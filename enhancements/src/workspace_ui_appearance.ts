import appearance_css from "./workspace_ui_appearance.css";
import { workspace_button as button, workspace_dialog, workspace_element as el } from "./workspace_widgets";

const SETTINGS_KEY = "linux-note:workspace-ui-appearance:v1";
const STYLE_ID = "linux-note-workspace-ui-appearance-style";
const DEFAULT_FONT = '"Segoe WPC", "Segoe UI", "Microsoft YaHei UI", sans-serif';
const DEFAULT_SIZE = 13;
const DEFAULT_MARGIN = 0;
const MINIMUM_MARGIN = 0;
const MAXIMUM_MARGIN = 24;

type appearance = { font_family: string; font_size: number; document_margin_percent: number };
type margin_control = {
  container: HTMLElement;
  footer: HTMLElement;
  input: HTMLInputElement;
  output: HTMLOutputElement;
  dispose(): void;
};
export type workspace_ui_appearance_binding = { dispose(): void };
type appearance_runtime = {
  binding: workspace_ui_appearance_binding;
  controls: Map<HTMLElement, margin_control>;
  observer: MutationObserver;
  reconcile_pending: boolean;
  storage_listener: (event: StorageEvent) => void;
};
type appearance_dialog_session = { root: HTMLElement; cancel(): void };

let runtime: appearance_runtime | undefined;
let active_value: appearance = normalize();
let active_dialog: appearance_dialog_session | undefined;

function normalize(value: Partial<appearance> = {}): appearance {
  const font_size = Number(value.font_size);
  const document_margin_percent = Number(value.document_margin_percent);
  return {
    font_family: String(value.font_family || DEFAULT_FONT).trim() || DEFAULT_FONT,
    font_size: Number.isFinite(font_size) ? Math.max(11, Math.min(18, Math.round(font_size))) : DEFAULT_SIZE,
    document_margin_percent: Number.isFinite(document_margin_percent)
      ? Math.max(MINIMUM_MARGIN, Math.min(MAXIMUM_MARGIN, Math.round(document_margin_percent))) : DEFAULT_MARGIN,
  };
}

function read(): appearance {
  try { return normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); }
  catch { return normalize(); }
}

function write(value: appearance): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); }
  catch { /* 当前窗口仍应用所选外观。 */ }
}

function sync_range_progress(input: HTMLInputElement): void {
  const minimum = Number(input.min) || 0;
  const maximum = Number(input.max) || 100;
  const progress = maximum > minimum ? (Number(input.value) - minimum) * 100 / (maximum - minimum) : 0;
  input.style.setProperty("--linux-note-range-progress",
    String(Math.max(0, Math.min(100, Math.round(progress * 100) / 100))) + "%");
}

function sync_margin_control(control: margin_control, value: appearance): void {
  const text = String(value.document_margin_percent) + "%";
  control.input.value = String(value.document_margin_percent);
  if (control.output.value !== text) control.output.value = text;
  if (control.output.textContent !== text) control.output.textContent = text;
  sync_range_progress(control.input);
}

function sync_margin_controls(value: appearance): void {
  if (!runtime) return;
  for (const control of runtime.controls.values()) sync_margin_control(control, value);
}

function apply(value: appearance): void {
  active_value = normalize(value);
  const root = document.documentElement;
  root.style.setProperty("--linux-note-ui-font-family", active_value.font_family);
  root.style.setProperty("--linux-note-ui-font-size", String(active_value.font_size) + "px");
  root.style.setProperty("--linux-note-document-margin", String(active_value.document_margin_percent) + "%");
  root.style.setProperty("--linux-note-document-width", String(100 - active_value.document_margin_percent * 2) + "%");
  sync_margin_controls(active_value);
}

