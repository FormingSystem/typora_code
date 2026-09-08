import { workspace_element as el, workspace_menu, type workspace_menu_entry } from "./workspace_widgets";
import { format_file_path } from "./file_paths";
import { git_icon, type git_icon_name } from "./git_icons";
import explorer_css from "./workspace_explorer.css";

type sidebar_panel = {containerEl: HTMLElement; ribbonButton?: {id: string}; show(): void; hide(): void};
export type workspace_explorer_core = {
  SidebarPanel: new () => sidebar_panel;
  app: {workspace: {
    sidebar: {activePanel?: sidebar_panel; panels: sidebar_panel[]; isShown: boolean; addPanel(panel: sidebar_panel): unknown; removePanel(panel: sidebar_panel): void; switch(panel: new () => sidebar_panel): void; show(): void; hide(): void; toggle(): void};
    ribbon: {activeButton(id: string): void};
    on(event: string, callback: (...args: unknown[]) => void): unknown;
  }};
};
export type workspace_explorer_options = {
  open_file(path: string, location?: {}, group?: string): unknown;
  context_root(): string;
  active_file?(): string;
  open_folder(): unknown;
  copy(text: string): unknown;
  rename(root: string, old_path: string, name: string): Promise<string>;
  extra_menu?(path: string, is_directory: boolean): workspace_menu_entry[];
};
type explorer_node = {
  id: string; path: string; name: string; parent?: explorer_node; depth: number;
  directory: boolean; link: boolean; expanded: boolean; children?: explorer_node[];
  error?: string; loading?: Promise<void>; watcher?: {close(): void}; refresh_timer?: number;
};
const ROW_HEIGHT = 26;
const EXPLORER_ID = "linux_note:file_explorer";

