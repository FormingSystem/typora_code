import {check as check_icon} from "../vendor/codicons/icons.json";

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
