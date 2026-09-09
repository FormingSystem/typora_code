import { git_icon } from "./git_icons";
import type { workspace_file_host } from "./workspace_files";
import { create_workspace_quick_open } from "./workspace_quick_open";
import { create_workspace_titlebar_definitions, type titlebar_runtime } from "./workspace_titlebar_entries";
import { create_workspace_titlebar_menu } from "./workspace_titlebar_menu";
import titlebar_css from "./workspace_titlebar.css";

function history_button(direction: -1 | 1): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `workspace-titlebar-history ${direction < 0 ? "is-back" : "is-forward"}`;
  button.append(git_icon(direction < 0 ? "arrow-left" : "arrow-right"));
  button.disabled = true;
  button.title = direction < 0 ? "后退（Alt+←）" : "前进（Alt+→）";
  button.setAttribute("aria-label", button.title);
  button.onclick = () => window.dispatchEvent(new CustomEvent("linux-note-reading-history-travel", { detail: { direction } }));
  return button;
}

/** 只编排标题栏区域；菜单数据、菜单交互、标签生命周期和外观设置由独立模块负责。 */
export function install_workspace_titlebar(files: workspace_file_host) {
  const runtime = window as unknown as titlebar_runtime;
  const bar = document.querySelector<HTMLElement>("#top-titlebar");
  if (!bar || !runtime.File?.isNode || runtime.File.isMac || bar.dataset.workspaceTitlebar) return;
  const platform = runtime.reqnode?.("process").platform;
  if (platform && !["win32", "linux"].includes(platform)) return;
  const events = new AbortController();
  let disposed = false;
  bar.dataset.workspaceTitlebar = "ready";
  const native_icons: Array<{button: HTMLElement; nodes: Node[]}> = [];
  const paths: Record<string, string> = {"w-min":"M3 8.5h10", "w-max":"M3.5 3.5h9v9h-9z", "w-restore":"M5.5 3.5h7v7M3.5 5.5h7v7h-7z", "w-close":"m3.5 3.5 9 9m0-9-9 9"};
  for (const [id, path] of Object.entries(paths)) {
    const button = bar.querySelector<HTMLElement>(`#${id}`); if (!button) continue;
    native_icons.push({button, nodes: [...button.childNodes]});
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("class", "workspace-window-icon"); svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(svg.namespaceURI, "path"); shape.setAttribute("d", path); svg.append(shape); button.replaceChildren(svg);
  }
  const style = document.createElement("style");
  style.dataset.workspaceTitlebarStyle = "true";
  style.textContent = titlebar_css;
  document.head.append(style);
  if (!runtime.File.option?.framelessWindow && runtime.reqnode) {
    void runtime.reqnode("electron").ipcRenderer.invoke("setting.put", "framelessWindow", true).then(() => {
      if (!disposed) document.documentElement.dataset.linuxNoteTitlebar = "next-window";
    }).catch(() => { if (!disposed) document.documentElement.dataset.linuxNoteTitlebar = "setting-failed"; });
  } else document.documentElement.dataset.linuxNoteTitlebar = "ready";

  const icon_slot = document.createElement("span");
  icon_slot.className = "workspace-titlebar-icon-slot";
  const icon = document.createElement("img");
  icon.className = "workspace-titlebar-icon";
  icon.src = new URL("./assets/icon/icon_32x32@2x.png", document.baseURI).href;
  icon.alt = "Typora";
  icon.draggable = false;
  icon_slot.append(icon);

  const quick_open = create_workspace_quick_open(files);
  const definitions = create_workspace_titlebar_definitions(files, runtime, quick_open.open);
  const titlebar_menu = create_workspace_titlebar_menu(definitions);
  const command_area = document.createElement("div");
  command_area.className = "workspace-titlebar-command-area";
  const navigation = document.createElement("div");
  navigation.className = "workspace-titlebar-navigation";
  navigation.setAttribute("aria-label", "编辑位置历史");
  const back = history_button(-1), forward = history_button(1);
  back.disabled = document.documentElement.dataset.linuxNoteHistoryBack !== "true";
  forward.disabled = document.documentElement.dataset.linuxNoteHistoryForward !== "true";
  navigation.append(back, forward);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "workspace-titlebar-quick-open";
  trigger.title = "按文件名搜索（Ctrl+P）";
  trigger.setAttribute("aria-label", trigger.title);
  const trigger_text = document.createElement("span");
  const refresh_title = () => {
    const workspace = files.context_root();
    trigger_text.textContent = workspace ? files.path_api.basename(workspace) : (document.title || "搜索");
  };
  trigger.append(git_icon("search"), trigger_text);
  trigger.onclick = () => quick_open.open();
  refresh_title();
  command_area.append(navigation, trigger);
  window.addEventListener("linux-note-reading-history-state", event => {
    const state = (event as CustomEvent<{ back?: boolean; forward?: boolean }>).detail || {};
    back.disabled = !state.back;
    forward.disabled = !state.forward;
  }, {signal: events.signal});
  window.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.code !== "Numpad0" || event.isComposing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runtime.ClientCommand?.resetZoom?.();
  }, {capture: true, signal: events.signal});
  const layout_actions = document.createElement("div");
  layout_actions.className = "workspace-titlebar-layout-actions";
  layout_actions.setAttribute("aria-label", "布局控制");
  for (const [name, title, action] of [
    ["layout-sidebar-left", "切换主侧边栏", () => files.core.app.workspace.sidebar.toggle()],
    ["layout-panel", "切换底部面板", () => files.core.app.commands.run("linux_note:terminal_toggle_panel")],
  ] as const) {
    const button = document.createElement("button"); button.type = "button";
    button.title = title; button.setAttribute("aria-label", title); button.append(git_icon(name)); button.onclick = action;
    layout_actions.append(button);
  }
  bar.insertBefore(layout_actions, bar.querySelector("#w-traffic-lights"));
  bar.prepend(icon_slot, titlebar_menu.menu);
  bar.append(command_area);
  const title = document.querySelector<HTMLElement>("#title-text");
  let title_observer: MutationObserver | undefined;
  const original_title = title?.getAttribute("title");
  if (title) {
    const refresh = () => { title.title = title.textContent || document.title; refresh_title(); };
    refresh();
    title_observer = new MutationObserver(refresh);
    title_observer.observe(title, { childList: true, characterData: true, subtree: true });
  }
  return { menu: titlebar_menu.menu, quick_open, back, forward, close_menu: titlebar_menu.close, dispose() {
    if (disposed) return; disposed = true; events.abort(); title_observer?.disconnect();
    titlebar_menu.dispose(); quick_open.dispose(); icon_slot.remove(); command_area.remove(); layout_actions.remove(); style.remove();
    for (const {button, nodes} of native_icons) button.replaceChildren(...nodes);
    if (title) { if (original_title == null) title.removeAttribute("title"); else title.setAttribute("title", original_title); }
    delete bar.dataset.workspaceTitlebar; delete document.documentElement.dataset.linuxNoteTitlebar;
  } };
}
