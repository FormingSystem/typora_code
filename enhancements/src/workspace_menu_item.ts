import {check as check_icon} from "../vendor/codicons/icons.json";

/** 标记能力属于条目，列宽属于整张菜单；所有菜单采用VS Code的2em标记列。 */
export function align_workspace_menu_columns(menu: HTMLElement, row_selector: string, label_selector: string, shortcut_selector?: string): {label_width:number;shortcut_width:number} {
  const rows = [...menu.querySelectorAll<HTMLElement>(row_selector)];
  const text_width = (selector?: string) => selector ? Math.max(0,...rows.map(row => {
    const node = row.querySelector(selector); if (!node) return 0;
    const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().width;
  })) : 0;
  menu.style.setProperty('--workspace-menu-leading-width', '2em');
  const shortcut_width = Math.ceil(text_width(shortcut_selector));
  menu.style.setProperty('--workspace-menu-shortcut-width', shortcut_width + 'px');
  return {label_width:Math.ceil(text_width(label_selector)),shortcut_width};
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
