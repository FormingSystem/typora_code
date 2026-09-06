export function graph_element<K extends keyof HTMLElementTagNameMap>(tag: K, class_name = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = class_name; node.textContent = text; return node;
}
export function graph_button(text: string, action: () => void, class_name = ""): HTMLButtonElement {
  const node = graph_element("button", class_name, text); node.type = "button"; node.onclick = action; return node;
}
export function graph_option(value: string, text: string): HTMLOptionElement {
  const node = graph_element("option", "", text); node.value = value; return node;
}
export function graph_dialog(title: string): { root: HTMLElement; content: HTMLElement; footer: HTMLElement; close(): void } {
  const root = graph_element("div", "git-graph-dialog-shade");
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", title);
  const panel = graph_element("section", "git-graph-dialog"); const content = graph_element("div", "git-graph-dialog-content"); const footer = graph_element("div", "git-graph-dialog-footer");
  const previous = document.activeElement as HTMLElement | null;
  const close = () => { window.removeEventListener("keydown", global_key, true); root.remove(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  // 执行按钮禁用后浏览器可能把焦点退回 body；Esc 仍必须关闭最上层弹窗。
  const global_key = (event: KeyboardEvent) => {
    if (document.querySelectorAll(".git-graph-dialog-shade").item(document.querySelectorAll(".git-graph-dialog-shade").length - 1) !== root) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  };
  panel.append(graph_element("h3", "", title), content, footer); root.append(panel); document.body.append(root);
  window.addEventListener("keydown", global_key, true);
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const focusable = [...root.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,[tabindex="0"]')];
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
      if (!event.shiftKey && current === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus(); }
    }
    event.stopPropagation();
  });
  footer.append(graph_button("关闭", close)); setTimeout(() => panel.querySelector<HTMLElement>("input,textarea,select,button")?.focus(), 0);
  return { root, content, footer, close };
}
export type graph_menu_entry = { title: string; action: () => void; id?: string; disabled?: boolean; checked?: boolean; separator?: boolean; children?: graph_menu_entry[] };
let close_active_menu: (() => void) | undefined;
export function graph_menu(event: MouseEvent, entries: graph_menu_entry[]): void {
  close_active_menu?.(); event.preventDefault(); event.stopPropagation();
  const previous_focus = document.activeElement as HTMLElement | null;
  const menus: HTMLElement[] = [];
  const close_from = (level: number) => { menus.splice(level).forEach(menu => menu.remove()); };
  const close = () => { close_from(0); if (previous_focus?.isConnected) previous_focus.focus({preventScroll:true}); window.removeEventListener("pointerdown", outside, true); window.removeEventListener("blur", close); if (close_active_menu === close) close_active_menu = undefined; };
  const outside = (input: Event) => { if (!menus.some(menu => menu.contains(input.target as Node))) close(); };
  const show = (items: graph_menu_entry[], x: number, y: number, level: number, parent?: HTMLButtonElement) => {
    close_from(level); const menu = graph_element("div", "git-graph-menu"); menu.setAttribute("role", "menu"); menu.setAttribute("data-menu-level", String(level)); menus.push(menu);
    for (const entry of items) {
      if (entry.separator && menu.children.length) { const separator = graph_element("hr"); separator.setAttribute("role", "separator"); menu.append(separator); }
      const node = graph_button((entry.checked == null ? "" : entry.checked ? "✓  " : "　 ") + entry.title + (entry.children ? "  ›" : ""), () => { if (entry.children) open_child(true); else { close(); entry.action(); } });
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
      const link = graph_element("a", "", match[0]); link.href = options.issue_url.replace(/\{id\}/gu, encodeURIComponent(match[1] || match[0])); link.onclick = event => { event.preventDefault(); open_url(link.href); }; fragment.append(link);
      offset = match.index! + match[0].length;
    }
    fragment.append(document.createTextNode(value.slice(offset)));
  };
  for (const match of source.matchAll(tokens)) {
    plain(source.slice(last, match.index)); const value = match[0];
    if (/^https?:/u.test(value)) {
      const link = graph_element("a", "", value); link.href = value; link.onclick = event => { event.preventDefault(); open_url(value); }; fragment.append(link);
    } else if (!options.markdown) plain(value);
    else {
      const size = value.startsWith("***") ? 3 : value.startsWith("**") ? 2 : 1;
      const node = graph_element(value[0] === "`" ? "code" : size > 1 ? "strong" : "em", "", value.slice(size, -size));
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
