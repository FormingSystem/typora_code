import { workspace_button as button, workspace_dialog, workspace_element as el } from "./workspace_widgets";

const SETTINGS_KEY = "linux-note:workspace-ui-appearance:v1";
const DEFAULT_FONT = '"Segoe WPC", "Segoe UI", "Microsoft YaHei UI", sans-serif';
const DEFAULT_SIZE = 13;

type appearance = { font_family: string; font_size: number };

function normalize(value: Partial<appearance> = {}): appearance {
  const font_size = Number(value.font_size);
  return {
    font_family: String(value.font_family || DEFAULT_FONT).trim() || DEFAULT_FONT,
    font_size: Number.isFinite(font_size) ? Math.max(11, Math.min(18, Math.round(font_size))) : DEFAULT_SIZE,
  };
}

function read(): appearance {
  try { return normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); }
  catch { return normalize(); }
}

function apply(value: appearance): void {
  document.documentElement.style.setProperty("--linux-note-ui-font-family", value.font_family);
  document.documentElement.style.setProperty("--linux-note-ui-font-size", `${value.font_size}px`);
}

/** 只设置应用外壳字体；不匹配 #write、Markdown 预览或 Monaco 编辑器。 */
export function install_workspace_ui_appearance(): void {
  if (document.documentElement.dataset.linuxNoteUiAppearance) return;
  document.documentElement.dataset.linuxNoteUiAppearance = "ready";
  const style = document.createElement("style");
  style.dataset.workspaceUiAppearance = "true";
  style.textContent = `:is(#top-titlebar,.typ-ribbon,.typ-workspace-tab-header,.context-menu,.workspace-quick-open,.git-graph-dialog,.git-graph-menu),#typora-sidebar :is(button,input,textarea,select,summary,.workspace-explorer-row,.workspace-outline-row,.workspace-search-heading,.workspace-search-options-row,.workspace-search-status):not(.workspace-lookup-preview *){font-family:var(--linux-note-ui-font-family,${DEFAULT_FONT})!important;font-size:var(--linux-note-ui-font-size,${DEFAULT_SIZE}px)!important}`;
  document.head.append(style);
  apply(read());
}

export function open_workspace_ui_appearance(): void {
  const current = read();
  const dialog = workspace_dialog("界面字体");
  dialog.root.dataset.workspaceUiAppearance = "true";
  const font_label = el("label", "", "界面字体");
  const font = el("input");
  font.value = current.font_family;
  font.setAttribute("aria-label", "界面字体");
  const size_label = el("label", "", `界面字号 ${current.font_size}px`);
  const size = el("input");
  size.type = "range";
  size.min = "11";
  size.max = "18";
  size.step = "1";
  size.value = String(current.font_size);
  size.setAttribute("aria-label", "界面字号");
  const preview = () => {
    const value = normalize({ font_family: font.value, font_size: Number(size.value) });
    size_label.textContent = `界面字号 ${value.font_size}px`;
    apply(value);
  };
  font.oninput = preview;
  size.oninput = preview;
  dialog.content.append(font_label, font, size_label, size, el("p", "", "仅调整菜单、标签、侧栏和弹窗；Markdown 正文渲染保持原样。"));
  const close = dialog.close;
  let saved = false;
  const observer = new MutationObserver(() => {
    if (!dialog.root.isConnected) { observer.disconnect(); if (!saved) apply(current); }
  });
  observer.observe(document.body, { childList: true });
  dialog.footer.prepend(
    button("恢复默认", () => { font.value = DEFAULT_FONT; size.value = String(DEFAULT_SIZE); preview(); }),
    button("应用", () => {
      const value = normalize({ font_family: font.value, font_size: Number(size.value) });
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch { /* 本窗口仍使用所选设置。 */ }
      saved = true;
      apply(value);
      close();
    }),
  );
}
