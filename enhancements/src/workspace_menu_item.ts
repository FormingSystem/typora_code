import {check as check_icon} from "../vendor/codicons/icons.json";

/** 标记能力属于条目，列宽属于整张菜单；所有菜单采用VS Code的2em标记列。 */
export function align_workspace_menu_columns(menu: HTMLElement, row_selector: string, label_selector: string, shortcut_selector?: string): void {
  const rows = [...menu.querySelectorAll<HTMLElement>(row_selector)];
  const text_width = (node: HTMLElement | null) => {
    if (!node) return 0;
    // 初始菜单可能已经压窄；测完整单行宽度，不能把折行后的Range当作固有宽度。
    const value=node.style.getPropertyValue('white-space'),priority=node.style.getPropertyPriority('white-space');
    try{
      node.style.setProperty('white-space','nowrap','important');
      const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().width;
    }finally{if(value)node.style.setProperty('white-space',value,priority);else node.style.removeProperty('white-space');}
  };
  menu.style.setProperty('--workspace-menu-leading-width', '2em');
  const horizontal = (style: CSSStyleDeclaration, keys: string[]) => keys.reduce((sum,key)=>sum+(parseFloat(style.getPropertyValue(key))||0),0);
  // 按真实行的组合求最大值，无快捷键行不会被其他行的快捷键挤占。
  const width = Math.max(0,...rows.map(row=>{
    const label=row.querySelector<HTMLElement>(label_selector),shortcut=shortcut_selector?row.querySelector<HTMLElement>(shortcut_selector):null;
    const has_shortcut=Boolean(shortcut?.textContent?.trim());
    row.dataset.menuShortcut=String(has_shortcut);
    const style=getComputedStyle(row);
    return text_width(label)+(has_shortcut?text_width(shortcut)+4*parseFloat(style.fontSize):0)+horizontal(style,['padding-left','padding-right','border-left-width','border-right-width','margin-left','margin-right']);
  }));
  menu.style.width=Math.ceil(width+horizontal(getComputedStyle(menu),['padding-left','padding-right','border-left-width','border-right-width']))+'px';
  // 长菜单的非覆盖式滚动条会占据内容宽度；按实际占用补足，仍受视口max-width约束。
  const gutter=Math.max(0,menu.offsetWidth-menu.clientWidth-horizontal(getComputedStyle(menu),['border-left-width','border-right-width']));
  if(gutter)menu.style.width=(parseFloat(menu.style.width)+Math.ceil(gutter))+'px';
}

/** 普通命令无状态槽；false 表示可勾选但未选中，不能与 undefined 混同。 */
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
