import { create_reading_history, type reading_location } from "./reading_history";
import { file_key } from "./reading_positions";
import { create_reading_workspace, reading_delay, type reading_context } from "./reading_workspace";
import { get_workspace_app } from "./workspace_bootstrap";

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

let bound = false;

export function bind_reading_navigation(): void {
  if (bound) return;
  const file = (window as unknown as { File?: typora_file_state }).File;
  const editor = file?.editor;
  if (!file || !editor || typeof editor.tryOpenUrl !== "function"
      || typeof editor.library?.openFile !== "function" || typeof editor.selection?.buildUndo !== "function") return;
  bound = true;
  const app = get_workspace_app();
  const runtime = window as unknown as { reqnode(name: string): {
    isAbsolute(path: string): boolean; resolve(...parts: string[]): string; dirname(path: string): string; normalize(path: string): string;
  } };
  const path_api = app ? runtime.reqnode("path") : undefined;
  const history = create_reading_history();
  const original_open_url = editor.tryOpenUrl;
  const original_open_file = editor.library.openFile;
  const native_path = () => file.bundle?.filePath ?? "";
  const is_busy = () => Boolean(file._onInitParse || file._onFileSwitching);
  const workspace = create_reading_workspace(native_path, is_busy);
  let navigating = false;
  let pending_from: reading_location | null = null;
  let pending_timer = 0;
  const capture = (context = workspace.active()): reading_location | null => {
    if (!context?.file_path || file.bundle?.unsupported || editor.sourceView?.inSourceMode) return null;
    const position = workspace.capture(context);
    if (!position) return null;
    let cursor = null;
    if ((!context.leaf || context.leaf.view.isEditor()) && file_key(context.file_path) === file_key(native_path())) {
      try {
        const candidate = editor.selection.buildUndo();
        if (candidate?.type === "cursor") cursor = JSON.parse(JSON.stringify(candidate));
      } catch { /* 没有正文选区时仍保存阅读位置。 */ }
    }
    return { file_path: context.file_path, ...position, position, cursor, view_id: context.view_id };
  };
  const finish_pending = () => {
    window.clearTimeout(pending_timer);
    const current = capture();
    if (pending_from && current && !is_busy() && !navigating) history.record_jump(pending_from, current);
    pending_from = null;
  };
  const wait_for = async (ready: () => boolean): Promise<boolean> => {
    const started = Date.now();
    while (!ready()) {
      if (Date.now() - started > 15000) return false;
      await reading_delay(40);
    }
    return true;
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
    const existing = view_id == null ? undefined : workspace.all().find((context) => context.view_id === view_id
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
  const report = (error: unknown) => console.error("[linux-note reading navigation]", error);
  const navigate = async (path: string, hash?: string, location?: reading_location): Promise<boolean> => {
    if (navigating) return false;
    path = path_api?.normalize(path) ?? path;
    finish_pending();
    const from = capture();
    workspace.checkpoint();
    navigating = true;
    workspace.hold(path, true);
    try {
      const target = await open_target(path, location?.view_id);
      if (!target) return false;
      // 文件事件、交换回调与代码块限高都可能异步改变布局；先让这些步骤完成再定位。
      await reading_delay(100);
      workspace.stop_restoring(target);
      if (hash) {
        original_open_url.call(editor, hash);
        await reading_delay(100);
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
        try { if (location.cursor) editor.undo?.exeCommand(location.cursor); } catch { /* 失效光标不阻止阅读恢复。 */ }
        await reading_delay(40);
        await workspace.restore(target, location.position ?? location);
      } else await workspace.resume(target);
      const to = capture(target);
      if (to) {
        workspace.remember(target, to.position!);
        if (from && !location) history.record_jump(from, to);
      }
      return true;
    } finally {
      workspace.hold(path, false);
      navigating = false;
    }
  };

  editor.tryOpenUrl = function (url, ...args) {
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
    if (!app && /\.md(?:#|$)/iu.test(local_url)) {
      const [path, hash] = local_url.split(/#(.*)/su);
      void navigate(path, hash ? `#${hash}` : undefined).catch(report);
      return;
    }
    return original_open_url.call(this, url, ...args);
  };
  editor.library.openFile = function (path, callback) {
    if (navigating || callback || editor.sourceView?.inSourceMode) return original_open_file.call(this, path, callback);
    void navigate(path).catch(report);
  };
  if (app) {
    // 替换核心 openFile 的固定 500ms 全局锚点定时器：文件、栏、标题作为一次操作兑现。
    const original_workspace_open_file = app.workspace.activeEditor.openFile;
    app.workspace.activeEditor.openFile = (target) => {
      if (editor.sourceView?.inSourceMode) return original_workspace_open_file.call(app.workspace.activeEditor, target);
      const url = typeof target === "string" ? { pathname: target } : target;
      void navigate(url.pathname, url.hash).catch(report);
    };
    const original_app_open_file = app.openFile;
    app.openFile = function (path) {
      const source = workspace.active()?.file_path;
      const unwrapped = path.replace(/^<|>$/gu, "");
      return original_app_open_file.call(this, source && !path_api!.isAbsolute(unwrapped)
        ? path_api!.resolve(path_api!.dirname(source), unwrapped) : unwrapped);
    };
    // 标签切换通过核心保存的 openFile$original，事件用于补齐这条路径。
    app.workspace.on("file:will-open", () => {
      workspace.checkpoint();
      if (navigating || history.is_navigating() || pending_from) return;
      pending_from = capture();
    });
    app.workspace.on("file:open", () => {
      if (navigating || history.is_navigating()) return;
      window.clearTimeout(pending_timer);
      pending_timer = window.setTimeout(finish_pending, 500);
    });
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
    if (event.repeat || navigating || history.is_navigating() || is_busy()) return;
    finish_pending();
    const current = capture();
    if (current) void history.travel(event.key === "ArrowLeft" ? -1 : 1, current,
      (location) => navigate(location.file_path, undefined, location)).catch(report);
  }, true);
  document.documentElement.setAttribute("data-linux-note-reading-navigation", "ready");
  document.documentElement.setAttribute("data-linux-note-reading-positions", "ready");
}
