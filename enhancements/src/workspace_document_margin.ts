import {acquire_workspace_footer_layout} from "./workspace_footer_layout";
import {capture_position, apply_position} from "./reading_positions";
import {acquire_workspace_style} from "./workspace_styles";
import margin_css from "./workspace_document_margin.css";

// 复用 71fcf1d 底栏滑块的存储字段；其余外观字段仅保留，不重新应用。
const SETTINGS_KEY = "linux-note:workspace-ui-appearance:v1";
const MINIMUM_MARGIN = 0;
const MAXIMUM_MARGIN = 24;
const ROOT_ATTRIBUTE = "data-linux-note-document-margin";
const properties = ["--linux-note-document-margin", "--linux-note-document-width"] as const;
type margin_binding = {dispose():void};
const bindings = new WeakMap<HTMLElement, margin_binding>();

function normalize_margin(value:unknown):number {
  const margin = Number(value);
  return Number.isFinite(margin) ? Math.max(MINIMUM_MARGIN, Math.min(MAXIMUM_MARGIN, Math.round(margin))) : 0;
}

function stored_appearance():Record<string,unknown> {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return {};
  const value:unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("原有外观设置无法读取。");
  return value as Record<string,unknown>;
}

function read_margin():number {
  try { return normalize_margin(stored_appearance().document_margin_percent); }
  catch { return 0; }
}

/** 宽度重排后仍显示同一正文段落，不修改正文、选区、文件或阅读历史。 */
function preserve_reading_position(change:()=>void):void {
  const content = document.querySelector<HTMLElement>("content");
  const write = content?.querySelector<HTMLElement>(":scope > #write");
  const position = content && write && write.getBoundingClientRect().height > 0 ? capture_position(content, write) : undefined;
  change();
  if (position && content?.isConnected && write?.parentElement === content) apply_position(content, write, position);
}

/** 恢复原有底栏百分比入口，只控制活动 Markdown 正文框的左右边距。 */
export function install_workspace_document_margin(footer:HTMLElement):margin_binding {
  const existing = bindings.get(footer);
  if (existing) return existing;
  const root = document.documentElement;
  const previous_attribute = root.getAttribute(ROOT_ATTRIBUTE);
  const previous_properties = properties.map(name=>({name,value:root.style.getPropertyValue(name),priority:root.style.getPropertyPriority(name)}));
  const style = acquire_workspace_style("typora-code-style:workspace_document_margin", margin_css);
  const layout=acquire_workspace_footer_layout();
  const container = document.createElement("label");
  container.className = "linux-note-document-margin workspace-footer-group";
  const description = "Markdown 正文单侧边距";
  container.title = description;
  const label = document.createElement("span");
  label.className = "linux-note-document-margin-label workspace-footer-text";
  label.textContent = "边距";
  const input = document.createElement("input");
  input.type = "range";input.min = String(MINIMUM_MARGIN);input.max = String(MAXIMUM_MARGIN);input.step = "1";
  input.setAttribute("aria-label", "Markdown 正文单侧边距百分比");
  const output = document.createElement("output");output.className="workspace-footer-text";output.setAttribute("aria-live", "polite");
  container.append(label,input,output);
  footer.insertBefore(container,footer.querySelector(":scope > .footer-item-right"));
  let disposed = false;
  let active_margin = read_margin();
  const sync_control = () => {
    input.value = String(active_margin);
    output.value = `${active_margin}%`;
    input.style.setProperty("--linux-note-range-progress", `${active_margin * 100 / MAXIMUM_MARGIN}%`);
  };
  const apply = (value:number) => {
    active_margin = normalize_margin(value);
    preserve_reading_position(()=>{
      root.setAttribute(ROOT_ATTRIBUTE,"ready");
      root.style.setProperty(properties[0],`${active_margin}%`);
      root.style.setProperty(properties[1],`${100 - active_margin * 2}%`);
    });
    sync_control();
  };
  const on_input = () => {
    const value = normalize_margin(input.value);
    try {
      // 先保存再发布；重读合并，不能覆盖别的窗口保存的字体等设置。
      localStorage.setItem(SETTINGS_KEY,JSON.stringify({...stored_appearance(),document_margin_percent:value}));
    } catch (error) {
      sync_control();input.setAttribute("aria-invalid","true");
      container.title = `边距保存失败：${String((error as Error)?.message || error)}`;
      console.warn("[Typora Code document margin] 保存失败",error);
      return;
    }
    input.removeAttribute("aria-invalid");container.title = description;
    apply(value);
  };
  const on_storage = (event:StorageEvent) => {
    if (!disposed && (event.key === SETTINGS_KEY || event.key === null)) {
      input.removeAttribute("aria-invalid");container.title = description;apply(read_margin());
    }
  };
  input.addEventListener("input",on_input);
  window.addEventListener("storage",on_storage);
  apply(active_margin);
  const binding:margin_binding = {dispose() {
    if (disposed) return;disposed = true;
    input.removeEventListener("input",on_input);window.removeEventListener("storage",on_storage);
    preserve_reading_position(()=>{
      container.remove();
      if (previous_attribute === null) root.removeAttribute(ROOT_ATTRIBUTE);else root.setAttribute(ROOT_ATTRIBUTE,previous_attribute);
      for (const property of previous_properties) {
        if (property.value) root.style.setProperty(property.name,property.value,property.priority);else root.style.removeProperty(property.name);
      }
      layout.remove();style.remove();
    });
    bindings.delete(footer);
  }};
  bindings.set(footer,binding);
  return binding;
}
