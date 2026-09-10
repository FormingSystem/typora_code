import type {graph_leaf} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";
import {workspace_dialog, workspace_element} from "./workspace_widgets";

const TRANSFER_PREFIX = "typora-code-transfer:";
const TRANSFER_TIMEOUT_MS = 25000;
const bindings = new WeakMap<object, {dispose(): void}>();
type transfer_snapshot = Awaited<ReturnType<workspace_file_host["capture_transfer"]>>;
type transfer_message = {kind: "ready" | "payload" | "accepted" | "committed" | "retained" | "error" | "cancel"; snapshot?: transfer_snapshot; error?: string};
type channel_like = Pick<BroadcastChannel, "postMessage" | "close" | "onmessage" | "onmessageerror">;
type window_runtime = { _options?: {initAnchor?: string; initFilePath?: string}; File?: {bundle?: {filePath?: string}; changeCounter?: {isDocumentEdited(): boolean}}; JSBridge?: {invoke(command: string, ...args: unknown[]): Promise<unknown>} };
type detached_window_options = {
  channel?: (name: string) => channel_like;
  open_window?: (anchor: string, root: string) => Promise<unknown>;
  notify?: (message: string) => void;
  timeout_ms?: number;
  initial_anchor?: string;
};

/** 原生空窗携带随机 anchor，只有对应内存频道能接收文档；收到确认前不关闭来源标签。 */
export function bind_workspace_detached_window(files: workspace_file_host, options: detached_window_options = {}) {
  const existing = bindings.get(files); if (existing) return existing;
  const runtime = window as unknown as window_runtime;
  const make_channel = options.channel || ((name: string) => new BroadcastChannel(name));
  const timeout_ms = options.timeout_ms ?? TRANSFER_TIMEOUT_MS;
  const notify = options.notify || ((message: string) => {
    const dialog = workspace_dialog("移至新窗口"); dialog.content.append(workspace_element("p", "", message));
  });
  const open_window = options.open_window || ((anchor: string, root: string) => {
    if (!runtime.JSBridge?.invoke) return Promise.reject(new Error("当前宿主未提供新窗口入口。"));
    // Typora 1.14.9 的原生 app.openFile(null, {mountFolder, anchor}) 返回 {winId}，
    // 新窗在 _options.initAnchor 中收到 anchor；不经 shell、不复制临时文件、不修改 ASAR。
    return runtime.JSBridge.invoke("app.openFile", null, {mountFolder: root, anchor});
  });
  const cancellations = new Set<() => void>();
  const pending_leaves = new WeakSet<object>();
  let disposed = false;
  const report = (error: unknown) => { if (!disposed) notify(error instanceof Error ? error.message : String(error)); };

  const send_leaf = async (leaf: graph_leaf) => {
    if (disposed || pending_leaves.has(leaf)) return;
    pending_leaves.add(leaf);
    try {
      const snapshot = await new Promise<transfer_snapshot>((resolve, reject) => {
        const controller = new AbortController(); let finished = false;
        const finish = (snapshot?: transfer_snapshot, error?: unknown) => {
          if (finished) return; finished = true; controller.abort();
          clearTimeout(timer); cancellations.delete(cancel);
          if (error) reject(error); else resolve(snapshot!);
        };
        const cancel = () => finish(undefined, new Error("文档捕获已取消，原标签仍保留。"));
        const timer = setTimeout(() => finish(undefined, new Error("文档读取超时，原标签仍保留。")), timeout_ms);
        cancellations.add(cancel);
        void Promise.resolve().then(() => files.capture_transfer(leaf, controller.signal)).then(snapshot => finish(snapshot), error => finish(undefined, error));
      });
      if (disposed) return;
      const anchor = TRANSFER_PREFIX + crypto.randomUUID();
      const channel = make_channel(anchor);
      await new Promise<void>((resolve, reject) => {
        let finished = false, sent = false, accepted = false;
        const controller = new AbortController();
        const finish = (error?: unknown) => {
          if (finished) return; finished = true;
          controller.abort(); clearTimeout(timer); cancellations.delete(cancel);
          channel.onmessage = null; channel.onmessageerror = null; channel.close();
          error ? reject(error) : resolve();
        };
        const cancel = () => { if (finished) return; channel.postMessage({kind: "cancel"}); finish(new Error("窗口移交已取消，原标签仍保留。")); };
        const timer = setTimeout(() => { channel.postMessage({kind: "cancel"}); finish(new Error("窗口未及时完成移交，原标签仍保留。")); }, timeout_ms);
        cancellations.add(cancel);
        channel.onmessageerror = () => finish(new Error("窗口通信失败，原标签仍保留。"));
        channel.onmessage = event => {
          const message = event.data as transfer_message;
          if (finished || !message || typeof message.kind !== "string") return;
          if (message.kind === "ready" && !sent) {
            sent = true; channel.postMessage({kind: "payload", snapshot});
          } else if (message.kind === "accepted" && sent && !accepted) {
            accepted = true;
            void (async () => {
              // ACK 与当前内容身份二次核对共同决定是否移除，不能用路径关闭另一组的同名标签。
              if (disposed || finished) return;
              const released = await files.release_transfer(leaf, snapshot, controller.signal);
              if (finished) return;
              channel.postMessage({kind: released ? "committed" : "retained"});
              finish();
              if (!released) report(snapshot.kind === "markdown" && snapshot.dirty
                ? "未保存的 Markdown 已在新窗口打开，原窗口保留草稿副本。"
                : "新窗口已接收文档；移交期间原内容或状态发生变化，原标签已保留。");
            })().catch(error => { if (!finished) { channel.postMessage({kind: "retained"}); finish(error); } });
          } else if (message.kind === "error") finish(new Error(message.error || "新窗口读取失败，原标签仍保留。"));
        };
        void Promise.resolve().then(() => open_window(anchor, snapshot.root)).catch(finish);
      });
    } catch (error) { report(error); }
    finally { pending_leaves.delete(leaf); }
  };

  const detach = (event: Event) => {
    const detail = (event as CustomEvent<{leaf?: graph_leaf}>).detail;
    if (!detail?.leaf || disposed) return;
    let present = false; files.core.app.workspace.eachLeaves(leaf => { if (leaf === detail.leaf) present = true; });
    if (!present) return;
    event.preventDefault(); void send_leaf(detail.leaf);
  };
  document.addEventListener("typora-code:tab-detach", detach);

  // 不是带有效令牌的原生空窗时不订阅，既有窗口与普通新建窗口均不接受移交正文。
  const anchor = options.initial_anchor ?? runtime._options?.initAnchor ?? "";
  if (/^typora-code-transfer:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(anchor)
      && !runtime._options?.initFilePath && !runtime.File?.bundle?.filePath && !runtime.File?.changeCounter?.isDocumentEdited()) {
    if (runtime._options?.initAnchor === anchor) runtime._options.initAnchor = "";
    const channel = make_channel(anchor);
    const controller = new AbortController();
    let finished = false, importing = false, accepted = false, abandoned = false;
    const finish = () => {
      if (finished) return; finished = true; controller.abort(); clearInterval(ready_timer); clearTimeout(timer);
      cancellations.delete(cancel); channel.onmessage = null; channel.onmessageerror = null; channel.close();
    };
    const cancel = () => { if (finished) return; abandoned = true; channel.postMessage({kind: "error", error: "新窗口已取消接收。"}); finish(); };
    const timer = setTimeout(() => { abandoned = true; channel.postMessage({kind: "error", error: "新窗口等待移交超时，原标签仍保留。"}); finish(); report(accepted ? "原窗口未确认移除标签，此窗口中的文档已保留。" : "原窗口未完成移交，原标签仍保留。"); }, timeout_ms);
    const ready_timer = setInterval(() => { if (!importing && !finished) channel.postMessage({kind: "ready"}); }, 150);
    cancellations.add(cancel);
    channel.onmessageerror = () => { abandoned = true; finish(); report("窗口通信失败，已保留现有文档。"); };
    channel.onmessage = event => {
      const message = event.data as transfer_message;
      if (finished || !message) return;
      if (message.kind === "payload" && message.snapshot && !importing) {
        importing = true; clearInterval(ready_timer);
        void files.receive_transfer(message.snapshot, controller.signal).then(() => {
          accepted = true;
          if (!finished && !abandoned) channel.postMessage({kind: "accepted"});
        }).catch(error => {
          if (!finished) channel.postMessage({kind: "error", error: String(error instanceof Error ? error.message : error)});
          if (!finished) { finish(); report(error); }
        });
      } else if (message.kind === "committed" && accepted) finish();
      else if (message.kind === "retained" && accepted) { finish(); report("原窗口仍保留文档副本，此窗口中的内容也已保留。"); }
      else if (message.kind === "cancel") { abandoned = true; finish(); report("原窗口已取消移交，已有内容仍保留。"); }
    };
    channel.postMessage({kind: "ready"});
  }
  const binding = {dispose() {
    if (disposed) return; disposed = true;
    document.removeEventListener("typora-code:tab-detach", detach);
    window.removeEventListener("pagehide", binding.dispose);
    for (const cancel of [...cancellations]) cancel();
    bindings.delete(files);
  }};
  window.addEventListener("pagehide", binding.dispose);
  bindings.set(files, binding); return binding;
}
