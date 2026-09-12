import {acquire_workspace_style} from "./workspace_styles";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import { create_workspace_entry, transfer_workspace_entries, trash_workspace_entries } from "./workspace_file_operations";
import type { graph_core, graph_leaf } from "./git_graph_host";
import { git_diff_editor } from "./git_diff_editor";
import { workspace_element as el, workspace_button as button, workspace_menu, workspace_dialog } from "./workspace_widgets";
import { FILE_LANGUAGE_RULES, is_markdown_file } from "./file_language";
import { create_text_document, save_text_document_as, MAX_TEXT_DOCUMENT_BYTES } from "./workspace_text_document";
import {decode_file_bytes} from "./file_language";
import {capture_position, apply_position} from "./reading_positions";
import type {workspace_document_snapshot, workspace_transfer_format, workspace_transfer_target} from "./workspace_document_transfer";
import { bind_source_lifecycle } from "./workspace_source_lifecycle";
import { bind_workspace_editor_status } from "./workspace_editor_status";
import { navigate_reading_target, rename_reading_paths } from "./reading_navigation";
import { prepare_workspace_rename, prepare_workspace_move, renamed_workspace_path } from "./workspace_rename";
import { reveal_markdown_location } from "./workspace_markdown_location";
import { SOURCE_FILE_VIEW_ID, file_key, is_source_file_uri, parse_markdown_file_target, resolve_markdown_file_target, resolve_host_open_file_target, resolve_workspace_file, source_file_path, source_file_uri } from "./workspace_file_uri";
import * as monaco from "monaco-editor/editor/editor.api";
import files_css from "./workspace_files.css";

