import {workspace_leaf_tab} from "./workspace_leaf_tab";
import { create_workspace_entry, transfer_workspace_entries, trash_workspace_entries } from "./workspace_file_operations";
import type { graph_core, graph_leaf } from "./git_graph_host";
import { git_diff_editor } from "./git_diff_editor";
import { workspace_element as el, workspace_button as button, workspace_menu, workspace_dialog } from "./workspace_widgets";
import { FILE_LANGUAGE_RULES, is_markdown_file } from "./file_language";
import { create_text_document } from "./workspace_text_document";
import { bind_source_lifecycle } from "./workspace_source_lifecycle";
import { bind_workspace_editor_status } from "./workspace_editor_status";
import { navigate_reading_target, rename_reading_paths } from "./reading_navigation";
import { prepare_workspace_rename, prepare_workspace_move, renamed_workspace_path } from "./workspace_rename";
import { reveal_markdown_location } from "./workspace_markdown_location";
import { SOURCE_FILE_VIEW_ID, file_key, is_source_file_uri, parse_markdown_file_target, resolve_markdown_file_target, resolve_workspace_file, source_file_path, source_file_uri } from "./workspace_file_uri";
import * as monaco from "monaco-editor/editor/editor.api";
import files_css from "./workspace_files.css";

export type file_location = {line?: number; column?: number; end_line?: number; end_column?: number; source?: boolean; expected_text?: string; hash?: string; preview?: boolean; preserve_focus?: boolean};
export type workspace_file_host = {
  fs: any; path_api: any; core: graph_core;
  open_file(file_path: string, location?: file_location, group?: string): Promise<void>;
  context_root(): string;
  file_menu(event: MouseEvent, file_path: string): void;
  copy(text: string): unknown;
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
  save_all(): Promise<boolean>;
  can_write(file_path: string): boolean;
  refresh_files(paths: string[]): void;
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
  const runtime = window as unknown as {reqnode(name: string): any; File?: any; ClientCommand?: Record<string, (...args: unknown[]) => unknown>; doApplyRename?(path: string): void};
  const fs = runtime.reqnode("fs"); const path_api = runtime.reqnode("path"); const shell = runtime.reqnode("electron").shell;
  let native_app_open_file = core.app.openFile;
  const call_native_app_open_file = (target: string) => native_app_open_file.call(core.app, target);
  const style = el("style"); style.textContent = files_css; document.head.append(style);
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
  const context_root = () => runtime.File?.getMountFolder?.() || core.app.workspace.activeLeaf?.state.git_cwd || path_api.dirname(real_path(core.app.workspace.activeLeaf) || core.app.workspace.activeFile || "");
  class source_file_view extends core.WorkspaceView {
    containerEl = el("section", "linux-note-source-file"); icon = "fa-file-code-o";
    editor?: git_diff_editor; focus_requested=true; file_path: string; loaded = false; loading = false; disposed=false; target?:file_location;
    status = el("span", "workspace-file-status"); body = el("div", "workspace-file-body");
    status_controls = el("div", "workspace-editor-status-controls"); location_label = el("span", "workspace-file-location");
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
    if (renaming) throw new Error("正在重命名，请稍后再打开文件。");
    const resolved_path = resolve_workspace_file(path_api, context_root(), file_path);
    if (!resolved_path) throw new Error("无法解析文件路径。");
    file_path = resolved_path;
    if (is_markdown_file(file_path) && !location.source) {
      if ([...views].some(view => file_key(view.file_path) === file_key(file_path) && view.dirty())) throw new Error("该 Markdown 的源码标签有未保存修改，请先保存后再打开渲染视图。");
      const existing_leaves=new Set<graph_leaf>();core.app.workspace.eachLeaves(leaf=>existing_leaves.add(leaf));
      await navigate_reading_target(file_path, {group, hash: location.hash, locate: location.line == null ? undefined : (signal) => reveal_markdown_location(location, signal)});
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
    const markdown = resolve_markdown_file_target(path_api, context_root(), target);
    if (markdown) return open_file(markdown.file_path, {hash: markdown.hash});
    if (!target.startsWith("typ://")) return open_file(target);
    // 原生 bundle 仍指向该文件而中央为工具标签时，核心会直接返回；阅读导航显式激活既有 Markdown leaf。
    return native_app_open_file.call(this, target);
  };
  let library = runtime.File?.editor?.library;
  let native_library_open_file = typeof library?.openFile === "function" ? library.openFile : undefined;
  const routed_library_open_file = function (this: unknown, target: string, ...args: unknown[]) {
    if (typeof target === "string" && !target.startsWith("typ://") && !parse_markdown_file_target(target)) return open_file(target);
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
  const save_active = async () => {
    const source_view = active_source_view();
    if (source_view) return source_view.save();
    if (!native_document_active()) return false;
    await Promise.resolve(runtime.ClientCommand?.save?.());
    return true;
  };
  const save_all = async () => {
    const source_saves = [...views].filter(view => !view.disposed && view.dirty()).map(view => view.save());
    const [, source_results] = await Promise.all([
      Promise.resolve().then(() => runtime.ClientCommand?.saveAll?.()),
      Promise.all(source_saves),
    ]);
    return source_results.every(Boolean);
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
  const host = {fs, path_api, core, open_file, context_root, file_menu, copy, rename_file, move_file, create_entry, transfer_entries, trash_entries, keep_open, source_editor_active, run_editor_command, can_save_active, save_active, save_all,
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
