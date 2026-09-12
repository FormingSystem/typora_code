import {open_workspace_window} from "./workspace_open_dialog";
import type {graph_leaf} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";
import {workspace_dialog, workspace_element} from "./workspace_widgets";

// anchor 会被 Typora 的延迟文件加载流程再次消费，只能使用无副作用的文内片段。
const WINDOW_ANCHOR_PREFIX = "#typora-code-window-";
const CHANNEL_PREFIX = "typora-code:tab-transfer:";
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TRANSFER_TIMEOUT_MS = 25000;
const bindings = new WeakMap<object, {dispose(): void}>();
type transfer_snapshot = Awaited<ReturnType<workspace_file_host["capture_transfer"]>>;
type transfer_target = {group: graph_leaf["parent"]; index: number};
type transfer_message = {kind: "ready" | "payload" | "accepted" | "committed" | "retained" | "error" | "cancel"; peer_id: string; snapshot?: transfer_snapshot; error?: string};
type channel_like = Pick<BroadcastChannel, "postMessage" | "close" | "onmessage" | "onmessageerror">;
type window_runtime = {
  _options?: {initAnchor?: string; initFilePath?: string};
  File?: {option?: {initAnchor?: string}; bundle?: {filePath?: string}; editor?: {getMarkdown(): string}; changeCounter?: {isDocumentEdited(): boolean}; isFileLoading?(): boolean; inSavingProcess?: boolean; _onFileSwitching?: boolean; _onInitParse?: boolean};
  JSBridge?: {invoke(command: string, ...args: unknown[]): Promise<unknown>};
};
type detached_window_options = {
  channel?: (name: string) => channel_like;
  open_window?: (anchor: string, root: string) => Promise<unknown>;
  notify?: (message: string) => void;
  timeout_ms?: number;
  initial_anchor?: string;
};
type drag_detail = {leaf?: graph_leaf; transfer_token?: string; local_drop?: boolean; cancelled?: boolean; drop_effect?: string; screen_x?: number; screen_y?: number};