function ensure_style(): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.dataset.workspaceUiAppearanceStyle = "ready";
  if (style.textContent !== appearance_css) style.textContent = appearance_css;
  for (const duplicate of document.querySelectorAll<HTMLStyleElement>("style[data-workspace-ui-appearance-style]")) {
    if (duplicate !== style) duplicate.remove();
  }
}

function create_margin_control(footer: HTMLElement): margin_control {
  const container = el("label", "linux-note-document-margin");
  container.title = "Markdown 正文单侧边距";
  container.append(el("span", "linux-note-document-margin-label", "边距"));
  const input = el("input");
  input.type = "range";
  input.min = String(MINIMUM_MARGIN);
  input.max = String(MAXIMUM_MARGIN);
  input.step = "1";
  input.setAttribute("aria-label", "Markdown 正文单侧边距百分比");
  const output = el("output");
  output.setAttribute("aria-live", "polite");
  const on_input = () => {
    const document_margin_percent = normalize({ document_margin_percent: Number(input.value) }).document_margin_percent;
    write(normalize({ ...read(), document_margin_percent }));
    apply({ ...active_value, document_margin_percent });
  };
  input.addEventListener("input", on_input);
  container.append(input, output);
  const control: margin_control = {
    container, footer, input, output,
    dispose() { input.removeEventListener("input", on_input); container.remove(); },
  };
  sync_margin_control(control, active_value);
  return control;
}

function reconcile_footer_controls(state: appearance_runtime): void {
  for (const [footer, control] of state.controls) {
    if (!footer.isConnected || control.container.parentElement !== footer) {
      control.dispose();
      state.controls.delete(footer);
    }
  }
  for (const footer of document.querySelectorAll<HTMLElement>("footer.ty-footer")) {
    let control = state.controls.get(footer);
    if (!control) {
      for (const child of [...footer.children]) {
        if ((child as HTMLElement).classList?.contains("linux-note-document-margin")) child.remove();
      }
      control = create_margin_control(footer);
      state.controls.set(footer, control);
    }
    const right_item = footer.querySelector<HTMLElement>(".footer-item-right");
    if (control.container.parentElement !== footer || control.container.nextSibling !== right_item) {
      footer.insertBefore(control.container, right_item);
    }
    sync_margin_control(control, active_value);
  }
}

function mutation_affects_footer(record: MutationRecord): boolean {
  if (record.target instanceof Element && record.target.matches("footer.ty-footer")) return true;
  return [...record.addedNodes, ...record.removedNodes].some(node =>
    node instanceof Element && (node.matches("footer.ty-footer") || Boolean(node.querySelector("footer.ty-footer"))));
}

function schedule_footer_reconciliation(state: appearance_runtime): void {
  if (state.reconcile_pending) return;
  state.reconcile_pending = true;
  queueMicrotask(() => {
    state.reconcile_pending = false;
    if (runtime === state) reconcile_footer_controls(state);
  });
}

/** 设置应用外壳字体和 Markdown 几何；不覆盖主题的正文字体、颜色、行高、标题或代码样式。 */
export function install_workspace_ui_appearance(): workspace_ui_appearance_binding {
  ensure_style();
  document.documentElement.dataset.linuxNoteUiAppearance = "ready";
  if (runtime) {
    if (!active_dialog?.root.isConnected) apply(read());
    reconcile_footer_controls(runtime);
    return runtime.binding;
  }
  apply(read());
  const controls = new Map<HTMLElement, margin_control>();
  let state: appearance_runtime;
  const observer = new MutationObserver(records => {
    if (records.some(mutation_affects_footer)) schedule_footer_reconciliation(state);
  });
  const storage_listener = (event: StorageEvent) => { if (event.key === SETTINGS_KEY) apply(read()); };
  const binding: workspace_ui_appearance_binding = { dispose() {
    if (runtime !== state) return;
    active_dialog?.cancel();
    observer.disconnect();
    window.removeEventListener("storage", storage_listener);
    for (const control of controls.values()) control.dispose();
    controls.clear();
    runtime = undefined;
    document.getElementById(STYLE_ID)?.remove();
    delete document.documentElement.dataset.linuxNoteUiAppearance;
    for (const property of ["--linux-note-ui-font-family", "--linux-note-ui-font-size", "--linux-note-document-margin", "--linux-note-document-width"]) {
      document.documentElement.style.removeProperty(property);
    }
  } };
  state = { binding, controls, observer, reconcile_pending: false, storage_listener };
  runtime = state;
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  window.addEventListener("storage", storage_listener);
  reconcile_footer_controls(state);
  return binding;
}

