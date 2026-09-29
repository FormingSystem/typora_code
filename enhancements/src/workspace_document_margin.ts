import {workspace_text} from "./workspace_i18n";
import {acquire_workspace_footer_layout} from "./workspace_footer_layout";
import {change_reading_geometry} from "./reading_reflow";
import {acquire_workspace_style} from "./workspace_styles";
import margin_css from "./workspace_document_margin.css";

// Reuse the storage field of the status bar slider of 71fcf1d; other appearance fields are only retained, not reapplied.
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
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(workspace_text("document_margin_original_appearance_settings_cannot_be_read"));
  return value as Record<string,unknown>;
}

function read_margin():number {
  try { return normalize_margin(stored_appearance().document_margin_percent); }
  catch { return 0; }
}

/** After width rearrangement, the same document content paragraph is still displayed; the document content, selection, file, and reading history are not modified. */
function preserve_reading_position(change:()=>void):void {
  const content = document.querySelector<HTMLElement>("content");
  const write = content?.querySelector<HTMLElement>(":scope > #write");
  if(content&&write&&write.getBoundingClientRect().height>0)change_reading_geometry(content,write,change);
  else change();
}

/** Restore the original status bar percentage entry; it only controls the left and right margins of the active Markdown document content box. */
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
  const description = workspace_text("document_margin_markdown_single_margin_of_the_document_content");
  container.title = description;
  const label = document.createElement("span");
  label.className = "linux-note-document-margin-label workspace-footer-text";
  label.textContent = workspace_text("document_margin_margin");
  const input = document.createElement("input");
  input.type = "range";input.min = String(MINIMUM_MARGIN);input.max = String(MAXIMUM_MARGIN);input.step = "1";
  input.setAttribute("aria-label", workspace_text("document_margin_markdown_single_margin_percentage_of_the_document_content"));
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
      // Save first, then publish; re-read merge, cannot overwrite other window saved font settings.
      localStorage.setItem(SETTINGS_KEY,JSON.stringify({...stored_appearance(),document_margin_percent:value}));
    } catch (error) {
      sync_control();input.setAttribute("aria-invalid","true");
      container.title = workspace_text("document_margin_margin_save_failure", {value_0: String(String((error as Error)?.message || error))});
      console.warn(workspace_text("document_margin_typora_code_document_margin_save_failure"),error);
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
