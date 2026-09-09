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
  const binding: workspace_chrome_binding = { dispose() {
    if (active_binding !== binding) return;
    active_binding = undefined;
    document.getElementById(STYLE_ID)?.remove();
    delete document.documentElement.dataset.linuxNoteWorkspaceChrome;
  } };
  active_binding = binding;
  return binding;
}

export function dispose_workspace_chrome(): void {
  active_binding?.dispose();
}