export type file_location = {line?: number; column?: number; end_line?: number; end_column?: number; source?: boolean; expected_text?: string; hash?: string; preview?: boolean; preserve_focus?: boolean; signal?: AbortSignal};
export type workspace_file_host = {
  fs: any; path_api: any; core: graph_core;
  open_file(file_path: string, location?: file_location, group?: string): Promise<void>;
  context_root(): string;
  file_menu(event: MouseEvent, file_path: string): void;
  copy(text: string): unknown;
  read_text(file_path:string):Promise<string>;
  rename_file(root: string, old_path: string, name: string): Promise<string>;
  move_file(root: string, old_path: string, target: string): Promise<string>;
  create_entry(root:string,parent:string,name:string,directory:boolean):Promise<string>;
  transfer_entries(root:string,paths:string[],target:string,move:boolean):Promise<string[]>;
  trash_entries(root:string,paths:string[]):Promise<void>;
  keep_open(leaf?:graph_leaf):void;
  source_editor_active(): boolean;
  run_editor_command(command: string): void;
  current_file(): string;
  can_save_active(): boolean;
  save_active(): Promise<boolean>;
  save_as_active():Promise<boolean>;
  reload_active():void;
  save_leaf(leaf:graph_leaf):Promise<boolean>;
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

/** Markdown 默认使用原生编辑面；显式源码视图和其他文本使用 Monaco 标签。 */
export function bind_workspace_files(core: graph_core): workspace_file_host {
  const binding_owner = core.app as unknown as Record<symbol, workspace_files_binding | undefined>;
  const existing_binding = binding_owner[FILES_BINDING];
  if (existing_binding) {
    existing_binding.install();
    active_host = existing_binding.host;
    return existing_binding.host;
  }
  const runtime = window as unknown as {reqnode(name: string): any; File?: any; JSBridge?:{invoke(command:string,...args:unknown[]):Promise<unknown>}; ClientCommand?: Record<string, (...args: unknown[]) => unknown>; doApplyRename?(path: string): void};
  const fs = runtime.reqnode("fs"); const path_api = runtime.reqnode("path"); const shell = runtime.reqnode("electron").shell;
  let native_app_open_file = core.app.openFile;
  const call_native_app_open_file = (target: string) => native_app_open_file.call(core.app, target);
  const style = acquire_workspace_style("typora-code-style:workspace_files", files_css, {});
  const group_locations = new Map<string, file_location>();
  const views = new Set<source_file_view>();
  const preview_leaves=new Map<graph_leaf["parent"],graph_leaf>();
  const keep_open=(leaf=core.app.workspace.activeLeaf||undefined)=>{
    if(!leaf)return;delete leaf.state.workspace_preview;if(preview_leaves.get(leaf.parent)===leaf)preview_leaves.delete(leaf.parent);
    workspace_leaf_tab(leaf)?.classList.remove("is-workspace-preview");
  };
  const set_preview=(leaf:graph_leaf|null,preview:boolean)=>{
    if(!leaf)return;if(!preview){keep_open(leaf);return;}
    const previous=preview_leaves.get(leaf.parent);
    let previous_exists=false;core.app.workspace.eachLeaves(item=>{if(item===previous)previous_exists=true;});
    if(previous&&previous!==leaf&&previous_exists){
      const source=[...views].find(view=>view.leaf===previous);
      const native_dirty=runtime.File?.changeCounter?.isDocumentEdited()&&file_key(runtime.File?.bundle?.filePath||"")===file_key(previous.state.path);
      if(source?.dirty()||source?.saving||native_dirty)keep_open(previous);else previous.parent.removeTab?.(previous.state.path);
    }
    leaf.state.workspace_preview=true;preview_leaves.set(leaf.parent,leaf);
    workspace_leaf_tab(leaf)?.classList.add("is-workspace-preview");
  };
  const keep_clicked_tab=(event:MouseEvent)=>{const tab=event.target instanceof Element?event.target.closest<HTMLElement>(".typ-tab[data-id]"):null;if(tab)core.app.workspace.eachLeaves(leaf=>{if(workspace_leaf_tab(leaf)===tab)keep_open(leaf);});};
  const keep_edited_native=(event:Event)=>{if(event.target instanceof Element&&event.target.closest("#write"))keep_open();};
  document.addEventListener("dblclick",keep_clicked_tab,true);document.addEventListener("input",keep_edited_native,true);
  let renaming = false, file_operation_count = 0;
  const source_lifecycle = bind_source_lifecycle(core, () => views);
  const editor_status = bind_workspace_editor_status(core);
  const real_path = (leaf: graph_leaf | null): string => {
    if (!leaf) return "";
    if (path_api.isAbsolute(leaf.state.path)) return leaf.state.path;
    const source_path = source_file_path(leaf.state.path, path_api);
    if (source_path) return source_path;
    return "";
  };
  const context_root = () => runtime.File?.getMountFolder?.() ?? core.app.workspace.activeLeaf?.state.git_cwd ?? path_api.dirname(real_path(core.app.workspace.activeLeaf) || core.app.workspace.activeFile || "");
  class source_file_view extends core.WorkspaceView {
    containerEl = el("section", "linux-note-source-file"); icon = "fa-file-code-o";
    editor?: git_diff_editor; focus_requested=true; file_path: string; loaded = false; loading = false; disposed=false; target?:file_location;
    status = el("span", "workspace-file-status"); body = el("div", "workspace-file-body");
    status_controls = el("div", "workspace-editor-status-controls workspace-footer-group"); location_label = el("span", "workspace-file-location");
    language_button = button("", () => this.choose_language()); encoding_button = button("", () => this.choose_format("encoding")); eol_button = button("", () => this.choose_format("eol"));
    text_document: ReturnType<typeof create_text_document>; format?: Awaited<ReturnType<ReturnType<typeof create_text_document>["load"]>>;
    saved_format = ""; saved_version = 0; saving = false;
    constructor(leaf: graph_leaf) {
      super(leaf); this.file_path = real_path(leaf); leaf.state.git_cwd = path_api.dirname(this.file_path); views.add(this);
      this.target=group_locations.get(leaf.state.path);this.focus_requested=!this.target?.preserve_focus;group_locations.delete(leaf.state.path);
      this.text_document = create_text_document({fs,path_api}, this.file_path);
      this.language_button.title = "选择语言模式（仅改变语法高亮）"; this.language_button.setAttribute("aria-label", "语言模式");
      this.encoding_button.title = "选择保存编码"; this.encoding_button.setAttribute("aria-label", "保存编码");
      this.encoding_button.textContent="UTF-8";
      this.eol_button.title = "选择行尾序列"; this.eol_button.setAttribute("aria-label", "行尾序列");
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
    onOpen() {
      this.guard_close();
      for (const tab of [workspace_leaf_tab(this.leaf)].filter((tab):tab is HTMLElement=>Boolean(tab))) {
        const label = tab.querySelector(".typ-file-basename"); if (label) label.textContent = path_api.basename(this.file_path);
        tab.querySelector(".typ-file-ext")?.remove(); tab.title = this.file_path;
      }
      this.update_status();
      editor_status.refresh();editor_status.schedule();
      if (!this.loaded && !this.loading) void this.load_file(); else this.reveal();
      queueMicrotask(()=>{if(!this.disposed&&this.focus_requested&&core.app.workspace.activeLeaf===this.leaf)this.editor?.focused_editor().focus();});
    }
    async load_file(encoding?: string) {
      if (renaming) { this.status.textContent = "正在重命名，请稍后再读取文件。"; return; }
      if (this.loading||this.saving||this.disposed) return; this.loading = true; this.status.textContent = "正在读取…";
      const previous_version=this.editor?.models[0].getAlternativeVersionId(),previous_format=this.format_key();
      // 读取候选快照后才替换保存基线；读取期间禁止输入及格式修改。
      const candidate=create_text_document({fs,path_api},this.file_path,{encoding:encoding??this.format?.encoding});
      this.editor?.focused_editor().updateOptions({readOnly:true});
      for(const control of[this.language_button,this.encoding_button,this.eol_button])control.disabled=true;
      try {
        const decoded = await candidate.load(); if(this.disposed)return;
        if(this.editor?.models[0].getAlternativeVersionId()!==previous_version||this.format_key()!==previous_format){this.status.textContent="读取期间内容已变化，已保留未保存的修改。";return;}
        this.text_document=candidate;
        this.format = decoded; this.saved_format = this.format_key();
        const data = {title: path_api.basename(this.file_path), file: this.file_path, left: decoded.text, left_label: this.file_path};
        if (this.editor) this.editor.update(data);
        else {
          this.editor = new git_diff_editor(data,()=>this.menu_entries()); this.body.replaceChildren(this.editor.container);
          const view=this.editor.focused_editor();
          this.editor.subscriptions.push(view.onDidChangeModelContent(()=>queueMicrotask(()=>{if(!this.disposed)this.update_status();})),view.onDidChangeCursorPosition(()=>this.update_status()),view.onDidFocusEditorText(()=>editor_status.schedule()));
        }
        this.editor.focused_editor().updateOptions({readOnly:false});
        this.saved_version=this.editor.models[0].getAlternativeVersionId();
        this.loaded = true; this.update_status(); this.reveal();
        if(this.focus_requested&&core.app.workspace.activeLeaf===this.leaf)this.editor.focused_editor().focus();
      } catch (error) {
        if(this.disposed)return;
        this.status.textContent = "无法作为文本预览";
        if (!this.editor) this.body.replaceChildren(el("p", "workspace-file-notice", String(error)), button("使用系统程序打开", () => void shell.openPath(this.file_path)));
        else this.status.textContent = String(error);
      } finally { this.loading = false;if(!this.disposed){this.editor?.focused_editor().updateOptions({readOnly:false});for(const control of[this.language_button,this.encoding_button,this.eol_button])control.disabled=false;} }
    }
    reveal() {
      if(this.disposed)return;this.editor?.editor.layout();
      const target = this.target; if (!target || !this.editor) return;
      const editor = this.editor.focused_editor(); const model = editor.getModel(); if (!model) return;
      const line = Math.max(1, Math.min(model.getLineCount(), target.line || 1));
      const selection={startLineNumber: line, startColumn: target.column || 1, endLineNumber: target.end_line || line, endColumn: target.end_column || target.column || 1};
      if(target.expected_text!==undefined&&model.getValueInRange(selection).replace(/\r\n?/gu,"\n")!==target.expected_text.replace(/\r\n?/gu,"\n")){this.status.textContent="目标内容已变化，请保存未保存的修改并刷新搜索后重试。";this.target=undefined;return;}
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
      this.status.textContent=this.saving?"正在保存…":this.dirty()?"未保存":"";
      this.location_label.textContent=position?`行 ${position.lineNumber}，列 ${position.column}`:"";
      this.language_button.textContent=this.editor.models[0].getLanguageId();this.encoding_button.textContent=this.format.encoding.toUpperCase()+(this.format.bom?" BOM":"");this.eol_button.textContent=this.format.eol==="mixed"?"混合换行":this.format.eol;
      editor_status.schedule();
      for(const tab of [workspace_leaf_tab(this.leaf)].filter((tab):tab is HTMLElement=>Boolean(tab))){
        let dot=tab.querySelector<HTMLElement>(".workspace-file-dirty");if(this.dirty()&&!dot){dot=el("span","workspace-file-dirty","●");dot.title="有未保存修改";tab.querySelector(".typ-file-basename")?.after(dot);}else if(!this.dirty())dot?.remove();
      }
    }
    async save(){
      if(renaming){this.status.textContent="正在重命名，请稍后再保存。";return false;}
      if(this.saving||this.loading||!this.editor||!this.format)return false;
      if(runtime.File?.bundle?.filePath===this.file_path&&runtime.File?.changeCounter?.isDocumentEdited()){this.status.textContent="该 Markdown 的正文编辑器有未保存修改，请先处理正文草稿。";return false;}
      this.editor.focused_editor().pushUndoStop();
      const model=this.editor.models[0],version=model.getAlternativeVersionId(),format_key=this.format_key();
      this.saving=true;this.update_status();
      try{const saved=await this.text_document.save(model.getValue(),{encoding:this.format.encoding,bom:this.format.bom,eol:this.format.eol});this.saved_version=version;this.saved_format=format_key;this.format={...saved,encoding:this.format.encoding,bom:this.format.bom,eol:this.format.eol};this.saving=false;this.update_status();return true;}
      catch(error){this.saving=false;this.update_status();this.status.textContent=String(error instanceof Error?error.message:error);return false;}
    }
    async save_as(){
      if(this.disposed||this.saving||this.loading||renaming||!this.editor||!this.format||!runtime.JSBridge?.invoke)return false;
      this.saving=true;this.update_status();
      try{
        const result=await runtime.JSBridge.invoke("dialog.showSaveDialog",{title:"另存为",defaultPath:this.file_path,properties:["showOverwriteConfirmation"],filters:[{name:"所有文件",extensions:["*"]}]}) as {canceled?:boolean;filePath?:string};
        if(this.disposed||core.app.workspace.activeLeaf!==this.leaf||result?.canceled||!result?.filePath)return false;
        if(!path_api.isAbsolute(result.filePath))throw new Error("系统返回的保存路径无效。");
        const target=path_api.normalize(result.filePath);
        if(file_key(target)===file_key(this.file_path)){this.saving=false;return await this.save();}
        let opened=false;core.app.workspace.eachLeaves(leaf=>{if(leaf!==this.leaf&&file_key(real_path(leaf))===file_key(target))opened=true;});
        if(opened||file_key(runtime.File?.bundle?.filePath||"")===file_key(target))throw new Error("目标文件已在编辑器中打开，请先关闭目标标签并处理其修改。");
        const parent=this.leaf.parent as graph_leaf["parent"]&{renameTab(old_path:string,new_path:string):void};
        if(typeof parent.renameTab!=="function")throw new Error("当前编辑组不支持更新文件身份。");
        const model=this.editor.models[0],version=model.getAlternativeVersionId(),format={...this.format},format_key=this.format_key();
        this.editor.focused_editor().pushUndoStop();
        const saved=await save_text_document_as({fs,path_api},target,model.getValue(),format);
        this.text_document=saved.document;this.file_path=target;this.leaf.state.git_cwd=path_api.dirname(target);
        this.editor.data.file=target;this.editor.data.title=path_api.basename(target);this.editor.data.left_label=target;
        this.format={...saved.value,encoding:this.format.encoding,bom:this.format.bom,eol:this.format.eol};this.saved_version=version;this.saved_format=format_key;
        parent.renameTab(this.leaf.state.path,source_file_uri(target));keep_open(this.leaf);
        const tab=workspace_leaf_tab(this.leaf);if(tab){const label=tab.querySelector(".typ-file-basename");if(label)label.textContent=path_api.basename(target);tab.title=target;}
        return true;
      }catch(error){this.status.textContent=String(error instanceof Error?error.message:error);new core.Notice(this.status.textContent,5000);return false;}
      finally{this.saving=false;this.update_status();}
    }
    choose_language(){
      if(!this.editor||this.loading)return;const dialog=workspace_dialog("选择语言模式");const select=el("select");select.setAttribute("aria-label","文件语言模式");
      const choices=new Map(FILE_LANGUAGE_RULES.filter(rule=>!rule.category||rule.category==="text").map(rule=>[rule.language,rule.label]));choices.set("plaintext","纯文本");
      for(const [value,label]of choices){const option=el("option","",label);option.value=value;select.append(option);}select.value=this.editor.models[0].getLanguageId();
      dialog.content.append(select,el("p","","语言模式只改变高亮；保存沿用原文件名和后缀。"));dialog.footer.prepend(button("应用",()=>{if(this.loading)return;monaco.editor.setModelLanguage(this.editor!.models[0],select.value);this.update_status();dialog.close();if(core.app.workspace.activeLeaf===this.leaf)this.editor?.focused_editor().focus();}));
    }
    choose_format(kind:"encoding"|"eol"){
      if(this.loading)return;
      if(!this.format){if(kind==="encoding")this.choose_reopen_encoding();return;}const dialog=workspace_dialog(kind==="encoding"?"选择保存编码":"选择行尾序列");const select=el("select");select.setAttribute("aria-label",kind==="encoding"?"文件保存编码":"文件行尾序列");
      const values=kind==="encoding"?["utf-8","utf-8-bom","utf-16le","utf-16be"]:["LF","CRLF","CR",...(this.format.eol==="mixed"?["mixed"]:[])];
      for(const value of values){const option=el("option","",value==="mixed"?"保留混合换行":value.toUpperCase());option.value=value;select.append(option);}select.value=kind==="encoding"?(this.format.encoding==="utf-8"&&this.format.bom?"utf-8-bom":this.format.encoding):this.format.eol;
      dialog.content.append(select,el("p","","选择后按 Ctrl+S 保存，当前文件不会立即改写。"));dialog.footer.prepend(button("应用",()=>{if(this.loading)return;if(kind==="encoding"){this.format!.encoding=select.value==="utf-8-bom"?"utf-8":select.value;this.format!.bom=select.value!=="utf-8";}else this.format!.eol=select.value as typeof this.format.eol;this.update_status();dialog.close();if(core.app.workspace.activeLeaf===this.leaf)this.editor?.focused_editor().focus();}));
      if(kind==="encoding")dialog.footer.prepend(button("以编码重新打开…",()=>{dialog.close();this.choose_reopen_encoding();}));
    }
    choose_reopen_encoding(){
      if(this.loading)return;
      if(this.dirty()){this.status.textContent="请先保存或从磁盘重新加载，避免重新解码丢失草稿。";return;}
      const dialog=workspace_dialog("以编码重新打开");const select=el("select");select.setAttribute("aria-label","重新打开编码");
      for(const value of["utf-8","utf-16le","utf-16be","gb18030","big5","windows-1252"]){const option=el("option","",value.toUpperCase());option.value=value;select.append(option);}
      dialog.content.append(select);dialog.footer.prepend(button("重新打开",()=>{if(this.dirty()||this.loading){this.status.textContent="请先保存修改，再以其他编码重新打开。";return;}dialog.close();void this.load_file(select.value);}));
    }
    menu_entries(){return [
      {title:"保存文件（Ctrl+S）",action:()=>void this.save()},
      {title:"另存为…",shortcut:"Ctrl+Shift+S",action:()=>void this.save_as()},
      {title:"从磁盘重新加载",action:()=>this.confirm_reload()},
      {title:"在文件夹中显示",action:()=>shell.showItemInFolder(this.file_path)},
      ...(is_markdown_file(this.file_path)?[{title:"打开 Markdown 渲染",action:()=>{if(this.dirty()){this.status.textContent="请先保存源码修改，再打开 Markdown 渲染。";return;}call_native_app_open_file(this.file_path);}}]:[])
    ];}
    menu(event:MouseEvent){workspace_menu(event,this.menu_entries());}
    confirm_reload(){if(!this.dirty()){void this.load_file();return;}const dialog=workspace_dialog("重新加载文件");dialog.content.append(el("p","","重新加载会丢弃此标签中未保存的修改。"));dialog.footer.prepend(button("丢弃修改并重新加载",()=>{dialog.close();void this.load_file();}));}
    confirm_close(close:()=>void){source_lifecycle.confirm_close(this,close);}
    guard_close(){source_lifecycle.guard(this);}
    release_source(){if(this.disposed)return;this.disposed=true;this.editor?.dispose();views.delete(this);editor_status.release(this.leaf);}
    onClose(){source_lifecycle.schedule_release(this);editor_status.schedule();}
  }
  const unregister_view = core.app.viewManager.registerView(SOURCE_FILE_VIEW_ID, leaf => new source_file_view(leaf));
  const open_file = async (file_path: string, location: file_location = {}, group = "active") => {
    if(location.signal?.aborted)throw new Error("打开文件已取消。");
    if (renaming) throw new Error("正在重命名，请稍后再打开文件。");
    const resolved_path = resolve_workspace_file(path_api, context_root(), file_path);
    if (!resolved_path) throw new Error("无法解析文件路径。");
    file_path = resolved_path;
    if (!fs.statSync(file_path).isFile()) throw new Error("目标不是普通文件。");
    if (is_markdown_file(file_path) && !location.source) {
      if ([...views].some(view => file_key(view.file_path) === file_key(file_path) && view.dirty())) throw new Error("该 Markdown 的源码标签有未保存修改，请先保存后再打开渲染视图。");
      const existing_leaves=new Set<graph_leaf>();core.app.workspace.eachLeaves(leaf=>existing_leaves.add(leaf));
      await navigate_reading_target(file_path, {group, hash: location.hash, signal:location.signal, locate: location.line == null ? undefined : (signal) => reveal_markdown_location(location, signal)});
      if(location.signal?.aborted)throw new Error("打开文件已取消。");
      const leaf=core.app.workspace.activeLeaf;
      if(leaf&&file_key(leaf.state.path)===file_key(file_path)&&(!location.preview||!existing_leaves.has(leaf)||leaf.state.workspace_preview))set_preview(leaf,Boolean(location.preview));
      return;
    }
    const uri = source_file_uri(file_path);
    let existing: graph_leaf | undefined;
    core.app.workspace.eachLeaves(leaf => { if (leaf.parent===core.app.workspace.activeLeaf?.parent && is_source_file_uri(leaf.state.path) && file_key(real_path(leaf)) === file_key(file_path)) existing = leaf; });
    if (existing && group === "active") { const view=existing.view as source_file_view;view.focus_requested=!location.preserve_focus;if(location.line!=null)view.target=location;core.app.workspace.activeLeaf = existing.parent.toggleTab(existing.state.path);view.reveal();if(!location.preview||existing.state.workspace_preview)set_preview(existing,Boolean(location.preview));return; }
    if (group !== "active") { group_locations.set(uri,location);core.app.commands.run(group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [uri]);set_preview(core.app.workspace.activeLeaf,Boolean(location.preview)); return; }
    const parent = core.app.workspace.activeLeaf?.parent; if (!parent) throw new Error("当前没有可用的编辑器组。");
    const leaf = core.app.workspace.createLeaf({type: SOURCE_FILE_VIEW_ID, state: {path: uri, git_cwd: path_api.dirname(file_path)}});
    (leaf.view as source_file_view).focus_requested=!location.preserve_focus;
    if(location.line!=null)(leaf.view as source_file_view).target=location;
    parent.appendChild(leaf); core.app.workspace.activeLeaf = leaf;set_preview(leaf,Boolean(location.preview));
  };
  // 社区核心默认把不支持的文件送到外部程序；所有应用内打开入口统一分流。
  const routed_app_open_file = function (this: typeof core.app, target: string) {
    const source = real_path(core.app.workspace.activeLeaf) || core.app.workspace.activeFile || runtime.File?.bundle?.filePath || "";
    target = resolve_host_open_file_target(path_api, source, target);
    const markdown = resolve_markdown_file_target(path_api, context_root(), target);
    if (markdown) return open_file(markdown.file_path, {hash: markdown.hash});
    if (!target.startsWith("typ://")) return open_file(target);
    // 原生 bundle 仍指向该文件而中央为工具标签时，核心会直接返回；阅读导航显式激活既有 Markdown leaf。
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
      if (!markdown || !fs.statSync(markdown.file_path).isFile()) throw new Error("目标不是普通文件。");
      // 检查与使用必须是同一个绝对文件；相对路径、file URL 和锚点不传给原生文件 API。
      if (markdown.hash) {
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
  const copy = (text: string) => runtime.reqnode("electron").clipboard.writeText(text);
  const file_menu = (event: MouseEvent, file_path: string) => workspace_menu(event, [
    {title: "打开文件", action: () => void open_file(file_path)},
    {title: "在右侧打开", action: () => void open_file(file_path, {}, "right")},
    {title: "复制路径", action: () => copy(file_path)},
    {title: "复制相对路径", action: () => copy(path_api.relative(context_root(), file_path))},
    {title: "在文件夹中显示", action: () => shell.showItemInFolder(file_path)}
  ]);
  const relocate_file = async (root: string, old_path: string, name: string, moving = false) => {
    if (renaming || runtime.File?._onFileSwitching || runtime.File?.inSavingProcess) throw new Error("文件正在切换、保存或重命名，请稍后重试。");
    renaming = true;
    const relocations: {view: source_file_view; target: string; transaction: Awaited<ReturnType<source_file_view["text_document"]["prepare_relocation"]>>}[] = [];
    const library = runtime.File?.editor?.library;
    let paused = false, native_watch_paused = false, old_native_path = "", new_native_path = "", applied = false, renamed_path = "";
    try {
      const plan = await (moving?prepare_workspace_move:prepare_workspace_rename)({fs, path_api}, root, old_path, name);
      if (plan.old_path === plan.new_path) return plan.new_path;
      const map = (candidate: string) => renamed_workspace_path(path_api, candidate, plan.old_path, plan.new_path, plan.directory);
      for (const view of views) {
        const target = map(view.file_path); if (!target) continue;
        if (view.loading || view.saving) throw new Error("有关标签正在读取或保存，请稍后再重命名。");
        relocations.push({view, target, transaction: await view.text_document.prepare_relocation(target)});
      }
      old_native_path = runtime.File?.bundle?.filePath || ""; new_native_path = map(old_native_path) || "";
      if (new_native_path && typeof runtime.doApplyRename !== "function") throw new Error("当前 Typora 未提供原生文档改名接口，已停止重命名以保留编辑内容。");
      const tabs: {leaf: graph_leaf; target: string}[] = [];
      const all_leaves: graph_leaf[] = [];
      core.app.workspace.eachLeaves(leaf => { all_leaves.push(leaf); });
      core.app.workspace.eachLeaves(leaf => {
        const target = map(real_path(leaf)); if (!target) return;
        if (all_leaves.some(other => other !== leaf && !map(real_path(other)) && file_key(real_path(other)) === file_key(target))) throw new Error("目标名称已有打开的文档标签，请先处理该标签，避免混淆未保存内容。");
        if (typeof (leaf.parent as unknown as {renameTab?: unknown}).renameTab !== "function") throw new Error("当前编辑器组不支持更新标签路径，已停止重命名。");
        tabs.push({leaf, target: is_source_file_uri(leaf.state.path) ? source_file_uri(target) : target});
      });
      library?.pauseOnChange?.(); paused = true;
      // 原生 IPC 负责暂停文件监视；不用社区核心的 directory:rename 前缀匹配，以免 a 误改 abc。
      const ipc = runtime.reqnode("electron").ipcRenderer;
      if (new_native_path) { await ipc.invoke("app.sendEvent", "willRename", {oldPath: plan.old_path}); native_watch_paused = true; }
      await plan.apply(); applied = true; renamed_path = plan.new_path;
      for (const {leaf, target} of tabs) (leaf.parent as unknown as {renameTab(old_path: string, new_path: string): void}).renameTab(leaf.state.path, target);
      const problems: string[] = [];
      for (const {view, target, transaction} of relocations) {
        view.file_path = target; view.leaf.state.git_cwd = path_api.dirname(target);
        if (view.editor) { view.editor.data.file = target; view.editor.data.title = path_api.basename(target); view.editor.data.left_label = target; }
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
      // 其他 Typora 窗口沿真实原生事件更新路径；当前窗口的标签已用组件边界精确迁移。
      await ipc.invoke("app.sendEvent", "didRename", {oldPath: plan.old_path, newPath: plan.new_path});
      if (problems.length) throw new Error("名称已更新，但磁盘内容同时发生变化。草稿仍保留，请比较后再保存。\n" + problems.join("\n"));
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
  const rename_file=(root:string,old_path:string,name:string)=>relocate_file(root,old_path,name);
  const move_file=(root:string,old_path:string,target:string)=>relocate_file(root,old_path,target,true);
  const active_source_view = () => [...views].find(view => view.leaf === core.app.workspace.activeLeaf);
  const native_document_active = () => Boolean(core.app.workspace.activeLeaf)
    && !String(core.app.workspace.activeLeaf?.state.path || "").startsWith("typ://");
  const run_editor_command=(command:string)=>{
    const editor=active_source_view()?.editor?.focused_editor();if(!editor)return;
    editor.focus();const action=editor.getAction(command);if(action)void action.run();else editor.trigger("workspace-menu",command,null);
  };
  const source_editor_active=()=>Boolean(active_source_view()?.editor);
  const can_save_active = () => Boolean(active_source_view()) || native_document_active();
  const pending_native_saves=new Set<()=>void>();
  let native_open_pending=false;
  const release_save_active=core.app.workspace.on("active-leaf:change",()=>{if(native_document_active())native_open_pending=true;});
  const release_save_open=core.app.workspace.on("file:open",(opened:string)=>{if(typeof opened==="string"&&file_key(opened)===file_key(core.app.workspace.activeLeaf?.state.path||"")&&file_key(opened)===file_key(runtime.File?.bundle?.filePath||""))native_open_pending=false;});
  const save_leaf=async(leaf:graph_leaf):Promise<boolean>=>{
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
        if(workspace.activeLeaf!==leaf){activating=true;workspace.activeLeaf=leaf.parent.toggleTab(leaf.state.path);activating=false;if(preview_only())finish(false);}
        if(workspace.activeLeaf!==leaf)cancel();
      });
      if(!ready)return false;
    }
    if(preview_only())return false;
    // No await between the final identity check and invocation: never save a newly selected document.
    if(!binding.active||!native_matches()||typeof runtime.ClientCommand?.save!=="function")return false;
    await Promise.resolve(runtime.ClientCommand.save());return true;
  };
  const save_active = async () => {const leaf=core.app.workspace.activeLeaf;return leaf?save_leaf(leaf):false;};
  const native_ready=()=>{
    const leaf=core.app.workspace.activeLeaf;
    return binding.active&&native_document_active()&&file_key(leaf!.state.path)===file_key(runtime.File?.bundle?.filePath||"")
      &&(!(leaf!.view as any).isEditor||(leaf!.view as any).isEditor())&&!runtime.File?._onFileSwitching&&!runtime.File?.inSavingProcess;
  };
  const save_as_active=async()=>{
    const source=active_source_view();if(source)return source.save_as();
    if(!native_ready()||!runtime.ClientCommand?.saveAs)return false;
    await Promise.resolve(runtime.ClientCommand.saveAs());return true;
  };
  const reload_active=()=>{const source=active_source_view();if(source)source.confirm_reload();else if(native_ready())runtime.ClientCommand?.reloadFromDisk?.();};
  const save_all = async () => {
    const source_saves = [...views].filter(view => !view.disposed && view.dirty()).map(view => view.save());
    const [, source_results] = await Promise.all([
      Promise.resolve().then(() => runtime.ClientCommand?.saveAll?.()),
      Promise.all(source_saves),
    ]);
    return source_results.every(Boolean);
  };
  const transfer_captures = new WeakMap<graph_leaf,{capture_id:string;fingerprint:string}>();
  const transfer_present = (leaf:graph_leaf) => {let present=false;core.app.workspace.eachLeaves(item=>{if(item===leaf)present=true;});return present;};
  const transfer_guard = (signal?:AbortSignal) => {
    if(signal?.aborted||!binding.active)throw new Error("窗口移交已取消，原标签仍保留。");
    if(renaming||runtime.File?.isFileLoading?.()||runtime.File?._onFileSwitching||runtime.File?._onInitParse||runtime.File?.inSavingProcess)throw new Error("文件正在读取、切换、保存或重命名，请稍后再移至新窗口。");
  };
  const transfer_hash=async(value:Uint8Array|string)=>{
    const bytes=typeof value==="string"?new TextEncoder().encode(value):value;
    const digest=await runtime.reqnode("crypto").webcrypto.subtle.digest("SHA-256",bytes);
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
  };
  // 分块异步读取并校验同一个句柄及目录入口；慢盘取消不会阻塞输入或迟到覆盖草稿。
  const transfer_disk=async(file_path:string,signal?:AbortSignal)=>{
    transfer_guard(signal);const entry=await fs.promises.lstat(file_path);transfer_guard(signal);
    const real=await fs.promises.realpath(file_path);transfer_guard(signal);
    if(!entry.isFile()||entry.isSymbolicLink())throw new Error("只能移交真实普通文件，目录或符号链接不支持。");
    const handle=await fs.promises.open(file_path,"r");
    try {
      transfer_guard(signal);const before=await handle.stat();transfer_guard(signal);
      if(!before.isFile()||before.size>MAX_TEXT_DOCUMENT_BYTES)throw new Error("移交文件超过16 MiB或不是普通文本文件。");
      const bytes=new Uint8Array(before.size+1);let length=0;
      while(length<bytes.length){const {bytesRead:count}=await handle.read(bytes,length,Math.min(256*1024,bytes.length-length),length);transfer_guard(signal);if(!count)break;length+=count;}
      const result=bytes.slice(0,length),sha256=await transfer_hash(result);transfer_guard(signal);
      const after=await handle.stat();transfer_guard(signal);
      const current=await fs.promises.lstat(file_path);transfer_guard(signal);
      const current_real=await fs.promises.realpath(file_path);transfer_guard(signal);
      const same=(a:any,b:any)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
      if(!same(before,after)||!same(after,current)||!same(entry,current)||length!==after.size||real!==current_real)throw new Error("移交期间磁盘文件发生变化，原标签仍保留。");
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
    if(typeof runtime.File?.editor?.getMarkdown!=="function")throw new Error("当前宿主不支持读取原生Markdown草稿。");
    const text=runtime.File.editor.getMarkdown();if(typeof text!=="string")throw new Error("原生Markdown正文尚未就绪。");return text;
  };
  const normalized_transfer_text=(text:string)=>text.replace(/\r\n?/gu,"\n");
  const collect_transfer=async(leaf:graph_leaf,signal?:AbortSignal):Promise<workspace_document_snapshot>=>{
    transfer_guard(signal);if(!transfer_present(leaf))throw new Error("要移交的标签已关闭。");
    const file_path=real_path(leaf);if(!file_path||!path_api.isAbsolute(file_path))throw new Error("请先保存未命名文档，再移至新窗口。");
    const root=context_root(),source=[...views].find(view=>view.leaf===leaf&&!view.disposed);
    const snapshot:workspace_document_snapshot={schema:1,capture_id:globalThis.crypto.randomUUID(),capture_fingerprint:"",kind:source?"source":"markdown",file_path,root,text:"",dirty:false,disk_sha256:""};
    let verify_content=()=>{};
    if(source){
      if(source.loading||source.saving||!source.loaded||!source.editor||!source.format)throw new Error("源码标签正在读取或保存，请稍后再移至新窗口。");
      const model=source.editor.models[0],version=model.getAlternativeVersionId(),format_key=source.format_key(),language=model.getLanguageId();
      verify_content=()=>{transfer_guard(signal);if(!transfer_present(leaf)||source.disposed||source.loading||source.saving||version!==model.getAlternativeVersionId()||format_key!==source.format_key()||language!==model.getLanguageId())throw new Error("源码在捕获期间发生变化，请重新移交。");};
      const transaction=await source.text_document.prepare_relocation(source.file_path);
      try{
        verify_content();snapshot.disk_sha256=(await transfer_disk(file_path,signal)).sha256;verify_content();
        snapshot.text=model.getValue();snapshot.dirty=source.dirty();snapshot.language=model.getLanguageId();
        snapshot.source_format={encoding:source.format.encoding,bom:source.format.bom,eol:source.format.eol};
        snapshot.source_baseline_format=saved_source_format(source);snapshot.source_baseline=source.format.text;
        snapshot.source_model_eol=model.getEOL() as "\n"|"\r\n";snapshot.view_state=source.editor.focused_editor().saveViewState();
      }finally{transaction.cancel();}
    }else{
      if(!is_markdown_file(file_path))throw new Error("此标签不是可以移交的源码或Markdown文件。");
      const disk=await transfer_disk(file_path,signal);transfer_guard(signal);
      const native_matches=file_key(runtime.File?.bundle?.filePath||"")===file_key(file_path);
      const decoded=decode_file_bytes(disk.bytes,native_matches?(runtime.File?.bundle?.fileEncode||"utf8").replace(/-bom$/u,""):"utf-8");
      snapshot.disk_sha256=disk.sha256;snapshot.markdown_baseline=decoded.text;
      if(native_matches){
        const saved=runtime.File?.bundle?.savedContent;
        if(typeof saved!=="string"||normalized_transfer_text(saved)!==normalized_transfer_text(decoded.text))throw new Error("Markdown磁盘内容与当前加载基线不同，请先比较后再移交。");
        snapshot.text=native_transfer_text();snapshot.dirty=Boolean(runtime.File?.changeCounter?.isDocumentEdited());
        if(snapshot.dirty&&runtime.File?.option?.enableAutoSave)throw new Error("当前开启了Markdown自动保存，无法保证草稿移交不写入磁盘；请先处理自动保存设置，原标签仍保留。");
        const content=document.querySelector<HTMLElement>("content"),write=content?.querySelector<HTMLElement>(":scope > #write");
        if(content&&write)snapshot.reading_position=capture_position(content,write);
      }else{
        // 后台Markdown预览没有独立可编辑缓冲；读取磁盘并保留此预览栏自己的滚动位置。
        snapshot.text=decoded.text;const state=(leaf.view as {getScroll?:()=>{scrollTop:number}}).getScroll?.();
        snapshot.reading_position={scroll_top:state?.scrollTop??leaf.containerEl.scrollTop,scroll_left:leaf.containerEl.scrollLeft};
      }
      if(!snapshot.dirty&&normalized_transfer_text(snapshot.text)!==normalized_transfer_text(decoded.text))throw new Error("Markdown正文与磁盘基线不同，不能作为已保存文档移交。");
      verify_content=()=>{transfer_guard(signal);const still_native=file_key(runtime.File?.bundle?.filePath||"")===file_key(file_path);if(still_native!==native_matches||still_native&&(native_transfer_text()!==snapshot.text||Boolean(runtime.File?.changeCounter?.isDocumentEdited())!==snapshot.dirty||snapshot.dirty&&runtime.File?.option?.enableAutoSave))throw new Error("Markdown正文或自动保存设置在捕获期间改变，请重新移交。");};
    }
    if(snapshot.text.length>MAX_TEXT_DOCUMENT_BYTES)throw new Error("草稿超过16 MiB，原标签仍保留。");
    snapshot.capture_fingerprint=await transfer_fingerprint(snapshot);verify_content();
    transfer_guard(signal);if(!transfer_present(leaf)||real_path(leaf)!==file_path||context_root()!==root)throw new Error("标签或工作区在移交期间改变，请重试。");
    return snapshot;
  };
  const capture_transfer=async(leaf:graph_leaf,signal?:AbortSignal)=>{
    const snapshot=await collect_transfer(leaf,signal);transfer_guard(signal);transfer_captures.set(leaf,{capture_id:snapshot.capture_id,fingerprint:snapshot.capture_fingerprint});return snapshot;
  };
  const receive_transfer=async(snapshot:workspace_document_snapshot,target:workspace_transfer_target,signal?:AbortSignal):Promise<graph_leaf>=>{
    transfer_guard(signal);
    if(!snapshot||snapshot.schema!==1||!["source","markdown"].includes(snapshot.kind)||typeof snapshot.text!=="string"||snapshot.text.length>MAX_TEXT_DOCUMENT_BYTES||typeof snapshot.file_path!=="string"||!path_api.isAbsolute(snapshot.file_path)||typeof snapshot.root!=="string"||typeof snapshot.dirty!=="boolean"||!/^[a-f0-9]{64}$/u.test(snapshot.disk_sha256)||snapshot.capture_fingerprint!==await transfer_fingerprint(snapshot))throw new Error("窗口文档快照无效，未修改当前文档。");
    const target_root=context_root(),target_group=target?.group as graph_leaf["parent"]&{insertChild?(index:number,leaf:graph_leaf):void};
    const target_children:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{if(leaf.parent===target_group)target_children.push(leaf);});
    if(!target_group||typeof target_group.insertChild!=="function"||!target_children.length||!Number.isInteger(target.index)||target.index<0||target.index>target_children.length)throw new Error("接收编辑组或标签插入位置无效，请重新拖动。");
    const native_before={path:runtime.File?.bundle?.filePath||"",dirty:Boolean(runtime.File?.changeCounter?.isDocumentEdited()),text:native_transfer_text()};
    const check_destination=(received?:graph_leaf)=>{
      transfer_guard(signal);let present=false,duplicate=false;const children:graph_leaf[]=[];
      core.app.workspace.eachLeaves(leaf=>{if(leaf.parent===target_group){present=true;if(leaf!==received)children.push(leaf);}if(leaf!==received&&file_key(real_path(leaf))===file_key(snapshot.file_path))duplicate=true;});
      if(duplicate)throw new Error("目标窗口已打开同一文件；为保留其内容和草稿，未合并该标签。");
      if(!present||context_root()!==target_root)throw new Error("接收编辑组或工作区已改变，请重新拖动。");
      if(!received&&(children.length!==target_children.length||children.some((leaf,index)=>leaf!==target_children[index])))throw new Error("接收编辑组的标签顺序已改变，请重新拖动。");
      if(snapshot.kind==="source"&&((runtime.File?.bundle?.filePath||"")!==native_before.path||Boolean(runtime.File?.changeCounter?.isDocumentEdited())!==native_before.dirty||native_transfer_text()!==native_before.text))throw new Error("目标窗口的Markdown草稿发生变化，停止恢复并保留当前内容。");
      if(snapshot.kind==="markdown"&&!received&&runtime.File?.changeCounter?.isDocumentEdited())throw new Error("目标窗口当前有未保存的Markdown草稿，请先保存或处理该草稿，再合并Markdown标签。");
    };
    check_destination();
    if(snapshot.kind==="markdown"&&snapshot.dirty&&runtime.File?.option?.enableAutoSave)throw new Error("目标窗口开启Markdown自动保存，未接收未保存草稿，原标签仍保留。");
    if((await transfer_disk(snapshot.file_path,signal)).sha256!==snapshot.disk_sha256)throw new Error("接收前磁盘文件发生变化，原标签仍保留。");check_destination();
    const insert_received=(type:string,path:string)=>{
      check_destination();const leaf=core.app.workspace.createLeaf({type,state:{path,git_cwd:target_root}});
      target_group.insertChild!(target.index,leaf);core.app.workspace.activeLeaf=leaf;return leaf;
    };
    if(snapshot.kind==="source"){
      const valid_format=(format:workspace_transfer_format|undefined)=>format&&typeof format.encoding==="string"&&format.encoding.length<100&&typeof format.bom==="boolean"&&["LF","CRLF","CR","mixed"].includes(format.eol);
      if(!valid_format(snapshot.source_format)||!valid_format(snapshot.source_baseline_format)||typeof snapshot.source_baseline!=="string"||!['\n','\r\n'].includes(snapshot.source_model_eol||"")||typeof snapshot.language!=="string")throw new Error("源码快照缺少保存基线或格式。");
      const leaf=insert_received(SOURCE_FILE_VIEW_ID,source_file_uri(snapshot.file_path)),view=[...views].find(view=>view.leaf===leaf&&!view.disposed);
      if(!leaf||!view||file_key(view.file_path)!==file_key(snapshot.file_path))throw new Error("目标源码标签未打开。");
      const check_target=()=>{check_destination(leaf);if(!transfer_present(leaf)||leaf.parent!==target_group||view.disposed||view.saving||view.dirty())throw new Error("目标窗口状态或草稿发生变化，停止恢复。");};
      for(let count=0;view.loading&&count<250;count++){await new Promise(resolve=>setTimeout(resolve,20));check_target();}
      check_target();if(view.loading)throw new Error("目标文件未及时完成读取。");
      if(!view.loaded||view.format?.encoding!==snapshot.source_baseline_format!.encoding){await view.load_file(snapshot.source_baseline_format!.encoding);check_target();}
      if(!view.loaded||!view.editor||!view.format||view.format.text!==snapshot.source_baseline||view.saved_format!==`${snapshot.source_baseline_format!.encoding}:${snapshot.source_baseline_format!.bom}:${snapshot.source_baseline_format!.eol}`)throw new Error("目标源码的加载基线与来源不同，未恢复草稿。");
      const transaction=await view.text_document.prepare_relocation(view.file_path);
      try{
        check_target();const disk=await transfer_disk(snapshot.file_path,signal);check_target();if(disk.sha256!==snapshot.disk_sha256)throw new Error("接收期间磁盘文件发生变化。");
        const editor=view.editor.focused_editor(),model=view.editor.models[0];
        if(!snapshot.dirty&&(model.getValue()!==snapshot.text||JSON.stringify(snapshot.source_format)!==JSON.stringify(snapshot.source_baseline_format)))throw new Error("已保存源码快照与磁盘内容不一致。");
        if(snapshot.dirty){editor.pushUndoStop();model.setEOL(snapshot.source_model_eol==="\r\n"?monaco.editor.EndOfLineSequence.CRLF:monaco.editor.EndOfLineSequence.LF);editor.executeEdits("workspace-transfer",[{range:model.getFullModelRange(),text:snapshot.text}]);editor.pushUndoStop();view.saved_version=-1;}
        Object.assign(view.format,snapshot.source_format);monaco.editor.setModelLanguage(model,snapshot.language!);
        if(snapshot.view_state)editor.restoreViewState(snapshot.view_state);
        view.update_status();keep_open(leaf);
        if(model.getValue()!==snapshot.text||view.dirty()!==snapshot.dirty)throw new Error("目标源码未能完整恢复，原标签仍保留。");
        return leaf;
      }finally{transaction.cancel();}
    }
    if(!is_markdown_file(snapshot.file_path)||typeof snapshot.markdown_baseline!=="string"||typeof runtime.File?.reloadContent!=="function")throw new Error("目标宿主无法接收Markdown快照。");
    const leaf=insert_received("core.markdown",snapshot.file_path);
    await navigate_reading_target(snapshot.file_path,{signal});transfer_guard(signal);
    const inherited_markdown=()=>snapshot.dirty&&Boolean(runtime.File?.changeCounter?.isDocumentEdited())&&normalized_transfer_text(native_transfer_text())===normalized_transfer_text(snapshot.text);
    const check_markdown=()=>{check_destination(leaf);if(!transfer_present(leaf)||leaf.parent!==target_group||core.app.workspace.activeLeaf!==leaf||file_key(runtime.File?.bundle?.filePath||"")!==file_key(snapshot.file_path)||runtime.File?.changeCounter?.isDocumentEdited()&&!inherited_markdown())throw new Error("目标Markdown尚未就绪或已有修改，未恢复草稿。");};
    check_markdown();const disk=await transfer_disk(snapshot.file_path,signal);check_markdown();
    if(disk.sha256!==snapshot.disk_sha256||normalized_transfer_text(runtime.File?.bundle?.savedContent||"")!==normalized_transfer_text(snapshot.markdown_baseline)||!inherited_markdown()&&normalized_transfer_text(native_transfer_text())!==normalized_transfer_text(snapshot.markdown_baseline))throw new Error("目标Markdown与磁盘基线不同，未恢复草稿。");
    if(snapshot.dirty){
      if(runtime.File?.option?.enableAutoSave)throw new Error("目标窗口在加载期间开启了Markdown自动保存，未恢复草稿，原标签仍保留。");
      // 原生同文件窗口可自动继承共享快照；已继承完整草稿时不再重载或重建撤销记录。
      // 未继承时使用1.14.9对象参数签名；skipUndo会把文档误标成已保存，不能使用。
      if(!inherited_markdown())runtime.File.reloadContent(snapshot.text,{delayRefresh:false,skipChangeCount:false,skipStore:true});
      if(!runtime.File.changeCounter?.isDocumentEdited())runtime.File.updateChangeCount?.(runtime.File.ChangeType?.NSChangeDone);
      if(!runtime.File.changeCounter?.isDocumentEdited()||normalized_transfer_text(native_transfer_text())!==normalized_transfer_text(snapshot.text))throw new Error("Markdown草稿未完整恢复，原标签仍保留。");
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
        // Typora 1.14.9在另一个窗口仍持有同一原生文档时，tryLeaveDocument不保存或丢弃它。
        // 只有目标已ACK、完整指纹未变、宿主确认共享文档后才移除源叶子。
        const no_other_window=await runtime.JSBridge.invoke("document.noOtherWindow");transfer_guard(signal);
        if(no_other_window!==false||!native_markdown_ready()||transfer_captures.get(leaf)!==captured||!transfer_present(leaf))return false;
        shared_markdown=true;
      }
      if(runtime.File?.changeCounter?.isDocumentEdited()&&!shared_markdown){
        if(!source)return false;
        const group=leaf.parent as graph_leaf["parent"]&{activeLeaf?:graph_leaf;children?:graph_leaf[]};
        // 关闭后台源码叶子不切换原生缓冲；活动叶子只允许切至另一独立源码叶子。
        // 最后一叶移除会重排编辑组，保留它以免间接打开其他Markdown并触发自动保存。
        const children=group.children||[],index=children.indexOf(leaf),next=children[index-1]||children[index+1];
        if(!group.activeLeaf||children.length<2||group.activeLeaf===leaf&&!views.has(next?.view as source_file_view))return false;
      }
      if(!leaf.parent.removeTab)return false;
      // 目标已ACK且指纹重检成功，临时放行源码自身关闭保护；不调用任何保存入口。
      if(source){source.saved_version=source.editor!.models[0].getAlternativeVersionId();source.saved_format=source.format_key();}
      try{if(signal?.aborted)return false;leaf.parent.removeTab(leaf.state.path);}
      finally{if(source&&transfer_present(leaf)){source.saved_version=previous_version!;source.saved_format=previous_format!;source.update_status();}}
      const removed=!transfer_present(leaf);if(removed)transfer_captures.delete(leaf);return removed;
    }catch{return false;}
  };
  document.documentElement.setAttribute("data-linux-note-workspace-files", "ready");
  document.documentElement.setAttribute("data-linux-note-source-editing", "ready");
  let binding: workspace_files_binding;
  const assert_can_dispose = () => {
    if(file_operation_count)throw new Error("文件操作正在执行，请完成后再停用 Typora Code。");
    if (renaming || [...views].some(view => view.saving)) throw new Error("文件正在保存或重命名，请完成后再停用 Typora Code。");
    if ([...views].some(view => !view.disposed && view.dirty())) throw new Error("源码标签有未保存修改，请先保存，或关闭标签并处理修改，再停用 Typora Code。");
  };
  // 卸载前先检查草稿；不能把未保存模型交给已注销的视图工厂。
  const dispose = () => {
    if (!binding.active) return;
    assert_can_dispose();
    binding.active = false;
    for(const cancel of [...pending_native_saves])cancel();release_save_active();release_save_open();
    window.removeEventListener("pagehide", dispose);
    if (core.app.openFile === routed_app_open_file) core.app.openFile = native_app_open_file;
    if (library && library.openFile === routed_library_open_file) library.openFile = native_library_open_file;
    source_lifecycle.dispose();
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
    if(!binding.active)throw new Error("Typora Code 已停用。");file_operation_count++;
    try{return await action();}finally{file_operation_count--;}
  };
  const create_entry=(root:string,parent:string,name:string,directory:boolean)=>file_operation(()=>create_workspace_entry({fs,path_api},root,parent,name,directory));
  const transfer_entries=(root:string,paths:string[],target:string,move:boolean)=>file_operation(()=>transfer_workspace_entries({fs,path_api},root,paths,target,move?move_file:undefined));
  const trash_entries=(root:string,paths:string[])=>file_operation(async()=>{
    const includes=(candidate:string)=>paths.some(path=>renamed_workspace_path(path_api,candidate,path,path,true)!==undefined);
    const affected=[...views].filter(view=>includes(view.file_path));
    if(renaming||affected.some(view=>view.dirty()||view.saving))throw new Error("待删除项目包含未保存或正在保存的源码，请先保存，或关闭标签并处理修改后再删除。");
    if(includes(runtime.File?.bundle?.filePath||"")&&runtime.File?.changeCounter?.isDocumentEdited())throw new Error("待删除项目包含未保存的 Markdown，请先保存或关闭文档后再删除。");
    if(typeof shell.trashItem!=="function")throw new Error("当前宿主未提供回收站接口。");
    await trash_workspace_entries({fs,path_api},root,paths,async(target:string)=>{
      // 每个文件落盘动作前重检草稿，批次期间编辑不能被后续删除吞掉。
      if([...views].some(view=>includes(view.file_path)&&(view.dirty()||view.saving)))throw new Error("源码在删除期间发生修改，已停止后续删除。");
      await shell.trashItem(target);
      const leaves:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{if(renamed_workspace_path(path_api,real_path(leaf),target,target,true)!==undefined)leaves.push(leaf);});
      for(const view of [...views])if(renamed_workspace_path(path_api,view.file_path,target,target,true)!==undefined)view.release_source();
      for(const leaf of leaves)leaf.parent.removeTab?.(leaf.state.path);
    });
  });
  const host = {fs, path_api, core, open_file, context_root, file_menu, copy, rename_file, move_file, create_entry, transfer_entries, trash_entries, keep_open, source_editor_active, run_editor_command, can_save_active, save_active, save_as_active, reload_active, save_leaf, save_all,capture_transfer,receive_transfer,release_transfer,
    read_text:async(file_path:string)=>{
      if(!binding.active)throw new Error("Typora Code 已停用。");
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
