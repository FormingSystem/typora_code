import workspace_chrome_css from "./workspace_chrome.css";

const STYLE_ID = "linux-note-workspace-chrome-style";
export type workspace_chrome_binding = { dispose(): void };
let active_binding: workspace_chrome_binding | undefined;

function ensure_workspace_chrome(): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  if (style.textContent !== workspace_chrome_css) style.textContent = workspace_chrome_css;
  document.documentElement.dataset.linuxNoteWorkspaceChrome = "ready";
}

/** Shared VS Code-like geometry for native, Monaco, xterm and extension controls. */
export function install_workspace_chrome(): workspace_chrome_binding {
  ensure_workspace_chrome();
  if (active_binding) return active_binding;
  // 读取宿主正文背景判断主题，不让系统深色偏好覆盖用户选中的浅色主题。
  const refresh_theme = () => {
    const style = getComputedStyle(document.body);
    const probe = document.createElement("span"); probe.style.color = style.getPropertyValue("--bg-color").trim() || style.backgroundColor;
    document.body.append(probe);
    const channels = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) || [255,255,255]; probe.remove();
    const theme = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 < 128 ? "dark" : "light";
    if (document.documentElement.dataset.linuxNoteShellTheme !== theme) document.documentElement.dataset.linuxNoteShellTheme = theme;
  };
  const observer = new MutationObserver(refresh_theme);
  observer.observe(document.documentElement, {attributes: true, attributeFilter: ["class", "style", "data-theme"]});
  observer.observe(document.body, {attributes: true, attributeFilter: ["class", "style"]});
  // 原生切换主题可直接替换 link href；load 之后再读取计算色。
  const on_theme_load = (event: Event) => { if (event.target instanceof HTMLLinkElement) refresh_theme(); };
  document.addEventListener("load", on_theme_load, true);
  refresh_theme();
  const binding: workspace_chrome_binding = { dispose() {
    if (active_binding !== binding) return;
    active_binding = undefined; observer.disconnect(); document.removeEventListener("load", on_theme_load, true);
    delete document.documentElement.dataset.linuxNoteShellTheme;
    document.getElementById(STYLE_ID)?.remove();
    delete document.documentElement.dataset.linuxNoteWorkspaceChrome;
  } };
  active_binding = binding;
  return binding;
}

export function dispose_workspace_chrome(): void {
  active_binding?.dispose();
}
