import {register_workspace_dismissal,type workspace_dismiss_layer} from './workspace_focus';
import {workspace_text} from "./workspace_i18n";
import {acquire_workspace_directories} from './workspace_directory_service';
import {workspace_list_selection} from "./workspace_list_selection";
import {register_workspace_context_guard} from "./workspace_context";
import {remote_files_for} from './remote_workspace_files';
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_file_icons,workspace_file_icon} from "./workspace_file_icons";
import {acquire_workspace_style} from "./workspace_styles";
import { workspace_element as el, workspace_menu, workspace_dialog, type workspace_menu_entry } from "./workspace_widgets";
import { format_file_path } from "./file_paths";
import { git_icon, type git_icon_name } from "./git_icons";
import type {workspace_file_clipboard} from "./workspace_file_clipboard";
import explorer_css from "./workspace_explorer.css";
import type {workspace_path_result} from './workspace_path_search';

export type workspace_file_tree_options = {
  fs?:any;
  path_api?:any;
  selection?:{select(path:string,directory:boolean):void;enter(path:string,directory:boolean):unknown;label(path:string):string};
  open_file(path: string, location?: {preview?: boolean}, group?: string): unknown;
  context_root(): string;
  active_file?(): string;
  open_folder(): unknown;
  copy(text: string): unknown;
  reveal_system?(path:string):unknown;
  find_in_folder?(path:string):unknown;
  terminal?(path:string):unknown;
  compare?(left:string,right:string):Promise<void>;
  rename?(root: string, old_path: string, name: string): Promise<string>;
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
/** Explorer and selector share the same virtual file tree; host sidebar and confirmation transactions are held by the caller. */
export function create_workspace_file_tree(options: workspace_file_tree_options) {
  const runtime = window as unknown as {reqnode(name: string): any};
  const fs = options.fs || runtime.reqnode("fs"), path_api = options.path_api || runtime.reqnode("path");
  const directories=acquire_workspace_directories(fs,path_api);
  const style = acquire_workspace_style("typora-code-style:workspace_explorer", explorer_css, {});
  const container = el("section", "linux-note-workspace-explorer");
  if(options.selection)container.classList.add("workspace-file-tree-selection"); container.setAttribute("aria-label", workspace_text("file_tree_explorer"));
  const interaction=acquire_workspace_interaction(container);
  const toolbar = el("div", "workspace-explorer-toolbar");
  const title = el("strong", "", workspace_text("file_tree_explorer"));
  const actions = el("div", "workspace-explorer-actions");
  const root_label = el("div", "workspace-explorer-root");
  const root_name = el("span", "workspace-explorer-root-name"), root_actions = el("div", "workspace-explorer-actions"); root_label.append(root_name, root_actions);
  const tree = el("div", "workspace-explorer-tree"); tree.tabIndex = 0; tree.setAttribute("role", "tree"); tree.setAttribute("aria-label", workspace_text("file_tree_files_and_folders"));
  const spacer = el("div", "workspace-explorer-spacer"); tree.append(spacer);
  const status = el("div", "workspace-explorer-status"); status.setAttribute("role", "status"); status.hidden=true;
  toolbar.append(title, actions); container.append(toolbar, root_label, tree, status);
  let root: explorer_node | undefined, selected_path = "", visible = false, disposed = false, generation = 0, serial = 0;
  let flat_nodes: explorer_node[] = [], render_frame = 0, reveal_request = 0;
  let edit_dismissal:workspace_dismiss_layer|undefined;
  let rename_state: {node: explorer_node; input: HTMLInputElement; busy: boolean; focus_requested: boolean; creating?: boolean} | undefined;
  let compact_folders = false;
  let search_projection = false;
  const selection_model = new workspace_list_selection(tree);
  const selection_paths = selection_model.keys;
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
    // When the available tree height changes, first scroll then render, ensuring that the selected line remains fully visible even after errors or cancellation.
    keep_row_visible();
  };
  const run = (operation: () => unknown) => { void Promise.resolve().then(operation).catch(error => set_status(String(error))); };
  const file_icon_style=acquire_workspace_file_icons();
  const icon = (name: git_icon_name) => git_icon(name, "workspace-explorer-icon");
  const icon_button = (name: git_icon_name, label: string, action: () => unknown) => {
    const button = el("button"); button.type = "button"; button.title = label; button.setAttribute("aria-label", label); button.append(icon(name)); button.onclick = () => run(action); return button;
  };
  const open_folder = async () => { await options.open_folder(); await sync_root(true); };
  actions.append(icon_button("folder-opened", workspace_text("file_commands_open_folder"), open_folder), icon_button("target", workspace_text("file_tree_locate_current_file"), () => reveal()));
  root_actions.append(icon_button("new-file", workspace_text("file_tree_new_file"), () => begin_create(false)), icon_button("new-folder", workspace_text("file_tree_new_folder"), () => begin_create(true)), icon_button("refresh", workspace_text("file_tree_refresh_explorer"), () => refresh()), icon_button("collapse-all", workspace_text("file_tree_all_collapse"), () => {
    if (!root) return;
    for (const child of root.children || []) collapse(child);
    rebuild();
  }));

  function close_watch(node: explorer_node) {
    if (node.watcher) { node.watcher.close(); node.watcher = undefined; }
    if (node.refresh_timer) { window.clearTimeout(node.refresh_timer); node.refresh_timer = undefined; }
  }
  function close_branch(node: explorer_node, forget = false) {
    close_watch(node); for (const child of node.children || []) close_branch(child, forget);
    if (forget) nodes.delete(node.path);
  }
  function watch(node: explorer_node) {
    if (options.selection || !visible || disposed || (!node.expanded && !node.compact_parent) || node.watcher) return;
    const stop=directories.service.subscribe(options.context_root(),change=>{
      if(!change.names||change.source===container||change.directory&&change.directory!==node.path)return;
      if(node.refresh_timer)window.clearTimeout(node.refresh_timer);
      node.refresh_timer=window.setTimeout(()=>{node.refresh_timer=undefined;if(visible&&(node.expanded||node.compact_parent))void load_children(node,true,false,true);},250);
    },node.path);node.watcher={close:stop};
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
      // Keep the line and name node under the mouse; only recycle lines that are off-screen, avoiding refresh cutting off browser double-click sequences.
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
            if(options.selection)return;
            if (node.directory || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) { click_sequence = undefined; return; }
            if (event.detail < 2) click_sequence = {node, selected: selected_path === node.path && selection_paths.size === 1 && selection_paths.has(node.path)};
          };
          row.onclick = event => {
            if (event.target === rename_state?.input || rename_state?.busy || disposed || nodes.get(node.path) !== node) return;
            if (!options.selection && (event.ctrlKey || event.metaKey)) { if (selection_paths.has(node.path)) selection_paths.delete(node.path); else selection_paths.add(node.path); selected_path = node.path; render(); return; }
            if (!options.selection && event.shiftKey) {
              const start = flat_nodes.findIndex(candidate => candidate.path === selected_path), end = flat_nodes.indexOf(node);
              selection_paths.clear(); for (const candidate of flat_nodes.slice(Math.min(Math.max(start, 0), end), Math.max(start, end) + 1)) selection_paths.add(candidate.path); render(); return;
            }
            // Directories respond sequentially to click; only files distinguish double-click, avoiding swallowing rapid consecutive double-clicks.
            if (event.button !== 0 || event.altKey && (node.directory || options.selection || event.shiftKey || event.ctrlKey || event.metaKey) || !node.directory && event.detail >= 2) return;
            select(node, false, true); run(() => activate(node, !event.altKey));
          };
          row.ondblclick = event => {
            if (event.target === rename_state?.input) return;
            event.preventDefault(); event.stopPropagation();
            if(options.selection){if(event.button===0&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){select(node);run(()=>options.selection!.enter(node.path,node.directory));}return;}
            if (node.directory || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || rename_state || operation_busy || disposed || nodes.get(node.path) !== node) return;
            const sequence = click_sequence; click_sequence = undefined;
            if (sequence?.node === node && sequence.selected) begin_rename(node);
          };
          row.oncontextmenu = event => { click_sequence = undefined; if (!selection_paths.has(node.path)) select(node); context_menu(event, node); };
        }
        const {row, chevron, label, note, file_icon} = view;
        row.className = "workspace-explorer-row" + (selection_paths.has(node.path) ? " is-selected" : "") + (options.file_clipboard?.is_cut(node.path) ? " is-cut" : "");
        row.id = node.id; row.dataset.path = node.path; row.dataset.directory = String(node.directory); row.setAttribute("role", "treeitem");
        row.setAttribute("aria-level", String((node.display_depth ?? node.depth) + 1)); selection_model.focused_key=selected_path;selection_model.bind(row,node.path);
        if (node.directory) row.setAttribute("aria-expanded", String(node.expanded)); else row.removeAttribute("aria-expanded");
        row.setAttribute("aria-busy", String(Boolean(node.loading)));
        row.style.top = index * ROW_HEIGHT + "px"; row.style.setProperty("--workspace-tree-depth", String(node.display_depth ?? node.depth));
        row.title = (options.selection?.label(node.path) || node.path) + (node.error ? "\n" + node.error : "");
        const state = node.directory ? String(node.expanded) : "file";
        if (chevron.dataset.state !== state) { chevron.dataset.state = state; chevron.replaceChildren(...(node.directory ? [icon(node.expanded ? "chevron-down" : "chevron-right")] : [])); }
        const name = node.display_name || node.name; if (label.textContent !== name) label.textContent = name;
        const message = [node.link ? workspace_text("file_tree_link") : "", node.loading ? workspace_text("file_tree_reading") : node.error ? workspace_text("file_tree_cannot_read") : ""].filter(Boolean).join(" ");
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
    selection_paths.clear(); selection_paths.add(node.path); selected_path = node.path; options.selection?.select(node.path,node.directory); set_status(""); tree.focus({preventScroll: true});
    if (scroll) {
      const index = flat_nodes.indexOf(node), top = index * ROW_HEIGHT;
      if (top < tree.scrollTop) tree.scrollTop = top;
      else if (top + ROW_HEIGHT > tree.scrollTop + tree.clientHeight) tree.scrollTop = top + ROW_HEIGHT - tree.clientHeight;
    }
    if (preserve_dom) {
      selection_model.focused_key=selected_path;
      for (const row of tree.querySelectorAll<HTMLElement>(".workspace-explorer-row")) {
        selection_model.paint(row);
      }
      tree.setAttribute("aria-activedescendant", node.id);
    } else render();
  }
  async function load_children(node: explorer_node, force = false, probing = false, invalidated = false): Promise<void> {
    if (rename_state?.busy) return;
    if (disposed || nodes.get(node.path) !== node) return;
    if (node.loading) return node.loading;
    if (node.children && !force) { watch(node); return; }
    const current_generation = generation;
    node.error = undefined;
    node.loading = (async () => {
      try {
        if(force&&!invalidated)directories.service.invalidate(options.context_root(),node.path,container);
        const entries = await directories.service.read(options.context_root(),node.path);
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
        // Compact folder only detects the single subdirectory chain of visible directories; stop when encountering a fork, do not traverse below the fork.
        if (compact_folders && !probing) for (const child of children) {
          let current = child;
          for (let depth = 0; current.directory && !current.link && depth < 32; depth++) {
            await load_children(current, false, true);
            if (disposed || generation !== current_generation || current.children?.length !== 1 || !current.children[0].directory) break;
            current = current.children[0];
          }
        }
        if (node === root && !children.length) set_status(workspace_text("file_tree_this_folder_is_empty"));
      } catch (error) {
        if (!disposed && current_generation === generation) { node.error = String(error); set_status(workspace_text("file_tree_cannot_read_the_folder") + (options.selection?.label(node.path) || node.path) + "\n" + node.error); }
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
      // Query the target only when the user clicks a link; do not recursively follow symbolic links to traverse the repository.
      const stat = await fs.promises.stat(node.path); if (disposed || generation !== current_generation || nodes.get(node.path) !== node) return; node.directory = stat.isDirectory();
    }
    if (node.directory) {
      if (node.expanded) { collapse(node); rebuild(); }
      else {
        node.expanded = true; rebuild();
        await load_children(node);
        if (!disposed && generation === current_generation && nodes.get(node.path) === node && node.expanded) watch_visible(node);
      }
    } else if(!options.selection) await options.open_file(node.path, {preview});
  }
  function context_menu(event: MouseEvent, node: explorer_node) {
    if(options.selection){event.preventDefault();return;}
    const current_generation=generation;
    const selected_files=[...selection_paths].filter(path=>!nodes.get(path)?.directory);
    const entries: workspace_menu_entry[] = node === root ? [{title: workspace_text("file_tree_all_collapse"), action: () => { for (const child of node.children || []) collapse(child); rebuild(); }}]
      : node.directory ? [{title: node.expanded ? workspace_text("file_tree_collapse_folder") : workspace_text("file_tree_expand_folder"), action: () => run(() => activate(node))}]
      : [{title: workspace_text("file_commands_open_file"), action: () => run(() => options.open_file(node.path))}, {title: workspace_text("file_tree_open_on_the_right"), action: () => run(() => options.open_file(node.path, {}, "right"))}];
    if (node.directory && options.create) entries.push({title: workspace_text("file_tree_new_file_817fb4ed"), separator: true, action: () => run(() => begin_create(false, node))}, {title: workspace_text("file_tree_new_folder_fe33cf22"), action: () => run(() => begin_create(true, node))});
    if(options.reveal_system&&!remote_files_for(node.path))entries.push({title:workspace_text("file_tree_display_in_system_file_explorer"),shortcut:"Shift+Alt+R",action:()=>run(()=>options.reveal_system!(node.path))});
    if(options.terminal)entries.push({title:workspace_text("file_tree_open_in_integrated_terminal"),action:()=>run(()=>options.terminal!(node.directory?node.path:node.parent!.path))});
    if(node.directory&&options.find_in_folder)entries.push({title:workspace_text("file_tree_search_in_folder"),shortcut:"Shift+Alt+F",separator:true,action:()=>run(()=>options.find_in_folder!(node.path))});
    if(!node.directory&&options.compare){
      entries.push({title:workspace_text("file_tree_select_for_comparison"),separator:true,action:()=>{compare_path=node.path;set_status(workspace_text("file_tree_selected_comparison_file")+node.name);}});
      if(compare_path&&compare_path!==node.path)entries.push({title:workspace_text("file_tree_compare_with_selected_item"),action:()=>run(()=>options.compare!(compare_path,node.path))});
      if(selected_files.length===2)entries.push({title:workspace_text("file_tree_compare_selected_file"),action:()=>run(()=>options.compare!(selected_files[0],selected_files[1]))});
    }
    if (node !== root && options.file_clipboard) entries.push({title: workspace_text("git_diff_editor_cut"),shortcut:"Ctrl+X",separator: true, disabled:operation_busy,action: () => run(() => set_clipboard(true))}, {title: workspace_text("monaco_text_input_copy"),shortcut:"Ctrl+C", disabled:operation_busy, action: () => run(() => set_clipboard(false))});
    if (node.directory && options.file_clipboard) entries.push({title: workspace_text("git_diff_editor_paste"),shortcut:"Ctrl+V", disabled: operation_busy, action: () => run(() => paste(node))});
    entries.push({title: workspace_text("editor_actions_copy_path"),shortcut:"Shift+Alt+C",separator: true, action: () => run(() => options.copy(format_file_path(path_api, node.path, root?.path, false) || node.path))},
      {title: workspace_text("file_path_actions_copy_relative_path"),shortcut:"Alt+K Alt+Shift+C", action: () => run(() => options.copy(format_file_path(path_api, node.path, root?.path, true) || node.name))});
    if (node !== root) entries.push({title: workspace_text("file_tree_rename"),shortcut:"F2",separator: true, disabled: Boolean(rename_state?.busy)||operation_busy, action: () => begin_rename(node)});
    if (node !== root && options.trash) entries.push({title: workspace_text("file_tree_delete"),shortcut:"Del",disabled:operation_busy, action: () => confirm_trash()});
    if (node.directory) entries.push({title: workspace_text("file_tree_refresh_folder"),separator:true, action: () => run(() => load_children(node, true))});
    entries.push(...options.extra_menu?.(node.path, node.directory) || []);
    container.dispatchEvent(new CustomEvent("typora-code:explorer-file-menu",{detail:{path:node.path,directory:node.directory,entries}}));
    // When the root directory has switched or the target node has disappeared, the old menu cannot be operated again on the old selection.
    const guard=(items:workspace_menu_entry[])=>{for(const entry of items){const action=entry.action;entry.action=()=>{if(!disposed&&generation===current_generation&&nodes.get(node.path)===node)action();};if(entry.children)guard(entry.children);}};guard(entries);
    workspace_menu(event, entries, "workspace-explorer-menu workspace-menu-compact");
  }
  function begin_rename(node: explorer_node) {
    if (!root || node === root || disposed || rename_state?.busy) return;
    cancel_edit();select(node, true);
    const input = el("input", "workspace-explorer-rename"); input.value = node.name; input.setAttribute("aria-label", workspace_text("file_tree_new_name")); input.spellcheck = false;
    rename_state = {node, input, busy: false, focus_requested: true}; set_status(workspace_text("file_tree_enter_new_name_press_enter_to_confirm_esc_to_cancel"));
    edit_dismissal=register_workspace_dismissal(()=>[input],reason=>{
      if(rename_state?.input!==input||rename_state.busy)return;
      cancel_edit();set_status(workspace_text("file_tree_operation_canceled"));
      if(reason==='escape')tree.focus({preventScroll:true});
      render();
    },{window_blur:true});
    input.onkeydown = event => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); if (!rename_state?.busy) { cancel_edit(); set_status(workspace_text("file_tree_operation_canceled")); tree.focus({preventScroll: true}); render(); } }
      else if (event.key === "Enter") { event.preventDefault(); run(finish_rename); }
    };
    // Focus is executed by the true mounted input box's render; when scroll events cancel the old RAF, it will not miss the focus.
    render();
  }
  async function finish_rename() {
    const edit = rename_state, current_root = root;
    if (!edit || !current_root || edit.busy) return;
    if (!edit.creating && edit.input.value === edit.node.name) { clear_edit(); tree.focus({preventScroll: true}); render(); return; }
    edit.busy = true; edit.input.disabled = true; set_status(workspace_text("file_tree_renaming"));
    try {
      const expanded = edit.node.expanded;
      const target = edit.creating ? await options.create!(current_root.path, edit.node.parent!.path, edit.input.value, edit.node.directory) : await options.rename!(current_root.path, edit.node.path, edit.input.value);
      clear_edit();
      if (disposed || root !== current_root) return;
      // Discard old path monitoring handles, then re-expand to the new name, avoiding reading the old path after directory renaming.
      close_branch(edit.node, true); await load_children(edit.node.parent || current_root, true); await reveal(target);
      const replacement = nodes.get(target); if (expanded && replacement?.directory) { replacement.expanded = true; await load_children(replacement); }
      set_status((edit.creating ? workspace_text("file_tree_created") : workspace_text("file_tree_renamed_to")) + path_api.basename(target)); tree.focus({preventScroll: true});
    } catch (error) {
      if (disposed) return;
      const renamed_path = (error as {renamed_path?: string}).renamed_path;
      if (renamed_path) { clear_edit(); await refresh(); await reveal(renamed_path); set_status(String(error instanceof Error ? error.message : error)); return; }
      edit.busy = false; edit.input.disabled = false; edit.input.setAttribute("aria-invalid", "true"); set_status(String(error instanceof Error ? error.message : error));
      edit.input.focus({preventScroll: true});
    }
  }
  function clear_edit(){const edit=rename_state;rename_state=undefined;edit_dismissal?.dispose();edit_dismissal=undefined;return edit;}
  function cancel_edit() {
    const edit = clear_edit();
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
    if(!paths.length)return;operation_busy=true;set_status(workspace_text("file_tree_writing_to_system_clipboard"));
    try { await options.file_clipboard.copy(current_root.path,paths,move,()=>!disposed&&root===current_root&&path_api.normalize(options.context_root())===current_root.path);
      if(!disposed&&root===current_root)set_status(move?workspace_text("file_tree_cut_select_target_folder_to_paste"):workspace_text("file_tree_copied_to_system_clipboard"));
    } finally { operation_busy=false;if(!disposed)render(); }
  }
  async function paste(target = nodes.get(selected_path) || root) {
    if (!root || !target || !options.file_clipboard || operation_busy) return;
    const current_root=root;if(!target.directory)target=target.parent||root;
    const destination=target;operation_busy=true;set_status(workspace_text("file_tree_pasting_file"));
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
      run(async()=>{try{if(disposed||root!==current_root)return;await options.trash!(current_root.path,paths);selection_paths.clear();selected_path="";set_status(workspace_text("file_tree_moved_to_recycle_bin"));}finally{operation_busy=false;if(!disposed)await refresh();}});
    };
    if(options.confirm_delete?.()===false){execute();return;}
    const dialog=workspace_dialog(workspace_text("file_tree_delete"),workspace_text("language_service_settings_view_cancel"),()=>{trash_confirmation=undefined;dialogs.delete(dialog);});
    dialogs.add(dialog);trash_confirmation=dialog;
    dialog.content.append(el("p","",paths.length===1?workspace_text("file_tree_are_you_sure_you_want_to_move_to_the_recycle_bin", {value_0: String(path_api.basename(paths[0]))}):workspace_text("file_tree_are_you_sure_you_want_to_move_items_to_the_recycle_bin", {value_0: String(paths.length)})));
    const cancel=el("button","",workspace_text("language_service_settings_view_cancel")),accept=el("button","",workspace_text("file_tree_move_to_recycle_bin"));
    cancel.onclick=()=>dialog.close();accept.onclick=()=>{dialog.close();execute();};
    dialog.footer.replaceChildren(cancel,accept);cancel.focus();
  }
  async function sync_root(force = false) {
    if (rename_state?.busy) return;
    if(search_projection){search_projection=false;generation++;if(root)close_branch(root,true);root=undefined;}
    const requested = options.context_root();
    if (!requested || !path_api.isAbsolute(requested)) {
      if (root) { generation++; close_branch(root, true); root = undefined; clear_edit();selection_paths.clear();compare_path="";root_name.textContent = workspace_text("file_tree_folder_not_opened"); selected_path = ""; rebuild(); }
      set_status(workspace_text("file_tree_open_a_folder_to_browse_all_files")); return;
    }
    const file_path = path_api.normalize(requested);
    if (root?.path === file_path) { if (force) {set_status("");await load_children(root, true);} return; }
    generation++;
    clear_edit(); selection_paths.clear();compare_path="";
    if (root) close_branch(root, true);
    root = create_node(file_path, path_api.basename(file_path) || file_path, true, false); root.expanded = true;
    selected_path = "";const remote=remote_files_for(root.path);root_name.textContent = root.name+(remote?` [SSH: ${remote.connection.target}]`:''); root_label.title = remote?remote.remote_path(root.path):root.path; tree.scrollTop = 0;
    set_status(workspace_text("file_tree_reading_folder")); rebuild(); await load_children(root);
    if (root && !root.error && root.children?.length) set_status("");
  }
  async function refresh() {
    await sync_root(); if (!root) return;
    const expanded = [...nodes.values()].filter(node => node.directory && (node.expanded || node.compact_parent));
    // Refresh expanded directories in sequence to avoid issuing a large number of requests simultaneously to network drives or large directories.
    for (const node of expanded) if (!disposed && nodes.get(node.path) === node) await load_children(node, true);
  }
  async function reveal(file_path = options.active_file?.() || "", intent:'center'|'auto'='center') {
    const request=++reveal_request;
    await sync_root(); if (disposed || request!==reveal_request || !root || !file_path || !path_api.isAbsolute(file_path)) return;
    file_path = path_api.normalize(file_path);
    const relative = path_api.relative(root.path, file_path);
    if (!relative || path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) return;
    let parent = root;const reveal_generation=generation;
    const current=()=>!disposed&&generation===reveal_generation&&request===reveal_request;
    const apply=(node:explorer_node)=>{
      const changed=selected_path!==node.path||selection_paths.size!==1||!selection_paths.has(node.path);
      if(changed){selection_paths.clear();selection_paths.add(node.path);selected_path=node.path;options.selection?.select(node.path,node.directory);}
      const top=flat_nodes.indexOf(node)*ROW_HEIGHT;
      const needs_scroll=intent==='center'||top<tree.scrollTop||top+ROW_HEIGHT>tree.scrollTop+tree.clientHeight;
      if(status.textContent)set_status("");
      if(needs_scroll){tree.scrollTop=Math.max(0,top-tree.clientHeight/2);render();}
      else if(changed)render();
    };
    // Opening a visible row already selected it. Host notifications must not
    // walk directories, rebuild the list or move that row under the pointer.
    const known=nodes.get(file_path);
    if(intent==='auto'&&known&&flat_nodes.includes(known)){apply(known);return;}
    const components = relative.split(path_api.sep);
    for (const name of components.slice(0, -1)) {
      await load_children(parent);if(!current())return;
      const child = parent.children?.find(node => path_api.sep === "\\" ? node.name.toLowerCase() === name.toLowerCase() : node.name === name); if (!child) return;
      if (child.link && !child.directory) { try { child.directory = (await fs.promises.stat(child.path)).isDirectory(); } catch { return; } }
      if (!child.directory) return;
      child.expanded = true; await load_children(child);if(!current())return; parent = child;
    }
    await load_children(parent);if(!current())return;rebuild();
    const name = components.at(-1)!;
    let node = parent.children?.find(candidate => path_api.sep === "\\" ? candidate.name.toLowerCase() === name.toLowerCase() : candidate.name === name);
    while (node?.compact_parent && node.children?.length === 1) node = node.children[0];
    if (node&&current()) apply(node);
  }
  async function set_visible(value:boolean) {
    visible=value;
    if(!value){if(!rename_state?.busy){cancel_edit();render();}if(root)close_branch(root);return;}
    await sync_root();if(root)watch_visible(root);
  }
  tree.addEventListener("scroll", render, {passive: true});
  tree.addEventListener("keydown", event => {
    if (event.target !== tree || event.isComposing) return;
    const selected=nodes.get(selected_path)||root;
    if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&selected){
      if(event.code==="KeyR"&&options.reveal_system&&!remote_files_for(selected.path)){event.preventDefault();event.stopPropagation();run(()=>options.reveal_system!(selected.path));}
      if(event.code==="KeyF"&&options.find_in_folder){event.preventDefault();event.stopPropagation();run(()=>options.find_in_folder!(selected.directory?selected.path:selected.parent!.path));}
      return;
    }
    if(event.altKey)return;
    if(options.selection&&(event.ctrlKey||event.metaKey||["Delete","F2","F10"].includes(event.key)))return;
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
      else if(event.key==="Enter"&&options.selection)run(()=>options.selection!.enter(node.path,node.directory));
      else run(() => activate(node));
    } else if (event.key === "F2") {
      event.preventDefault(); event.stopPropagation(); begin_rename(node);
    } else if (event.key === "F10" && event.shiftKey) {
      event.preventDefault(); const bounds = tree.getBoundingClientRect(); context_menu(new MouseEvent("contextmenu", {clientX: bounds.left + 24, clientY: bounds.top + 30}), node);
    }
  });
  detachers.push(register_workspace_context_guard(()=>operation_busy||rename_state?.busy?workspace_text("file_tree_file_operations_are_in_progress_please_complete_them_before"):undefined));
  root_label.oncontextmenu=event=>{if(root)context_menu(event,root);};
  tree.oncontextmenu = event => { if (event.target instanceof Element && event.target.closest(".workspace-explorer-row")) return; if (root) context_menu(event, root); };
  const resize_observer = new ResizeObserver(() => { if (rename_state) keep_row_visible(); render(); }); resize_observer.observe(tree);
  if(options.file_clipboard)detachers.push(options.file_clipboard.subscribe(()=>{if(!disposed)render();}));
  function dispose() {
    file_icon_style.remove();selection_model.dispose();
    if (disposed) return; disposed = true;directories.dispose();interaction.remove(); generation++; visible = false;
    resize_observer.disconnect();
    if (root) close_branch(root, true);
    if (render_frame) cancelAnimationFrame(render_frame);
    row_views.clear(); click_sequence = undefined; clear_edit(); for (const dialog of dialogs) dialog.close(); dialogs.clear();
    for (const detach of detachers) detach();
    container.remove();style.remove();
  }
  if(options.selection){toolbar.remove();root_label.remove();}
  function show_results(entries:workspace_path_result[]){
    if(disposed||!options.selection)return;
    generation++;if(root)close_branch(root,true);nodes.clear();selection_paths.clear();selected_path='';search_projection=true;
    const base=options.context_root();root=create_node(base,path_api.basename(base),true,false);root.expanded=true;root.children=[];
    for(const entry of entries){
      const relative=path_api.relative(base,entry.path);if(!relative||path_api.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path_api.sep))continue;
      const parts=relative.split(path_api.sep);let parent=root;
      for(let index=0;index<parts.length;index++){
        const path=path_api.join(parent.path,parts[index]),last=index===parts.length-1;
        let node=nodes.get(path);
        if(!node){node=create_node(path,parts[index],!last||entry.directory,last&&entry.link,parent);(parent.children||=[]).push(node);}
        if(!last){node.expanded=true;node.children||=[];}parent=node;
      }
    }
    tree.scrollTop=0;set_status('');rebuild();
  }
  return {container,tree,run,refresh,reveal,sync_root,set_visible,dispose,show_results,ready:()=>Boolean(root?.children&&!root.error)};
}
