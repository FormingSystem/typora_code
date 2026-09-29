import {workspace_text} from "./workspace_i18n";
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
  const owned_items = new Set<Element>();
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
    if (text === null) { new core.Notice(workspace_text("file_path_actions_please_save_the_document_first_before_copying_the_path"), 2000); return; }
    // Call the host clipboard bridge, without creating textarea, without switching files, and without touching the document selection.
    void Promise.resolve().then(() => !disposed && runtime.JSBridge.invoke("clipboard.write", JSON.stringify({ text })))
      .then(() => { if (disposed) return; new core.Notice(relative ? workspace_text("file_path_actions_relative_path_copied") : workspace_text("file_path_actions_absolute_path_copied"), 1500); })
      .catch((error: unknown) => {
        if (disposed) return;
        console.error("[linux-note copy path]", error);
        new core.Notice(workspace_text("file_path_actions_copy_path_failed_please_retry"), 2500);
      });
  };
  for (const [id, relative, title] of [
    [COPY_ABSOLUTE_PATH, false, workspace_text("file_path_actions_copy_absolute_path")],
    [COPY_RELATIVE_PATH, true, workspace_text("file_path_actions_copy_relative_path")],
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
    for (const [relative, label, key] of [[false, workspace_text("file_path_actions_copy_absolute_path"), "absolute"], [true, workspace_text("file_path_actions_copy_relative_path"), "relative"]] as const) {
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
      if (!enabled) { item.classList.add("disabled"); anchor.title = workspace_text("file_path_actions_document_is_not_saved_no_file_path"); }
      item.append(anchor);
      actions.set(item, () => {
        if (!enabled) return;
        copy_path(target, relative);
        // Reuse the community menu's close event, clean up what it registered for document click listening.
        menu.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        menu.style.display = "none";
      });
      menu.append(item); owned_items.add(item);
    }
  };
  collect(app.workspace.on("file-menu", ({ menu, path }) => add_items(menu.containerEl, path)));
  // Native file menu executes actions when mousedown.
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
    disposed = true; controller.abort();
    for (const cleanup of cleanups.reverse()) cleanup();
    for (const item of owned_items) item.remove(); owned_items.clear();
    if (previous_ready === null) document.documentElement.removeAttribute("data-linux-note-copy-path");
    else document.documentElement.setAttribute("data-linux-note-copy-path", previous_ready);
    if (active_dispose === dispose) active_dispose = undefined;
  };
  active_dispose = dispose;
  return dispose;
}
