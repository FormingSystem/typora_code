import {workspace_text} from "./workspace_i18n";
import {monaco_text_input,run_text_input_command} from "./monaco_text_input";
import {run_monaco_source_command} from './monaco_source_command';
import {bind_source_navigation} from "./source_navigation";
import {subscribe_document_symbols} from "./workspace_document_symbols";
import {prepare_deleted_native_document} from "./workspace_native_document";
import {workspace_context_switching,workspace_context_epoch,assert_workspace_context_ready} from "./workspace_context";
import {trash_native_path} from "./workspace_native_trash";
import {acquire_workspace_style} from "./workspace_styles";
import {publish_workspace_file_changed} from "./workspace_file_events";
import {read_workspace_editor_settings,observe_workspace_editor_settings,select_workspace_editor_group,workspace_editor_group_locked} from "./workspace_editor_settings";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import {create_resource_file_clipboard} from "./remote_workspace_clipboard";
import {create_workspace_file_clipboard,type workspace_file_clipboard} from "./workspace_file_clipboard";
import { validate_workspace_entries, create_workspace_entry, transfer_workspace_entries, trash_workspace_entries } from "./workspace_file_operations";
import type { graph_core, graph_leaf } from "./git_graph_host";
import { git_diff_editor } from "./git_diff_editor";
import { workspace_element as el, workspace_button as button, workspace_menu, workspace_dialog,dispose_workspace_widgets } from "./workspace_widgets";
import { FILE_LANGUAGE_RULES, is_markdown_file, detect_file_language } from "./file_language";
import { create_text_document, save_text_document_as } from "./workspace_text_document";
import {decode_file_bytes} from "./file_language";
import {capture_position, apply_position} from "./reading_positions";
import type {workspace_document_snapshot, workspace_transfer_format, workspace_transfer_target} from "./workspace_document_transfer";
import { bind_source_lifecycle, type source_lifecycle_view } from "./workspace_source_lifecycle";
import { bind_workspace_editor_status } from "./workspace_editor_status";
import { navigate_reading_target, rename_reading_paths } from "./reading_navigation";
import {register_navigation_editor, notify_navigation_selection} from "./reading_navigation_ports";
import { prepare_workspace_rename, prepare_workspace_move, renamed_workspace_path } from "./workspace_rename";
import { reveal_markdown_location } from "./workspace_markdown_location";
import { SOURCE_FILE_VIEW_ID, is_empty_editor_path, file_key, is_source_file_uri, parse_markdown_file_target, resolve_markdown_file_target, resolve_host_open_file_target, resolve_workspace_file, source_file_path, source_file_uri } from "./workspace_file_uri";
import * as monaco from "monaco-editor/editor/editor.api";
import {vscode_resource_entry} from "./workspace_open_vscode";
import files_css from "./workspace_files.css";

export type file_location = {reason?:"restore";line?: number; column?: number; end_line?: number; end_column?: number; source?: boolean; expected_text?: string; hash?: string; preview?: boolean; preserve_focus?: boolean; signal?: AbortSignal};
/** Independent document providers retain resource identity and IO, while the public file layer only takes over save/closed/unload protection. */
import {active_remote_files,remote_files_for,workspace_resource_fs,protect_remote_cache} from './remote_workspace_files';
import {choose_remote_resource} from './remote_workspace_picker';
export type workspace_document_port = source_lifecycle_view & {busy():boolean; read_text():string};
export type workspace_file_host = {
  fs: any; path_api: any; core: graph_core;
  register_document(port:workspace_document_port):()=>void;
  open_file(file_path: string, location?: file_location, group?: string): Promise<void>;
  restore_files(entries:ReadonlyArray<{path:string;source:boolean;pinned:boolean}>,signal:AbortSignal):Promise<void>;
  context_root(): string;
  file_menu(event: MouseEvent, file_path: string): void;
  copy(text: string): unknown;
  read_text(file_path:string):Promise<string>;
  rename_file(root: string, old_path: string, name: string): Promise<string>;
  move_file(root: string, old_path: string, target: string): Promise<string>;
  create_entry(root:string,parent:string,name:string,directory:boolean):Promise<string>;
  file_clipboard:workspace_file_clipboard;
  trash_entries(root:string,paths:string[]):Promise<void>;
  keep_open(leaf?:graph_leaf):void;
  editor_state(leaf:graph_leaf):{file_path:string; kind:"source"|"markdown"|"other"; dirty:boolean; busy:boolean};
  has_editor_errors(leaf:graph_leaf):boolean;
  close_leaf(leaf:graph_leaf):Promise<boolean>;
  prepare_workspace_switch():Promise<(()=>void)|undefined>;
  duplicate_leaf(leaf:graph_leaf,group:graph_leaf["parent"]):Promise<graph_leaf>;
  reopen_leaf(leaf:graph_leaf,source:boolean):Promise<boolean>;
  source_editor_active(): boolean;
  run_editor_command(command: string): void;
  current_file(): string;
  can_save_active(): boolean;
  save_active(): Promise<boolean>;
  save_as_active():Promise<boolean>;
  reload_active():void;
  save_leaf(leaf:graph_leaf):Promise<boolean>;
  auto_save_leaf(leaf:graph_leaf):Promise<boolean>;
  save_all(): Promise<boolean>;
  can_write(file_path: string): boolean;
  refresh_files(paths: string[]): void;
  capture_transfer(leaf:graph_leaf,signal?:AbortSignal):Promise<workspace_document_snapshot>;
  receive_transfer(snapshot:workspace_document_snapshot,target:workspace_transfer_target,signal?:AbortSignal):Promise<graph_leaf>;
  release_transfer(leaf:graph_leaf,snapshot:workspace_document_snapshot,signal?:AbortSignal):Promise<boolean>;
  assert_can_dispose(): void;
  dispose(): void;
};
const FILES_BINDING = Symbol.for("linux-note.workspace-files@v1");
type workspace_files_binding = {host: workspace_file_host; active: boolean; install(): void; dispose(): void};
let active_host: workspace_file_host | undefined;
export function get_workspace_files(): workspace_file_host | undefined { return active_host; }

