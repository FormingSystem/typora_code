import { create_reading_history, type reading_location } from "./reading_history";
import { get_workspace_app } from "./workspace_bootstrap";

// Typora 1.14.9 appsrc/window/frame.js 中已核对的接口；沿用其打开文件与光标恢复流程。
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
      || typeof editor.library?.openFile !== "function"
      || typeof editor.selection?.buildUndo !== "function" || typeof editor.undo?.exeCommand !== "function") return;
  bound = true;
  const history = create_reading_history();
  const original_open_url = editor.tryOpenUrl;
  const original_open_file = editor.library.openFile;
  let pending_from: reading_location | null = null;
  let pending_timer = 0;
  let pending_local = false;
  const is_busy = () => Boolean(file._onInitParse || file._onFileSwitching);

  const capture = (): reading_location | null => {
    const scroller = document.querySelector<HTMLElement>("content");
    const file_path = file.bundle?.filePath;
    if (!scroller || !file_path || file.bundle?.unsupported || editor.sourceView?.inSourceMode) return null;
    let cursor = null;
    try {
      const candidate = editor.selection.buildUndo();
      if (candidate?.type === "cursor") cursor = JSON.parse(JSON.stringify(candidate));
    } catch {
      // 没有正文选区时仍保存阅读位置。
    }
    return { file_path, scroll_top: scroller.scrollTop, scroll_left: scroller.scrollLeft, cursor };
  };
  const finish_pending = () => {
    window.clearTimeout(pending_timer);
    const current = capture();
    if (pending_from && current && !is_busy()
        && (pending_local || current.file_path !== pending_from.file_path)) history.record_jump(pending_from, current);
    pending_from = null;
  };
  const record_after_open = (local: boolean) => {
    window.clearTimeout(pending_timer);
    const started = Date.now();
    const poll = () => {
      if (!pending_from) return;
      if (!is_busy() && (local || file.bundle?.filePath !== pending_from.file_path)) {
        // 等待宿主的锚点、光标和滚动恢复落定，避免把加载中的页面当成目标。
        // 社区工作区在打开文件后延迟 500ms 执行锚点；将两步合并为一次阅读跳转。
        pending_timer = window.setTimeout(finish_pending, local ? 150 : 750);
      } else if (Date.now() - started < 30000) {
        pending_timer = window.setTimeout(poll, 75);
      } else pending_from = null;
    };
    pending_timer = window.setTimeout(poll, 0);
  };
  editor.tryOpenUrl = function (url, ...args) {
    // 外部网页和应用链接没有本窗口内的返回位置，不进入 Markdown 阅读历史。
    const local_url = url.trim().replace(/^<|>$/gu, "");
    if (history.is_navigating() || (!/^[a-z]:[\\/]/iu.test(local_url)
        && /^(?!file:)[a-z][a-z0-9+.-]*:/iu.test(local_url))) {
      return original_open_url.call(this, url, ...args);
    }
    if (pending_from && pending_local) finish_pending();
    if (!pending_from) pending_from = capture();
    pending_local = local_url.startsWith("#");
    try {
      const result = original_open_url.call(this, url, ...args);
      record_after_open(pending_local);
      return result;
    } catch (error) {
      pending_from = null;
      throw error;
    }
  };
  editor.library.openFile = function (path, callback) {
    if (history.is_navigating()) return original_open_file.call(this, path, callback);
    finish_pending();
    pending_from = capture();
    pending_local = false;
    const result = original_open_file.call(this, path, callback);
    record_after_open(false);
    return result;
  };
  // 社区分栏切换会调用保存过的 openFile；使用其事件补齐绕过公开方法的跳转。
  get_workspace_app()?.workspace.on("file:will-open", () => {
    if (history.is_navigating() || pending_from) return;
    pending_from = capture();
    pending_local = false;
    record_after_open(false);
  });

  const restore = async (location: reading_location): Promise<boolean> => {
    if (file.bundle?.filePath !== location.file_path) {
      // 此接口保留 Typora 的未保存确认、备份和打开失败处理，扩展不读取或写入正文。
      original_open_file.call(editor.library, location.file_path);
      const started = Date.now();
      while (file.bundle?.filePath !== location.file_path || is_busy()) {
        if (Date.now() - started >= 30000) return false;
        await new Promise((resolve) => window.setTimeout(resolve, 75));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    if (file.bundle?.filePath !== location.file_path) return false;
    try {
      if (location.cursor) editor.undo.exeCommand(location.cursor);
    } catch {
      // 文件内容变化导致旧光标失效时，仍恢复记录的滚动位置。
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const scroller = document.querySelector<HTMLElement>("content");
    if (!scroller) return false;
    scroller.scrollTop = location.scroll_top;
    scroller.scrollLeft = location.scroll_left;
    return true;
  };
  window.addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing
        || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const active = document.activeElement;
    if (document.querySelector('.linux-note-mermaid-viewer, .modal.in, [role="dialog"][aria-modal="true"]')
        || editor.sourceView?.inSourceMode
        || (active instanceof Element && active.matches("input, textarea, [contenteditable='true']")
          && !active.closest("#write"))) return;
    // 这两个组合键优先用于阅读导航，包括历史边界；避免落入 Typora 的表格移动快捷键。
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || history.is_navigating() || is_busy()) return;
    finish_pending();
    const current = capture();
    if (current) void history.travel(event.key === "ArrowLeft" ? -1 : 1, current, restore)
      .catch((error: unknown) => console.error("[linux-note reading navigation]", error));
  }, true);
  document.documentElement.setAttribute("data-linux-note-reading-navigation", "ready");
}
