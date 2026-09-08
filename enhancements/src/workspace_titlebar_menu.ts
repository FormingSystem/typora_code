import { git_icon } from "./git_icons";

export type titlebar_menu_entry = {
  label?: string;
  shortcut?: string;
  title?: string;
  separator?: boolean;
  checked?: boolean;
  disabled?: boolean;
  children?: titlebar_menu_entry[];
  action?: () => unknown;
};

export type titlebar_menu_definition = {
  label: string;
  mnemonic: string;
  entries(): Promise<titlebar_menu_entry[]>;
};

/** 渲染彼此独立的顶层菜单和任意级子菜单，不依赖 Typora 的聚合式 menu.popup。 */
export function create_workspace_titlebar_menu(definitions: titlebar_menu_definition[]) {
  const menu = document.createElement("nav");
  menu.className = "workspace-titlebar-menu";
  menu.setAttribute("aria-label", "主菜单");
  menu.setAttribute("role", "menubar");
  let panels: HTMLElement[] = [];
  let open_index = -1;

  const close_from = (level: number) => { panels.splice(level).forEach(panel => panel.remove()); };
  const close = () => {
    close_from(0);
    open_index = -1;
    menu.querySelectorAll("button[aria-expanded]").forEach(button => button.setAttribute("aria-expanded", "false"));
  };
  const show_panel = (entries: titlebar_menu_entry[], x: number, y: number, level: number, owner: HTMLButtonElement): HTMLElement => {
    close_from(level);
    const panel = document.createElement("div");
    panel.className = "workspace-titlebar-popup";
    panel.dataset.menuLevel = String(level);
    panel.setAttribute("role", "menu");
    panels.push(panel);
    for (const entry of entries) {
      if (entry.separator) {
        const separator = document.createElement("div");
        separator.className = "workspace-titlebar-separator";
        separator.setAttribute("role", "separator");
        panel.append(separator);
        continue;
      }
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", entry.checked == null ? "menuitem" : "menuitemcheckbox");
      if (entry.checked != null) item.setAttribute("aria-checked", String(entry.checked));
      if (entry.children) item.setAttribute("aria-haspopup", "menu");
      item.disabled = Boolean(entry.disabled);
      item.title = entry.title || "";
      const check = document.createElement("span");
      check.className = "workspace-titlebar-check";
      if (entry.checked) check.append(git_icon("check"));
      const label = document.createElement("span");
      label.className = "workspace-titlebar-popup-label";
      label.textContent = entry.label || "";
      const shortcut = document.createElement("kbd");
      shortcut.textContent = entry.shortcut || "";
      const arrow = document.createElement("span");
      arrow.className = "workspace-titlebar-submenu-arrow";
      if (entry.children) arrow.append(git_icon("chevron-right"));
      item.append(check, label, shortcut, arrow);
      const open_child = (focus = false) => {
        if (!entry.children || item.disabled) return;
        const rect = item.getBoundingClientRect();
        const child = show_panel(entry.children, rect.right - 2, rect.top, level + 1, item);
        if (focus) child.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      };
      item.onmouseenter = () => entry.children ? open_child() : close_from(level + 1);
      item.onclick = () => { if (entry.children) open_child(true); else { close(); entry.action?.(); } };
      item.onkeydown = event => {
        if (event.key === "ArrowRight" && entry.children) { event.preventDefault(); event.stopPropagation(); open_child(true); }
      };
      panel.append(item);
    }
    document.body.append(panel);
    const bounds = panel.getBoundingClientRect();
    if (level > 0 && x + bounds.width > innerWidth - 4) x = owner.getBoundingClientRect().left - bounds.width + 2;
    panel.style.left = `${Math.max(4, Math.min(x, innerWidth - bounds.width - 4))}px`;
    panel.style.top = `${Math.max(35, Math.min(y, innerHeight - bounds.height - 4))}px`;
    panel.onkeydown = event => {
      const items = [...panel.querySelectorAll<HTMLButtonElement>(":scope>button:not(:disabled)")];
      const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const target = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[target]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (level) { close_from(level); owner.focus(); } else { close(); owner.focus(); }
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (level) { close_from(level); owner.focus(); } else void open((open_index - 1 + definitions.length) % definitions.length, true);
      } else if (event.key === "ArrowRight" && !document.activeElement?.getAttribute("aria-haspopup") && !level) {
        event.preventDefault();
        void open((open_index + 1) % definitions.length, true);
      }
      event.stopPropagation();
    };
    return panel;
  };
  const open = async (index: number, focus_first = false) => {
    close();
    open_index = index;
    const definition = definitions[index];
    const button = menu.children[index] as HTMLButtonElement;
    button.setAttribute("aria-expanded", "true");
    const entries = await definition.entries();
    if (open_index !== index) return;
    const rect = button.getBoundingClientRect();
    const panel = show_panel(entries, rect.left, rect.bottom, 0, button);
    panel.setAttribute("aria-label", `${definition.label}菜单`);
    if (focus_first) panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  };

  definitions.forEach((definition, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = definition.label;
    button.title = `${definition.label}（Alt+${definition.mnemonic}）`;
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.onclick = () => { if (open_index === index) close(); else void open(index); };
    button.onmouseenter = () => { if (open_index >= 0 && open_index !== index) void open(index); };
    button.onkeydown = event => {
      if (["ArrowDown", "Enter", " "].includes(event.key)) { event.preventDefault(); void open(index, true); }
      else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const target = event.key === "Home" ? 0 : event.key === "End" ? definitions.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + definitions.length) % definitions.length;
        (menu.children[target] as HTMLButtonElement).focus();
      }
    };
    menu.append(button);
  });

  document.addEventListener("pointerdown", event => {
    if (panels.length && !panels.some(panel => panel.contains(event.target as Node)) && !menu.contains(event.target as Node)) close();
  }, true);
  window.addEventListener("keydown", event => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    const index = definitions.findIndex(definition => event.key.toLocaleUpperCase() === definition.mnemonic);
    if (index < 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void open(index, true);
  }, true);
  return { menu, close, open };
}