/** 全文件目录树自行枚举，不修改原生 SupportedFiles 或全局隐藏文件配置。 */
export function bind_workspace_explorer(core: workspace_explorer_core, options: workspace_explorer_options) {
  const runtime = window as unknown as {reqnode(name: string): any};
  const fs = runtime.reqnode("fs"), path_api = runtime.reqnode("path");
  const sidebar = core.app.workspace.sidebar;
  const style = el("style"); style.textContent = explorer_css; document.head.append(style);
  const container = el("section", "linux-note-workspace-explorer"); container.setAttribute("aria-label", "资源管理器");
  const toolbar = el("div", "workspace-explorer-toolbar");
  const title = el("strong", "", "资源管理器");
  const actions = el("div", "workspace-explorer-actions");
  const root_label = el("div", "workspace-explorer-root");
  const tree = el("div", "workspace-explorer-tree"); tree.tabIndex = 0; tree.setAttribute("role", "tree"); tree.setAttribute("aria-label", "文件和文件夹");
  const spacer = el("div", "workspace-explorer-spacer"); tree.append(spacer);
  const status = el("div", "workspace-explorer-status"); status.setAttribute("role", "status");
  toolbar.append(title, actions); container.append(toolbar, root_label, tree, status);
  let root: explorer_node | undefined, selected_path = "", visible = false, disposed = false, generation = 0, serial = 0;
  let flat_nodes: explorer_node[] = [], render_frame = 0, refresh_frame = 0, watcher_count = 0;
  let rename_state: {node: explorer_node; input: HTMLInputElement; busy: boolean; focus_requested: boolean} | undefined, click_timer = 0;
  const nodes = new Map<string, explorer_node>(); const detachers: (() => void)[] = [];
  const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: "base"});

  const set_status = (message: string) => { if (!disposed) status.textContent = message; };
  const run = (operation: () => unknown) => { void Promise.resolve().then(operation).catch(error => set_status(String(error))); };
  const icon = (name: git_icon_name) => git_icon(name, "workspace-explorer-icon");
  const icon_button = (name: git_icon_name, label: string, action: () => unknown) => {
    const button = el("button"); button.type = "button"; button.title = label; button.setAttribute("aria-label", label); button.append(icon(name)); button.onclick = () => run(action); return button;
  };
  const open_folder = async () => { await options.open_folder(); await sync_root(true); };
  actions.append(icon_button("folder-opened", "打开文件夹", open_folder), icon_button("target", "定位当前文件", () => reveal()), icon_button("refresh", "刷新资源管理器", () => refresh()), icon_button("collapse-all", "全部折叠", () => {
    if (!root) return;
    for (const child of root.children || []) collapse(child);
    rebuild();
  }));

  function close_watch(node: explorer_node) {
    if (node.watcher) { node.watcher.close(); node.watcher = undefined; watcher_count--; }
    if (node.refresh_timer) { window.clearTimeout(node.refresh_timer); node.refresh_timer = undefined; }
  }
  function close_branch(node: explorer_node, forget = false) {
    close_watch(node); for (const child of node.children || []) close_branch(child, forget);
    if (forget) nodes.delete(node.path);
  }
  function watch(node: explorer_node) {
    if (!visible || disposed || !node.expanded || node.watcher || watcher_count >= 128) return;
    try {
      node.watcher = fs.watch(node.path, {persistent: false}, () => {
        if (node.refresh_timer) window.clearTimeout(node.refresh_timer);
        node.refresh_timer = window.setTimeout(() => { node.refresh_timer = undefined; if (visible && node.expanded) void load_children(node, true); }, 250);
      });
      watcher_count++;
      const watcher = node.watcher as {on?(event: string, callback: () => void): void};
      watcher.on?.("error", () => { close_watch(node); });
    } catch { /* 无监视权限时仍可按需读取与手动刷新。 */ }
  }
  function watch_visible(node: explorer_node) { if (node.expanded) { watch(node); for (const child of node.children || []) watch_visible(child); } }
  function collapse(node: explorer_node) { node.expanded = false; close_branch(node); }
  function create_node(file_path: string, name: string, directory: boolean, link: boolean, parent?: explorer_node): explorer_node {
    const node = {id: "workspace-explorer-node-" + ++serial, path: file_path, name, directory, link, expanded: false, parent, depth: parent ? parent.depth + 1 : -1};
    nodes.set(file_path, node); return node;
  }
  function rebuild() {
    flat_nodes = [];
    const append = (node: explorer_node) => { flat_nodes.push(node); if (node.expanded) for (const child of node.children || []) append(child); };
    if (root) for (const child of root.children || []) append(child);
    spacer.style.height = flat_nodes.length * ROW_HEIGHT + "px";
    render();
  }
  function render() {
    if (disposed) return;
    if (render_frame) cancelAnimationFrame(render_frame);
    render_frame = requestAnimationFrame(() => {
      render_frame = 0;
      const start = Math.max(0, Math.floor(tree.scrollTop / ROW_HEIGHT) - 5);
      const end = Math.min(flat_nodes.length, start + Math.ceil((tree.clientHeight || 500) / ROW_HEIGHT) + 12);
      const rows: HTMLElement[] = [];
      const focused_input = rename_state && document.activeElement === rename_state.input ? rename_state.input : undefined;
      const selection = focused_input ? [focused_input.selectionStart, focused_input.selectionEnd] : undefined;
      for (let index = start; index < end; index++) {
        const node = flat_nodes[index];
        const row = el("div", "workspace-explorer-row" + (node.path === selected_path ? " is-selected" : ""));
        row.id = node.id; row.dataset.path = node.path; row.dataset.directory = String(node.directory); row.setAttribute("role", "treeitem");
        row.setAttribute("aria-level", String(node.depth + 1)); row.setAttribute("aria-selected", String(node.path === selected_path));
        if (node.directory) row.setAttribute("aria-expanded", String(node.expanded));
        row.style.top = index * ROW_HEIGHT + "px"; row.style.paddingLeft = (node.depth * 14 + 8) + "px";
        row.title = node.path + (node.error ? "\n" + node.error : "");
        const chevron = el("span", "workspace-explorer-chevron");
        if (node.directory) chevron.append(icon(node.expanded ? "chevron-down" : "chevron-right"));
        row.append(chevron, icon(node.directory ? node.expanded ? "folder-opened" : "folder" : "file"), rename_state?.node === node ? rename_state.input : el("span", "workspace-explorer-name", node.name));
        if (node.link) row.append(el("span", "workspace-explorer-note", "链接"));
        if (node.loading) row.append(el("span", "workspace-explorer-note", "读取中…"));
        else if (node.error) row.append(el("span", "workspace-explorer-note is-error", "无法读取"));
        row.onclick = event => {
          if (event.target === rename_state?.input) return;
          if (event.detail > 1) return;
          window.clearTimeout(click_timer);
          // 已选中名称的第二次操作留给双击改名；箭头和图标仍立即打开/折叠。
          if (selected_path === node.path && event.target instanceof Element && event.target.closest(".workspace-explorer-name")) {
            click_timer = window.setTimeout(() => { click_timer = 0; run(() => activate(node)); }, 500); return;
          }
          select(node); run(() => activate(node));
        };
        row.ondblclick = event => {
          if (!(event.target instanceof Element) || !event.target.closest(".workspace-explorer-name")) return;
          event.preventDefault(); event.stopPropagation(); window.clearTimeout(click_timer); click_timer = 0; begin_rename(node);
        };
        row.oncontextmenu = event => { select(node); context_menu(event, node); };
        rows.push(row);
      }
      spacer.replaceChildren(...rows);
      if (focused_input?.isConnected) { focused_input.focus({preventScroll: true}); focused_input.setSelectionRange(selection![0], selection![1]); }
      if (rename_state?.focus_requested && rename_state.input.isConnected) {
        const {input, node} = rename_state; rename_state.focus_requested = false;
        input.focus({preventScroll: true}); const dot = node.directory ? -1 : node.name.lastIndexOf("."); input.setSelectionRange(0, dot > 0 ? dot : node.name.length);
      }
      const selected = nodes.get(selected_path);
      if (selected && rows.some(row => row.id === selected.id)) tree.setAttribute("aria-activedescendant", selected.id);
      else tree.removeAttribute("aria-activedescendant");
    });
  }
  function select(node: explorer_node, scroll = false) {
    if (rename_state && rename_state.node !== node && !rename_state.busy) rename_state = undefined;
    selected_path = node.path; set_status(node.path); tree.focus({preventScroll: true});
    if (scroll) {
      const index = flat_nodes.indexOf(node), top = index * ROW_HEIGHT;
      if (top < tree.scrollTop) tree.scrollTop = top;
      else if (top + ROW_HEIGHT > tree.scrollTop + tree.clientHeight) tree.scrollTop = top + ROW_HEIGHT - tree.clientHeight;
    }
    render();
  }
  async function load_children(node: explorer_node, force = false): Promise<void> {
    if (rename_state?.busy) return;
    if (disposed || nodes.get(node.path) !== node) return;
    if (node.loading) return node.loading;
    if (node.children && !force) { watch(node); return; }
    const current_generation = generation;
    node.error = undefined;
    node.loading = (async () => {
      try {
        const entries = await fs.promises.readdir(node.path, {withFileTypes: true});
        if (disposed || generation !== current_generation || nodes.get(node.path) !== node) return;
        const old_children = new Map((node.children || []).map(child => [child.path, child]));
        const children: explorer_node[] = [];
        for (const entry of entries) {
          const file_path = path_api.join(node.path, entry.name);
          let child = old_children.get(file_path); old_children.delete(file_path);
          const directory = entry.isDirectory(), link = entry.isSymbolicLink();
          if (child && (!link && child.directory !== directory || child.link !== link)) { close_branch(child, true); child = undefined; }
          children.push(child || create_node(file_path, entry.name, directory, link, node));
        }
        for (const child of old_children.values()) close_branch(child, true);
        children.sort((left, right) => Number(right.directory) - Number(left.directory) || collator.compare(left.name, right.name) || left.name.localeCompare(right.name));
        node.children = children; watch(node);
        if (node === root && !children.length) set_status("此文件夹为空。");
      } catch (error) {
        if (!disposed && current_generation === generation) { node.error = String(error); set_status("无法读取文件夹：" + node.path + "\n" + node.error); }
      } finally {
        node.loading = undefined;
        if (!disposed && generation === current_generation) rebuild();
      }
    })();
    render(); return node.loading;
  }
  async function activate(node: explorer_node) {
    if (rename_state) return;
    if (node.link && !node.directory) {
      // 仅在用户点击链接时查询目标；不递归跟随符号链接遍历仓库。
      const stat = await fs.promises.stat(node.path); node.directory = stat.isDirectory();
    }
    if (node.directory) {
      if (node.expanded) collapse(node);
      else { node.expanded = true; await load_children(node); watch_visible(node); }
      rebuild();
    } else await options.open_file(node.path);
  }
  function context_menu(event: MouseEvent, node: explorer_node) {
    const entries: workspace_menu_entry[] = node === root ? [{title: "全部折叠", action: () => { for (const child of node.children || []) collapse(child); rebuild(); }}]
      : node.directory ? [{title: node.expanded ? "折叠文件夹" : "展开文件夹", action: () => run(() => activate(node))}]
      : [{title: "打开文件", action: () => run(() => options.open_file(node.path))}, {title: "在右侧打开", action: () => run(() => options.open_file(node.path, {}, "right"))}];
    if (node !== root) entries.push({title: "重命名（F2）", separator: true, disabled: Boolean(rename_state?.busy), action: () => begin_rename(node)});
    entries.push({title: "复制路径", separator: true, action: () => run(() => options.copy(format_file_path(path_api, node.path, root?.path, false) || node.path))},
      {title: "复制相对路径", action: () => run(() => options.copy(format_file_path(path_api, node.path, root?.path, true) || node.name))});
    if (node.directory) entries.push({title: "刷新文件夹", action: () => run(() => load_children(node, true))});
    entries.push(...options.extra_menu?.(node.path, node.directory) || []);
    workspace_menu(event, entries);
  }
  function begin_rename(node: explorer_node) {
    if (!root || node === root || disposed || rename_state?.busy) return;
    window.clearTimeout(click_timer); click_timer = 0; select(node, true);
    const input = el("input", "workspace-explorer-rename"); input.value = node.name; input.setAttribute("aria-label", "新名称"); input.spellcheck = false;
    rename_state = {node, input, busy: false, focus_requested: true}; set_status("输入新名称，按 Enter 确认，Esc 取消。");
    input.onkeydown = event => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); if (!rename_state?.busy) { rename_state = undefined; set_status("已取消重命名。"); tree.focus({preventScroll: true}); render(); } }
      else if (event.key === "Enter") { event.preventDefault(); run(finish_rename); }
    };
    // 聚焦由真正挂载输入框的 render 执行；滚动事件取消旧 RAF 时也不会漏掉聚焦。
    render();
  }
  async function finish_rename() {
    const edit = rename_state, current_root = root;
    if (!edit || !current_root || edit.busy) return;
    if (edit.input.value === edit.node.name) { rename_state = undefined; tree.focus({preventScroll: true}); render(); return; }
    edit.busy = true; edit.input.disabled = true; set_status("正在重命名…");
    try {
      const expanded = edit.node.expanded;
      const target = await options.rename(current_root.path, edit.node.path, edit.input.value);
      rename_state = undefined;
      if (disposed || root !== current_root) return;
      // 丢弃旧路径监视句柄，随后重新展开到新名称，避免目录改名后继续读取旧路径。
      close_branch(edit.node, true); await load_children(edit.node.parent || current_root, true); await reveal(target);
      const replacement = nodes.get(target); if (expanded && replacement?.directory) { replacement.expanded = true; await load_children(replacement); }
      set_status("已重命名为 " + path_api.basename(target)); tree.focus({preventScroll: true});
    } catch (error) {
      if (disposed) return;
      const renamed_path = (error as {renamed_path?: string}).renamed_path;
      if (renamed_path) { rename_state = undefined; await refresh(); await reveal(renamed_path); set_status(String(error instanceof Error ? error.message : error)); return; }
      edit.busy = false; edit.input.disabled = false; edit.input.setAttribute("aria-invalid", "true"); set_status(String(error instanceof Error ? error.message : error));
      edit.input.focus({preventScroll: true});
    }
  }
  async function sync_root(force = false) {
    if (rename_state?.busy) return;
    const requested = options.context_root();
    if (!requested || !path_api.isAbsolute(requested)) {
      if (root) { generation++; close_branch(root, true); root = undefined; root_label.textContent = "未打开文件夹"; selected_path = ""; rebuild(); }
      set_status("打开一个文件夹以浏览全部文件。"); return;
    }
    const file_path = path_api.normalize(requested);
    if (root?.path === file_path) { if (force) await load_children(root, true); return; }
    generation++;
    rename_state = undefined;
    if (root) close_branch(root, true);
    root = create_node(file_path, path_api.basename(file_path) || file_path, true, false); root.expanded = true;
    selected_path = ""; root_label.textContent = root.name; root_label.title = root.path; tree.scrollTop = 0;
    set_status("正在读取文件夹…"); rebuild(); await load_children(root);
    if (root && !root.error && root.children?.length) set_status("显示全部文件，包括隐藏文件和隐藏文件夹。");
  }
  async function refresh() {
    await sync_root(); if (!root) return;
    const expanded = [...nodes.values()].filter(node => node.directory && node.expanded);
    // 顺序刷新已展开目录，避免同时对网络盘或大目录发起大量请求。
    for (const node of expanded) if (!disposed && nodes.get(node.path) === node) await load_children(node, true);
  }
  async function reveal(file_path = options.active_file?.() || "") {
    await sync_root(); if (!root || !file_path || !path_api.isAbsolute(file_path)) return;
    file_path = path_api.normalize(file_path);
    const relative = path_api.relative(root.path, file_path);
    if (!relative || path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) return;
    let parent = root;
    const components = relative.split(path_api.sep);
    for (const name of components.slice(0, -1)) {
      await load_children(parent);
      const child = parent.children?.find(node => path_api.sep === "\\" ? node.name.toLowerCase() === name.toLowerCase() : node.name === name); if (!child) return;
      if (child.link && !child.directory) { try { child.directory = (await fs.promises.stat(child.path)).isDirectory(); } catch { return; } }
      if (!child.directory) return;
      child.expanded = true; await load_children(child); parent = child;
    }
    await load_children(parent); rebuild();
    const name = components.at(-1)!;
    const node = parent.children?.find(candidate => path_api.sep === "\\" ? candidate.name.toLowerCase() === name.toLowerCase() : candidate.name === name);
    if (node) { selected_path = node.path; set_status(node.path); const index = flat_nodes.indexOf(node); tree.scrollTop = Math.max(0, index * ROW_HEIGHT - tree.clientHeight / 2); render(); }
  }
  const clear_native_tabs = () => {
    const native_sidebar = document.querySelector("#typora-sidebar");
    const classes = ["active-tab-files", "active-tab-outline", "ty-show-search"];
    if (visible && native_sidebar && classes.some(name => native_sidebar.classList.contains(name))) native_sidebar.classList.remove(...classes);
  };
  const native_observer = new MutationObserver(clear_native_tabs);
  class explorer_sidebar extends core.SidebarPanel {
    containerEl = container;
    onshow() {
      visible = true; clear_native_tabs(); core.app.workspace.ribbon.activeButton("core.file-explorer");
      const native_sidebar = document.querySelector("#typora-sidebar");
      if (native_sidebar) native_observer.observe(native_sidebar, {attributes: true, attributeFilter: ["class"]});
      run(async () => { await sync_root(); if (root) watch_visible(root); await reveal(); });
    }
    onhide() { visible = false; native_observer.disconnect(); if (root) close_branch(root); }
  }
  const panel = new explorer_sidebar();
  sidebar.addPanel(panel);
  // 复用原文件按钮，不生成第二个按钮；独立面板标识让 bootstrap 正确识别真正的当前面板。
  panel.ribbonButton = {id: EXPLORER_ID};
  function show(toggle = false) {
    if (sidebar.activePanel !== panel) sidebar.switch(explorer_sidebar);
    else if (toggle) sidebar.toggle();
    else sidebar.show();
  }
  const activity_click = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest('.typ-ribbon-item[data-id="core.file-explorer"]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); show(true);
  };
  document.addEventListener("click", activity_click, true);
  tree.addEventListener("scroll", render, {passive: true});
  tree.addEventListener("keydown", event => {
    if (event.target !== tree || event.altKey || event.ctrlKey || event.metaKey) return;
    let index = Math.max(0, flat_nodes.findIndex(node => node.path === selected_path));
    const node = flat_nodes[index]; if (!node) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      index = event.key === "Home" ? 0 : event.key === "End" ? flat_nodes.length - 1 : Math.min(flat_nodes.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)));
      select(flat_nodes[index], true);
    } else if (["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "ArrowLeft") { if (node.expanded) { collapse(node); rebuild(); } else if (node.parent && node.parent !== root) select(node.parent, true); }
      else if (event.key === "ArrowRight") { if (node.directory && !node.expanded) run(() => activate(node)); else if (node.expanded && node.children?.length) select(node.children[0], true); }
      else run(() => activate(node));
    } else if (event.key === "F2") {
      event.preventDefault(); event.stopPropagation(); begin_rename(node);
    } else if (event.key === "F10" && event.shiftKey) {
      event.preventDefault(); const bounds = tree.getBoundingClientRect(); context_menu(new MouseEvent("contextmenu", {clientX: bounds.left + 24, clientY: bounds.top + 30}), node);
    }
  });
  tree.oncontextmenu = event => { if (event.target instanceof Element && event.target.closest(".workspace-explorer-row")) return; if (root) context_menu(event, root); };
  const resize_observer = new ResizeObserver(render); resize_observer.observe(tree);
  const active_change = () => { if (!visible || disposed || refresh_frame) return; refresh_frame = requestAnimationFrame(() => { refresh_frame = 0; run(() => reveal()); }); };
  for (const event of ["active-leaf:change", "file:open"]) { const detach = core.app.workspace.on(event, active_change); if (typeof detach === "function") detachers.push(detach as () => void); }
  const window_focus = () => { if (visible) run(() => refresh()); };
  window.addEventListener("focus", window_focus);
  function dispose() {
    if (disposed) return; disposed = true; generation++; visible = false;
    native_observer.disconnect(); resize_observer.disconnect();
    if (root) close_branch(root, true);
    if (render_frame) cancelAnimationFrame(render_frame); if (refresh_frame) cancelAnimationFrame(refresh_frame);
    window.clearTimeout(click_timer); rename_state = undefined;
    document.removeEventListener("click", activity_click, true); window.removeEventListener("focus", window_focus); window.removeEventListener("pagehide", dispose);
    for (const detach of detachers) detach();
    if (sidebar.activePanel === panel) { sidebar.hide(); sidebar.activePanel = sidebar.panels.find(candidate => candidate.ribbonButton?.id === "core.file-explorer"); }
    panel.ribbonButton = undefined; sidebar.removePanel(panel); container.remove(); style.remove();
    document.documentElement.removeAttribute("data-linux-note-workspace-explorer");
  }
  window.addEventListener("pagehide", dispose);
  document.documentElement.setAttribute("data-linux-note-workspace-explorer", "ready");
  // 已打开文件侧栏的启动场景立即升级显示；没有展开侧栏时不读目录。
  if (sidebar.isShown && (sidebar.activePanel?.ribbonButton?.id === "core.file-explorer" || document.querySelector("#typora-sidebar")?.classList.contains("active-tab-files"))) show();
  return {container, refresh, reveal, show, dispose};
}
