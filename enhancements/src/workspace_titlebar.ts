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
  bar.dataset.workspaceTitlebar = "ready";
  const style = document.createElement("style");
  style.dataset.workspaceTitlebarStyle = "true";
  style.textContent = titlebar_css;
  document.head.append(style);
  if (!runtime.File.option?.framelessWindow && runtime.reqnode) {
    void runtime.reqnode("electron").ipcRenderer.invoke("setting.put", "framelessWindow", true).then(() => {
      document.documentElement.dataset.linuxNoteTitlebar = "next-window";
    }).catch(() => { document.documentElement.dataset.linuxNoteTitlebar = "setting-failed"; });
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
  trigger.onclick = quick_open.open;
  refresh_title();
  command_area.append(navigation, trigger);
  window.addEventListener("linux-note-reading-history-state", event => {
    const state = (event as CustomEvent<{ back?: boolean; forward?: boolean }>).detail || {};
    back.disabled = !state.back;
    forward.disabled = !state.forward;
  });
  window.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.code !== "Numpad0" || event.isComposing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runtime.ClientCommand?.resetZoom?.();
  }, true);
  bar.prepend(icon_slot, titlebar_menu.menu);
  bar.append(command_area);
  const title = document.querySelector<HTMLElement>("#title-text");
  if (title) {
    const refresh = () => { title.title = title.textContent || document.title; refresh_title(); };
    refresh();
    new MutationObserver(refresh).observe(title, { childList: true, characterData: true, subtree: true });
  }
  return { menu: titlebar_menu.menu, quick_open, back, forward, close_menu: titlebar_menu.close };
}
