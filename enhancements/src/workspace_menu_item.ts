import {check as check_icon} from "../vendor/codicons/icons.json";

/** The marking capability belongs to the item; the column width belongs to the entire menu; all menus use the VS Code's 2em marking column. */
export function align_workspace_menu_columns(menu: HTMLElement, row_selector: string, label_selector: string, shortcut_selector?: string): void {
  const rows = [...menu.querySelectorAll<HTMLElement>(row_selector)];
  const text_width = (node: HTMLElement | null) => {
    if (!node) return 0;
    // The initial menu may have already narrowed; measure the complete line width, and cannot treat the folded Range as the inherent width.
    const value=node.style.getPropertyValue('white-space'),priority=node.style.getPropertyPriority('white-space');
    try{
      node.style.setProperty('white-space','nowrap','important');
      const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().width;
    }finally{if(value)node.style.setProperty('white-space',value,priority);else node.style.removeProperty('white-space');}
  };
  menu.style.setProperty('--workspace-menu-leading-width', '2em');
  const horizontal = (style: CSSStyleDeclaration, keys: string[]) => keys.reduce((sum,key)=>sum+(parseFloat(style.getPropertyValue(key))||0),0);
  // Take the maximum value of the real line combination; the shortcut line without a shortcut will not be squeezed by other lines' shortcuts.
  const width = Math.max(0,...rows.map(row=>{
    const label=row.querySelector<HTMLElement>(label_selector),shortcut=shortcut_selector?row.querySelector<HTMLElement>(shortcut_selector):null;
    const has_shortcut=Boolean(shortcut?.textContent?.trim());
    row.dataset.menuShortcut=String(has_shortcut);
    const style=getComputedStyle(row);
    return text_width(label)+(has_shortcut?text_width(shortcut)+4*parseFloat(style.fontSize):0)+horizontal(style,['padding-left','padding-right','border-left-width','border-right-width','margin-left','margin-right']);
  }));
  menu.style.width=Math.ceil(width+horizontal(getComputedStyle(menu),['padding-left','padding-right','border-left-width','border-right-width']))+'px';
  // The non-overlapping scroll bar of long menus will occupy the content width; make up for it according to the actual occupation, but still be constrained by the viewport max-width.
  const gutter=Math.max(0,menu.offsetWidth-menu.clientWidth-horizontal(getComputedStyle(menu),['border-left-width','border-right-width']));
  if(gutter)menu.style.width=(parseFloat(menu.style.width)+Math.ceil(gutter))+'px';
}

/** Normal commands have no state slot; false indicates that it is checkable but not selected, and cannot be confused with undefined. */
export function create_workspace_menu_check(item: HTMLElement, checked: boolean | undefined, class_name: string): HTMLElement | undefined {
  const checkable = typeof checked === "boolean";
  item.setAttribute("role", checkable ? "menuitemcheckbox" : "menuitem");
  if (!checkable) { item.removeAttribute("aria-checked"); return; }
  item.setAttribute("aria-checked", String(checked));
  const slot = document.createElement("span"); slot.className = class_name; slot.setAttribute("aria-hidden", "true");
  if (checked) {
    const icon = document.importNode(new DOMParser().parseFromString(check_icon, "image/svg+xml").documentElement, true);
    icon.setAttribute("data-git-icon", "check"); icon.setAttribute("fill", "currentColor");
    slot.append(icon);
  }
  return slot;
}
