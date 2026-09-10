import { create_reading_history, type reading_location } from "./reading_history";
import { file_key, parse_markdown_file_target, resolve_host_open_file_target, resolve_workspace_file } from "./workspace_file_uri";
import { create_reading_workspace, reading_delay, type reading_context } from "./reading_workspace";
import { get_workspace_app } from "./workspace_bootstrap";
import { capture_markdown_location, reveal_markdown_location } from "./workspace_markdown_location";
import type { file_location } from "./workspace_files";

// Typora 1.14.9 appsrc/window/frame.js 与社区核心 2.10.15 已核对的宿主接口。
type typora_editor = {
  tryOpenUrl(url: string, ...args: unknown[]): unknown;
  library: { openFile(path: string, callback?: () => void): unknown };
  selection: { buildUndo(): Record<string, unknown> | null };
  undo: { exeCommand(cursor: Record<string, unknown>): void };
  sourceView?: { inSourceMode: boolean };
};
type typora_file_state = {
  bundle?: { filePath?: string; unsupported?: unknown };
  editor?: typora_editor;
  _onInitParse?: boolean;
  _onFileSwitching?: boolean;
};

let active_dispose: (() => void) | undefined;
type reading_target_options = { locate?: (signal?: AbortSignal) => Promise<void>; group?: string; hash?: string };
let navigate_target: ((path: string, options: reading_target_options) => Promise<boolean>) | undefined;
let remap_paths: ((map: (path: string) => string | undefined) => void) | undefined;
export function rename_reading_paths(map: (path: string) => string | undefined): void { remap_paths?.(map); }

/** 定位必须包含在打开、位置保护和阅读历史的同一事务中。 */
export async function navigate_reading_target(path: string, options: reading_target_options = {}): Promise<void> {
  if (!navigate_target || !await navigate_target(path, options)) throw new Error("无法切换到目标 Markdown；请先处理文件打开或未保存确认后重试。");
}

