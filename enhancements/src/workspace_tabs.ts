import type { workspace_file_host } from "./workspace_files";

type workspace_leaf = { state: { path: string }; parent?: workspace_group };
type workspace_group = {
  containerEl: HTMLElement;
  children: workspace_leaf[];
  removeTab(path: string, tab?: HTMLElement): unknown;
};

function group_for_tab(files: workspace_file_host, tab: HTMLElement): workspace_group | undefined {
  const container = tab.closest<HTMLElement>(".typ-workspace-tabs");
  let match: workspace_group | undefined;
  files.core.app.workspace.eachLeaves(leaf => {
    const group = leaf.parent as unknown as workspace_group;
    if (!match && group?.containerEl === container) match = group;
  });
  return match;
}

function active_group(files: workspace_file_host): workspace_group | undefined {
  return files.core.app.workspace.activeLeaf?.parent as unknown as workspace_group | undefined;
}

function tab_for(group: workspace_group, path: string): HTMLElement | undefined {
  return [...group.containerEl.querySelectorAll<HTMLElement>(".typ-tab[data-id]")]
    .find(tab => tab.dataset.id === path);
}

function leaf_present(group: workspace_group, leaf: workspace_leaf): boolean {
  return group.children.includes(leaf);
}

const CLOSE_DIALOG_SELECTOR = '.git-graph-dialog-shade, [role="dialog"], .modal-dialog, .modal-backdrop, .modal.in';
const CLOSE_DIALOG_APPEAR_TIMEOUT_MS = 2000;

function dialog_owner(node: HTMLElement): HTMLElement {
  if (node.classList.contains("modal-backdrop")) return node;
  return node.closest<HTMLElement>(".modal") || node;
}

