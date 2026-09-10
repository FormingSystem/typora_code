import { COPY_ABSOLUTE_PATH, COPY_RELATIVE_PATH, format_file_path, type path_operations } from "./file_paths";
import { get_workspace_app } from "./workspace_bootstrap";
import { get_workspace_files } from "./workspace_files";
import { is_source_file_uri, source_file_path } from "./workspace_file_uri";

let active_dispose: (() => void) | undefined;

export function bind_file_path_actions(): () => void {
  const app = get_workspace_app();
  if (active_dispose) return active_dispose;
  if (!app) return () => {};
  const runtime = window as unknown as {
    reqnode(name: string): path_operations;
    File: { getMountFolder(): string | undefined };
    JSBridge: { invoke(command: string, payload: string): Promise<unknown> };
  };
  if (!runtime.reqnode || !runtime.JSBridge?.invoke) return () => {};
  let disposed = false;
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  const timers = new Set<number>();
  const owned_items = new Set<Element>();
  const menu_geometry = new Map<HTMLElement, { top: string; left: string; owned_top: string; owned_left: string }>();
  const previous_ready = document.documentElement.getAttribute("data-linux-note-copy-path");
  const collect = (value: unknown) => { if (typeof value === "function") cleanups.push(value as () => void); };
  const api = runtime.reqnode("path");
  const core = (window as unknown as Record<symbol, { Notice: new (message: string, delay?: number) => unknown }>)[Symbol.for("typora-code:workspace")];
  const get_path = (target: string, relative: boolean) => {
    const source_path=source_file_path(target,api);
    if(is_source_file_uri(target)&&!source_path)return null;
    if(source_path)target=source_path;
    return format_file_path(api,target,get_workspace_files()?.context_root()||runtime.File.getMountFolder(),relative);
  };
  const copy_path = (target: string, relative: boolean) => {
    if (disposed) return;
    const text = get_path(target, relative);
    if (text === null) { new core.Notice("请先保存文档，再复制路径。", 2000); return; }
    // 调用宿主剪贴板桥接，不创建 textarea、不切换文件，也不触碰正文选区。
    void Promise.resolve().then(() => !disposed && runtime.JSBridge.invoke("clipboard.write", JSON.stringify({ text })))
      .then(() => { if (disposed) return; new core.Notice(relative ? "已复制相对路径" : "已复制绝对路径", 1500); })
      .catch((error: unknown) => {
        if (disposed) return;
        console.error("[linux-note copy path]", error);
        new core.Notice("复制路径失败，请重试。", 2500);
      });
  };
  for (const [id, relative, title] of [
    [COPY_ABSOLUTE_PATH, false, "复制绝对路径"],
    [COPY_RELATIVE_PATH, true, "复制相对路径"],
  ] as const) {
    collect(app.commands.register({ id, title, scope: "global", callback: () => copy_path(app.workspace.activeLeaf?.state.path ?? "", relative) }));
  }

  const actions = new WeakMap<Element, () => void>();
  const add_items = (menu: HTMLElement, target: string) => {
    if (disposed) return;
    menu.querySelectorAll(".linux-note-path-item").forEach((item) => { item.remove(); owned_items.delete(item); });
    const separator = document.createElement("li");
    separator.className = "divider typ-menuitem linux-note-path-item";
    separator.setAttribute("for-file", "");
    separator.setAttribute("for-folder", "");
    menu.append(separator); owned_items.add(separator);
    for (const [relative, label, key] of [[false, "复制绝对路径", "absolute"], [true, "复制相对路径", "relative"]] as const) {
      const item = document.createElement("li");
      item.className = "typ-menuitem linux-note-path-item";
      item.setAttribute("data-linux-note-copy-path", key);
      item.setAttribute("for-file", "");
      item.setAttribute("for-folder", "");
      const anchor = document.createElement("a");
      anchor.setAttribute("role", "menuitem");
      anchor.tabIndex = 0;
      anchor.textContent = label;
      const enabled = get_path(target, relative) !== null;
      anchor.setAttribute("aria-disabled", String(!enabled));
      if (!enabled) { item.classList.add("disabled"); anchor.title = "文档尚未保存，没有文件路径"; }
      item.append(anchor);
      actions.set(item, () => {
        if (!enabled) return;
        copy_path(target, relative);
        // 复用社区菜单的关闭事件，清理它注册的正文点击监听。
        menu.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        menu.style.display = "none";
      });
      menu.append(item); owned_items.add(item);
    }
  };
  collect(app.workspace.on("file-menu", ({ menu, path }) => add_items(menu.containerEl, path)));
  // 标签菜单没有扩展事件；在根布局完成菜单重建后，向该菜单追加两个条目。
  document.addEventListener("contextmenu", (event) => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>(".typ-tab") : null;
    if (!tab) return;
    const menu = Array.from(document.querySelectorAll<HTMLElement>(".context-menu"))
      .find((candidate) => candidate.querySelector('[data-key="removeTab"]'));
    if (!menu) return;
    add_items(menu, tab.getAttribute("data-id") ?? "");
    const timer = window.setTimeout(() => {
      timers.delete(timer); if (disposed) return;
      const previous = menu_geometry.get(menu) ?? { top: menu.style.top, left: menu.style.left, owned_top: "", owned_left: "" };
      const bounds = menu.getBoundingClientRect();
      menu.style.top = Math.max(0, Math.min(bounds.top, window.innerHeight - bounds.height - 4)) + "px";
      menu.style.left = Math.max(0, Math.min(bounds.left, window.innerWidth - bounds.width - 4)) + "px";
      previous.owned_top = menu.style.top; previous.owned_left = menu.style.left; menu_geometry.set(menu, previous);
    }, 0);
    timers.add(timer);
  }, { signal: controller.signal });
  // 原生文件菜单在 mousedown 时执行动作。接管整个按钮手势，防止宿主提前关闭菜单或移动正文光标。
  for (const name of ["pointerdown", "mousedown", "mouseup", "click", "keydown"]) {
    document.addEventListener(name, (event) => {
      const item = event.target instanceof Element ? event.target.closest("[data-linux-note-copy-path]") : null;
      if (!item || !actions.has(item)) return;
      if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (name === "click" || (event instanceof KeyboardEvent && !event.repeat)) actions.get(item)!();
    }, { capture: true, signal: controller.signal });
  }
  document.documentElement.setAttribute("data-linux-note-copy-path", "ready");
  const dispose = () => {
    if (disposed) return;
    disposed = true; controller.abort(); for (const timer of timers) clearTimeout(timer); timers.clear();
    for (const cleanup of cleanups.reverse()) cleanup();
    for (const item of owned_items) item.remove(); owned_items.clear();
    for (const [menu, previous] of menu_geometry) {
      if (menu.style.top === previous.owned_top) menu.style.top = previous.top;
      if (menu.style.left === previous.owned_left) menu.style.left = previous.left;
    }
    menu_geometry.clear();
    if (previous_ready === null) document.documentElement.removeAttribute("data-linux-note-copy-path");
    else document.documentElement.setAttribute("data-linux-note-copy-path", previous_ready);
    if (active_dispose === dispose) active_dispose = undefined;
  };
  active_dispose = dispose;
  return dispose;
}
