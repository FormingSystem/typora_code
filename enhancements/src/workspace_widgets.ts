import widget_css from "./workspace_widgets.css";
import {acquire_workspace_style} from "./workspace_styles";

export function workspace_element<K extends keyof HTMLElementTagNameMap>(tag: K, class_name = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = class_name; node.textContent = text; return node;
}
export function workspace_button(text: string, action: () => void, class_name = ""): HTMLButtonElement {
  const node = workspace_element("button", class_name, text); node.type = "button"; node.onclick = action; return node;
}
export function workspace_option(value: string, text: string): HTMLOptionElement {
  const node = workspace_element("option", "", text); node.value = value; return node;
}
const active_dialogs = new Set<() => void>();
export function dispose_workspace_widgets(): void {
  close_active_menu?.();
  for (const close of [...active_dialogs]) close();
}
export function workspace_dialog(title: string, close_title = "关闭", on_close?:()=>void): { root: HTMLElement; content: HTMLElement; footer: HTMLElement; close(): void } {
  const root = workspace_element("div", "git-graph-dialog-shade");
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", title);
  const panel = workspace_element("section", "git-graph-dialog"); const content = workspace_element("div", "git-graph-dialog-content"); const footer = workspace_element("div", "git-graph-dialog-footer");
  const previous = document.activeElement as HTMLElement | null;
  panel.tabIndex = -1;
  let closed = false;
  const is_top_dialog = () => document.querySelectorAll(".git-graph-dialog-shade").item(document.querySelectorAll(".git-graph-dialog-shade").length - 1) === root;
  // 搜索筛选、折叠或动态禁用后，只让仍可见且可操作的控件参与焦点循环。
  const focusable_controls = () => [...root.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href],[tabindex]')]
    .filter(node => node.tabIndex >= 0 && !node.matches(":disabled") && !node.closest("[hidden],[inert]") && node.getClientRects().length > 0 && !["hidden", "collapse"].includes(getComputedStyle(node).visibility))
    .sort((left, right) => (left.tabIndex > 0 ? left.tabIndex : Infinity) - (right.tabIndex > 0 ? right.tabIndex : Infinity));
  const close = () => {
    if (closed) return;
    const restore_focus = is_top_dialog(); closed = true;
    active_dialogs.delete(close); window.clearTimeout(focus_timer); window.removeEventListener("keydown", global_key, true); root.remove();
    if (restore_focus && previous?.isConnected && !previous.matches(":disabled")) previous.focus({ preventScroll: true });
    on_close?.();
  };
  // 执行按钮禁用后浏览器可能把焦点退回 body；Tab 与 Esc 仍作用于最上层弹窗。
  const global_key = (event: KeyboardEvent) => {
    if (!is_top_dialog()) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key === "Tab") {
      const controls = focusable_controls(); const current = controls.indexOf(document.activeElement as HTMLElement);
      const target = !controls.length ? panel : event.shiftKey && current <= 0 ? controls.at(-1) : !event.shiftKey && (current < 0 || current === controls.length - 1) ? controls[0] : undefined;
      if (target) { event.preventDefault(); event.stopImmediatePropagation(); target.focus({preventScroll: true}); }
    }
  };
  panel.append(workspace_element("h3", "", title), content, footer); root.append(panel); document.body.append(root);
  window.addEventListener("keydown", global_key, true);
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    event.stopPropagation();
  });
  footer.append(workspace_button(close_title, close));
  const focus_timer = window.setTimeout(() => { if (root.isConnected && is_top_dialog()) (focusable_controls()[0] || panel).focus(); }, 0);
  active_dialogs.add(close);
  return { root, content, footer, close };
}
export type workspace_menu_entry = { title: string; action: () => void; shortcut?:string; id?: string; disabled?: boolean; checked?: boolean; separator?: boolean; children?: workspace_menu_entry[] };
let close_active_menu: (() => void) | undefined;
export function workspace_menu(event: MouseEvent, entries: workspace_menu_entry[], class_name="", on_close?:()=>void): () => void {
  close_active_menu?.(); event.preventDefault(); event.stopPropagation();
  const menu_style=acquire_workspace_style("typora-code-style:widgets",widget_css);
  const previous_focus = document.activeElement as HTMLElement | null;
  let closed=false;
  const menus: HTMLElement[] = [];
  const close_from = (level: number) => { menus.splice(level).forEach(menu => menu.remove()); };
  const close = () => { if(closed)return;closed=true;close_from(0);menu_style.remove(); if (previous_focus?.isConnected) previous_focus.focus({preventScroll:true}); window.removeEventListener("pointerdown", outside, true); window.removeEventListener("blur", close); if (close_active_menu === close) close_active_menu = undefined; on_close?.(); };
  const outside = (input: Event) => { if (!menus.some(menu => menu.contains(input.target as Node))) close(); };
  const show = (items: workspace_menu_entry[], x: number, y: number, level: number, parent?: HTMLButtonElement) => {
    close_from(level); const menu = workspace_element("div", "git-graph-menu"+(class_name?" "+class_name:"")); menu.setAttribute("role", "menu"); menu.setAttribute("data-menu-level", String(level)); menus.push(menu);
    for (const entry of items) {
      if (entry.separator && menu.children.length) { const separator = workspace_element("hr"); separator.setAttribute("role", "separator"); menu.append(separator); }
      const node = workspace_button("", () => { if (entry.children) open_child(true); else { close(); entry.action(); } });
      const check = workspace_element("span", "git-menu-check"); if (entry.checked) check.append(git_icon("check"));
      const arrow = workspace_element("span", "git-menu-arrow"); if (entry.children) arrow.append(git_icon("chevron-right"));
      node.append(check, workspace_element("span", "git-menu-label", entry.title));
      if(class_name||entry.shortcut)node.append(workspace_element("span","git-menu-shortcut",entry.shortcut||""));
      node.append(arrow);
      const open_child = (focus = false) => { if (!entry.children || node.disabled) return; const rect = node.getBoundingClientRect(); const child = show(entry.children, rect.right - 2, rect.top, level + 1, node); if (focus) child.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus(); };
      node.setAttribute("role", "menuitem"); if (entry.id) node.dataset.action = entry.id; node.disabled = Boolean(entry.disabled);
      if (entry.checked != null) { node.setAttribute("role", "menuitemcheckbox"); node.setAttribute("aria-checked", String(entry.checked)); }
      if (entry.children) node.setAttribute("aria-haspopup", "menu");
      node.onmouseenter = () => entry.children ? open_child() : close_from(level + 1);
      node.onkeydown = input => { if (input.key === "ArrowRight" && entry.children) { input.preventDefault(); input.stopPropagation(); open_child(true); } };
      menu.append(node);
    }
    menu.addEventListener("mousedown", input => { input.preventDefault(); input.stopPropagation(); });
    menu.addEventListener("keydown", input => {
      if (input.key === "Escape") { input.preventDefault(); close(); }
      if (input.key === "ArrowLeft" && parent) { input.preventDefault(); close_from(level); parent.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(input.key)) {
        input.preventDefault(); const buttons = [...menu.querySelectorAll<HTMLButtonElement>("button:not([disabled])")]; const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[input.key === "Home" ? 0 : input.key === "End" ? buttons.length - 1 : (current + (input.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      } input.stopPropagation();
    });
    document.body.append(menu); const bounds = menu.getBoundingClientRect();
    if (parent && x + bounds.width > innerWidth - 4) x = parent.getBoundingClientRect().left - bounds.width + 2;
    menu.style.left = Math.max(4, Math.min(x, innerWidth - bounds.width - 4)) + "px"; menu.style.top = Math.max(4, Math.min(y, innerHeight - bounds.height - 4)) + "px";
    return menu;
  };
  close_active_menu = close; window.addEventListener("blur", close); window.addEventListener("pointerdown", outside, true);
  show(entries, event.clientX, event.clientY, 0).querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  return close;
}

export function inline_message(text: string, options: { markdown: boolean; emoji: Record<string, string>; issue_pattern: string; issue_url: string }, open_url: (url: string) => void): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const source = text.replace(/:[a-z_0-9+-]+:/giu, code => options.emoji[code] || code);
  const tokens = /(https?:\/\/[^\s<>]+|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/gu;
  let last = 0;
  const plain = (value: string) => {
    if (!options.issue_url) { fragment.append(document.createTextNode(value)); return; }
    const pattern = new RegExp(options.issue_pattern, "gu"); let offset = 0;
    for (const match of value.matchAll(pattern)) {
      if (!match[0]) continue;
      fragment.append(document.createTextNode(value.slice(offset, match.index)));
      const link = workspace_element("a", "", match[0]); link.href = options.issue_url.replace(/\{id\}/gu, encodeURIComponent(match[1] || match[0])); link.onclick = event => { event.preventDefault(); open_url(link.href); }; fragment.append(link);
      offset = match.index! + match[0].length;
    }
    fragment.append(document.createTextNode(value.slice(offset)));
  };
  for (const match of source.matchAll(tokens)) {
    plain(source.slice(last, match.index)); const value = match[0];
    if (/^https?:/u.test(value)) {
      const link = workspace_element("a", "", value); link.href = value; link.onclick = event => { event.preventDefault(); open_url(value); }; fragment.append(link);
    } else if (!options.markdown) plain(value);
    else {
      const size = value.startsWith("***") ? 3 : value.startsWith("**") ? 2 : 1;
      const node = workspace_element(value[0] === "`" ? "code" : size > 1 ? "strong" : "em", "", value.slice(size, -size));
      if (size === 3) node.style.fontStyle = "italic"; fragment.append(node);
    }
    last = match.index! + value.length;
  }
  plain(source.slice(last)); return fragment;
}
export function shortcut_matches(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  return parts.at(-1) === event.key.toLowerCase() && parts.includes("mod") === (event.ctrlKey || event.metaKey)
    && parts.includes("shift") === event.shiftKey && parts.includes("alt") === event.altKey;
}
import { git_icon } from "./git_icons";