function visible_dialog(node: HTMLElement): boolean {
  if (!node.isConnected || node.closest(".workspace-quick-open") || node.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse"
    && style.opacity !== "0" && node.getClientRects().length > 0;
}

function visible_close_dialogs(): HTMLElement[] {
  const dialogs = new Set<HTMLElement>();
  for (const candidate of document.querySelectorAll<HTMLElement>(CLOSE_DIALOG_SELECTOR)) {
    const owner = dialog_owner(candidate);
    if (visible_dialog(owner)) dialogs.add(owner);
  }
  return [...dialogs];
}

async function close_leaf(group: workspace_group, leaf: workspace_leaf): Promise<boolean> {
  const before_dialogs = new Set(visible_close_dialogs());
  group.removeTab(leaf.state.path, tab_for(group, leaf.state.path));
  if (!leaf_present(group, leaf)) return true;
  return new Promise<boolean>(resolve => {
    let close_dialog: HTMLElement | undefined;
    let settled = false;
    const finish = (closed: boolean) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(appearance_timeout);
      window.clearInterval(visibility_poll);
      resolve(closed);
    };
    const inspect = () => {
      if (!leaf_present(group, leaf)) { finish(true); return; }
      close_dialog ||= visible_close_dialogs()
        .find(dialog => !before_dialogs.has(dialog));
      if (close_dialog) {
        window.clearTimeout(appearance_timeout);
        if (!visible_dialog(close_dialog)) finish(false);
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden", "open"] });
    // 原生 Bootstrap 模态框可能只通过过渡样式退出；轮询补足没有后续 DOM 变更的结束状态。
    const visibility_poll = window.setInterval(inspect, 100);
    // 未识别到关闭确认时尽快停止本次 Close All，避免把后续标签误关或等待五分钟。
    const appearance_timeout = window.setTimeout(() => finish(false), CLOSE_DIALOG_APPEAR_TIMEOUT_MS);
    inspect();
  });
}

/** 关闭当前编辑器标签；最后一个标签关闭后保留工作区空态，不创建可见的 New tab。 */
export function close_active_workspace_tab(files: workspace_file_host): void {
  const leaf = files.core.app.workspace.activeLeaf as unknown as workspace_leaf | null;
  const group = leaf?.parent as workspace_group | undefined;
  if (leaf && group && leaf.state.path) void close_leaf(group, leaf);
}

/** 依次关闭一组标签，以便每个未保存源码草稿仍能独立完成保存确认。 */
export async function close_all_workspace_tabs(files: workspace_file_host, group = active_group(files)): Promise<void> {
  if (!group) return;
  for (const leaf of [...group.children].filter(item => Boolean(item.state.path))) {
    if (!leaf_present(group, leaf) || !await close_leaf(group, leaf)) return;
  }
}

/** 补齐 VS Code 式关闭全部标签，并隐藏社区核心为维持树结构而生成的空占位标签。 */
export function bind_workspace_tab_actions(files: workspace_file_host): {dispose(): void} | undefined {
  const events = new AbortController();
  let disposed = false;
  const pending_menus = new Set<number>();
  if (document.documentElement.dataset.linuxNoteWorkspaceTabs) return;
  document.documentElement.dataset.linuxNoteWorkspaceTabs = "ready";
  const style = document.createElement("style");
  style.dataset.workspaceTabActions = "true";
  style.textContent = `.typ-workspace-tabs.linux-note-empty-group>.typ-workspace-tab-header{display:none!important}.linux-note-close-all-tabs.disabled>a{opacity:.45;pointer-events:none}`;
  document.head.append(style);
  const refresh_empty_groups = () => {
    document.querySelectorAll<HTMLElement>(".typ-workspace-tabs").forEach(group => {
      const tabs = [...group.querySelectorAll<HTMLElement>(":scope>.typ-workspace-tab-header .typ-tab[data-id]")];
      group.classList.toggle("linux-note-empty-group", tabs.length === 1 && !tabs[0].dataset.id);
    });
  };
  const observer = new MutationObserver(refresh_empty_groups);
  observer.observe(files.core.app.workspace.rootSplit.containerEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-id"] });
  refresh_empty_groups();

  let menu_group: workspace_group | undefined;
  document.addEventListener("contextmenu", event => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>(".typ-tab") : null;
    if (!tab) return;
    menu_group = group_for_tab(files, tab);
    const timer = window.setTimeout(() => {
      pending_menus.delete(timer);
      if (disposed) return;
      const menu = [...document.querySelectorAll<HTMLElement>(".context-menu")]
        .find(candidate => candidate.querySelector('[data-key="removeTab"]'));
      if (!menu || menu.querySelector(".linux-note-close-all-tabs")) return;
      const item = document.createElement("li");
      item.className = "typ-menuitem linux-note-close-all-tabs";
      item.dataset.key = "removeAllTabs";
      const anchor = document.createElement("a");
      anchor.setAttribute("role", "menuitem");
      anchor.tabIndex = 0;
      anchor.textContent = "关闭所有标签";
      item.classList.toggle("disabled", !menu_group?.children.some(leaf => Boolean(leaf.state.path)));
      item.append(anchor);
      const right = menu.querySelector('[data-key="removeRight"]');
      right?.after(item);
    }, 0);
    pending_menus.add(timer);
  }, {capture: true, signal: events.signal});
  for (const event_name of ["pointerdown", "mousedown", "mouseup", "click", "keydown"]) {
    document.addEventListener(event_name, event => {
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>(".linux-note-close-all-tabs") : null;
      if (!item || item.classList.contains("disabled")) return;
      if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event_name === "click" || event instanceof KeyboardEvent && !event.repeat) {
        item.closest<HTMLElement>(".context-menu")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        void close_all_workspace_tabs(files, menu_group);
        menu_group = undefined;
      }
    }, {capture: true, signal: events.signal});
  }
  return {dispose() {
    if (disposed) return; disposed = true; events.abort(); observer.disconnect(); style.remove();
    for (const timer of pending_menus) window.clearTimeout(timer); pending_menus.clear();
    document.querySelectorAll(".linux-note-close-all-tabs").forEach(node => node.remove());
    document.querySelectorAll(".linux-note-empty-group").forEach(node => node.classList.remove("linux-note-empty-group"));
    delete document.documentElement.dataset.linuxNoteWorkspaceTabs;
  }};
}
