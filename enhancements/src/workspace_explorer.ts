import {register_workspace_context_guard} from "./workspace_context";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_file_icons,workspace_file_icon} from "./workspace_file_icons";
import {acquire_workspace_style} from "./workspace_styles";
import { workspace_element as el, workspace_menu, workspace_dialog, type workspace_menu_entry } from "./workspace_widgets";
import { format_file_path } from "./file_paths";
import { git_icon, type git_icon_name } from "./git_icons";
import type {workspace_file_clipboard} from "./workspace_file_clipboard";
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
  open_file(path: string, location?: {preview?: boolean}, group?: string): unknown;
  context_root(): string;
  active_file?(): string;
  open_folder(): unknown;
  copy(text: string): unknown;
  reveal_system?(path:string):unknown;
  find_in_folder?(path:string):unknown;
  terminal?(path:string):unknown;
  compare?(left:string,right:string):Promise<void>;
  rename(root: string, old_path: string, name: string): Promise<string>;
  create?(root: string, parent: string, name: string, directory: boolean): Promise<string>;
  file_clipboard?:workspace_file_clipboard;
  trash?(root: string, paths: string[]): Promise<void>;
  confirm_delete?(): boolean;
  compact_folders?: boolean;
  extra_menu?(path: string, is_directory: boolean): workspace_menu_entry[];
};
type explorer_node = {
  id: string; path: string; name: string; parent?: explorer_node; depth: number;
  directory: boolean; link: boolean; expanded: boolean; children?: explorer_node[];
  display_name?: string; display_depth?: number; compact_parent?: boolean;
  error?: string; loading?: Promise<void>; watcher?: {close(): void}; refresh_timer?: number;
};
const ROW_HEIGHT = 26;
const EXPLORER_ID = "linux_note:file_explorer";
/** 全文件目录树自行枚举，不修改原生 SupportedFiles 或全局隐藏文件配置。 */
export function bind_workspace_explorer(core: workspace_explorer_core, options: workspace_explorer_options) {
  const runtime = window as unknown as {reqnode(name: string): any};
  const fs = runtime.reqnode("fs"), path_api = runtime.reqnode("path");
  const sidebar = core.app.workspace.sidebar;
  const style = acquire_workspace_style("typora-code-style:workspace_explorer", explorer_css, {});
  const container = el("section", "linux-note-workspace-explorer"); container.setAttribute("aria-label", "资源管理器");
  const interaction=acquire_workspace_interaction(container);
  const toolbar = el("div", "workspace-explorer-toolbar");
  const title = el("strong", "", "资源管理器");
  const actions = el("div", "workspace-explorer-actions");
  const root_label = el("div", "workspace-explorer-root");
  const root_name = el("span", "workspace-explorer-root-name"), root_actions = el("div", "workspace-explorer-actions"); root_label.append(root_name, root_actions);
  const tree = el("div", "workspace-explorer-tree"); tree.tabIndex = 0; tree.setAttribute("role", "tree"); tree.setAttribute("aria-label", "文件和文件夹");
  const spacer = el("div", "workspace-explorer-spacer"); tree.append(spacer);
  const status = el("div", "workspace-explorer-status"); status.setAttribute("role", "status"); status.hidden=true;
  toolbar.append(title, actions); container.append(toolbar, root_label, tree, status);
  let root: explorer_node | undefined, selected_path = "", visible = false, disposed = false, generation = 0, serial = 0;
  let flat_nodes: explorer_node[] = [], render_frame = 0, refresh_frame = 0, watcher_count = 0;
  let rename_state: {node: explorer_node; input: HTMLInputElement; busy: boolean; focus_requested: boolean; creating?: boolean} | undefined;
  let compact_folders = false;
  const selection_paths = new Set<string>();
  let operation_busy = false, compare_path = "";
  const dialogs = new Set<{close(): void}>();
  const nodes = new Map<string, explorer_node>(); const detachers: (() => void)[] = [];
  const row_views = new Map<explorer_node, {row: HTMLDivElement; chevron: HTMLSpanElement; label: HTMLSpanElement; note: HTMLSpanElement; file_icon: HTMLElement}>();
  let click_sequence: {node: explorer_node; selected: boolean} | undefined;
  const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: "base"});

  function keep_row_visible(node = rename_state?.node || nodes.get(selected_path)) {
    if (!node || !tree.clientHeight) return;
    const index = flat_nodes.indexOf(node); if (index < 0) return;
    const top = index * ROW_HEIGHT, before = tree.scrollTop;
    if (top < before) tree.scrollTop = top;
    else if (top + ROW_HEIGHT > before + tree.clientHeight) tree.scrollTop = top + ROW_HEIGHT - tree.clientHeight;
    if (tree.scrollTop !== before) render();
  }
  const set_status = (message: string) => {
    if (disposed) return;
    status.textContent = message; status.hidden = !message;
    // 提示改变可用树高时，先滚动再渲染，保证错误输入及取消后的选中行仍完整可见。
    keep_row_visible();
  };
  const run = (operation: () => unknown) => { void Promise.resolve().then(operation).catch(error => set_status(String(error))); };
  const file_icon_style=acquire_workspace_file_icons();
  const icon = (name: git_icon_name) => git_icon(name, "workspace-explorer-icon");
  const icon_button = (name: git_icon_name, label: string, action: () => unknown) => {
    const button = el("button"); button.type = "button"; button.title = label; button.setAttribute("aria-label", label); button.append(icon(name)); button.onclick = () => run(action); return button;
  };
  const open_folder = async () => { await options.open_folder(); await sync_root(true); };
  actions.append(icon_button("folder-opened", "打开文件夹", open_folder), icon_button("target", "定位当前文件", () => reveal()));
  root_actions.append(icon_button("new-file", "新建文件", () => begin_create(false)), icon_button("new-folder", "新建文件夹", () => begin_create(true)), icon_button("refresh", "刷新资源管理器", () => refresh()), icon_button("collapse-all", "全部折叠", () => {
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
    if (!visible || disposed || (!node.expanded && !node.compact_parent) || node.watcher || watcher_count >= 128) return;
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
  function watch_visible(node: explorer_node) { if (node.expanded || node.compact_parent) { watch(node); for (const child of node.children || []) watch_visible(child); } }
  function collapse(node: explorer_node) { node.expanded = false; close_branch(node); }
  function create_node(file_path: string, name: string, directory: boolean, link: boolean, parent?: explorer_node): explorer_node {
    const node = {id: "workspace-explorer-node-" + ++serial, path: file_path, name, directory, link, expanded: false, parent, depth: parent ? parent.depth + 1 : -1};
    nodes.set(file_path, node); return node;
  }
  function rebuild() {
    flat_nodes = [];
    for (const node of nodes.values()) node.compact_parent = false;
    const append = (node: explorer_node, depth = 0) => {
      let current = node; const names = [node.name];
      if (compact_folders && !rename_state) while (current.directory && current.children?.length === 1 && current.children[0].directory && !current.children[0].link) { current.compact_parent = true; watch(current); current = current.children[0]; names.push(current.name); }
      current.display_name = names.join(" / "); current.display_depth = depth;
      flat_nodes.push(current); if (current.expanded) for (const child of current.children || []) append(child, depth + 1);
    };
    if (root) for (const child of root.children || []) append(child);
    spacer.style.height = flat_nodes.length * ROW_HEIGHT + "px";
    render();
  }
  function render() {
    if (disposed || render_frame) return;
    render_frame = requestAnimationFrame(() => {
      render_frame = 0;
      const start = Math.max(0, Math.floor(tree.scrollTop / ROW_HEIGHT) - 5);
      const end = Math.min(flat_nodes.length, start + Math.ceil((tree.clientHeight || 500) / ROW_HEIGHT) + 12);
      const shown = new Set(flat_nodes.slice(start, end));
      const focused_input = rename_state && document.activeElement === rename_state.input ? rename_state.input : undefined;
      const selection = focused_input ? [focused_input.selectionStart, focused_input.selectionEnd] : undefined;
      // 保留鼠标下的行和名称节点；只回收离屏行，避免刷新切断浏览器双击序列。
      for (const [node, view] of row_views) if (!shown.has(node)) { view.row.remove(); row_views.delete(node); }
      for (let index = start; index < end; index++) {
        const node = flat_nodes[index];
        let view = row_views.get(node);
        if (!view) {
          const row = el("div", "workspace-explorer-row"), chevron = el("span", "workspace-explorer-chevron");
          const label = el("span", "workspace-explorer-name"), note = el("span", "workspace-explorer-note");
          view = {row, chevron, label, note, file_icon: workspace_file_icon(node.path)}; row_views.set(node, view);
          row.onmousedown = event => {
            if (event.target === rename_state?.input) return;
            if (node.directory || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) { click_sequence = undefined; return; }
            if (event.detail < 2) click_sequence = {node, selected: selected_path === node.path && selection_paths.size === 1 && selection_paths.has(node.path)};
          };
          row.onclick = event => {
            if (event.target === rename_state?.input || rename_state?.busy || disposed || nodes.get(node.path) !== node) return;
            if (event.ctrlKey || event.metaKey) { if (selection_paths.has(node.path)) selection_paths.delete(node.path); else selection_paths.add(node.path); selected_path = node.path; render(); return; }
            if (event.shiftKey) {
              const start = flat_nodes.findIndex(candidate => candidate.path === selected_path), end = flat_nodes.indexOf(node);
              selection_paths.clear(); for (const candidate of flat_nodes.slice(Math.min(Math.max(start, 0), end), Math.max(start, end) + 1)) selection_paths.add(candidate.path); render(); return;
            }
            // 目录逐次响应 click；只有文件区分双击，避免吞掉快速连点的第二击。
            if (event.altKey || !node.directory && event.detail >= 2) return;
            select(node, false, true); run(() => activate(node));
          };
          row.ondblclick = event => {
            if (event.target === rename_state?.input) return;
            event.preventDefault(); event.stopPropagation();
            if (node.directory || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || rename_state || operation_busy || disposed || nodes.get(node.path) !== node) return;
            const sequence = click_sequence; click_sequence = undefined;
            if (sequence?.node === node && sequence.selected) begin_rename(node);
          };
          row.oncontextmenu = event => { click_sequence = undefined; if (!selection_paths.has(node.path)) select(node); context_menu(event, node); };
        }
        const {row, chevron, label, note, file_icon} = view;
        row.className = "workspace-explorer-row" + (selection_paths.has(node.path) || node.path === selected_path ? " is-selected" : "") + (options.file_clipboard?.is_cut(node.path) ? " is-cut" : "");
        row.id = node.id; row.dataset.path = node.path; row.dataset.directory = String(node.directory); row.setAttribute("role", "treeitem");
        row.setAttribute("aria-level", String((node.display_depth ?? node.depth) + 1)); row.setAttribute("aria-selected", String(selection_paths.has(node.path) || node.path === selected_path));
        if (node.directory) row.setAttribute("aria-expanded", String(node.expanded)); else row.removeAttribute("aria-expanded");
        row.setAttribute("aria-busy", String(Boolean(node.loading)));
        row.style.top = index * ROW_HEIGHT + "px"; row.style.paddingLeft = ((node.display_depth ?? node.depth) * 8 + 8) + "px";
        row.title = node.path + (node.error ? "\n" + node.error : "");
        const state = node.directory ? String(node.expanded) : "file";
        if (chevron.dataset.state !== state) { chevron.dataset.state = state; chevron.replaceChildren(...(node.directory ? [icon(node.expanded ? "chevron-down" : "chevron-right")] : [])); }
        const name = node.display_name || node.name; if (label.textContent !== name) label.textContent = name;
        const message = [node.link ? "链接" : "", node.loading ? "读取中…" : node.error ? "无法读取" : ""].filter(Boolean).join(" ");
        if (note.textContent !== message) note.textContent = message; note.classList.toggle("is-error", Boolean(node.error) && !node.loading);
        const children = [chevron, ...(node.directory ? [] : [file_icon]), rename_state?.node === node ? rename_state.input : label, ...(message ? [note] : [])];
        for (const child of [...row.children]) if (!children.includes(child as HTMLElement)) child.remove();
        for (let part = 0; part < children.length; part++) if (row.children[part] !== children[part]) row.insertBefore(children[part], row.children[part] || null);
        if (spacer.children[index - start] !== row) spacer.insertBefore(row, spacer.children[index - start] || null);
      }
      if (focused_input?.isConnected && document.activeElement !== focused_input) { focused_input.focus({preventScroll: true}); focused_input.setSelectionRange(selection![0], selection![1]); }
      if (rename_state?.focus_requested && rename_state.input.isConnected) {
        const {input, node} = rename_state; rename_state.focus_requested = false;
        input.focus({preventScroll: true}); const dot = node.directory ? -1 : node.name.lastIndexOf("."); input.setSelectionRange(0, dot > 0 ? dot : node.name.length);
      }
      const selected = nodes.get(selected_path);
      if (selected && shown.has(selected)) tree.setAttribute("aria-activedescendant", selected.id);
      else tree.removeAttribute("aria-activedescendant");
    });
  }
  function select(node: explorer_node, scroll = false, preserve_dom = false) {
    if (rename_state && rename_state.node !== node && !rename_state.busy) cancel_edit();
    selection_paths.clear(); selection_paths.add(node.path); selected_path = node.path; set_status(""); tree.focus({preventScroll: true});
    if (scroll) {
      const index = flat_nodes.indexOf(node), top = index * ROW_HEIGHT;
      if (top < tree.scrollTop) tree.scrollTop = top;
      else if (top + ROW_HEIGHT > tree.scrollTop + tree.clientHeight) tree.scrollTop = top + ROW_HEIGHT - tree.clientHeight;
    }
    if (preserve_dom) {
      for (const row of tree.querySelectorAll<HTMLElement>(".workspace-explorer-row")) {
        const selected = row.dataset.path === node.path;
        row.classList.toggle("is-selected", selected); row.setAttribute("aria-selected", String(selected));
      }
      tree.setAttribute("aria-activedescendant", node.id);
    } else render();
  }
  async function load_children(node: explorer_node, force = false, probing = false): Promise<void> {
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
        node.children = children; watch(node); rebuild();
        // 紧凑文件夹只探测可见目录的单子目录链；遇到分叉即停，不遍历分叉以下正文。
        if (compact_folders && !probing) for (const child of children) {
          let current = child;
          for (let depth = 0; current.directory && !current.link && depth < 32; depth++) {
            await load_children(current, false, true);
            if (disposed || generation !== current_generation || current.children?.length !== 1 || !current.children[0].directory) break;
            current = current.children[0];
          }
        }
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
  async function activate(node: explorer_node, preview = false) {
    if (rename_state || disposed || nodes.get(node.path) !== node) return;
    const current_generation = generation;
    if (node.link && !node.directory) {
      // 仅在用户点击链接时查询目标；不递归跟随符号链接遍历仓库。
      const stat = await fs.promises.stat(node.path); if (disposed || generation !== current_generation || nodes.get(node.path) !== node) return; node.directory = stat.isDirectory();
    }
    if (node.directory) {
      if (node.expanded) { collapse(node); rebuild(); }
      else {
        node.expanded = true; rebuild();
        await load_children(node);
        if (!disposed && generation === current_generation && nodes.get(node.path) === node && node.expanded) watch_visible(node);
      }
    } else await options.open_file(node.path, {preview});
  }
  function context_menu(event: MouseEvent, node: explorer_node) {
    const current_generation=generation;
    const selected_files=[...selection_paths].filter(path=>!nodes.get(path)?.directory);
    const entries: workspace_menu_entry[] = node === root ? [{title: "全部折叠", action: () => { for (const child of node.children || []) collapse(child); rebuild(); }}]
      : node.directory ? [{title: node.expanded ? "折叠文件夹" : "展开文件夹", action: () => run(() => activate(node))}]
      : [{title: "打开文件", action: () => run(() => options.open_file(node.path))}, {title: "在右侧打开", action: () => run(() => options.open_file(node.path, {}, "right"))}];
    if (node.directory && options.create) entries.push({title: "新建文件…", separator: true, action: () => run(() => begin_create(false, node))}, {title: "新建文件夹…", action: () => run(() => begin_create(true, node))});
    if(options.reveal_system)entries.push({title:"在系统文件资源管理器中显示",shortcut:"Shift+Alt+R",action:()=>run(()=>options.reveal_system!(node.path))});
    if(options.terminal)entries.push({title:"在集成终端中打开",action:()=>run(()=>options.terminal!(node.directory?node.path:node.parent!.path))});
    if(node.directory&&options.find_in_folder)entries.push({title:"在文件夹中查找…",shortcut:"Shift+Alt+F",separator:true,action:()=>run(()=>options.find_in_folder!(node.path))});
    if(!node.directory&&options.compare){
      entries.push({title:"选择以进行比较",separator:true,action:()=>{compare_path=node.path;set_status("已选择比较文件："+node.name);}});
      if(compare_path&&compare_path!==node.path)entries.push({title:"与已选项目比较",action:()=>run(()=>options.compare!(compare_path,node.path))});
      if(selected_files.length===2)entries.push({title:"比较所选文件",action:()=>run(()=>options.compare!(selected_files[0],selected_files[1]))});
    }
    if (node !== root && options.file_clipboard) entries.push({title: "剪切",shortcut:"Ctrl+X",separator: true, disabled:operation_busy,action: () => run(() => set_clipboard(true))}, {title: "复制",shortcut:"Ctrl+C", disabled:operation_busy, action: () => run(() => set_clipboard(false))});
    if (node.directory && options.file_clipboard) entries.push({title: "粘贴",shortcut:"Ctrl+V", disabled: operation_busy, action: () => run(() => paste(node))});
    entries.push({title: "复制路径",shortcut:"Shift+Alt+C",separator: true, action: () => run(() => options.copy(format_file_path(path_api, node.path, root?.path, false) || node.path))},
      {title: "复制相对路径",shortcut:"Ctrl+K Ctrl+Shift+C", action: () => run(() => options.copy(format_file_path(path_api, node.path, root?.path, true) || node.name))});
    if (node !== root) entries.push({title: "重命名",shortcut:"F2",separator: true, disabled: Boolean(rename_state?.busy)||operation_busy, action: () => begin_rename(node)});
    if (node !== root && options.trash) entries.push({title: "删除",shortcut:"Del",disabled:operation_busy, action: () => confirm_trash()});
    if (node.directory) entries.push({title: "刷新文件夹",separator:true, action: () => run(() => load_children(node, true))});
    entries.push(...options.extra_menu?.(node.path, node.directory) || []);
    container.dispatchEvent(new CustomEvent("typora-code:explorer-file-menu",{detail:{path:node.path,directory:node.directory,entries}}));
    // 根目录已切换或目标节点消失时，关闭旧菜单不能再操作旧选择。
    const guard=(items:workspace_menu_entry[])=>{for(const entry of items){const action=entry.action;entry.action=()=>{if(!disposed&&generation===current_generation&&nodes.get(node.path)===node)action();};if(entry.children)guard(entry.children);}};guard(entries);
    workspace_menu(event, entries, "workspace-explorer-menu workspace-menu-compact");
  }
  function begin_rename(node: explorer_node) {
    if (!root || node === root || disposed || rename_state?.busy) return;
    select(node, true);
    const input = el("input", "workspace-explorer-rename"); input.value = node.name; input.setAttribute("aria-label", "新名称"); input.spellcheck = false;
    rename_state = {node, input, busy: false, focus_requested: true}; set_status("输入新名称，按 Enter 确认，Esc 取消。");
    input.onkeydown = event => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); if (!rename_state?.busy) { cancel_edit(); set_status("已取消操作。"); tree.focus({preventScroll: true}); render(); } }
      else if (event.key === "Enter") { event.preventDefault(); run(finish_rename); }
    };
    // 聚焦由真正挂载输入框的 render 执行；滚动事件取消旧 RAF 时也不会漏掉聚焦。
    render();
  }
  async function finish_rename() {
    const edit = rename_state, current_root = root;
    if (!edit || !current_root || edit.busy) return;
    if (!edit.creating && edit.input.value === edit.node.name) { rename_state = undefined; tree.focus({preventScroll: true}); render(); return; }
    edit.busy = true; edit.input.disabled = true; set_status("正在重命名…");
    try {
      const expanded = edit.node.expanded;
      const target = edit.creating ? await options.create!(current_root.path, edit.node.parent!.path, edit.input.value, edit.node.directory) : await options.rename(current_root.path, edit.node.path, edit.input.value);
      rename_state = undefined;
      if (disposed || root !== current_root) return;
      // 丢弃旧路径监视句柄，随后重新展开到新名称，避免目录改名后继续读取旧路径。
      close_branch(edit.node, true); await load_children(edit.node.parent || current_root, true); await reveal(target);
      const replacement = nodes.get(target); if (expanded && replacement?.directory) { replacement.expanded = true; await load_children(replacement); }
      set_status((edit.creating ? "已创建 " : "已重命名为 ") + path_api.basename(target)); tree.focus({preventScroll: true});
    } catch (error) {
      if (disposed) return;
      const renamed_path = (error as {renamed_path?: string}).renamed_path;
      if (renamed_path) { rename_state = undefined; await refresh(); await reveal(renamed_path); set_status(String(error instanceof Error ? error.message : error)); return; }
      edit.busy = false; edit.input.disabled = false; edit.input.setAttribute("aria-invalid", "true"); set_status(String(error instanceof Error ? error.message : error));
      edit.input.focus({preventScroll: true});
    }
  }
  function cancel_edit() {
    const edit = rename_state; rename_state = undefined;
    if (edit?.creating) { const parent = edit.node.parent!; parent.children = parent.children?.filter(child => child !== edit.node); nodes.delete(edit.node.path); rebuild(); }
  }
  async function begin_create(directory: boolean, parent = nodes.get(selected_path) || root) {
    if (!root || !parent || !options.create || rename_state?.busy || operation_busy) return;
    if (!parent.directory) parent = parent.parent || root;
    cancel_edit(); parent.expanded = true; await load_children(parent);
    if (disposed) return;
    const node = create_node(path_api.join(parent.path, ".workspace-new-" + ++serial), "", directory, false, parent);
    parent.children = [node, ...parent.children || []]; rebuild(); begin_rename(node); if (rename_state) { rename_state.creating = true; rebuild(); }
  }
  async function set_clipboard(move: boolean) {
    if (!root || !options.file_clipboard || operation_busy) return;
    const current_root=root, paths=selection_paths.size?[...selection_paths]:selected_path?[selected_path]:[];
    if(!paths.length)return;operation_busy=true;set_status("正在写入系统剪贴板…");
    try { await options.file_clipboard.copy(current_root.path,paths,move,()=>!disposed&&root===current_root&&path_api.normalize(options.context_root())===current_root.path);
      if(!disposed&&root===current_root)set_status(move?"已剪切，选择目标文件夹后粘贴。":"已复制到系统剪贴板。");
    } finally { operation_busy=false;if(!disposed)render(); }
  }
  async function paste(target = nodes.get(selected_path) || root) {
    if (!root || !target || !options.file_clipboard || operation_busy) return;
    const current_root=root;if(!target.directory)target=target.parent||root;
    const destination=target;operation_busy=true;set_status("正在粘贴文件…");
    try { const result=await options.file_clipboard.paste(current_root.path,destination.path,()=>!disposed&&root===current_root&&path_api.normalize(options.context_root())===current_root.path&&nodes.get(destination.path)===destination);
      if(!disposed&&root===current_root){await refresh();if(result.paths[0])await reveal(result.paths[0]);set_status(result.message);}
    } finally { operation_busy=false;if(!disposed)await refresh(); }
  }
  let trash_confirmation: ReturnType<typeof workspace_dialog>|undefined;
  function confirm_trash() {
    if (!root || !options.trash || operation_busy || trash_confirmation) return;
    const current_root = root, paths = selection_paths.size ? [...selection_paths] : selected_path ? [selected_path] : []; if (!paths.length) return;
    let accepted=false;
    const execute=()=>{
      if(accepted||operation_busy||disposed||root!==current_root)return;
      accepted=true;operation_busy=true;
      run(async()=>{try{if(disposed||root!==current_root)return;await options.trash!(current_root.path,paths);selection_paths.clear();selected_path="";set_status("已移到回收站。");}finally{operation_busy=false;if(!disposed)await refresh();}});
    };
    if(options.confirm_delete?.()===false){execute();return;}
    const dialog=workspace_dialog("删除","取消",()=>{trash_confirmation=undefined;dialogs.delete(dialog);});
    dialogs.add(dialog);trash_confirmation=dialog;
    dialog.content.append(el("p","",paths.length===1?`确定要将“${path_api.basename(paths[0])}”移到回收站吗？`:`确定要将 ${paths.length} 个项目移到回收站吗？`));
    const cancel=el("button","","取消"),accept=el("button","","移到回收站");
    cancel.onclick=()=>dialog.close();accept.onclick=()=>{dialog.close();execute();};
    dialog.footer.replaceChildren(cancel,accept);cancel.focus();
  }
  async function sync_root(force = false) {
    if (rename_state?.busy) return;
    const requested = options.context_root();
    if (!requested || !path_api.isAbsolute(requested)) {
      if (root) { generation++; close_branch(root, true); root = undefined; rename_state=undefined;selection_paths.clear();compare_path="";root_name.textContent = "未打开文件夹"; selected_path = ""; rebuild(); }
      set_status("打开一个文件夹以浏览全部文件。"); return;
    }
    const file_path = path_api.normalize(requested);
    if (root?.path === file_path) { if (force) await load_children(root, true); return; }
    generation++;
    rename_state = undefined; selection_paths.clear();compare_path="";
    if (root) close_branch(root, true);
    root = create_node(file_path, path_api.basename(file_path) || file_path, true, false); root.expanded = true;
    selected_path = ""; root_name.textContent = root.name; root_label.title = root.path; tree.scrollTop = 0;
    set_status("正在读取文件夹…"); rebuild(); await load_children(root);
    if (root && !root.error && root.children?.length) set_status("");
  }
  async function refresh() {
    await sync_root(); if (!root) return;
    const expanded = [...nodes.values()].filter(node => node.directory && (node.expanded || node.compact_parent));
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
    let node = parent.children?.find(candidate => path_api.sep === "\\" ? candidate.name.toLowerCase() === name.toLowerCase() : candidate.name === name);
    while (node?.compact_parent && node.children?.length === 1) node = node.children[0];
    if (node) { selection_paths.clear(); selection_paths.add(node.path); selected_path = node.path; set_status(""); const index = flat_nodes.indexOf(node); tree.scrollTop = Math.max(0, index * ROW_HEIGHT - tree.clientHeight / 2); render(); }
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
    if (event.target !== tree || event.isComposing) return;
    const selected=nodes.get(selected_path)||root;
    if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&selected){
      if(event.code==="KeyR"&&options.reveal_system){event.preventDefault();event.stopPropagation();run(()=>options.reveal_system!(selected.path));}
      if(event.code==="KeyF"&&options.find_in_folder){event.preventDefault();event.stopPropagation();run(()=>options.find_in_folder!(selected.directory?selected.path:selected.parent!.path));}
      return;
    }
    if(event.altKey)return;
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase(); if (!["c", "x", "v", "a"].includes(key)) return;
      event.preventDefault(); event.stopPropagation();
      if (key === "v") run(() => paste()); else if (key === "a") { selection_paths.clear(); for (const node of flat_nodes) selection_paths.add(node.path); render(); } else run(()=>set_clipboard(key === "x")); return;
    }
    if (event.key === "Delete") { event.preventDefault(); event.stopPropagation(); confirm_trash(); return; }
    let index = Math.max(0, flat_nodes.findIndex(node => node.path === selected_path));
    const node = flat_nodes[index]; if (!node) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      index = event.key === "Home" ? 0 : event.key === "End" ? flat_nodes.length - 1 : Math.min(flat_nodes.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)));
      select(flat_nodes[index], true);
    } else if (["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "ArrowLeft") { if (node.expanded) { collapse(node); rebuild(); } else { let parent = node.parent; while (parent && parent !== root && !flat_nodes.includes(parent)) parent = parent.parent; if (parent && parent !== root) select(parent, true); } }
      else if (event.key === "ArrowRight") { if (node.directory && !node.expanded) run(() => activate(node)); else if (node.expanded && node.children?.length) select(flat_nodes[index + 1] || node.children[0], true); }
      else run(() => activate(node));
    } else if (event.key === "F2") {
      event.preventDefault(); event.stopPropagation(); begin_rename(node);
    } else if (event.key === "F10" && event.shiftKey) {
      event.preventDefault(); const bounds = tree.getBoundingClientRect(); context_menu(new MouseEvent("contextmenu", {clientX: bounds.left + 24, clientY: bounds.top + 30}), node);
    }
  });
  detachers.push(register_workspace_context_guard(()=>operation_busy||rename_state?.busy?"文件操作正在执行，请完成后再切换工作区。":undefined));
  root_label.oncontextmenu=event=>{if(root)context_menu(event,root);};
  tree.oncontextmenu = event => { if (event.target instanceof Element && event.target.closest(".workspace-explorer-row")) return; if (root) context_menu(event, root); };
  const resize_observer = new ResizeObserver(() => { if (rename_state) keep_row_visible(); render(); }); resize_observer.observe(tree);
  const active_change = () => { if (!visible || disposed || refresh_frame) return; refresh_frame = requestAnimationFrame(() => { refresh_frame = 0; run(() => reveal()); }); };
  for (const event of ["active-leaf:change", "file:open"]) { const detach = core.app.workspace.on(event, active_change); if (typeof detach === "function") detachers.push(detach as () => void); }
  if(options.file_clipboard)detachers.push(options.file_clipboard.subscribe(()=>{if(!disposed)render();}));
  const window_focus = () => { run(()=>options.file_clipboard?.refresh());if (visible) run(() => refresh()); };
  window.addEventListener("focus", window_focus);
  function dispose() {
    file_icon_style.remove();
    if (disposed) return; disposed = true;interaction.remove(); generation++; visible = false;
    native_observer.disconnect(); resize_observer.disconnect();
    if (root) close_branch(root, true);
    if (render_frame) cancelAnimationFrame(render_frame); if (refresh_frame) cancelAnimationFrame(refresh_frame);
    row_views.clear(); click_sequence = undefined; rename_state = undefined; for (const dialog of dialogs) dialog.close(); dialogs.clear();
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