export function bind_reading_navigation(): () => void {
  if (active_dispose) return active_dispose;
  const file = (window as unknown as { File?: typora_file_state }).File;
  const editor = file?.editor;
  if (!file || !editor || typeof editor.tryOpenUrl !== "function"
      || typeof editor.library?.openFile !== "function" || typeof editor.selection?.buildUndo !== "function") return () => {};
  let disposed = false;
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  const collect = (value: unknown) => { if (typeof value === "function") cleanups.push(value as () => void); };
  const attrs = ["data-linux-note-reading-navigation", "data-linux-note-reading-positions", "data-linux-note-history-back", "data-linux-note-history-forward"];
  const previous_attrs = attrs.map(name => document.documentElement.getAttribute(name));
  const app = get_workspace_app();
  const runtime = window as unknown as { reqnode(name: string): {
    isAbsolute(path: string): boolean; resolve(...parts: string[]): string; dirname(path: string): string; normalize(path: string): string;
  } };
  const path_api = app ? runtime.reqnode("path") : undefined;
  const history = create_reading_history();
  const publish_history_state = () => {
    if (disposed) return;
    const detail = { back: history.can_travel(-1), forward: history.can_travel(1) };
    document.documentElement.dataset.linuxNoteHistoryBack = String(detail.back);
    document.documentElement.dataset.linuxNoteHistoryForward = String(detail.forward);
    window.dispatchEvent(new CustomEvent("linux-note-reading-history-state", { detail }));
  };
  const original_open_url = editor.tryOpenUrl;
  const original_open_file = editor.library.openFile;
  const native_path = () => file.bundle?.filePath ?? "";
  const is_busy = () => Boolean(file._onInitParse || file._onFileSwitching);
  const workspace = create_reading_workspace(native_path, is_busy);
  let navigating = false;
  let pending_from: reading_location | null = null;
  let pending_timer = 0;
  const owned_remap_paths = remap_paths = map => {
    if (disposed) return;
    history.remap_paths(map); workspace.remap_paths(map);
    if (pending_from) pending_from.file_path = map(pending_from.file_path) ?? pending_from.file_path;
  };
  const capture = (context = workspace.active()): reading_location | null => {
    if (disposed || !context?.file_path || file.bundle?.unsupported || editor.sourceView?.inSourceMode) return null;
    const position = workspace.capture(context);
    if (!position) return null;
    let cursor = null;
    if ((!context.leaf || context.leaf.view.isEditor()) && file_key(context.file_path) === file_key(native_path())) {
      try {
        const candidate = editor.selection.buildUndo();
        if (candidate?.type === "cursor") {
          cursor = JSON.parse(JSON.stringify(candidate));
          const source_location = capture_markdown_location();
          if (source_location) cursor.linux_note_source_location = source_location;
        }
      } catch { /* 没有正文选区时仍保存阅读位置。 */ }
    }
    return { file_path: context.file_path, ...position, position, cursor, view_id: context.view_id };
  };
  const finish_pending = () => {
    window.clearTimeout(pending_timer);
    if (disposed) return;
    const current = capture();
    if (pending_from && current && !is_busy() && !navigating) { history.record_jump(pending_from, current); publish_history_state(); }
    pending_from = null;
  };
  const wait_for = async (ready: () => boolean): Promise<boolean> => {
    const started = Date.now();
    if (disposed) return false;
    while (!ready()) {
      if (disposed || Date.now() - started > 15000) return false;
      await reading_delay(40, controller.signal);
    }
    return !disposed;
  };
  const activate = async (context: reading_context): Promise<boolean> => {
    const leaf = context.leaf;
    if (app && leaf) {
      if (leaf.parent.activeLeaf !== leaf) leaf.parent.toggleTab(leaf.state.path);
      app.workspace.activeLeaf = leaf;
      if (!await wait_for(() => Boolean(workspace.elements(context)))) return false;
      if (!leaf.view.isEditor()) {
        // 复用社区核心的编辑器交换及原生未保存确认；目标接管后目录也属于目标文件。
        leaf.view.containerEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }
    }
    return wait_for(() => !is_busy() && file_key(native_path()) === file_key(context.file_path)
      && (!leaf || leaf.view.isEditor()) && Boolean(workspace.elements(context)));
  };
  const open_target = async (path: string, view_id?: number): Promise<reading_context | undefined> => {
    const existing = workspace.all().find((context) => (view_id == null || context.view_id === view_id)
      && file_key(context.file_path) === file_key(path));
    if (existing) return await activate(existing) ? existing : undefined;
    const current = workspace.active();
    if (current && file_key(current.file_path) === file_key(path)) return await activate(current) ? current : undefined;
    // 保留宿主打开失败与未保存确认；绝不通过读正文、reloadContent 或自动保存来切换。
    original_open_file.call(editor.library, path);
    let target: reading_context | undefined;
    if (!await wait_for(() => {
      target = workspace.active();
      return Boolean(target && file_key(target.file_path) === file_key(path) && workspace.elements(target));
    })) return;
    return target && await activate(target) ? target : undefined;
  };
  const report = (error: unknown) => { if (!disposed) console.error("[linux-note reading navigation]", error); };
  const navigate = async (path: string, hash?: string, location?: reading_location, options: reading_target_options = {}): Promise<boolean> => {
    if (disposed || navigating) return false;
    const source = workspace.active()?.file_path || native_path();
    if (path_api) {
      const target = resolve_host_open_file_target(path_api, source, path);
      const resolved = resolve_workspace_file(path_api, source ? path_api.dirname(source) : "", target);
      if (!resolved) throw new Error("无法解析目标 Markdown 路径。");
      path = resolved;
      // 宿主收到不存在的文件会先清空编辑面，因此必须在任何状态切换前拒绝。
      const fs = (runtime as unknown as {reqnode(name: string): {statSync(path: string): {isFile(): boolean}}}).reqnode("fs");
      if (!fs.statSync(path).isFile()) throw new Error("目标不是普通文件。");
    }
    finish_pending();
    const from = capture();
    workspace.checkpoint();
    navigating = true;
    workspace.hold(path, true);
    try {
      let target: reading_context | undefined;
      if (app && options.group && options.group !== "active") {
        app.commands.run(options.group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [path]);
        const opened = await wait_for(() => {
          target = workspace.active();
          return Boolean(target && file_key(target.file_path) === file_key(path) && workspace.elements(target));
        });
        if (!opened || !target || !await activate(target)) target = undefined;
      } else target = await open_target(path, location?.view_id);
      if (disposed || !target) return false;
      // 文件事件、交换回调与代码块限高都可能异步改变布局；先让这些步骤完成再定位。
      await reading_delay(100, controller.signal);
      if (disposed) return false;
      workspace.stop_restoring(target);
      if (options.locate) {
        await options.locate(controller.signal);
        if (disposed) return false;
      } else if (hash) {
        original_open_url.call(editor, hash);
        await reading_delay(100, controller.signal);
        if (disposed) return false;
        const heading = window.getSelection()?.focusNode?.parentElement?.closest("h1,h2,h3,h4,h5,h6");
        const cid = heading?.getAttribute("cid");
        // 原生目录已按目标文件更新；仅滚动目录自己的容器，不滚动来源文档。
        if (cid) {
          const item = Array.from(document.querySelectorAll<HTMLElement>("#outline-content .outline-label"))
            .find((node) => node.getAttribute("data-ref") === cid);
          if (item) {
            for (let parent = item.parentElement; parent?.closest("#outline-content"); parent = parent.parentElement) {
              if (parent.classList.contains("outline-item-wrapper")) parent.classList.add("outline-item-open");
            }
            item.scrollIntoView({ block: "nearest" });
          }
        }
      } else if (location) {
        // cid 只用于当前窗口的原生历史，持久化位置不保存它；最后恢复滚动，避免选区拉动视口。
        try {
          if (location.cursor?.linux_note_source_location) await reveal_markdown_location(location.cursor.linux_note_source_location as file_location, controller.signal);
          else if (location.cursor) editor.undo?.exeCommand(location.cursor);
        } catch { /* 正文发生变化或失效光标不阻止阅读位置恢复。 */ }
        await reading_delay(40, controller.signal);
        if (disposed) return false;
        await workspace.restore(target, location.position ?? location);
      } else await workspace.resume(target);
      if (disposed) return false;
      const to = capture(target);
      if (to) {
        workspace.remember(target, to.position!);
        if (from && !location) { history.record_jump(from, to); publish_history_state(); }
      }
      return true;
    } finally {
      workspace.hold(path, false);
      navigating = false;
    }
  };
  const owned_navigate_target = navigate_target = async (path, options) => {
    if (disposed) return false;
    // 光标先到位而历史滚动仍在稳定时，下一次明确打开应等待事务结束，不能丢掉用户的双击。
    const started = Date.now();
    while (navigating || history.is_navigating()) {
      if (disposed || Date.now() - started > 15000) return false;
      await reading_delay(40, controller.signal);
    }
    return navigate(path, options.hash, undefined, options);
  };
  const travel_history = async (direction: -1 | 1) => {
    if (disposed || navigating || history.is_navigating() || is_busy()) return false;
    finish_pending();
    const current = capture();
    if (!current) return false;
    const pending = history.travel(direction, current, location => navigate(location.file_path, undefined, location));
    publish_history_state();
    try { return await pending; }
    finally { publish_history_state(); }
  };

  const owned_open_url = editor.tryOpenUrl = function (url, ...args) {
    if (disposed) return original_open_url.call(this, url, ...args);
    const local_url = url.trim().replace(/^<|>$/gu, "");
    if (navigating) return;
    if (editor.sourceView?.inSourceMode || (!/^[a-z]:[\\/]/iu.test(local_url) && /^(?!file:)[a-z][a-z0-9+.-]*:/iu.test(local_url))) {
      return original_open_url.call(this, url, ...args);
    }
    if (local_url.startsWith("#")) {
      const context = workspace.active();
      if (context) void navigate(context.file_path, local_url).catch(report);
      return;
    }
    const markdown_target = parse_markdown_file_target(local_url);
    if (!app && markdown_target) {
      void navigate(markdown_target.file_path, markdown_target.hash).catch(report);
      return;
    }
    return original_open_url.call(this, url, ...args);
  };
  const owned_open_file = editor.library.openFile = function (path, callback) {
    if (disposed) return original_open_file.call(this, path, callback);
    if (navigating || callback || editor.sourceView?.inSourceMode) return original_open_file.call(this, path, callback);
    const parsed = parse_markdown_file_target(path);
    if (!parsed?.hash) { void navigate(path).catch(report); return; }
    const source = workspace.active()?.file_path;
    const target = path_api && source ? resolve_workspace_file(path_api, path_api.dirname(source), parsed.file_path) : parsed.file_path;
    void navigate(target ?? parsed.file_path, parsed.hash).catch(report);
  };
  if (app) {
    // 替换核心 openFile 的固定 500ms 全局锚点定时器：文件、栏、标题作为一次操作兑现。
    const original_workspace_open_file = app.workspace.activeEditor.openFile;
    const owned_workspace_open_file = app.workspace.activeEditor.openFile = (target) => {
      if (disposed) return original_workspace_open_file.call(app.workspace.activeEditor, target);
      if (editor.sourceView?.inSourceMode) return original_workspace_open_file.call(app.workspace.activeEditor, target);
      const url = typeof target === "string" ? { pathname: target } : target;
      void navigate(url.pathname, url.hash).catch(report);
    };
    const original_app_open_file = app.openFile;
    const owned_app_open_file = app.openFile = function (path) {
      if (disposed) return original_app_open_file.call(this, path);
      const source = workspace.active()?.file_path;
      return original_app_open_file.call(this, resolve_host_open_file_target(path_api!, source ?? "", path));
    };
    cleanups.push(() => {
      if (app.openFile === owned_app_open_file) app.openFile = original_app_open_file;
      if (app.workspace.activeEditor.openFile === owned_workspace_open_file) app.workspace.activeEditor.openFile = original_workspace_open_file;
    });
    // 标签切换通过核心保存的 openFile$original，事件用于补齐这条路径。
    collect(app.workspace.on("file:will-open", () => {
      if (disposed) return;
      workspace.checkpoint();
      if (navigating || history.is_navigating() || pending_from) return;
      pending_from = capture();
    }));
    collect(app.workspace.on("file:open", () => {
      if (disposed) return;
      if (navigating || history.is_navigating()) return;
      window.clearTimeout(pending_timer);
      pending_timer = window.setTimeout(finish_pending, 500);
    }));
  }
  window.addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing
        || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const active = document.activeElement;
    if (document.querySelector('.linux-note-mermaid-viewer, .modal.in, [role="dialog"][aria-modal="true"]')
        || editor.sourceView?.inSourceMode
        || (active instanceof Element && active.matches("input, textarea, [contenteditable='true']") && !active.closest("#write"))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    void travel_history(event.key === "ArrowLeft" ? -1 : 1).catch(report);
  }, { capture: true, signal: controller.signal });
  window.addEventListener("linux-note-reading-history-travel", event => {
    const direction = (event as CustomEvent<{ direction?: number }>).detail?.direction;
    if (direction === -1 || direction === 1) void travel_history(direction).catch(report);
  }, { signal: controller.signal });
  publish_history_state();
  document.documentElement.setAttribute("data-linux-note-reading-navigation", "ready");
  document.documentElement.setAttribute("data-linux-note-reading-positions", "ready");
  const dispose = () => {
    if (disposed) return;
    disposed = true; controller.abort(); clearTimeout(pending_timer); pending_from = null;
    workspace.dispose();
    for (const cleanup of cleanups.reverse()) cleanup();
    if (editor.tryOpenUrl === owned_open_url) editor.tryOpenUrl = original_open_url;
    if (editor.library.openFile === owned_open_file) editor.library.openFile = original_open_file;
    if (navigate_target === owned_navigate_target) navigate_target = undefined;
    if (remap_paths === owned_remap_paths) remap_paths = undefined;
    attrs.forEach((name, index) => { const previous = previous_attrs[index]; if (previous === null) document.documentElement.removeAttribute(name); else document.documentElement.setAttribute(name, previous); });
    if (active_dispose === dispose) active_dispose = undefined;
  };
  active_dispose = dispose;
  return dispose;
}