export function dispose_workspace_ui_appearance(): void {
  runtime?.binding.dispose();
}

export function open_workspace_ui_appearance(): void {
  install_workspace_ui_appearance();
  if (active_dialog?.root.isConnected) {
    active_dialog.root.querySelector<HTMLElement>("input,button")?.focus();
    return;
  }
  const current = read();
  const dialog = workspace_dialog("界面外观");
  dialog.root.dataset.workspaceUiAppearance = "true";
  const font_label = el("label", "", "界面字体");
  const font = el("input");
  font.value = current.font_family;
  font.setAttribute("aria-label", "界面字体");
  const size_label = el("label", "", "界面字号 " + String(current.font_size) + "px");
  const size = el("input");
  size.type = "range";
  size.min = "11";
  size.max = "18";
  size.step = "1";
  size.value = String(current.font_size);
  size.setAttribute("aria-label", "界面字号");
  const margin_label = el("label", "", "Markdown 单侧边距 " + String(current.document_margin_percent) + "%");
  const margin = el("input");
  margin.type = "range";
  margin.min = String(MINIMUM_MARGIN);
  margin.max = String(MAXIMUM_MARGIN);
  margin.step = "1";
  margin.value = String(current.document_margin_percent);
  margin.setAttribute("aria-label", "Markdown 正文单侧边距百分比");
  const preview = () => {
    const value = normalize({ font_family: font.value, font_size: Number(size.value), document_margin_percent: Number(margin.value) });
    size_label.textContent = "界面字号 " + String(value.font_size) + "px";
    margin_label.textContent = "Markdown 单侧边距 " + String(value.document_margin_percent) + "%";
    sync_range_progress(size);
    sync_range_progress(margin);
    apply(value);
  };
  font.oninput = preview;
  size.oninput = preview;
  margin.oninput = preview;
  sync_range_progress(size);
  sync_range_progress(margin);
  dialog.content.append(font_label, font, size_label, size, margin_label, margin,
    el("p", "", "字体仅影响菜单、标签、侧栏和弹窗；边距仅调整 Markdown 正文宽度，主题渲染保持原样。"));
  let saved = false;
  let finished = false;
  let observer: MutationObserver;
  let session: appearance_dialog_session;
  const finish = () => {
    if (finished) return;
    finished = true;
    observer.disconnect();
    if (!saved) apply(read());
    if (active_dialog === session) active_dialog = undefined;
  };
  observer = new MutationObserver(() => { if (!dialog.root.isConnected) finish(); });
  observer.observe(document.body, { childList: true });
  session = {
    root: dialog.root,
    cancel() {
      if (finished) return;
      finish();
      dialog.close();
    },
  };
  active_dialog = session;
  const close_button = dialog.footer.querySelector<HTMLButtonElement>("button");
  if (close_button) close_button.onclick = session.cancel;
  dialog.footer.prepend(
    button("恢复默认", () => {
      font.value = DEFAULT_FONT;
      size.value = String(DEFAULT_SIZE);
      margin.value = String(DEFAULT_MARGIN);
      preview();
    }),
    button("应用", () => {
      const value = normalize({ font_family: font.value, font_size: Number(size.value), document_margin_percent: Number(margin.value) });
      write(value);
      saved = true;
      apply(value);
      session.cancel();
    }),
  );
}