/** The Markdown defaults to using native editing view; explicit source code views and other text use the Monaco tag. */
export function bind_workspace_files(core: graph_core): workspace_file_host {
  const binding_owner = core.app as unknown as Record<symbol, workspace_files_binding | undefined>;
  const existing_binding = binding_owner[FILES_BINDING];
  if (existing_binding) {
    existing_binding.install();
    active_host = existing_binding.host;
    return existing_binding.host;
  }
  const runtime = window as unknown as {reqnode(name: string): any; File?: any; JSBridge?:{invoke(command:string,...args:unknown[]):Promise<unknown>}; ClientCommand?: Record<string, (...args: unknown[]) => unknown>; doApplyRename?(path: string): void};
  const fs = workspace_resource_fs(runtime.reqnode("fs")); const path_api = runtime.reqnode("path"); const shell = runtime.reqnode("electron").shell;
  if((runtime as any)._options?.userDataPath)protect_remote_cache(path_api.join((runtime as any)._options.userDataPath,'typora_code','remote_cache'),path_api);
  let native_app_open_file = core.app.openFile;
  const style = acquire_workspace_style("typora-code-style:workspace_files", files_css, {});
  const group_locations = new Map<string, file_location>();
  const views = new Set<source_file_view>();
  const document_ports = new Set<workspace_document_port>();
  const document_port=(leaf:graph_leaf|null)=>[...document_ports].find(port=>port.leaf===leaf&&!port.disposed);
  let next_navigation_id = -1;
  const renamed_markdown_leaves = new Set<graph_leaf>();
  let refreshing_renamed_editors = false;
  let open_revision=0;
  const preview_leaves=new Map<graph_leaf["parent"],graph_leaf>();
  const keep_open=(leaf=core.app.workspace.activeLeaf||undefined)=>{
    if(!leaf)return;delete leaf.state.workspace_preview;if(preview_leaves.get(leaf.parent)===leaf)preview_leaves.delete(leaf.parent);
    workspace_leaf_tab(leaf)?.classList.remove("is-workspace-preview");
  };
  const set_preview=(leaf:graph_leaf|null,preview:boolean)=>{
    if(!leaf)return;
    const edited=[...views].some(view=>view.leaf===leaf&&(view.dirty()||view.saving))||file_key(runtime.File?.bundle?.filePath||"")===file_key(leaf.state.path)&&runtime.File?.changeCounter?.isDocumentEdited();
    if(edited||leaf.state.workspace_pinned||!read_workspace_editor_settings().enable_preview)preview=false;if(!preview){keep_open(leaf);return;}
    const previous=preview_leaves.get(leaf.parent);
    let previous_exists=false;core.app.workspace.eachLeaves(item=>{if(item===previous)previous_exists=true;});
    if(previous&&previous!==leaf&&previous_exists){
      const source=[...views].find(view=>view.leaf===previous);
      const native_dirty=runtime.File?.changeCounter?.isDocumentEdited()&&file_key(runtime.File?.bundle?.filePath||"")===file_key(previous.state.path);
      if(source?.dirty()||source?.saving||native_dirty)keep_open(previous);else {
        // Reuse the editing group sorting port; replace the preview remains in the old position, and it cannot be drawn to the end first and then jump back.
        const group=previous.parent as typeof previous.parent&{children:graph_leaf[]};
        const index=group.children.indexOf(previous);
        const layout_core=core as graph_core&{move_workspace_leaf(leaf:graph_leaf,group:graph_leaf["parent"],index:number):void};
        if(index>=0)layout_core.move_workspace_leaf(leaf,group,index);
        previous.parent.removeTab?.(previous.state.path);
      }
    }
    leaf.state.workspace_preview=true;preview_leaves.set(leaf.parent,leaf);
    workspace_leaf_tab(leaf)?.classList.add("is-workspace-preview");
  };
  // Native format commands do not necessarily dispatch input; the leave notification and host editing notification are both elevated according to the real dirty status.
  const keep_dirty_native=()=>{
    const path=runtime.File?.bundle?.filePath||"";
    if(!runtime.File?.changeCounter?.isDocumentEdited())return;
    core.app.workspace.eachLeaves(leaf=>{if(leaf.state.workspace_preview&&file_key(leaf.state.path)===file_key(path))keep_open(leaf);});
  };
  const prune_previews=()=>queueMicrotask(()=>{
    const present=new Set<graph_leaf>();core.app.workspace.eachLeaves(leaf=>{present.add(leaf);});
    for(const [group,leaf] of preview_leaves)if(!present.has(leaf)||leaf.parent!==group||!leaf.state.workspace_preview)preview_leaves.delete(group);
  });
  const native_editor=(core.app as unknown as {features?:{markdownEditor?:{on(name:string,callback:()=>void):()=>void}}}).features?.markdownEditor;
  const release_preview_edit=native_editor?.on("edit",keep_dirty_native);
  const release_preview_open=core.app.workspace.on("file:will-open",keep_dirty_native);
  const release_preview_layout=core.app.workspace.on("layout-changed",prune_previews);
  const apply_editor_settings=()=>{if(!read_workspace_editor_settings().enable_preview)core.app.workspace.eachLeaves(leaf=>{if(leaf.state.workspace_preview)keep_open(leaf);});};
  const stop_editor_settings=observe_workspace_editor_settings(apply_editor_settings);apply_editor_settings();
  // Native Markdown opens depending on the current group; when creating a new group, first place a safe empty leaf, allowing the original open and unsaved confirmation to continue having transactions.
  const route_native_group=(file_path:string,activate_existing=false)=>{
    let existing:graph_leaf|undefined;core.app.workspace.eachLeaves(leaf=>{if(file_key(leaf.state.path)===file_key(file_path))existing=leaf;});
    if(existing){if(activate_existing){core.app.workspace.activeLeaf=existing;existing.parent.toggleTab(existing.state.path);}return;}
    const group=select_workspace_editor_group(core,file_path);
    if(group===core.app.workspace.activeLeaf?.parent)return;
    const active=group.activeLeaf||group.children?.[0];
    if(active){core.app.workspace.activeLeaf=group.toggleTab(active.state.path);return;}
    const placeholder=core.app.workspace.createLeaf({type:"core.empty",state:{path:"typ://core.empty/"+globalThis.crypto.randomUUID()+"/New tab"}});
    group.appendChild(placeholder);core.app.workspace.activeLeaf=placeholder;return placeholder;
  };
  const native_placeholders=new Map<graph_leaf,()=>void>();
  const watch_native_placeholder=(leaf:graph_leaf)=>{
    const cleanup=()=>{if(!native_placeholders.has(leaf))return;native_placeholders.delete(leaf);for(const release of releases)release();leaf.parent.removeTab?.(leaf.state.path);};
    const check=()=>queueMicrotask(()=>{
      if(!native_placeholders.has(leaf))return;
      const children=(leaf.parent as graph_leaf["parent"]&{children?:graph_leaf[]}).children||[];
      if(!children.includes(leaf)||children.some(item=>item!==leaf)||core.app.workspace.activeLeaf!==leaf)cleanup();
    });
    const releases=[core.app.workspace.on("layout-changed",check),core.app.workspace.on("active-leaf:change",check),core.app.workspace.on("file:open",check)];
    native_placeholders.set(leaf,cleanup);check();
  };
  const keep_clicked_tab=(event:MouseEvent)=>{const tab=event.target instanceof Element?event.target.closest<HTMLElement>(".typ-tab[data-id]"):null;if(tab)core.app.workspace.eachLeaves(leaf=>{if(workspace_leaf_tab(leaf)===tab)keep_open(leaf);});};
  const keep_edited_native=(event:Event)=>{if(event.target instanceof Element&&event.target.closest("#write"))keep_open();};
  document.addEventListener("dblclick",keep_clicked_tab,true);document.addEventListener("input",keep_edited_native,true);
  let renaming = false, file_operation_count = 0;
  const source_lifecycle = bind_source_lifecycle(core, () => [...views,...document_ports]);
  const editor_status = bind_workspace_editor_status(core);
  const real_path = (leaf: graph_leaf | null): string => {
    if (!leaf) return "";
    if (path_api.isAbsolute(leaf.state.path)) return leaf.state.path;
    const source_path = source_file_path(leaf.state.path, path_api);
    if (source_path) return source_path;
    return "";
  };
  const context_root = () => active_remote_files()?.root || (runtime.File?.getMountFolder?.() ?? core.app.workspace.activeLeaf?.state.git_cwd ?? path_api.dirname(real_path(core.app.workspace.activeLeaf) || core.app.workspace.activeFile || ""));
  class source_file_view extends core.WorkspaceView {
    navigation_id = next_navigation_id--;
    containerEl = el("section", "linux-note-source-file"); icon = "fa-file-code-o";
    load_task:Promise<void>=Promise.resolve();
    editor?: git_diff_editor; focus_requested=true; disposed=false; target?:file_location;
    status = el("span", "workspace-file-status"); body = el("div", "workspace-file-body");
    status_controls = el("div", "workspace-editor-status-controls workspace-footer-group"); location_label = el("span", "workspace-file-location");
    language_button = button("", () => this.choose_language()); encoding_button = button("", () => this.choose_format("encoding")); eol_button = button("", () => this.choose_format("eol"));
    shared: {
      file_path:string; text_document:ReturnType<typeof create_text_document>;
      format?:Awaited<ReturnType<ReturnType<typeof create_text_document>["load"]>>;
      saved_format:string; saved_version:number; saving:boolean; loading:boolean; loaded:boolean;
    };
    get file_path(){return this.shared.file_path;} set file_path(value:string){this.shared.file_path=value;}
    get text_document(){return this.shared.text_document;} set text_document(value:ReturnType<typeof create_text_document>){this.shared.text_document=value;}
    get format(){return this.shared.format;} set format(value:Awaited<ReturnType<ReturnType<typeof create_text_document>["load"]>>|undefined){this.shared.format=value;}
    get saved_format(){return this.shared.saved_format;} set saved_format(value:string){this.shared.saved_format=value;}
    get saved_version(){return this.shared.saved_version;} set saved_version(value:number){this.shared.saved_version=value;}
    get saving(){return this.shared.saving;} set saving(value:boolean){this.shared.saving=value;}
    get loading(){return this.shared.loading;} set loading(value:boolean){this.shared.loading=value;}
    get loaded(){return this.shared.loaded;} set loaded(value:boolean){this.shared.loaded=value;}
    close_requires_save(){return ![...views].some(view=>view!==this&&!view.disposed&&view.shared===this.shared);}
    refresh_shared(){for(const view of views)if(view.shared===this.shared){view.attach_shared_editor();view.editor?.focused_editor().updateOptions({readOnly:this.loading});for(const control of[view.language_button,view.encoding_button,view.eol_button])control.disabled=this.loading;view.update_status();}}
    attach_shared_editor(){
      if(this.disposed||this.editor||!this.loaded||!this.format)return;
      const original=[...views].find(view=>view!==this&&!view.disposed&&view.shared===this.shared&&view.editor);
      if(!original?.editor)return;
      this.editor=new git_diff_editor({title:path_api.basename(this.file_path),file:this.file_path,left:original.editor.models[0].getValue(),left_label:this.file_path},()=>this.menu_entries(),original.editor.models[0]);
      this.body.replaceChildren(this.editor.container);const editor=this.editor.focused_editor();editor.updateOptions({readOnly:false});
      this.editor.subscriptions.push(editor.onDidChangeModelContent(()=>queueMicrotask(()=>{if(!this.disposed){this.update_status();publish_workspace_file_changed(this.file_path);}})),editor.onDidChangeCursorPosition(event=>{this.update_status();if(core.app.workspace.activeLeaf===this.leaf)notify_navigation_selection(event.source==="api");}),editor.onDidFocusEditorText(()=>editor_status.schedule()));
    }
    constructor(leaf: graph_leaf) {
      super(leaf); const file_path=real_path(leaf);
      this.shared=[...views].find(view=>!view.disposed&&file_key(view.file_path)===file_key(file_path))?.shared
        ||{file_path,text_document:create_text_document({fs,path_api},file_path),saved_format:"",saved_version:0,saving:false,loading:false,loaded:false};
      leaf.state.git_cwd = path_api.dirname(this.file_path); views.add(this);
      this.target=group_locations.get(leaf.state.path);this.focus_requested=!this.target?.preserve_focus;group_locations.delete(leaf.state.path);
      this.language_button.title = workspace_text("files_select_language_mode_syntax_and_language_service"); this.language_button.setAttribute("aria-label", workspace_text("files_language_mode"));
      this.encoding_button.title = workspace_text("files_select_save_encoding"); this.encoding_button.setAttribute("aria-label", workspace_text("files_save_encoding"));
      this.encoding_button.textContent="UTF-8";
      this.eol_button.title = workspace_text("files_select_line_ending"); this.eol_button.setAttribute("aria-label", workspace_text("files_line_ending"));
      for(const node of [this.status,this.location_label])node.classList.add("workspace-footer-text");
      for(const node of [this.encoding_button,this.eol_button,this.language_button])node.classList.add("workspace-footer-control");
      this.status_controls.append(this.status, this.location_label, this.encoding_button, this.eol_button, this.language_button);
      this.containerEl.append(this.body);editor_status.register(this.leaf,this.status_controls);
      const save_keydown=(event:KeyboardEvent)=>{
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.isComposing && event.key.toLowerCase() === "s") {event.preventDefault();event.stopImmediatePropagation();void this.save();}
      };
      this.containerEl.addEventListener("keydown",save_keydown,true);this.status_controls.addEventListener("keydown",save_keydown,true);
      this.status_controls.oncontextmenu = event => this.menu(event);
    }
    sync_tab_label() {
      for (const tab of [workspace_leaf_tab(this.leaf)].filter((tab):tab is HTMLElement=>Boolean(tab))) {
        const label = tab.querySelector(".typ-file-basename"); if (label) label.textContent = path_api.basename(this.file_path);
        tab.querySelector(".typ-file-ext")?.remove(); tab.title = this.file_path;
      }
    }
    onOpen() {
      this.guard_close();this.sync_tab_label();
      this.attach_shared_editor();this.update_status();refresh_source_analysis();
      editor_status.refresh();editor_status.schedule();
      if (!this.loaded && !this.loading) this.load_task=this.load_file(); else this.reveal();
      queueMicrotask(()=>{if(!this.disposed&&this.focus_requested&&core.app.workspace.activeLeaf===this.leaf)this.editor?.focused_editor().focus();});
    }
    async load_file(encoding?: string) {
      if (renaming) { this.status.textContent = workspace_text("files_renaming_in_progress_please_try_again_later_to_read_the_file"); return; }
      if (this.loading||this.saving||this.disposed) return; this.loading = true; this.refresh_shared(); this.status.textContent = workspace_text("breadcrumbs_picker_reading");
      const previous_version=this.editor?.models[0].getAlternativeVersionId(),previous_format=this.format_key();
      // Replace the saved baseline only after reading the candidate snapshot; prohibit input and format modifications during the reading period.
      const candidate=create_text_document({fs,path_api},this.file_path,{encoding:encoding??this.format?.encoding});
      this.editor?.focused_editor().updateOptions({readOnly:true});
      for(const control of[this.language_button,this.encoding_button,this.eol_button])control.disabled=true;
      try {
        const decoded = await candidate.load(); if(this.disposed)return;
        if(this.editor?.models[0].getAlternativeVersionId()!==previous_version||this.format_key()!==previous_format){this.status.textContent=workspace_text("files_content_has_changed_during_reading_unsaved_modifications_hav");return;}
        this.text_document=candidate;
        this.format = decoded; this.saved_format = this.format_key();
        const data = {title: path_api.basename(this.file_path), file: this.file_path, left: decoded.text, left_label: this.file_path};
        if (this.editor) this.editor.update(data);
        else {
          this.editor = new git_diff_editor(data,()=>this.menu_entries()); this.body.replaceChildren(this.editor.container);
          const view=this.editor.focused_editor();
          this.editor.subscriptions.push(view.onDidChangeModelContent(()=>queueMicrotask(()=>{if(!this.disposed){this.update_status();publish_workspace_file_changed(this.file_path);}})),view.onDidChangeCursorPosition(event=>{this.update_status();if(core.app.workspace.activeLeaf===this.leaf)notify_navigation_selection(event.source==="api");}),view.onDidFocusEditorText(()=>editor_status.schedule()));
        }
        this.editor.focused_editor().updateOptions({readOnly:false});
        this.saved_version=this.editor.models[0].getAlternativeVersionId();
        this.loaded = true; this.refresh_shared(); this.reveal();refresh_source_analysis();
        if(this.focus_requested&&core.app.workspace.activeLeaf===this.leaf)this.editor.focused_editor().focus();
      } catch (error) {
        if(this.disposed)return;
        this.status.textContent = workspace_text("files_cannot_be_previewed_as_text");
        if (!this.editor) this.body.replaceChildren(el("p", "workspace-file-notice", String(error)), ...(!remote_files_for(this.file_path)?[button(workspace_text("files_open_with_system_program"), () => void shell.openPath(this.file_path))]:[]));
        else this.status.textContent = String(error);
      } finally { const status=this.status.textContent;this.loading = false;this.refresh_shared();if(status&&status!==workspace_text("breadcrumbs_picker_reading"))this.status.textContent=status;if(core.app.workspace.activeLeaf===this.leaf)notify_navigation_selection(true); }
    }
    reveal() {
      if(this.disposed||!this.leaf.parent)return;this.editor?.editor.layout();
      const target = this.target; if (!target || !this.editor) return;
      const editor = this.editor.focused_editor(); const model = editor.getModel(); if (!model) return;
      const line = Math.max(1, Math.min(model.getLineCount(), target.line || 1));
      const selection={startLineNumber: line, startColumn: target.column || 1, endLineNumber: target.end_line || line, endColumn: target.end_column || target.column || 1};
      if(target.expected_text!==undefined&&model.getValueInRange(selection).replace(/\r\n?/gu,"\n")!==target.expected_text.replace(/\r\n?/gu,"\n")){this.status.textContent=workspace_text("files_target_content_has_changed_please_save_unsaved_modifications");this.target=undefined;return;}
      editor.setSelection(selection);
      editor.revealRangeInCenter(selection); if(this.focus_requested)editor.focus(); this.target=undefined;
    }
    format_key(){return this.format ? `${this.format.encoding}:${this.format.bom}:${this.format.eol}` : "";}
    dirty(){return this.loaded&&Boolean(this.editor)&&(this.editor!.models[0].getAlternativeVersionId()!==this.saved_version||this.format_key()!==this.saved_format);}
    update_status(){
      if(this.dirty())keep_open(this.leaf);
      if(this.disposed||!this.editor||!this.format)return;
      const view=this.editor.focused_editor(),position=view.getPosition();
      this.containerEl.dataset.modified=String(this.dirty());
      this.status.textContent=this.saving?workspace_text("files_saving"):this.dirty()?workspace_text("files_unsaved"):"";
      this.location_label.textContent=position?workspace_text("files_line_column", {value_0: String(position.lineNumber), value_1: String(position.column)}):"";
      this.language_button.textContent=this.editor.models[0].getLanguageId();this.encoding_button.textContent=this.format.encoding.toUpperCase()+(this.format.bom?" BOM":"");this.eol_button.textContent=this.format.eol==="mixed"?workspace_text("files_mixed_line_endings"):this.format.eol;
      editor_status.schedule();
      for(const tab of [workspace_leaf_tab(this.leaf)].filter((tab):tab is HTMLElement=>Boolean(tab))){
        let dot=tab.querySelector<HTMLElement>(".workspace-file-dirty");if(this.dirty()&&!dot){dot=el("span","workspace-file-dirty","●");dot.title=workspace_text("files_unsaved_modifications_exist");tab.querySelector(".typ-file-basename")?.after(dot);}else if(!this.dirty())dot?.remove();
      }
    }
    async save(){
      if(renaming){this.status.textContent=workspace_text("files_renaming_in_progress_please_try_again_later_to_save");return false;}
      if(this.saving||this.loading||!this.editor||!this.format)return false;
      if(runtime.File?.bundle?.filePath===this.file_path&&runtime.File?.changeCounter?.isDocumentEdited()){this.status.textContent=workspace_text("files_the_markdown_document_editor_has_unsaved_modifications_pleas");return false;}
      this.editor.focused_editor().pushUndoStop();
      const model=this.editor.models[0],version=model.getAlternativeVersionId(),format_key=this.format_key();
      this.saving=true;this.refresh_shared();
      try{const saved=await this.text_document.save(model.getValue(),{encoding:this.format.encoding,bom:this.format.bom,eol:this.format.eol});this.saved_version=version;this.saved_format=format_key;this.format={...saved,encoding:this.format.encoding,bom:this.format.bom,eol:this.format.eol};this.saving=false;this.refresh_shared();await refresh_renamed_editors();return true;}
      catch(error){this.saving=false;this.refresh_shared();this.status.textContent=String(error instanceof Error?error.message:error);return false;}
    }
    async save_as(){
      if(this.disposed||this.saving||this.loading||renaming||!this.editor||!this.format||!runtime.JSBridge?.invoke)return false;
      this.saving=true;this.refresh_shared();
      try{
        const result=remote_files_for(this.file_path)?{filePath:await choose_remote_resource(false,this.file_path)}:await runtime.JSBridge.invoke("dialog.showSaveDialog",{title:workspace_text("file_commands_save_as"),defaultPath:this.file_path,properties:["showOverwriteConfirmation"],filters:[{name:workspace_text("files_all_files"),extensions:["*"]}]}) as {canceled?:boolean;filePath?:string};
        if(this.disposed||core.app.workspace.activeLeaf!==this.leaf||result?.canceled||!result?.filePath)return false;
        if(!path_api.isAbsolute(result.filePath))throw new Error(workspace_text("color_files_the_save_path_returned_by_the_system_is_invalid"));
        const target=path_api.normalize(result.filePath);
        if(file_key(target)===file_key(this.file_path)){this.saving=false;return await this.save();}
        let opened=false;core.app.workspace.eachLeaves(leaf=>{if(leaf!==this.leaf&&file_key(real_path(leaf))===file_key(target))opened=true;});
        if(opened||file_key(runtime.File?.bundle?.filePath||"")===file_key(target))throw new Error(workspace_text("files_the_target_file_is_already_open_in_the_editor_please_close_t"));
        const parent=this.leaf.parent as graph_leaf["parent"]&{renameTab(old_path:string,new_path:string):void};
        if(typeof parent.renameTab!=="function")throw new Error(workspace_text("files_the_current_editing_group_does_not_support_updating_file_ide"));
        const model=this.editor.models[0],version=model.getAlternativeVersionId(),format={...this.format},format_key=this.format_key();
        this.editor.focused_editor().pushUndoStop();
        const saved=await save_text_document_as({fs,path_api},target,model.getValue(),format);
        this.text_document=saved.document;this.file_path=target;this.leaf.state.git_cwd=path_api.dirname(target);
        this.editor.data.file=target;this.editor.data.title=path_api.basename(target);this.editor.data.left_label=target;
        this.format={...saved.value,encoding:this.format.encoding,bom:this.format.bom,eol:this.format.eol};this.saved_version=version;this.saved_format=format_key;
        for(const view of views)if(view.shared===this.shared){
          const group=view.leaf.parent as typeof parent;
          group.renameTab(view.leaf.state.path,source_file_uri(target));view.leaf.state.git_cwd=path_api.dirname(target);
          if(view.editor){view.editor.data.file=target;view.editor.data.title=path_api.basename(target);view.editor.data.left_label=target;}
          keep_open(view.leaf);const tab=workspace_leaf_tab(view.leaf);if(tab){const label=tab.querySelector(".typ-file-basename");if(label)label.textContent=path_api.basename(target);tab.title=target;}
        }keep_open(this.leaf);
        const tab=workspace_leaf_tab(this.leaf);if(tab){const label=tab.querySelector(".typ-file-basename");if(label)label.textContent=path_api.basename(target);tab.title=target;}
        return true;
      }catch(error){this.status.textContent=String(error instanceof Error?error.message:error);new core.Notice(this.status.textContent,5000);return false;}
      finally{this.saving=false;this.refresh_shared();}
    }
    choose_language(){
      if(!this.editor||this.loading)return;const dialog=workspace_dialog(workspace_text("files_select_language_mode"));const select=el("select");select.setAttribute("aria-label",workspace_text("files_file_language_mode"));
      const choices=new Map(FILE_LANGUAGE_RULES.filter(rule=>!rule.category||rule.category==="text").map(rule=>[rule.language,rule.label]));choices.set("plaintext",workspace_text("file_language_plain_text"));
      for(const [value,label]of choices){const option=el("option","",label);option.value=value;select.append(option);}select.value=this.editor.models[0].getLanguageId();
      dialog.content.append(select,el("p","",workspace_text("files_the_language_mode_determines_syntax_highlighting_and_the_cor")));dialog.footer.prepend(button(workspace_text("markdown_color_menu_apply"),()=>{if(this.loading)return;monaco.editor.setModelLanguage(this.editor!.models[0],select.value);this.refresh_shared();dialog.close();if(core.app.workspace.activeLeaf===this.leaf)this.editor?.focused_editor().focus();}));
    }
    choose_format(kind:"encoding"|"eol"){
      if(this.loading)return;
      if(!this.format){if(kind==="encoding")this.choose_reopen_encoding();return;}const dialog=workspace_dialog(kind==="encoding"?workspace_text("files_select_save_encoding"):workspace_text("files_select_line_ending"));const select=el("select");select.setAttribute("aria-label",kind==="encoding"?workspace_text("files_file_save_encoding"):workspace_text("files_file_line_ending_sequence"));
      const values=kind==="encoding"?["utf-8","utf-8-bom","utf-16le","utf-16be"]:["LF","CRLF","CR",...(this.format.eol==="mixed"?["mixed"]:[])];
      for(const value of values){const option=el("option","",value==="mixed"?workspace_text("files_keep_mixed_line_endings"):value.toUpperCase());option.value=value;select.append(option);}select.value=kind==="encoding"?(this.format.encoding==="utf-8"&&this.format.bom?"utf-8-bom":this.format.encoding):this.format.eol;
      dialog.content.append(select,el("p","",workspace_text("files_after_selection_the_file_will_be_saved_as_ctrl_s_the_current")));dialog.footer.prepend(button(workspace_text("markdown_color_menu_apply"),()=>{if(this.loading)return;if(kind==="encoding"){this.format!.encoding=select.value==="utf-8-bom"?"utf-8":select.value;this.format!.bom=select.value!=="utf-8";}else this.format!.eol=select.value as typeof this.format.eol;this.refresh_shared();dialog.close();if(core.app.workspace.activeLeaf===this.leaf)this.editor?.focused_editor().focus();}));
      if(kind==="encoding")dialog.footer.prepend(button(workspace_text("files_open_with_encoding"),()=>{dialog.close();this.choose_reopen_encoding();}));
    }
    choose_reopen_encoding(){
      if(this.loading)return;
      if(this.dirty()){this.status.textContent=workspace_text("files_please_save_first_or_reload_from_disk_to_avoid_losing_draft");return;}
      const dialog=workspace_dialog(workspace_text("files_open_with_encoding_a1359622"));const select=el("select");select.setAttribute("aria-label",workspace_text("files_reload_with_encoding"));
      for(const value of["utf-8","utf-16le","utf-16be","gb18030","big5","windows-1252"]){const option=el("option","",value.toUpperCase());option.value=value;select.append(option);}
      dialog.content.append(select);dialog.footer.prepend(button(workspace_text("files_reload"),()=>{if(this.dirty()||this.loading){this.status.textContent=workspace_text("files_please_save_your_modifications_first_before_opening_with_oth");return;}dialog.close();void this.load_file(select.value);}));
    }
    menu_entries(){return [
      ...(core.app.workspace.activeLeaf===this.leaf?source_navigation?.entries()||[]:[]),
      vscode_resource_entry(this.file_path),
      {title:workspace_text("files_save_file_ctrl_s"),action:()=>void this.save()},
      {title:workspace_text("files_save_as"),shortcut:"Ctrl+Shift+S",action:()=>void this.save_as()},
      {title:workspace_text("file_commands_reload_from_disk"),action:()=>this.confirm_reload()},
      {title:workspace_text("files_display_in_folder"),action:()=>remote_files_for(this.file_path)?core.app.commands.run("linux_note:reveal_in_explorer",[this.file_path,context_root()]):shell.showItemInFolder(this.file_path)},
      ...(is_markdown_file(this.file_path)?[{title:workspace_text("files_open_markdown_rendering"),action:()=>{if(this.dirty()){this.status.textContent=workspace_text("files_please_save_your_source_code_modifications_first_before_open");return;}void open_file(this.file_path);}}]:[])
    ];}
    menu(event:MouseEvent){workspace_menu(event,this.menu_entries());}
    confirm_reload(){if(!this.dirty()){void this.load_file();return;}const dialog=workspace_dialog(workspace_text("files_reload_file"));dialog.content.append(el("p","",workspace_text("files_reloading_will_discard_unsaved_modifications_in_this_tab")));dialog.footer.prepend(button(workspace_text("files_discard_modifications_and_reload"),()=>{dialog.close();void this.load_file();}));}
    confirm_close(close:()=>void){source_lifecycle.confirm_close(this,close);}
    guard_close(){source_lifecycle.guard(this);}
    release_source(){if(this.disposed)return;renamed_markdown_leaves.delete(this.leaf);this.disposed=true;this.editor?.dispose();views.delete(this);editor_status.release(this.leaf);}
    onClose(){source_lifecycle.schedule_release(this);editor_status.schedule();}
  }
  const unregister_view = core.app.viewManager.registerView(SOURCE_FILE_VIEW_ID, leaf => new source_file_view(leaf));
  const open_file = async (file_path: string, location: file_location = {}, group = "active") => {
    if(location.reason!=="restore")window.dispatchEvent(new Event("workspace-file-open-intent"));
    if(workspace_context_switching())throw new Error(workspace_text("files_the_workspace_is_switching_please_open_the_file_later"));
    if(location.signal?.aborted)throw new Error(workspace_text("files_opening_file_has_been_canceled"));
    if (renaming) throw new Error(workspace_text("files_renaming_in_progress_please_try_again_later_to_open_the_file"));
    const resolved_path = resolve_workspace_file(path_api, context_root(), file_path);
    if (!resolved_path) throw new Error(workspace_text("files_cannot_parse_the_file_path"));
    file_path = resolved_path;
    const request_revision=++open_revision;
    const epoch=workspace_context_epoch(),valid=()=>binding.active&&!workspace_context_switching()&&epoch===workspace_context_epoch()&&!location.signal?.aborted;
    const remote=remote_files_for(file_path);if(remote){let opened=false;core.app.workspace.eachLeaves(leaf=>{if(file_key(real_path(leaf))===file_key(file_path))opened=true;});await remote.prepare(file_path,!opened,valid);if(!valid())throw Error(workspace_text("files_opening_file_has_been_canceled"));}
    if (!fs.statSync(file_path).isFile()) throw new Error(workspace_text("reading_navigation_the_target_is_not_a_regular_file"));
    keep_dirty_native();
    notify_navigation_selection();
    if (is_markdown_file(file_path) && !location.source) {
      if ([...views].some(view => file_key(view.file_path) === file_key(file_path) && view.dirty())) throw new Error(workspace_text("files_the_markdown_source_code_tab_has_unsaved_modifications_pleas"));
      const existing_leaves=new Set<graph_leaf>();core.app.workspace.eachLeaves(leaf=>{existing_leaves.add(leaf);});
      const placeholder=group==="active"?route_native_group(file_path):undefined;
      // core should first mount the correct leaf in file:open; submit a preview within the same event, cannot wait for asynchronous reading localization to complete.
      const commit_preview=()=>{
        const leaf=core.app.workspace.activeLeaf;
        if(valid()&&leaf&&file_key(leaf.state.path)===file_key(file_path)&&(!existing_leaves.has(leaf)||leaf.state.workspace_preview))set_preview(leaf,Boolean(location.preview));
      };
      const stop_open=core.app.workspace.on("file:open",path=>{if(file_key(path)===file_key(file_path))commit_preview();});
      try {await navigate_reading_target(file_path, {group, hash: location.hash, signal:location.signal, locate: location.line == null ? undefined : (signal) => reveal_markdown_location(location, signal)});}
      finally {stop_open();if(placeholder)placeholder.parent.removeTab?.(placeholder.state.path);}
      if(location.signal?.aborted)throw new Error(workspace_text("files_opening_file_has_been_canceled"));
      const leaf=core.app.workspace.activeLeaf;
      if(leaf&&file_key(leaf.state.path)===file_key(file_path)&&(!location.preview||!existing_leaves.has(leaf)||leaf.state.workspace_preview))set_preview(leaf,Boolean(location.preview));
      return;
    }
    const uri = source_file_uri(file_path);
    const parent = group === "active" ? select_workspace_editor_group(core,uri) : undefined;
    let existing: graph_leaf | undefined;
    core.app.workspace.eachLeaves(leaf => { if (leaf.parent===parent && is_source_file_uri(leaf.state.path) && file_key(real_path(leaf)) === file_key(file_path)) existing = leaf; });
    if (existing && group === "active") { const view=existing.view as source_file_view;view.focus_requested=!location.preserve_focus;if(location.line!=null)view.target=location;core.app.workspace.activeLeaf = existing.parent.toggleTab(existing.state.path);view.reveal();if(!location.preview||existing.state.workspace_preview)set_preview(existing,Boolean(location.preview));return; }
    if (group !== "active") { group_locations.set(uri,location);core.app.commands.run(group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [uri]);set_preview(core.app.workspace.activeLeaf,Boolean(location.preview)); return; }
    if (!parent) throw new Error(workspace_text("files_no_available_editor_group_is_currently_available"));
    const leaf = core.app.workspace.createLeaf({type: SOURCE_FILE_VIEW_ID, state: {path: uri, git_cwd: path_api.dirname(file_path)}});
    (leaf.view as source_file_view).focus_requested=!location.preserve_focus;
    if(location.line!=null)(leaf.view as source_file_view).target=location;
    const view=leaf.view as source_file_view;
    if(location.preview&&read_workspace_editor_settings().enable_preview){
      // Implicit preview prepares content, keeps the original tab during reading; after success, mounts and replaces within the same task completion.
      const previous_active=core.app.workspace.activeLeaf;
      view.attach_shared_editor();
      if(!view.loaded){view.load_task=[...views].find(other=>other!==view&&other.shared===view.shared&&other.loading)?.load_task||view.load_file();await view.load_task;view.attach_shared_editor();}
      if(view.disposed)return;
      if(!valid()||request_revision!==open_revision||core.app.workspace.activeLeaf!==previous_active){view.release_source();return;}
      if(!view.loaded){parent.appendChild(leaf);core.app.workspace.activeLeaf=leaf;keep_open(leaf);return;}
    }
    parent.appendChild(leaf); core.app.workspace.activeLeaf = leaf;
    set_preview(leaf,Boolean(location.preview));
  };
  const restore_files:workspace_file_host["restore_files"]=async(entries,signal)=>{
    const parent=core.app.workspace.activeLeaf?.parent,epoch=workspace_context_epoch();
    if(!parent)return;
    const known=new Set<string>();core.app.workspace.eachLeaves(leaf=>{known.add(file_key(leaf.state.path));});
    for(let offset=0;offset<entries.length;offset+=20){
      if(signal.aborted||!binding.active||epoch!==workspace_context_epoch())return;
      const batch:graph_leaf[]=[];
      for(const entry of entries.slice(offset,offset+20)){
        const path=entry.source?source_file_uri(entry.path):entry.path;
        if(known.has(file_key(path)))continue;known.add(file_key(path));
        const leaf=core.app.workspace.createLeaf({type:entry.source?SOURCE_FILE_VIEW_ID:"core.markdown",state:{path,workspace_pinned:entry.pinned}});
        if(entry.source)(leaf.view as source_file_view).focus_requested=false;
        batch.push(leaf);
      }
      parent.append_inactive(batch);
      for(const leaf of batch)if(leaf.view instanceof source_file_view){leaf.view.sync_tab_label();leaf.view.guard_close();}
      if(offset+20<entries.length)await new Promise(resolve=>setTimeout(resolve,0));
    }
  };
  let source_navigation:ReturnType<typeof bind_source_navigation>|undefined;
  let analysis_model:any,analysis_path="",analysis_root="",analysis_binding:ReturnType<typeof subscribe_document_symbols>|undefined;
  let source_navigation_editor:git_diff_editor|undefined,source_navigation_language:monaco.IDisposable|undefined,analysis_language="";
  function refresh_source_analysis(){
    const leaf=core.app.workspace.activeLeaf,view=[...views].find(item=>item.leaf===leaf&&!item.disposed),model=view?.loaded?view.editor?.models[0]:undefined;
    const file=view?.file_path||"",root=context_root();
    if(model===analysis_model&&file===analysis_path&&root===analysis_root&&source_navigation_editor===view?.editor&&analysis_language===model?.getLanguageId())return;
    source_navigation?.dispose();source_navigation=undefined;source_navigation_language?.dispose();source_navigation_language=undefined;source_navigation_editor=view?.editor;analysis_language=model?.getLanguageId();
    if(analysis_model&&!analysis_model.isDisposed())monaco.editor.setModelMarkers(analysis_model,"typora_code_lsp",[]);
    analysis_binding?.dispose();analysis_binding=undefined;analysis_model=model;analysis_path=file;analysis_root=root;
    if(model&&!remote_files_for(file)){
      source_navigation_language=model.onDidChangeLanguage(refresh_source_analysis);
      analysis_binding=subscribe_document_symbols(model,file,root,state=>{
        if(model.isDisposed())return;
        monaco.editor.setModelMarkers(model,"typora_code_lsp",state.diagnostics_version===model.getVersionId()?(state.diagnostics||[]).map(item=>({startLineNumber:item.range.start.line+1,startColumn:item.range.start.character+1,endLineNumber:item.range.end.line+1,endColumn:item.range.end.character+1,message:item.message,source:item.source,severity:item.severity===2?monaco.MarkerSeverity.Warning:item.severity===3?monaco.MarkerSeverity.Info:item.severity===4?monaco.MarkerSeverity.Hint:monaco.MarkerSeverity.Error})):[]);
      });
      if(model.getLanguageId()!=="markdown"&&model.getLanguageId()!=="plaintext")source_navigation=bind_source_navigation(view!.editor!.focused_editor(),{
        valid:()=>!view!.disposed&&!["markdown","plaintext"].includes(model.getLanguageId())&&core.app.workspace.activeLeaf===view!.leaf&&context_root()===root&&!workspace_context_switching(),
        query:(kind,position,signal)=>analysis_binding!.navigate(kind,position,signal),
        open:async(target,signal)=>{await open_file(target.file_path,{source:true,preview:true,signal,line:target.range.start.line+1,column:target.range.start.character+1,end_line:target.range.end.line+1,end_column:target.range.end.character+1});},
        notice:message=>{new core.Notice(message,5000);}
      });
    }
  }
  const release_analysis_active=core.app.workspace.on("active-leaf:change",refresh_source_analysis);
  const release_analysis_open=core.app.workspace.on("file:open",refresh_source_analysis);
  window.addEventListener("linux-note-workspace-context-changed",refresh_source_analysis);

  const release_navigation = register_navigation_editor({
    capture() {
      const view = [...views].find(item => !item.disposed && item.leaf === core.app.workspace.activeLeaf);
      if (!view?.editor || view.loading || !view.loaded) return null;
      const editor = view.editor.focused_editor(), selection = editor.getSelection();
      return {kind: "source", file_path: view.file_path, view_id: view.navigation_id,
        line: selection?.startLineNumber, cursor: selection ? {...selection} : null,
        scroll_top: editor.getScrollTop(), scroll_left: editor.getScrollLeft(), editor_state: editor.saveViewState()};
    },
    async restore(location, signal) {
      if (signal.aborted || workspace_context_switching()) return false;
      let view = [...views].find(item => !item.disposed && item.navigation_id === location.view_id && file_key(item.file_path) === file_key(location.file_path));
      if (view) core.app.workspace.activeLeaf = view.leaf.parent.toggleTab(view.leaf.state.path);
      else {
        await open_file(location.file_path, {source: true, signal});
        view = [...views].find(item => !item.disposed && item.leaf === core.app.workspace.activeLeaf && file_key(item.file_path) === file_key(location.file_path));
      }
      const started = Date.now();
      while (view && !view.disposed && (!view.loaded || view.loading) && !signal.aborted && Date.now() - started < 15000) await new Promise(resolve => setTimeout(resolve, 40));
      if (signal.aborted || !view?.loaded || view.loading || view.disposed || !view.editor || core.app.workspace.activeLeaf !== view.leaf) return false;
      const editor = view.editor.focused_editor();
      if (location.editor_state) editor.restoreViewState(location.editor_state as import("monaco-editor/editor/editor.api").editor.ICodeEditorViewState);
      if (location.cursor) editor.setSelection(location.cursor as unknown as import("monaco-editor/editor/editor.api").IRange);
      editor.setScrollTop(location.scroll_top); editor.setScrollLeft(location.scroll_left); editor.focus();
      return true;
    }
  });
  // The community core defaults to sending unsupported files to external programs; all internal entry points are uniformly routed.
  const routed_app_open_file = function (this: typeof core.app, target: string) {
    const source = real_path(core.app.workspace.activeLeaf) || core.app.workspace.activeFile || runtime.File?.bundle?.filePath || "";
    target = resolve_host_open_file_target(path_api, source, target);
    const markdown = resolve_markdown_file_target(path_api, context_root(), target);
    if (markdown) return open_file(markdown.file_path, {hash: markdown.hash});
    if (!target.startsWith("typ://")) return open_file(target);
    // The native bundle still points to this file while the central is a tool tab, the core will directly return; the reading navigation explicitly activates existing Markdown leaf.
    return native_app_open_file.call(this, target);
  };
  let library = runtime.File?.editor?.library;
  let native_library_open_file = typeof library?.openFile === "function" ? library.openFile : undefined;
  const routed_library_open_file = function (this: unknown, target: string, ...args: unknown[]) {
    if (typeof target === "string" && !target.startsWith("typ://") && !parse_markdown_file_target(target)) {
      const source = real_path(core.app.workspace.activeLeaf) || core.app.workspace.activeFile || runtime.File?.bundle?.filePath || "";
      return open_file(resolve_host_open_file_target(path_api, source, target));
    }
    if (typeof target === "string" && parse_markdown_file_target(target)) {
      const source = real_path(core.app.workspace.activeLeaf) || core.app.workspace.activeFile || runtime.File?.bundle?.filePath || "";
      const markdown = resolve_markdown_file_target(path_api, context_root(), resolve_host_open_file_target(path_api, source, target));
      const remote=markdown&&remote_files_for(markdown.file_path);
      if(markdown&&remote&&!remote.prepared(markdown.file_path)){
        const epoch=workspace_context_epoch(),valid=()=>binding.active&&epoch===workspace_context_epoch()&&!workspace_context_switching();
        return remote.prepare(markdown.file_path,false,valid).then(()=>{if(valid())return routed_library_open_file.call(this,target,...args);});
      }
      if (!markdown || !fs.statSync(markdown.file_path).isFile()) throw new Error(workspace_text("reading_navigation_the_target_is_not_a_regular_file"));
      const active_group=core.app.workspace.activeLeaf?.parent;
      let existing_in_group=false;core.app.workspace.eachLeaves(leaf=>{if(leaf.parent===active_group&&file_key(leaf.state.path)===file_key(markdown.file_path))existing_in_group=true;});
      if(active_group&&workspace_editor_group_locked(active_group)&&!existing_in_group){
        // Only select the target group; it is still owned by the native call below, which has parameters, callback receivers, return values, and unsave confirmation.
        const placeholder=route_native_group(markdown.file_path,true);if(placeholder)watch_native_placeholder(placeholder);
      }
      // Check and use must be the same absolute file; relative paths, file, URL, and anchors are not passed to the native file API.
      if (markdown.hash) {
        // Regular links save the source before opening; you cannot open the file first and then add the anchor history later.
        if (typeof args[0] !== "function") return open_file(markdown.file_path, {hash: markdown.hash});
        const callback=args[0];
        const completed=function(this:unknown,...callback_args:unknown[]) {
          const result=typeof callback==="function"?callback.apply(this,callback_args):undefined;
          if(binding.active&&file_key(runtime.File?.bundle?.filePath||"")===file_key(markdown.file_path)
            &&file_key(real_path(core.app.workspace.activeLeaf))===file_key(markdown.file_path)) {
            void navigate_reading_target(markdown.file_path,{hash:markdown.hash}).catch(error=>console.error("Typora Code link navigation:",error));
          }
          return result;
        };
        return native_library_open_file?.call(this,markdown.file_path,completed,...args.slice(1));
      }
      return native_library_open_file?.call(this,markdown.file_path,...args);
    }
    return native_library_open_file?.call(this, target, ...args);
  };
  const copy = (text: string) => { if(file_clipboard.is_busy())throw new Error(workspace_text("files_the_file_clipboard_is_processing_please_try_again_later_to_c"));file_clipboard.invalidate(); runtime.reqnode("electron").clipboard.writeText(remote_files_for(text)?.remote_path(text)||text); };
  const file_menu = (event: MouseEvent, file_path: string) => workspace_menu(event, [
    vscode_resource_entry(file_path),
    {title: workspace_text("file_commands_open_file"), action: () => void open_file(file_path)},
    {title: workspace_text("file_tree_open_on_the_right"), action: () => void open_file(file_path, {}, "right")},
    {title: workspace_text("editor_actions_copy_path"), action: () => copy(file_path)},
    {title: workspace_text("file_path_actions_copy_relative_path"), action: () => copy(path_api.relative(context_root(), file_path))},
    {title: workspace_text("files_display_in_folder"), action: () => remote_files_for(file_path)?core.app.commands.run("linux_note:reveal_in_explorer",[file_path,context_root()]):shell.showItemInFolder(file_path)}
  ]);
  const relocate_file = async (root: string, old_path: string, name: string, moving = false) => {
    if (renaming || runtime.File?._onFileSwitching || runtime.File?.inSavingProcess) throw new Error(workspace_text("files_the_file_is_currently_being_switched_saved_or_renamed_please"));
    renaming = true;
    const relocations: {view: source_file_view; target: string; became_markdown: boolean; previous_path: string; transaction: Awaited<ReturnType<source_file_view["text_document"]["prepare_relocation"]>>}[] = [];
    const library = runtime.File?.editor?.library;
    let paused = false, native_watch_paused = false, old_native_path = "", new_native_path = "", applied = false, renamed_path = "";
    try {
      const plan = await (moving?prepare_workspace_move:prepare_workspace_rename)({fs, path_api}, root, old_path, name);
      if (plan.old_path === plan.new_path) return plan.new_path;
      const map = (candidate: string) => renamed_workspace_path(path_api, candidate, plan.old_path, plan.new_path, plan.directory);
      for (const view of views) {
        const target = map(view.file_path); if (!target) continue;
        if (view.loading || view.saving) throw new Error(workspace_text("files_some_tabs_are_currently_being_read_or_saved_please_try_again"));
        relocations.push({view, target, previous_path:view.file_path, became_markdown:!is_markdown_file(view.file_path)&&is_markdown_file(target), transaction: await view.text_document.prepare_relocation(target)});
      }
      old_native_path = runtime.File?.bundle?.filePath || ""; new_native_path = map(old_native_path) || "";
      if (new_native_path && typeof runtime.doApplyRename !== "function") throw new Error(workspace_text("files_the_typora_does_not_provide_a_native_document_renaming_inter"));
      const tabs: {leaf: graph_leaf; target: string}[] = [];
      const all_leaves: graph_leaf[] = [];
      core.app.workspace.eachLeaves(leaf => { all_leaves.push(leaf); });
      core.app.workspace.eachLeaves(leaf => {
        const target = map(real_path(leaf)); if (!target) return;
        if (all_leaves.some(other => other !== leaf && !map(real_path(other)) && file_key(real_path(other)) === file_key(target))) throw new Error(workspace_text("files_the_target_name_already_has_an_open_document_tab_please_proc"));
        if (typeof (leaf.parent as unknown as {renameTab?: unknown}).renameTab !== "function") throw new Error(workspace_text("files_the_current_editor_group_does_not_support_updating_the_tab_p"));
        tabs.push({leaf, target: is_source_file_uri(leaf.state.path) ? source_file_uri(target) : target});
      });
      library?.pauseOnChange?.(); paused = true;
      // The native IPC is responsible for pausing file monitoring; do not use the directory:rename prefix match of the community core before a, to avoid abc being mistakenly modified.
      const ipc = runtime.reqnode("electron").ipcRenderer;
      if (new_native_path) { await ipc.invoke("app.sendEvent", "willRename", {oldPath: plan.old_path}); native_watch_paused = true; }
      await plan.apply(); applied = true; renamed_path = plan.new_path;
      for (const {leaf, target} of tabs) (leaf.parent as unknown as {renameTab(old_path: string, new_path: string): void}).renameTab(leaf.state.path, target);
      const problems: string[] = [];
      for (const {view, target, transaction, became_markdown, previous_path} of relocations) {
        view.file_path = target; view.leaf.state.git_cwd = path_api.dirname(target);
        if (view.editor) { view.editor.data.file = target; view.editor.data.title = path_api.basename(target); view.editor.data.left_label = target; }
        if(view.editor) {
          const model=view.editor.models[0];
          const first_line=model.getLineContent(1),language=detect_file_language(target,first_line);
          if(detect_file_language(previous_path,first_line)!==language)monaco.editor.setModelLanguage(model,language);
        }
        if(became_markdown)renamed_markdown_leaves.add(view.leaf);
        else if(!is_markdown_file(target))renamed_markdown_leaves.delete(view.leaf);
        try { await transaction.commit(); } catch (error) { problems.push(String(error)); }
        for (const tab of document.querySelectorAll<HTMLElement>(".typ-tab[data-id]")) if (tab.dataset.id === view.leaf.state.path) {
          const label = tab.querySelector(".typ-file-basename"); if (label) label.textContent = path_api.basename(target);
          tab.querySelector(".typ-file-ext")?.remove(); tab.title = target;
        }
        view.update_status();
      }
      if (new_native_path) runtime.doApplyRename!(new_native_path);
      rename_reading_paths(map); editor_status.refresh(); editor_status.schedule();
      runtime.File?.editor?.quickOpenPanel?.updateCacheByRename?.(plan.old_path, plan.new_path);
      window.dispatchEvent(new CustomEvent("linux-note-workspace-renamed", {detail: {old_path: plan.old_path, new_path: plan.new_path, directory: plan.directory}}));
      // Other Typora windows update the path along the real native event; the current window's tab has already been precisely migrated using component boundaries.
      await ipc.invoke("app.sendEvent", "didRename", {oldPath: plan.old_path, newPath: plan.new_path});
      if (problems.length) throw new Error(workspace_text("files_the_name_has_been_updated_but_the_disk_content_is_also_chang") + problems.join("\n"));
      return plan.new_path;
    } catch (error) {
      if (applied) throw Object.assign(new Error(String(error instanceof Error ? error.message : error)), {renamed_path});
      throw error;
    } finally {
      for (const relocation of relocations) relocation.transaction.cancel();
      if (!applied && native_watch_paused && old_native_path) runtime.doApplyRename?.(old_native_path);
      if (paused) library?.resumeOnChange?.();
      renaming = false;
    }
  };
  const rename_file=async(root:string,old_path:string,name:string)=>{const target=await relocate_file(root,old_path,name);await refresh_renamed_editors();return target;};
  const move_file=async(root:string,old_path:string,target:string)=>{const result=await relocate_file(root,old_path,target,true);await refresh_renamed_editors();return result;};
  const active_source_view = () => [...views].find(view => view.leaf === core.app.workspace.activeLeaf);
  const native_document_active = () => Boolean(core.app.workspace.activeLeaf)
    && !String(core.app.workspace.activeLeaf?.state.path || "").startsWith("typ://");
  const run_editor_command=(command:string)=>{
    const input=monaco_text_input(document.activeElement),input_command=({"editor.action.clipboardCopyAction":"copy","editor.action.clipboardCutAction":"cut","editor.action.clipboardPasteAction":"paste","editor.action.selectAll":"selectAll",undo:"undo",redo:"redo"} as Record<string,string>)[command];
    if(input&&input_command){run_text_input_command(input,input_command);return;}
    const editor=active_source_view()?.editor?.focused_editor();if(!editor)return;
    run_monaco_source_command(editor,command);
  };
  const source_editor_active=()=>Boolean(active_source_view()?.editor);
  const can_save_active = () => Boolean(document_port(core.app.workspace.activeLeaf)) || Boolean(active_source_view()) || native_document_active();
  const pending_native_saves=new Set<()=>void>();
  let native_open_pending=false;
  const release_save_active=core.app.workspace.on("active-leaf:change",()=>{
    if(native_document_active())native_open_pending=file_key(core.app.workspace.activeLeaf?.state.path||"")!==file_key(runtime.File?.bundle?.filePath||"")
      ||Boolean(runtime.File?.isFileLoading?.()||runtime.File?._onInitParse||runtime.File?._onFileSwitching);
  });
  const release_save_open=core.app.workspace.on("file:open",(opened:string)=>{if(typeof opened==="string"&&file_key(opened)===file_key(core.app.workspace.activeLeaf?.state.path||"")&&file_key(opened)===file_key(runtime.File?.bundle?.filePath||""))native_open_pending=false;});
  const save_leaf=async(leaf:graph_leaf):Promise<boolean>=>{
    const port=document_port(leaf);if(port)return port.save();
    const source=[...views].find(view=>view.leaf===leaf&&!view.disposed);if(source)return source.save();
    if(leaf.state.path.startsWith("typ://")||!binding.active)return false;
    const target=file_key(leaf.state.path),workspace=core.app.workspace;
    const native_matches=()=>workspace.activeLeaf===leaf&&file_key(runtime.File?.bundle?.filePath||"")===target;
    const preview_only=()=>typeof (leaf.view as {isEditor?:()=>boolean}).isEditor==="function"&&!(leaf.view as {isEditor:()=>boolean}).isEditor();
    if(workspace.activeLeaf===leaf&&preview_only())return false;
    if(workspace.activeLeaf!==leaf||native_open_pending||!native_matches()){
      const ready=await new Promise<boolean>(resolve=>{
        let settled=false,activating=false;let stop_open=()=>{},stop_active=()=>{};
        const finish=(value:boolean)=>{if(settled)return;settled=true;clearTimeout(timeout);stop_open();stop_active();pending_native_saves.delete(cancel);resolve(value);};
        const cancel=()=>finish(false);const timeout=setTimeout(cancel,5000);pending_native_saves.add(cancel);
        stop_open=workspace.on("file:open",(opened:string)=>{if(typeof opened==="string"&&file_key(opened)===target&&native_matches())finish(true);});
        stop_active=workspace.on("active-leaf:change",()=>{if(!activating&&workspace.activeLeaf!==leaf)cancel();});
        if(workspace.activeLeaf!==leaf){
          activating=true;workspace.activeLeaf=leaf.parent.toggleTab(leaf.state.path);activating=false;
          if(preview_only())finish(false);
          else if(!native_open_pending&&native_matches())finish(true);
        }
        if(workspace.activeLeaf!==leaf)cancel();
      });
      if(!ready)return false;
    }
    if(preview_only())return false;
    // No await between the final identity check and invocation: never save a newly selected document.
    if(!binding.active||!native_matches())return false;
    // The verified entry of Windows/Linux returns the actual write disk result; it cannot treat the menu callback return as save completion.
    if(runtime.File?.isNode&&typeof runtime.File.saveUseNode==="function")return await runtime.File.saveUseNode(false)===true;
    if(typeof runtime.ClientCommand?.save!=="function")return false;
    await Promise.resolve(runtime.ClientCommand.save());return true;
  };
  const save_active = async () => {const leaf=core.app.workspace.activeLeaf;return leaf?save_leaf(leaf):false;};
  const auto_save_leaf=async(leaf:graph_leaf):Promise<boolean>=>{
    if(!binding.active||!transfer_present(leaf))return false;
    const state=editor_state(leaf);if(!state.file_path||state.busy||!state.dirty)return false;
    const source=[...views].find(view=>view.leaf===leaf&&!view.disposed);if(source)return source.save();
    // Automatic saving only writes the host's current memory document; it does not activate other tabs; silent parameters prohibit popping up a save as or failure dialog box.
    if(state.kind!=="markdown"||file_key(runtime.File?.bundle?.filePath||"")!==file_key(state.file_path)||runtime.File?.isReadonlyMode||runtime.File?.isLocked)return false;
    return runtime.File?.isNode&&typeof runtime.File.saveUseNode==="function"?await runtime.File.saveUseNode(false,true)===true:false;
  };
  const native_ready=()=>{
    const leaf=core.app.workspace.activeLeaf;
    return binding.active&&native_document_active()&&file_key(leaf!.state.path)===file_key(runtime.File?.bundle?.filePath||"")
      &&(!(leaf!.view as any).isEditor||(leaf!.view as any).isEditor())&&!runtime.File?._onFileSwitching&&!runtime.File?.inSavingProcess;
  };
  const save_as_active=async()=>{
    const source=active_source_view();if(source)return source.save_as();
    const old_path=runtime.File?.bundle?.filePath||'',remote=remote_files_for(old_path)||(!old_path?active_remote_files():undefined);
    if(remote){
      if(!native_ready()||typeof runtime.File?.saveAsUseNode!=='function')return false;
      const leaf=core.app.workspace.activeLeaf,epoch=workspace_context_epoch();
      const target=await choose_remote_resource(false,old_path||path_api.join(remote.root,'Untitled.md'));if(!target)return false;
      if(!native_ready()||core.app.workspace.activeLeaf!==leaf||epoch!==workspace_context_epoch())return false;
      if(target===old_path)return save_active();
      let opened=false;core.app.workspace.eachLeaves(item=>{if(item!==leaf&&file_key(real_path(item))===file_key(target))opened=true;});
      if(opened)throw Error(workspace_text("files_the_target_file_is_already_open_in_the_editor_please_process"));
      const text=runtime.File.editor.getMarkdown(),valid=()=>binding.active&&core.app.workspace.activeLeaf===leaf&&(runtime.File.bundle.filePath||'')===old_path&&runtime.File.editor.getMarkdown()===text&&epoch===workspace_context_epoch();
      await save_text_document_as({fs,path_api},target,text,{text,encoding:'utf-8',bom:false,eol:'LF'} as any);
      if(!valid())return false;await remote.prepare(target,true,valid);if(!valid())return false;
      // The verified native save as entry is responsible for tabs, document content, undo, and dirty identity; remote writing is done before the host publishes.
      const error=await runtime.File.saveAsUseNode(target);if(error)throw error;return true;
    }
    if(!native_ready()||!runtime.ClientCommand?.saveAs)return false;
    await Promise.resolve(runtime.ClientCommand.saveAs());return true;
  };
  const reload_active=()=>{
    const source=active_source_view();if(source){source.confirm_reload();return;}if(!native_ready())return;
    const path=runtime.File?.bundle?.filePath||'',remote=remote_files_for(path);
    if(!remote){runtime.ClientCommand?.reloadFromDisk?.();return;}
    const reload=async()=>{const text=runtime.File.editor.getMarkdown(),epoch=workspace_context_epoch();const valid=()=>native_ready()&&runtime.File.bundle.filePath===path&&runtime.File.editor.getMarkdown()===text&&epoch===workspace_context_epoch();await remote.prepare(path,true,valid);if(valid())await runtime.File.reloadFromDisk(true);};
    const perform=()=>void reload().catch(error=>new core.Notice(String((error as Error).message),6000));
    if(runtime.File?.changeCounter?.isDocumentEdited()){const dialog=workspace_dialog(workspace_text("files_reload_remote_file"));dialog.content.append(el('p','',workspace_text("files_reloading_will_discard_unsaved_modifications_in_this_documen")));dialog.footer.prepend(button(workspace_text("files_discard_modifications_and_reload"),()=>{dialog.close();perform();}));}else perform();
  };
  const save_all = async () => {
    if(active_remote_files()){
      const leaves:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{if(editor_state(leaf).dirty)leaves.push(leaf);});
      for(const leaf of leaves)if(!await save_leaf(leaf))return false;
      return true;
    }
    const owners = new Set<object>();
    const source_saves = [...views].filter(view => {if(view.disposed||!view.dirty()||owners.has(view.shared))return false;owners.add(view.shared);return true;}).map(view => view.save());
    source_saves.push(...[...document_ports].filter(port=>!port.disposed&&port.dirty()).map(port=>port.save()));
    const [, source_results] = await Promise.all([
      Promise.resolve().then(() => runtime.ClientCommand?.saveAll?.()),
      Promise.all(source_saves),
    ]);
    return source_results.every(Boolean);
  };
  const editor_state=(leaf:graph_leaf)=>{
    const port=document_port(leaf);if(port)return {file_path:"",kind:"other" as const,dirty:port.dirty(),busy:port.busy()};
    const source=[...views].find(view=>view.leaf===leaf&&!view.disposed),file_path=real_path(leaf);
    const markdown=!source&&(is_markdown_file(file_path)||leaf.state.path==="");
    const native_same=markdown&&file_key(runtime.File?.bundle?.filePath||"")===file_key(file_path);
    return {file_path,kind:(source?"source":markdown?"markdown":"other") as "source"|"markdown"|"other",
      dirty:source?source.dirty():Boolean(native_same&&runtime.File?.changeCounter?.isDocumentEdited()),
      busy:Boolean(renaming||source?.saving||source?.loading||native_same&&(runtime.File?.isFileLoading?.()||runtime.File?.inSavingProcess||runtime.File?._onFileSwitching))};
  };
  const prepare_workspace_switch=async():Promise<(()=>void)|undefined>=>{
    const leaves:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{leaves.push(leaf);});
    const check=()=>{
      assert_workspace_context_ready();
      if(!binding.active||renaming||file_operation_count||file_clipboard.is_busy()||runtime.File?.isFileLoading?.()||runtime.File?.inSavingProcess||leaves.some(leaf=>editor_state(leaf).busy))throw new Error(workspace_text("files_the_file_is_currently_being_read_saved_or_moved_please_compl"));
      const current:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{current.push(leaf);});
      if(current.length!==leaves.length||current.some(leaf=>!leaves.includes(leaf)))throw new Error(workspace_text("files_the_open_editor_has_changed_please_switch_the_workspace_agai"));
    };
    check();
    const dirty=()=>leaves.filter(leaf=>editor_state(leaf).dirty);
    const terminal_count=document.querySelectorAll('.linux-note-terminal[data-session]').length;
    if(dirty().length||terminal_count){
      const accepted=await new Promise<boolean>(resolve=>{
        let done=false,busy=false;const dialog=workspace_dialog(workspace_text("files_switching_the_workspace"),workspace_text("language_service_settings_view_cancel"),()=>{if(!done)resolve(false);});
        dialog.root.dataset.workspaceSwitch="true";
        dialog.content.append(el("p","",dirty().length?workspace_text("files_the_current_workspace_has_unsaved_modifications_please_save"):workspace_text("files_switching_the_workspace_will_end_the_current_window_s_termin")));
        if(terminal_count&&dirty().length)dialog.content.append(el("p","",workspace_text("files_the_terminal_session_of_the_current_window_will_also_end")));
        const message=el("p");dialog.content.append(message);
        const accept=button(dirty().length?workspace_text("files_save_all_and_switch"):workspace_text("files_switching_the_workspace"),()=>{
          if(busy)return;busy=true;accept.disabled=true;
          void(async()=>{check();for(const leaf of dirty()){if(!dialog.root.isConnected)return;if(!await save_leaf(leaf))throw new Error(workspace_text("files_saving_is_not_complete_the_original_workspace_is_preserved_p"));}
            if(!dialog.root.isConnected)return;check();if(dirty().length)throw new Error(workspace_text("files_there_are_still_unsaved_modifications_the_workspace_is_prese"));done=true;dialog.close(false);resolve(true);
          })().catch(error=>{message.textContent=String(error);}).finally(()=>{busy=false;accept.disabled=false;});
        });dialog.footer.prepend(accept);
      });
      if(!accepted)return;
    }
    check();if(dirty().length)throw new Error(workspace_text("files_there_are_still_unsaved_modifications_the_workspace_is_prese"));
    return ()=>{
      check();if(dirty().length)throw new Error(workspace_text("files_the_document_has_unsaved_modifications_the_switch_has_been_s"));
      file_clipboard.invalidate();
      dispose_workspace_widgets();
      for(const leaf of leaves)leaf.parent.removeTab?.(leaf.state.path);
      // The core removes the last item and creates an empty leaf; active identity cannot point to the old document that has been removed.
      let empty:graph_leaf|undefined;core.app.workspace.eachLeaves(leaf=>{empty??=leaf;});core.app.workspace.activeLeaf=empty;
    };
  };
  const native_close_dialogs=new Map<graph_leaf,{dialog:ReturnType<typeof workspace_dialog>;result:Promise<boolean>}>();
  const close_leaf=async(leaf:graph_leaf):Promise<boolean>=>{
    if(is_empty_editor_path(leaf.state.path)||!transfer_present(leaf))return true;if(editor_state(leaf).busy)return false;
    const group=leaf.parent,path=leaf.state.path,state=editor_state(leaf);
    const remove=async()=>{if(!transfer_present(leaf))return true;if(leaf.parent!==group||leaf.state.path!==path)return false;await group.removeTab?.(path);return !transfer_present(leaf);};
    if(state.kind!=="markdown"||!state.dirty)return remove();
    let shared=false;core.app.workspace.eachLeaves(other=>{if(other!==leaf&&other.state.path===path)shared=true;});
    if(shared)return remove();
    const pending=native_close_dialogs.get(leaf);if(pending)return pending.result;
    let resolve_result!:(value:boolean)=>void,finished=false,saving=false;
    const result=new Promise<boolean>(resolve=>{resolve_result=resolve;});
    const dialog=workspace_dialog(workspace_text("files_save_file_changes"),workspace_text("language_service_settings_view_cancel"),()=>{native_close_dialogs.delete(leaf);if(!finished)resolve_result(false);});
    native_close_dialogs.set(leaf,{dialog,result});
    dialog.root.dataset.workspaceTabClose=path;dialog.content.append(el("p","",workspace_text("files_has_unsaved_changes", {value_0: String(path_api.basename(path)||workspace_text("files_unnamed_document"))})));
    const identity=()=>transfer_present(leaf)&&leaf.parent===group&&leaf.state.path===path;
    const finish=async()=>{if(!dialog.root.isConnected||!identity())return;const closed=await remove();finished=true;resolve_result(closed);dialog.close();};
    const message=el("p");dialog.content.append(message);
    const controls:HTMLButtonElement[]=[];
    const set_busy=(value:boolean)=>{saving=value;for(const control of controls)control.disabled=value;};
    const save_button=button(workspace_text("files_save_and_close"),()=>{if(saving)return;set_busy(true);
      void save_leaf(leaf).then(async saved=>{
        if(saved&&identity()&&!editor_state(leaf).dirty)await finish();
        else if(dialog.root.isConnected)message.textContent=workspace_text("files_the_document_has_not_been_saved_and_the_tab_is_retained");
      }).catch(error=>{message.textContent=String(error);}).finally(()=>set_busy(false));});
    controls.push(save_button);dialog.footer.prepend(save_button);
    if(path&&typeof runtime.File?.reloadFromDisk==="function"){
      const discard_button=button(workspace_text("files_do_not_save_and_close"),()=>{if(saving||!identity())return;set_busy(true);
        void(async()=>{
          if(file_key(runtime.File?.bundle?.filePath||"")!==file_key(path))return;
          await runtime.File.reloadFromDisk(true);
          if(dialog.root.isConnected&&identity()&&!editor_state(leaf).dirty)await finish();
        })().catch(error=>{message.textContent=String(error);}).finally(()=>set_busy(false));});
      controls.push(discard_button);dialog.footer.insertBefore(discard_button,dialog.footer.lastElementChild);
    }
    return result;
  };
  const duplicate_leaf=async(leaf:graph_leaf,group:graph_leaf["parent"])=>{
    if(!transfer_present(leaf)||editor_state(leaf).busy)throw new Error(workspace_text("files_the_document_is_not_ready_please_try_again_later"));
    const state=editor_state(leaf);if(state.kind==="other")throw new Error(workspace_text("files_this_tool_tab_does_not_support_document_split_view"));
    const duplicate=core.app.workspace.createLeaf({type:state.kind==="source"?SOURCE_FILE_VIEW_ID:"core.markdown",state:{...leaf.state,workspace_preview:false,workspace_pinned:false}});
    group.appendChild(duplicate);core.app.workspace.activeLeaf=duplicate;
    return duplicate;
  };
  const reopen_dialogs=new Map<graph_leaf,{dialog:ReturnType<typeof workspace_dialog>;result:Promise<boolean>}>();
  const save_before_reopen=(leaf:graph_leaf):Promise<boolean>=>{
    const pending=reopen_dialogs.get(leaf);if(pending)return pending.result;
    let resolve_result!:(value:boolean)=>void,completed=false,saving=false;
    const result=new Promise<boolean>(resolve=>{resolve_result=resolve;});
    const group=leaf.parent,path=leaf.state.path;
    const dialog=workspace_dialog(workspace_text("files_switch_editing_mode"),workspace_text("language_service_settings_view_cancel"),()=>{reopen_dialogs.delete(leaf);resolve_result(completed);});
    reopen_dialogs.set(leaf,{dialog,result});dialog.root.dataset.workspaceReopen=path;
    dialog.content.append(el("p","",workspace_text("files_this_document_has_unsaved_changes_save_and_continue_switchin")));
    const message=el("p");dialog.content.append(message);
    const save=button(workspace_text("files_save_and_continue"),()=>{if(saving)return;saving=true;save.disabled=true;
      void save_leaf(leaf).then(saved=>{
        if(!dialog.root.isConnected)return;
        completed=saved&&transfer_present(leaf)&&leaf.parent===group&&leaf.state.path===path&&!editor_state(leaf).dirty;
        if(completed)dialog.close();else message.textContent=workspace_text("files_save_is_incomplete_current_editor_is_retained");
      }).catch(error=>{message.textContent=String(error);}).finally(()=>{saving=false;save.disabled=false;});
    });dialog.footer.prepend(save);return result;
  };
  const reopen_leaf=async(leaf:graph_leaf,source:boolean)=>{
    const state=editor_state(leaf);if(!state.file_path||!is_markdown_file(state.file_path)||state.busy)return false;
    if((state.kind==="source")===source){core.app.workspace.activeLeaf=leaf.parent.toggleTab(leaf.state.path);return true;}
    if(state.dirty&&!await save_before_reopen(leaf))return false;
    if(!transfer_present(leaf)||editor_state(leaf).busy||editor_state(leaf).dirty)return false;
    const group=leaf.parent;core.app.workspace.activeLeaf=group.toggleTab(leaf.state.path);
    await open_file(state.file_path,{source});
    const opened=core.app.workspace.activeLeaf;
    if(!opened||opened===leaf||opened.parent!==group)return opened===leaf;
    const pinned=Boolean(leaf.state.workspace_pinned);
    if(!await close_leaf(leaf))return false;
    if(pinned){opened.state.workspace_pinned=true;(core as graph_core&{move_workspace_leaf(leaf:graph_leaf,group:graph_leaf["parent"],index:number):void}).move_workspace_leaf(opened,group,0);}
    return true;
  };
  // The dirty model retains editing; it switches only after saving is successful, without introducing automatic saving or a second draft.
  const refresh_renamed_editors=async()=>{
    if(refreshing_renamed_editors||renaming||runtime.File?.changeCounter?.isDocumentEdited())return;
    refreshing_renamed_editors=true;
    const active=core.app.workspace.activeLeaf;let desired_active=active;
    try {
      for(const leaf of [...renamed_markdown_leaves]) {
        if(!transfer_present(leaf)){renamed_markdown_leaves.delete(leaf);continue;}
        const state=editor_state(leaf);
        if(state.dirty||state.busy)continue;
        if(await reopen_leaf(leaf,false)){renamed_markdown_leaves.delete(leaf);if(leaf===active)desired_active=core.app.workspace.activeLeaf;}
      }
    } catch(error) { new core.Notice(workspace_text("files_the_file_type_has_been_updated_the_editor_switch_is_incomple")+String(error),5000); }
    finally {refreshing_renamed_editors=false;if(desired_active&&transfer_present(desired_active)&&core.app.workspace.activeLeaf!==desired_active)core.app.workspace.activeLeaf=desired_active;}
  };
  const transfer_captures = new WeakMap<graph_leaf,{capture_id:string;fingerprint:string}>();
  const transfer_present = (leaf:graph_leaf) => {let present=false;core.app.workspace.eachLeaves(item=>{if(item===leaf)present=true;});return present;};
  const transfer_loading = () => Boolean(runtime.File?.isFileLoading?.()||runtime.File?._onFileSwitching||runtime.File?._onInitParse);
  const transfer_guard = (signal?:AbortSignal) => {
    if(signal?.aborted||!binding.active)throw new Error(workspace_text("files_window_transfer_has_been_canceled_the_original_tab_is_retain"));
    if(renaming||runtime.File?.isFileLoading?.()||runtime.File?._onFileSwitching||runtime.File?._onInitParse||runtime.File?.inSavingProcess)throw new Error(workspace_text("files_the_file_is_being_read_switched_saved_or_renamed_please_try"));
  };
  // The last time it is removed will trigger the host's asynchronous switch. Only wait for it to end before the transaction starts; do not retry the written transfer.
  const prepare_transfer = async (current:()=>boolean,signal?:AbortSignal) => {
    const deadline=Date.now()+5000,epoch=workspace_context_epoch();
    const valid=()=>epoch===workspace_context_epoch()&&!workspace_context_switching()&&current();
    while(transfer_loading()){
      if(signal?.aborted||!binding.active||!valid())throw new Error(workspace_text("files_window_transfer_target_has_been_changed_the_original_tab_is"));
      if(renaming||runtime.File?.inSavingProcess||Date.now()>=deadline)transfer_guard(signal);
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    transfer_guard(signal);
    if(!valid())throw new Error(workspace_text("files_window_transfer_target_has_been_changed_the_original_tab_is_14fe9452"));
  };
  const transfer_hash=async(value:Uint8Array|string)=>{
    const bytes=typeof value==="string"?new TextEncoder().encode(value):value;
    const digest=await runtime.reqnode("crypto").webcrypto.subtle.digest("SHA-256",bytes);
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
  };
  // Asynchronous block reading and verification of the same handle and directory entry; slow disk cancellation will not block input or stale draft coverage.
  const transfer_disk=async(file_path:string,signal?:AbortSignal)=>{
    transfer_guard(signal);const entry=await fs.promises.lstat(file_path);transfer_guard(signal);
    const real=await fs.promises.realpath(file_path);transfer_guard(signal);
    if(!entry.isFile()||entry.isSymbolicLink())throw new Error(workspace_text("files_only_real_ordinary_files_can_be_transferred_directories_or_s"));
    const handle=await fs.promises.open(file_path,"r");
    try {
      transfer_guard(signal);const before=await handle.stat();transfer_guard(signal);
      if(!before.isFile())throw new Error(workspace_text("files_the_transfer_project_is_not_an_ordinary_text_file"));
      const bytes=new Uint8Array(before.size+1);let length=0;
      while(length<bytes.length){const {bytesRead:count}=await handle.read(bytes,length,Math.min(256*1024,bytes.length-length),length);transfer_guard(signal);if(!count)break;length+=count;}
      const result=bytes.slice(0,length),sha256=await transfer_hash(result);transfer_guard(signal);
      const after=await handle.stat();transfer_guard(signal);
      const current=await fs.promises.lstat(file_path);transfer_guard(signal);
      const current_real=await fs.promises.realpath(file_path);transfer_guard(signal);
      const same=(a:any,b:any)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
      if(!same(before,after)||!same(after,current)||!same(entry,current)||length!==after.size||real!==current_real)throw new Error(workspace_text("files_disk_file_changes_occurred_during_transfer_the_original_tab"));
      return{bytes:result,sha256};
    }finally{await handle.close();}
  };
  const transfer_fingerprint=(snapshot:workspace_document_snapshot)=>transfer_hash(JSON.stringify([
    snapshot.schema,snapshot.kind,snapshot.file_path,snapshot.root,snapshot.text,snapshot.dirty,snapshot.disk_sha256,
    snapshot.source_format,snapshot.source_baseline_format,snapshot.source_baseline,snapshot.source_model_eol,snapshot.markdown_baseline,snapshot.language
  ]));
  const saved_source_format=(view:source_file_view):workspace_transfer_format=>{
    const [encoding,bom,eol]=view.saved_format.split(":");return{encoding,bom:bom==="true",eol:eol as workspace_transfer_format["eol"]};
  };
  const native_transfer_text=()=>{
    if(typeof runtime.File?.editor?.getMarkdown!=="function")throw new Error(workspace_text("files_the_current_host_does_not_support_reading_native_markdown_dr"));
    const text=runtime.File.editor.getMarkdown();if(typeof text!=="string")throw new Error(workspace_text("files_the_native_markdown_document_content_is_not_ready"));return text;
  };
  const normalized_transfer_text=(text:string)=>text.replace(/\r\n?/gu,"\n");
  const collect_transfer=async(leaf:graph_leaf,signal?:AbortSignal):Promise<workspace_document_snapshot>=>{
    transfer_guard(signal);if(!transfer_present(leaf))throw new Error(workspace_text("files_the_tab_to_be_transferred_has_been_closed"));
    const file_path=real_path(leaf);if(!file_path||!path_api.isAbsolute(file_path))throw new Error(workspace_text("files_please_save_the_unnamed_document_first_then_transfer_it_to_a"));
    const root=context_root(),source=[...views].find(view=>view.leaf===leaf&&!view.disposed);
    const snapshot:workspace_document_snapshot={schema:1,capture_id:globalThis.crypto.randomUUID(),capture_fingerprint:"",kind:source?"source":"markdown",file_path,root,text:"",dirty:false,disk_sha256:""};
    let verify_content=()=>{};
    if(source){
      if(source.loading||source.saving||!source.loaded||!source.editor||!source.format)throw new Error(workspace_text("files_source_code_tab_is_being_read_or_saved_please_try_again_late"));
      const model=source.editor.models[0],version=model.getAlternativeVersionId(),format_key=source.format_key(),language=model.getLanguageId();
      verify_content=()=>{transfer_guard(signal);if(!transfer_present(leaf)||source.disposed||source.loading||source.saving||version!==model.getAlternativeVersionId()||format_key!==source.format_key()||language!==model.getLanguageId())throw new Error(workspace_text("files_source_code_has_changed_during_capture_please_resubmit"));};
      const transaction=await source.text_document.prepare_relocation(source.file_path);
      try{
        verify_content();snapshot.disk_sha256=(await transfer_disk(file_path,signal)).sha256;verify_content();
        snapshot.text=model.getValue();snapshot.dirty=source.dirty();snapshot.language=model.getLanguageId();
        snapshot.source_format={encoding:source.format.encoding,bom:source.format.bom,eol:source.format.eol};
        snapshot.source_baseline_format=saved_source_format(source);snapshot.source_baseline=source.format.text;
        snapshot.source_model_eol=model.getEOL() as "\n"|"\r\n";snapshot.view_state=source.editor.focused_editor().saveViewState();
      }finally{transaction.cancel();}
    }else{
      if(!is_markdown_file(file_path))throw new Error(workspace_text("files_this_tab_is_not_a_source_code_or_markdown_file_that_can_be_r"));
      const disk=await transfer_disk(file_path,signal);transfer_guard(signal);
      const native_matches=file_key(runtime.File?.bundle?.filePath||"")===file_key(file_path);
      const decoded=decode_file_bytes(disk.bytes,native_matches?(runtime.File?.bundle?.fileEncode||"utf8").replace(/-bom$/u,""):"utf-8");
      snapshot.disk_sha256=disk.sha256;snapshot.markdown_baseline=decoded.text;
      if(native_matches){
        const saved=runtime.File?.bundle?.savedContent;
        if(typeof saved!=="string"||normalized_transfer_text(saved)!==normalized_transfer_text(decoded.text))throw new Error(workspace_text("files_markdown_disk_content_differs_from_the_current_loaded_baseli"));
        snapshot.text=native_transfer_text();snapshot.dirty=Boolean(runtime.File?.changeCounter?.isDocumentEdited());
        if(snapshot.dirty&&runtime.File?.option?.enableAutoSave)throw new Error(workspace_text("files_current_markdown_auto_save_is_enabled_cannot_guarantee_draft"));
        const content=document.querySelector<HTMLElement>("content"),write=content?.querySelector<HTMLElement>(":scope > #write");
        if(content&&write)snapshot.reading_position=capture_position(content,write);
      }else{
        // BackgroundMarkdown preview does not have an independent editable buffer; read the disk and retain this preview column's own scroll position.
        snapshot.text=decoded.text;const state=(leaf.view as {getScroll?:()=>{scrollTop:number}}).getScroll?.();
        snapshot.reading_position={scroll_top:state?.scrollTop??leaf.containerEl.scrollTop,scroll_left:leaf.containerEl.scrollLeft};
      }
      if(!snapshot.dirty&&normalized_transfer_text(snapshot.text)!==normalized_transfer_text(decoded.text))throw new Error(workspace_text("files_markdown_document_content_differs_from_the_disk_baseline_can"));
      verify_content=()=>{transfer_guard(signal);const still_native=file_key(runtime.File?.bundle?.filePath||"")===file_key(file_path);if(still_native!==native_matches||still_native&&(native_transfer_text()!==snapshot.text||Boolean(runtime.File?.changeCounter?.isDocumentEdited())!==snapshot.dirty||snapshot.dirty&&runtime.File?.option?.enableAutoSave))throw new Error(workspace_text("files_markdown_document_content_or_auto_save_settings_have_changed"));};
    }
    snapshot.capture_fingerprint=await transfer_fingerprint(snapshot);verify_content();
    transfer_guard(signal);if(!transfer_present(leaf)||real_path(leaf)!==file_path||context_root()!==root)throw new Error(workspace_text("files_tab_or_workspace_has_changed_during_resubmit_please_retry"));
    return snapshot;
  };
  const capture_transfer=async(leaf:graph_leaf,signal?:AbortSignal)=>{
    const root=context_root(),path=leaf.state.path;
    await prepare_transfer(()=>context_root()===root&&!workspace_context_switching()&&transfer_present(leaf)&&leaf.state.path===path,signal);
    const snapshot=await collect_transfer(leaf,signal);transfer_guard(signal);transfer_captures.set(leaf,{capture_id:snapshot.capture_id,fingerprint:snapshot.capture_fingerprint});return snapshot;
  };
  const receive_transfer=async(snapshot:workspace_document_snapshot,target:workspace_transfer_target,signal?:AbortSignal):Promise<graph_leaf>=>{
    const initial_root=context_root(),initial_children:graph_leaf[]=[];
    core.app.workspace.eachLeaves(leaf=>{if(leaf.parent===target?.group)initial_children.push(leaf);});
    if(!initial_children.length)throw new Error(workspace_text("files_received_edit_group_or_tab_insertion_position_is_invalid_ple"));
    await prepare_transfer(()=>{
      const children:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{if(leaf.parent===target?.group)children.push(leaf);});
      return context_root()===initial_root&&initial_children.length>0&&children.length===initial_children.length&&children.every((leaf,index)=>leaf===initial_children[index]);
    },signal);
    if(!snapshot||snapshot.schema!==1||!["source","markdown"].includes(snapshot.kind)||typeof snapshot.text!=="string"||typeof snapshot.file_path!=="string"||!path_api.isAbsolute(snapshot.file_path)||typeof snapshot.root!=="string"||typeof snapshot.dirty!=="boolean"||!/^[a-f0-9]{64}$/u.test(snapshot.disk_sha256)||snapshot.capture_fingerprint!==await transfer_fingerprint(snapshot))throw new Error(workspace_text("files_window_document_snapshot_is_invalid_no_changes_have_been_mad"));
    const target_root=context_root(),target_group=target?.group as graph_leaf["parent"]&{insertChild?(index:number,leaf:graph_leaf):void};
    const target_children:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{if(leaf.parent===target_group)target_children.push(leaf);});
    if(!target_group||typeof target_group.insertChild!=="function"||!target_children.length||!Number.isInteger(target.index)||target.index<0||target.index>target_children.length)throw new Error(workspace_text("files_received_edit_group_or_tab_insertion_position_is_invalid_ple"));
    const existing:graph_leaf[]=[];
    core.app.workspace.eachLeaves(leaf=>{if(file_key(real_path(leaf))===file_key(snapshot.file_path))existing.push(leaf);});
    if(existing.length){
      const epoch=workspace_context_epoch(),stable_targets:(()=>boolean)[]=[];
      const conflict=()=>new Error(workspace_text("files_the_content_or_save_format_of_the_same_file_is_different_bot"));
      const same_document=(current:workspace_document_snapshot)=>{
        if(current.kind!==snapshot.kind||current.disk_sha256!==snapshot.disk_sha256)return false;
        if(snapshot.kind==="markdown")return normalized_transfer_text(current.text)===normalized_transfer_text(snapshot.text)
          &&normalized_transfer_text(current.markdown_baseline||"")===normalized_transfer_text(snapshot.markdown_baseline||"");
        const format=(value:workspace_transfer_format|undefined)=>value&&[value.encoding,value.bom,value.eol];
        return current.text===snapshot.text&&current.source_baseline===snapshot.source_baseline&&current.source_model_eol===snapshot.source_model_eol
          &&JSON.stringify(format(current.source_format))===JSON.stringify(format(snapshot.source_format))
          &&JSON.stringify(format(current.source_baseline_format))===JSON.stringify(format(snapshot.source_baseline_format));
      };
      const validate_existing=()=>{
        transfer_guard(signal);
        if(context_root()!==target_root||epoch!==workspace_context_epoch()||workspace_context_switching()||existing.some(leaf=>!transfer_present(leaf)||file_key(real_path(leaf))!==file_key(snapshot.file_path)))throw new Error(workspace_text("files_received_edit_group_or_workspace_has_changed_please_drag_aga"));
        if(stable_targets.some(stable=>!stable()))throw new Error(workspace_text("files_target_document_has_changed_during_comparison_both_document"));
      };
      for(const leaf of existing){
        const current=await collect_transfer(leaf,signal);validate_existing();
        if(!same_document(current))throw conflict();
        const source=[...views].find(view=>view.leaf===leaf&&!view.disposed);
        if(source){
          const model=source.editor!.models[0],version=model.getAlternativeVersionId(),format=source.format_key(),baseline=source.format!.text,saved=source.saved_format;
          stable_targets.push(()=>!source.disposed&&source.editor?.models[0]===model&&model.getAlternativeVersionId()===version&&source.format_key()===format&&source.format?.text===baseline&&source.saved_format===saved);
        }
      }
      const leaf=existing.find(item=>item===core.app.workspace.activeLeaf)||existing[0];
      // Reuse existing models and undo history; cannot reload the target with the received text.
      if(snapshot.kind==="markdown"&&file_key(runtime.File?.bundle?.filePath||"")!==file_key(snapshot.file_path)){
        if(runtime.File?.changeCounter?.isDocumentEdited())throw new Error(workspace_text("files_target_window_has_another_unsaved_markdown_draft_open_docume"));
        core.app.workspace.activeLeaf=leaf;await navigate_reading_target(snapshot.file_path,{signal});
      }else if(core.app.workspace.activeLeaf!==leaf)core.app.workspace.activeLeaf=leaf;
      validate_existing();
      // Activating native documents may inherit the host's shared draft; after activation, verify again before allowing the source to close.
      for(const item of existing){const current=await collect_transfer(item,signal);validate_existing();if(!same_document(current))throw conflict();}
      keep_open(leaf);return leaf;
    }
    const native_before={path:runtime.File?.bundle?.filePath||"",dirty:Boolean(runtime.File?.changeCounter?.isDocumentEdited()),text:native_transfer_text()};
    const check_destination=(received?:graph_leaf)=>{
      transfer_guard(signal);let present=false,duplicate=false;const children:graph_leaf[]=[];
      core.app.workspace.eachLeaves(leaf=>{if(leaf.parent===target_group){present=true;if(leaf!==received)children.push(leaf);}if(leaf!==received&&file_key(real_path(leaf))===file_key(snapshot.file_path))duplicate=true;});
      if(duplicate)throw new Error(workspace_text("files_target_window_is_already_open_with_the_same_file_to_preserve"));
      if(!present||context_root()!==target_root)throw new Error(workspace_text("files_received_edit_group_or_workspace_has_changed_please_drag_aga"));
      if(!received&&(children.length!==target_children.length||children.some((leaf,index)=>leaf!==target_children[index])))throw new Error(workspace_text("files_order_of_the_received_edit_group_s_tab_has_changed_please_dr"));
      if(snapshot.kind==="source"&&((runtime.File?.bundle?.filePath||"")!==native_before.path||Boolean(runtime.File?.changeCounter?.isDocumentEdited())!==native_before.dirty||native_transfer_text()!==native_before.text))throw new Error(workspace_text("files_target_window_s_markdown_draft_has_changed_stop_recovery_and"));
      if(snapshot.kind==="markdown"&&!received&&runtime.File?.changeCounter?.isDocumentEdited())throw new Error(workspace_text("files_target_window_has_an_unsaved_markdown_draft_open_please_save"));
    };
    check_destination();
    if(snapshot.kind==="markdown"&&snapshot.dirty&&runtime.File?.option?.enableAutoSave)throw new Error(workspace_text("files_target_window_has_markdown_auto_save_enabled_no_unsaved_draf"));
    if((await transfer_disk(snapshot.file_path,signal)).sha256!==snapshot.disk_sha256)throw new Error(workspace_text("files_disk_file_has_changed_before_resubmit_original_tab_remains"));check_destination();
    const insert_received=(type:string,path:string)=>{
      check_destination();const leaf=core.app.workspace.createLeaf({type,state:{path,git_cwd:target_root}});
      target_group.insertChild!(target.index,leaf);core.app.workspace.activeLeaf=leaf;return leaf;
    };
    if(snapshot.kind==="source"){
      const valid_format=(format:workspace_transfer_format|undefined)=>format&&typeof format.encoding==="string"&&format.encoding.length<100&&typeof format.bom==="boolean"&&["LF","CRLF","CR","mixed"].includes(format.eol);
      if(!valid_format(snapshot.source_format)||!valid_format(snapshot.source_baseline_format)||typeof snapshot.source_baseline!=="string"||!['\n','\r\n'].includes(snapshot.source_model_eol||"")||typeof snapshot.language!=="string")throw new Error(workspace_text("files_source_code_snapshot_is_missing_saved_baseline_or_format"));
      const leaf=insert_received(SOURCE_FILE_VIEW_ID,source_file_uri(snapshot.file_path)),view=[...views].find(view=>view.leaf===leaf&&!view.disposed);
      if(!leaf||!view||file_key(view.file_path)!==file_key(snapshot.file_path))throw new Error(workspace_text("files_target_source_code_tab_is_not_open"));
      const check_target=()=>{check_destination(leaf);if(!transfer_present(leaf)||leaf.parent!==target_group||view.disposed||view.saving||view.dirty())throw new Error(workspace_text("files_target_window_state_or_draft_has_changed_stop_recovery"));};
      for(let count=0;view.loading&&count<250;count++){await new Promise(resolve=>setTimeout(resolve,20));check_target();}
      check_target();if(view.loading)throw new Error(workspace_text("files_target_file_has_not_completed_reading_in_time"));
      if(!view.loaded||view.format?.encoding!==snapshot.source_baseline_format!.encoding){await view.load_file(snapshot.source_baseline_format!.encoding);check_target();}
      if(!view.loaded||!view.editor||!view.format||view.format.text!==snapshot.source_baseline||view.saved_format!==`${snapshot.source_baseline_format!.encoding}:${snapshot.source_baseline_format!.bom}:${snapshot.source_baseline_format!.eol}`)throw new Error(workspace_text("files_the_baseline_for_loading_the_source_code_is_different_from_t"));
      const transaction=await view.text_document.prepare_relocation(view.file_path);
      try{
        check_target();const disk=await transfer_disk(snapshot.file_path,signal);check_target();if(disk.sha256!==snapshot.disk_sha256)throw new Error(workspace_text("files_disk_files_have_changed_during_reception"));
        const editor=view.editor.focused_editor(),model=view.editor.models[0];
        if(!snapshot.dirty&&(model.getValue()!==snapshot.text||JSON.stringify(snapshot.source_format)!==JSON.stringify(snapshot.source_baseline_format)))throw new Error(workspace_text("files_the_saved_source_code_snapshot_is_inconsistent_with_the_disk"));
        if(snapshot.dirty){editor.pushUndoStop();model.setEOL(snapshot.source_model_eol==="\r\n"?monaco.editor.EndOfLineSequence.CRLF:monaco.editor.EndOfLineSequence.LF);editor.executeEdits("workspace-transfer",[{range:model.getFullModelRange(),text:snapshot.text}]);editor.pushUndoStop();view.saved_version=-1;}
        Object.assign(view.format,snapshot.source_format);monaco.editor.setModelLanguage(model,snapshot.language!);
        if(snapshot.view_state)editor.restoreViewState(snapshot.view_state);
        view.update_status();keep_open(leaf);
        if(model.getValue()!==snapshot.text||view.dirty()!==snapshot.dirty)throw new Error(workspace_text("files_target_source_code_could_not_be_fully_restored_original_tab"));
        return leaf;
      }finally{transaction.cancel();}
    }
    if(!is_markdown_file(snapshot.file_path)||typeof snapshot.markdown_baseline!=="string"||typeof runtime.File?.reloadContent!=="function")throw new Error(workspace_text("files_target_host_cannot_receive_markdown_snapshot"));
    const leaf=insert_received("core.markdown",snapshot.file_path);
    await navigate_reading_target(snapshot.file_path,{signal});transfer_guard(signal);
    const inherited_markdown=()=>snapshot.dirty&&Boolean(runtime.File?.changeCounter?.isDocumentEdited())&&normalized_transfer_text(native_transfer_text())===normalized_transfer_text(snapshot.text);
    const check_markdown=()=>{check_destination(leaf);if(!transfer_present(leaf)||leaf.parent!==target_group||core.app.workspace.activeLeaf!==leaf||file_key(runtime.File?.bundle?.filePath||"")!==file_key(snapshot.file_path)||runtime.File?.changeCounter?.isDocumentEdited()&&!inherited_markdown())throw new Error(workspace_text("files_target_markdown_is_not_yet_ready_or_has_existing_changes_dra"));};
    check_markdown();const disk=await transfer_disk(snapshot.file_path,signal);check_markdown();
    if(disk.sha256!==snapshot.disk_sha256||normalized_transfer_text(runtime.File?.bundle?.savedContent||"")!==normalized_transfer_text(snapshot.markdown_baseline)||!inherited_markdown()&&normalized_transfer_text(native_transfer_text())!==normalized_transfer_text(snapshot.markdown_baseline))throw new Error(workspace_text("files_target_markdown_differs_from_the_disk_baseline_and_the_draft"));
    if(snapshot.dirty){
      if(runtime.File?.option?.enableAutoSave)throw new Error(workspace_text("files_the_target_window_has_enabled_markdown_auto_save_during_load"));
      // Native same-file window can automatically inherit shared snapshot; when the complete draft has been inherited, no reloading or rebuilding of undo records is performed.
      // When not inherited, use1.14.9 object parameter signature;skipUndo will mistakenly mark the document as saved, and cannot be used.
      if(!inherited_markdown())runtime.File.reloadContent(snapshot.text,{delayRefresh:false,skipChangeCount:false,skipStore:true});
      if(!runtime.File.changeCounter?.isDocumentEdited())runtime.File.updateChangeCount?.(runtime.File.ChangeType?.NSChangeDone);
      if(!runtime.File.changeCounter?.isDocumentEdited()||normalized_transfer_text(native_transfer_text())!==normalized_transfer_text(snapshot.text))throw new Error(workspace_text("files_the_markdown_draft_is_not_fully_restored_and_the_original_ta"));
    }
    const content=document.querySelector<HTMLElement>("content"),write=content?.querySelector<HTMLElement>(":scope > #write");
    if(content&&write&&snapshot.reading_position)apply_position(content,write,snapshot.reading_position);
    keep_open(leaf);return leaf;
  };
  const release_transfer=async(leaf:graph_leaf,snapshot:workspace_document_snapshot,signal?:AbortSignal):Promise<boolean>=>{
    const captured=transfer_captures.get(leaf);
    if(!captured||captured.capture_id!==snapshot.capture_id||captured.fingerprint!==snapshot.capture_fingerprint||signal?.aborted)return false;
    try{
      if(snapshot.capture_fingerprint!==await transfer_fingerprint(snapshot))return false;transfer_guard(signal);
      const current=await collect_transfer(leaf,signal);transfer_guard(signal);
      if(current.capture_fingerprint!==snapshot.capture_fingerprint||transfer_captures.get(leaf)!==captured||!transfer_present(leaf))return false;
      const source=[...views].find(view=>view.leaf===leaf&&!view.disposed),previous_version=source?.saved_version,previous_format=source?.saved_format;
      const native_markdown_ready=()=>snapshot.kind==="markdown"&&snapshot.dirty
        &&file_key(runtime.File?.bundle?.filePath||"")===file_key(snapshot.file_path)
        &&real_path(leaf)===snapshot.file_path&&context_root()===snapshot.root
        &&native_transfer_text()===snapshot.text&&Boolean(runtime.File?.changeCounter?.isDocumentEdited())
        &&normalized_transfer_text(runtime.File?.bundle?.savedContent||"")===normalized_transfer_text(snapshot.markdown_baseline||"")
        &&!runtime.File?.option?.enableAutoSave;
      let shared_markdown=false;
      if(snapshot.kind==="markdown"&&snapshot.dirty){
        if(!native_markdown_ready()||typeof runtime.JSBridge?.invoke!=="function")return false;
        // WhenTypora and1.14.9 are in another window still holding the same native document,tryLeaveDocument does not save or discard it.
        // Only remove the source leaf when the target isACK, the complete fingerprint has not changed, and the host confirms the shared document.
        const no_other_window=await runtime.JSBridge.invoke("document.noOtherWindow");transfer_guard(signal);
        if(no_other_window!==false||!native_markdown_ready()||transfer_captures.get(leaf)!==captured||!transfer_present(leaf))return false;
        shared_markdown=true;
      }
      if(runtime.File?.changeCounter?.isDocumentEdited()&&!shared_markdown){
        if(!source)return false;
        const group=leaf.parent as graph_leaf["parent"]&{activeLeaf?:graph_leaf;children?:graph_leaf[]};
        // Closing the background source code leaf does not switch the native buffer; active leaves only allow switching to another independent source code leaf.
        // When the last leaf is removed, reorganize the editing group, retain it to prevent indirect opening of otherMarkdown and triggering automatic saving.
        const children=group.children||[],index=children.indexOf(leaf),next=children[index-1]||children[index+1];
        if(!group.activeLeaf||children.length<2||group.activeLeaf===leaf&&!views.has(next?.view as source_file_view))return false;
      }
      if(!leaf.parent.removeTab)return false;
      // When the target isACK and the fingerprint recheck is successful, temporarily allow the source code to close protection; do not call any save entry.
      if(source){source.saved_version=source.editor!.models[0].getAlternativeVersionId();source.saved_format=source.format_key();}
      try{if(signal?.aborted)return false;leaf.parent.removeTab(leaf.state.path);}
      finally{if(source&&!source.disposed){source.saved_version=previous_version!;source.saved_format=previous_format!;source.update_status();}}
      const removed=!transfer_present(leaf);if(removed)transfer_captures.delete(leaf);return removed;
    }catch{return false;}
  };
  document.documentElement.setAttribute("data-linux-note-workspace-files", "ready");
  document.documentElement.setAttribute("data-linux-note-source-editing", "ready");
  let binding: workspace_files_binding;
  const assert_can_dispose = () => {
    if([...document_ports].some(port=>!port.disposed&&(port.busy()||port.dirty())))throw new Error(workspace_text("files_the_remote_document_is_being_operated_on_or_has_unsaved_chan"));
    if(file_operation_count||file_clipboard.is_busy())throw new Error(workspace_text("files_file_operations_are_in_progress_please_complete_them_before"));
    if (renaming || [...views].some(view => view.saving)) throw new Error(workspace_text("files_the_file_is_being_saved_or_renamed_please_complete_the_opera"));
    if ([...views].some(view => !view.disposed && view.dirty())) throw new Error(workspace_text("files_source_code_tab_has_unsaved_changes_please_save_first_or_clo"));
  };
  // Before uninstallation, check the draft; cannot pass an unsaved model to a view factory that has been deregistered.
  const dispose = () => {
    if (!binding.active) return;
    assert_can_dispose();
    binding.active = false;window.removeEventListener("linux-note-workspace-context-changed",refresh_source_analysis);source_navigation?.dispose();source_navigation_language?.dispose();if(analysis_model&&!analysis_model.isDisposed())monaco.editor.setModelMarkers(analysis_model,"typora_code_lsp",[]);release_analysis_active();release_analysis_open();analysis_binding?.dispose();file_clipboard.dispose();release_navigation();
    for(const cancel of [...pending_native_saves])cancel();release_save_active();release_save_open();
    window.removeEventListener("pagehide", dispose);
    if (core.app.openFile === routed_app_open_file) core.app.openFile = native_app_open_file;
    if (library && library.openFile === routed_library_open_file) library.openFile = native_library_open_file;
    source_lifecycle.dispose();stop_editor_settings();release_preview_edit?.();release_preview_open();release_preview_layout();for(const cleanup of [...native_placeholders.values()])cleanup();native_placeholders.clear();
    for(const {dialog} of native_close_dialogs.values())dialog.close();native_close_dialogs.clear();
    for(const {dialog} of reopen_dialogs.values())dialog.close();reopen_dialogs.clear();
    document.removeEventListener("dblclick",keep_clicked_tab,true);document.removeEventListener("input",keep_edited_native,true);
    for(const leaf of [...preview_leaves.values()])keep_open(leaf);preview_leaves.clear();
    for (const view of [...views]) {
      view.release_source();
      view.leaf.parent.removeTab?.(view.leaf.state.path);
      view.containerEl.remove();
    }
    if (typeof unregister_view === "function") unregister_view();
    group_locations.clear(); style.remove();
    delete binding_owner[FILES_BINDING];
    if (active_host === host) active_host = undefined;
    document.documentElement.removeAttribute("data-linux-note-workspace-files");
    document.documentElement.removeAttribute("data-linux-note-source-editing");
  };
  const install = () => {
    if (binding.active) return;
    native_app_open_file = core.app.openFile;
    library = runtime.File?.editor?.library;
    native_library_open_file = typeof library?.openFile === "function" ? library.openFile : undefined;
    core.app.openFile = routed_app_open_file;
    if (library && native_library_open_file) library.openFile = routed_library_open_file;
    binding.active = true;
    window.addEventListener("pagehide", dispose, {once: true});
  };
  const file_operation=async<T>(action:()=>Promise<T>):Promise<T>=>{
    if(!binding.active)throw new Error(workspace_text("git_graph_host_typora_code_is_disabled"));file_operation_count++;
    try{return await action();}finally{file_operation_count--;}
  };
  const create_entry=(root:string,parent:string,name:string,directory:boolean)=>file_operation(()=>create_workspace_entry({fs,path_api},root,parent,name,directory));
  const file_clipboard=create_workspace_file_clipboard(create_resource_file_clipboard(name=>runtime.reqnode(name)),{
    validate:(root,paths)=>file_operation(()=>validate_workspace_entries({fs,path_api},root,paths)),
    transfer:(root,paths,target,move,external)=>file_operation(()=>transfer_workspace_entries({fs,path_api},root,paths,target,move?move_file:undefined,external))
  });
  const trash_entries=(root:string,paths:string[])=>file_operation(async()=>{
    const includes=(candidate:string)=>paths.some(path=>renamed_workspace_path(path_api,candidate,path,path,true)!==undefined);
    const affected=[...views].filter(view=>includes(view.file_path));
    if(renaming||affected.some(view=>view.dirty()||view.saving))throw new Error(workspace_text("files_the_project_to_be_deleted_contains_source_code_with_unsaved"));
    if(includes(runtime.File?.bundle?.filePath||"")&&runtime.File?.changeCounter?.isDocumentEdited())throw new Error(workspace_text("files_the_project_to_be_deleted_contains_unsaved_markdown_please_s"));
    await trash_workspace_entries({fs,path_api},root,paths,async(target:string)=>{
      // Before each file write to disk, recheck the draft; during batch editing, edits cannot be swallowed by subsequent deletions.
      if([...views].some(view=>includes(view.file_path)&&(view.dirty()||view.saving)))throw new Error(workspace_text("files_source_code_was_modified_during_deletion_the_subsequent_dele"));
      const release_native=prepare_deleted_native_document(runtime,candidate=>renamed_workspace_path(path_api,candidate,target,target,true)!==undefined,native_transfer_text);
      await trash_native_path(runtime,target);
      if(release_native)await release_native();
      const leaves:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{if(renamed_workspace_path(path_api,real_path(leaf),target,target,true)!==undefined)leaves.push(leaf);});
      for(const view of [...views])if(renamed_workspace_path(path_api,view.file_path,target,target,true)!==undefined)view.release_source();
      for(const leaf of leaves)leaf.parent.removeTab?.(leaf.state.path);
    });
  });
  const host = {fs, path_api, core, open_file, restore_files, context_root, file_menu, copy, rename_file, move_file, create_entry, file_clipboard, trash_entries, keep_open, editor_state, close_leaf, prepare_workspace_switch, duplicate_leaf, reopen_leaf, source_editor_active, run_editor_command, can_save_active, save_active, save_as_active, reload_active, save_leaf, auto_save_leaf, save_all,capture_transfer,receive_transfer,release_transfer,
    register_document:(port:workspace_document_port)=>{document_ports.add(port);source_lifecycle.guard(port);return()=>{document_ports.delete(port);};},
    has_editor_errors:(leaf:graph_leaf)=>{const model=[...views].find(view=>view.leaf===leaf&&!view.disposed)?.editor?.models[0];return Boolean(model&&monaco.editor.getModelMarkers({resource:model.uri}).some(marker=>marker.severity===monaco.MarkerSeverity.Error));},
    read_text:async(file_path:string)=>{
      if(!binding.active)throw new Error(workspace_text("git_graph_host_typora_code_is_disabled"));
      const port=[...document_ports].find(port=>!port.disposed&&port.file_path===file_path);if(port)return port.read_text();
      const source=[...views].find(view=>!view.disposed&&file_key(view.file_path)===file_key(file_path)&&view.editor?.models[0]);
      if(source)return source.editor!.models[0].getValue();
      if(file_key(runtime.File?.bundle?.filePath||"")===file_key(file_path))return native_transfer_text();
      return (await create_text_document({fs,path_api},file_path).load()).text;
    },
    current_file: () => real_path(core.app.workspace.activeLeaf),
    can_write: (file_path: string) => (![...views].some(view=>file_key(view.file_path)===file_key(file_path)&&view.dirty()))&&(!runtime.File?.changeCounter?.isDocumentEdited() || file_key(runtime.File?.bundle?.filePath || "") !== file_key(file_path)),
    refresh_files: (paths: string[]) => { const keys=new Set(paths.map(file_key));for (const view of views) if (keys.has(file_key(view.file_path))&&!view.dirty()) void view.load_file(); },
    assert_can_dispose, dispose
  };
  binding = {host, active: false, install, dispose};
  binding_owner[FILES_BINDING] = binding;
  install();
  active_host=host; return host;
}