/** 原生标签拖放只携带随机令牌；目标完成恢复并确认后，来源才释放同一个标签。 */
export function bind_workspace_detached_window(files: workspace_file_host, options: detached_window_options = {}) {
  const existing = bindings.get(files); if (existing) return existing;
  const runtime = window as unknown as window_runtime;
  const make_channel = options.channel || ((name: string) => new BroadcastChannel(name));
  const timeout_ms = options.timeout_ms ?? TRANSFER_TIMEOUT_MS;
  const notify = options.notify || ((message: string) => {
    const dialog = workspace_dialog("移动标签"); dialog.content.append(workspace_element("p", "", message));
  });
  const open_window = options.open_window || ((anchor: string, root: string) => open_workspace_window(root,anchor));
  const cancellations = new Set<() => void>();
  const pending_leaves = new WeakSet<object>();
  const senders = new Map<string, {leaf: graph_leaf; cancel(): void; detach(): void; wait(): void; claimed(): boolean; releasing(): boolean}>();
  const receivers = new Set<string>();
  const anchor = options.initial_anchor ?? runtime._options?.initAnchor ?? runtime.File?.option?.initAnchor ?? "";
  const initial_token = anchor.startsWith(WINDOW_ANCHOR_PREFIX) ? anchor.slice(WINDOW_ANCHOR_PREFIX.length) : "";
  const auxiliary = TOKEN_PATTERN.test(initial_token) && !runtime._options?.initFilePath;
  let disposed = false;
  const report = (error: unknown) => { if (!disposed) notify(error instanceof Error ? error.message : String(error)); };
  const owns_leaf = (candidate: graph_leaf) => {
    let found = false; files.core.app.workspace.eachLeaves(leaf => { if (leaf === candidate) found = true; }); return found;
  };
  const close_empty_auxiliary = async (snapshot: transfer_snapshot) => {
    const empty = () => {
      let occupied = false; files.core.app.workspace.eachLeaves(leaf => { if (leaf.state.path && !leaf.state.path.startsWith("typ://core.empty")) occupied = true; });
      return !occupied && !disposed && !runtime.File?.isFileLoading?.() && !runtime.File?.inSavingProcess && !runtime.File?._onFileSwitching && !runtime.File?._onInitParse;
    };
    if (!auxiliary || !empty() || !runtime.JSBridge) return;
    // 原生 Markdown 的最后一个标签移走后，隐藏编辑缓冲仍可能是 dirty。
    // 只在宿主确认同文档仍由另一窗口持有时走原生关闭入口，不伪装已保存。
    if (runtime.File?.changeCounter?.isDocumentEdited()) {
      const file = runtime.File, bundle = file.bundle, counter = file.changeCounter;
      const same_draft = () => runtime.File === file && file.bundle === bundle && file.changeCounter === counter
        && file.bundle?.filePath === snapshot.file_path && counter?.isDocumentEdited()
        && file.editor?.getMarkdown().replace(/\r\n?/gu, "\n") === snapshot.text.replace(/\r\n?/gu, "\n");
      if (snapshot.kind !== "markdown" || !same_draft()
          || await runtime.JSBridge.invoke("document.noOtherWindow") !== false || !empty() || !same_draft()) return;
    }
    await runtime.JSBridge.invoke("window.close");
  };

  const start_sender = (leaf: graph_leaf, token: string) => {
    if (disposed || pending_leaves.has(leaf) || senders.has(token) || !owns_leaf(leaf)) return;
    let channel: channel_like;
    try { channel = make_channel(CHANNEL_PREFIX + token); } catch (error) { report(error); return; }
    pending_leaves.add(leaf);
    const controller = new AbortController();
    let finished = false, peer_id = "", sent = false, accepted = false, opening = false;
    let snapshot_promise: Promise<transfer_snapshot> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const post = (kind: transfer_message["kind"], extra: Partial<transfer_message> = {}) => {
      if (!finished) try { channel.postMessage({kind, peer_id, ...extra}); } catch (error) { finish(error); }
    };
    const finish = (error?: unknown) => {
      if (finished) return; finished = true; controller.abort(); clearTimeout(timer);
      cancellations.delete(cancel); pending_leaves.delete(leaf); senders.delete(token);
      channel.onmessage = null; channel.onmessageerror = null;
      try { channel.close(); } catch (close_error) { if (!error) error = close_error; }
      if (error) report(error);
    };
    const cancel = () => { post("cancel"); finish(); };
    const arm_timeout = () => {
      if (timer) return;
      timer = setTimeout(() => { post("cancel"); finish(new Error("窗口未及时完成移交，原标签仍保留。")); }, timeout_ms);
    };
    const capture = () => {
      arm_timeout();
      // 同窗排序不需要读取文件；在实际跨窗落下或新窗请求后才捕获草稿。
      return snapshot_promise ||= Promise.resolve().then(() => files.capture_transfer(leaf, controller.signal));
    };
    const deliver = async () => {
      if (sent || finished) return; sent = true;
      try { const snapshot = await capture(); if (!finished) post("payload", {snapshot}); }
      catch (error) { post("error", {error: String(error instanceof Error ? error.message : error)}); finish(error); }
    };
    channel.onmessageerror = () => { post("cancel"); finish(new Error("窗口通信失败，原标签仍保留。")); };
    channel.onmessage = event => {
      const message = event.data as transfer_message;
      if (finished || !message || !TOKEN_PATTERN.test(message.peer_id || "")) return;
      if (message.kind === "ready" && (!peer_id || message.peer_id === peer_id)) {
        peer_id = message.peer_id; void deliver();
      } else if (message.peer_id === peer_id && message.kind === "accepted" && sent && !accepted) {
        accepted = true;
        void (async () => {
          const snapshot = await capture(); if (finished) return;
          const released = await files.release_transfer(leaf, snapshot, controller.signal);
          if (finished) return;
          post(released ? "committed" : "retained"); finish();
          if (released) void close_empty_auxiliary(snapshot).catch(report);
          else report("目标窗口已接收文档；原内容或状态发生变化，原标签已保留。");
        })().catch(error => { if (!finished) { post("retained"); finish(error); } });
      } else if (message.peer_id === peer_id && message.kind === "error") finish(new Error(message.error || "目标窗口读取失败，原标签仍保留。"));
    };
    const detach = () => {
      if (finished || peer_id || opening) return; opening = true;
      void (async () => {
        const snapshot = await capture(); if (finished || peer_id) return;
        await open_window(WINDOW_ANCHOR_PREFIX + token, snapshot.root);
      })().catch(error => finish(error));
    };
    cancellations.add(cancel); senders.set(token, {leaf, cancel, detach, wait: arm_timeout, claimed: () => Boolean(peer_id), releasing: () => accepted});
  };

  const receive = (token: string, target: transfer_target) => {
    if (disposed || receivers.has(token) || senders.has(token)) return;
    let channel: channel_like;
    try { channel = make_channel(CHANNEL_PREFIX + token); } catch (error) { report(error); return; }
    receivers.add(token);
    const peer_id = crypto.randomUUID(), controller = new AbortController();
    let finished = false, importing = false, accepted = false;
    const post = (kind: transfer_message["kind"], extra: Partial<transfer_message> = {}) => {
      if (!finished) try { channel.postMessage({kind, peer_id, ...extra}); } catch (error) { finish(); report(error); }
    };
    const finish = () => {
      if (finished) return; finished = true; controller.abort(); clearInterval(ready_timer); clearTimeout(timer);
      cancellations.delete(cancel); receivers.delete(token); channel.onmessage = null; channel.onmessageerror = null;
      try { channel.close(); } catch (error) { report(error); }
    };
    const cancel = () => { post("error", {error: "目标窗口已取消接收。"}); finish(); };
    const timer = setTimeout(() => {
      post("error", {error: "目标窗口等待移交超时，原标签仍保留。"}); finish();
      report(accepted ? "原窗口未确认移除标签，此窗口中的文档已保留。" : "原窗口未完成移交，原标签仍保留。");
    }, timeout_ms);
    const ready_timer = setInterval(() => { if (!importing) post("ready"); }, 150);
    cancellations.add(cancel);
    channel.onmessageerror = () => { finish(); report("窗口通信失败，已保留现有文档。"); };
    channel.onmessage = event => {
      const message = event.data as transfer_message;
      if (finished || !message || (message.peer_id && message.peer_id !== peer_id)) return;
      if (message.kind === "payload" && message.snapshot && !importing) {
        importing = true; clearInterval(ready_timer);
        void files.receive_transfer(message.snapshot, target, controller.signal).then(() => {
          accepted = true; if (!finished) post("accepted");
        }).catch(error => {
          if (!finished) { post("error", {error: String(error instanceof Error ? error.message : error)}); finish(); report(error); }
        });
      } else if (message.kind === "committed" && accepted) finish();
      else if (message.kind === "retained" && accepted) { finish(); report("原窗口仍保留文档副本，此窗口中的内容也已保留。"); }
      else if (message.kind === "error") { finish(); report(message.error || "文档移交失败，原标签仍保留。"); }
      else if (message.kind === "cancel") { finish(); if (importing) report("原窗口已取消移交，已有内容仍保留。"); }
    };
    post("ready");
  };
  const drag_start = (event: Event) => {
    const detail = (event as CustomEvent<drag_detail>).detail;
    if (detail?.leaf && TOKEN_PATTERN.test(detail.transfer_token || "")) start_sender(detail.leaf, detail.transfer_token!);
  };
  const drop = (event: Event) => {
    const detail = (event as CustomEvent<{transfer_token?: string; target_group?: graph_leaf["parent"]; target_index?: number}>).detail;
    if (!detail?.target_group || !TOKEN_PATTERN.test(detail.transfer_token || "") || disposed) return;
    let present = false; files.core.app.workspace.eachLeaves(leaf => { if (leaf.parent === detail.target_group) present = true; });
    if (!present) return;
    event.preventDefault(); receive(detail.transfer_token!, {group: detail.target_group, index: Math.max(0, Math.trunc(detail.target_index || 0))});
  };
  const drag_end = (event: Event) => {
    const detail = (event as CustomEvent<drag_detail>).detail;
    const sender = detail && senders.get(detail.transfer_token || ""); if (!sender || sender.leaf !== detail.leaf) return;
    // 目标已确认后的正常释放会移除源 tab；核心观察器随即报告 source-invalid。
    // 此时手势已经落下，不能把自身提交过程误认成用户取消。pagehide/dispose 仍会中止协议。
    if (detail.cancelled && sender.releasing()) return;
    if (detail.cancelled || detail.local_drop) { sender.cancel(); return; }
    if (detail.drop_effect === "move" || detail.drop_effect === "copy" || sender.claimed()) { sender.wait(); return; }
    const x = detail.screen_x, y = detail.screen_y;
    // 编辑区、侧栏、缩放和最大化共用实际外窗边界；不再拿编辑组的30px外沿判定。
    if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)
        || (x! >= window.screenX && x! <= window.screenX + window.outerWidth && y! >= window.screenY && y! <= window.screenY + window.outerHeight)) {
      sender.cancel(); return;
    }
    sender.detach();
  };
  document.addEventListener("typora-code:tab-drag-start", drag_start);
  document.addEventListener("typora-code:tab-drop", drop);
  document.addEventListener("typora-code:tab-drag-end", drag_end);

  if (auxiliary && !runtime.File?.bundle?.filePath && !runtime.File?.changeCounter?.isDocumentEdited()) {
    if (runtime._options?.initAnchor === anchor) runtime._options.initAnchor = "";
    if (runtime.File?.option?.initAnchor === anchor) runtime.File.option.initAnchor = "";
    let initial_leaf = files.core.app.workspace.activeLeaf;
    if (!initial_leaf) files.core.app.workspace.eachLeaves(leaf => { initial_leaf ||= leaf; });
    if (initial_leaf) receive(initial_token, {group: initial_leaf.parent, index: 0});
  }
  const binding = {dispose() {
    if (disposed) return; disposed = true;
    document.removeEventListener("typora-code:tab-drag-start", drag_start);
    document.removeEventListener("typora-code:tab-drop", drop);
    document.removeEventListener("typora-code:tab-drag-end", drag_end);
    window.removeEventListener("pagehide", binding.dispose);
    for (const cancel of [...cancellations]) cancel();
    bindings.delete(files);
  }};
  window.addEventListener("pagehide", binding.dispose);
  bindings.set(files, binding); return binding;
}
