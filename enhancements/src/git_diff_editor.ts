import {read_text_presentation,update_text_presentation,observe_text_presentation} from './workspace_text_presentation';
import type {markdown_view_anchor} from './git_markdown_diff';
import {StandaloneServices} from "monaco-editor/editor/standalone/browser/standaloneServices.js";
import {IInstantiationService} from "monaco-editor/platform/instantiation/common/instantiation.js";
import {WorkbenchHoverDelegate} from "monaco-editor/platform/hover/browser/hover.js";
import {setHoverDelegateFactory} from "monaco-editor/base/browser/ui/hover/hoverDelegateFactory.js";
import {read_git_diff_preferences,update_git_diff_preferences,watch_git_diff_preferences,type git_diff_preferences} from "./git_diff_settings";
import design_baseline from "./vscode_design_baseline.json";
import {git_icon_button,git_icon} from "./git_icons";
import "./monaco_locale";
import * as monaco from "monaco-editor/editor/editor.api";
import "../node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css";
import "../node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css";
import "monaco-editor/editor/browser/coreCommands";
import "monaco-editor/editor/contrib/lineSelection/browser/lineSelection";
import "monaco-editor/editor/contrib/smartSelect/browser/smartSelect";
import "monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution";
import "monaco-editor/editor/contrib/find/browser/findController";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu";
import "monaco-editor/editor/contrib/folding/browser/folding";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations";
import "monaco-editor/editor/contrib/readOnlyMessage/browser/contribution";
import "monaco-editor/languages/definitions/cpp/register";
import "monaco-editor/languages/definitions/markdown/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/languages/definitions/shell/register";
import "monaco-editor/languages/definitions/powershell/register";
import "monaco-editor/languages/definitions/yaml/register";
import "monaco-editor/languages/definitions/html/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/rust/register";
import "monaco-editor/languages/definitions/go/register";
import "monaco-editor/languages/definitions/java/register";
import { createTokenizationSupport } from "monaco-editor/languages/features/json/tokenization";
import worker_source from "linux_note_monaco_worker";
import { workspace_element as el, workspace_menu, type workspace_menu_entry } from "./workspace_widgets";
import { detect_file_language } from "./file_language";
import { register_file_languages } from "./workspace_languages";
import { git_graph_text as text } from "./git_graph_i18n";

import {is_markdown_file} from './file_language';
import {create_git_markdown_diff} from './git_markdown_diff';

let initialized = false;
let serial = 0;
const model_users = new WeakMap<monaco.editor.ITextModel, number>();
export function initialize_editor(): void {
  if (initialized) return;
  const worker_url = URL.createObjectURL(new Blob([worker_source], {type: "text/javascript"}));
  (globalThis as unknown as {MonacoEnvironment: unknown}).MonacoEnvironment = {getWorker: () => new Worker(worker_url)};
  monaco.languages.register({id: "json", extensions: [".json", ".jsonc"]});
  monaco.languages.setTokensProvider("json", createTokenizationSupport(true));
  register_file_languages();
  initialized = true;
}
export type diff_document = {title: string; file?: string; left: string; right?: string; left_label?: string; right_label?: string};
export type diff_range_snapshot = {original_text:string;modified_text:string;line_changes:monaco.editor.ILineChange[];selections:monaco.Selection[]};
export class git_diff_editor {
  container = el("section", "git-graph-document"); toolbar = el("div", "git-diff-toolbar");
  labels = el("div", "git-diff-labels");
  body = el("div", "git-monaco-body"); status = el("span", "git-diff-count", text("diff.calculating"));
  editor: monaco.editor.IStandaloneDiffEditor | monaco.editor.IStandaloneCodeEditor;
  models: monaco.editor.ITextModel[] = []; observer: ResizeObserver; subscriptions: monaco.IDisposable[] = [];
  side_by_side = true; wrapped = true; collapsed = false; ignore_whitespace = true;
  show_moves = false; inline_when_narrow = true;
  toolbar_observer?:MutationObserver;
  mode_observer?:MutationObserver;
  last_focused_editor?: monaco.editor.IStandaloneCodeEditor;
  readonly_status?: HTMLElement;
  title_entries:()=>workspace_menu_entry[] = ()=>[];
  report_error?:(error:unknown)=>void;
  range_action?: (action:"stage"|"revert",snapshot:diff_range_snapshot)=>Promise<void>;
  range_available:()=>boolean = ()=>false;
  range_pending=false;
  private disposed=false;
  private restoring_navigation=false;
  private range_chord_until=0;
  private close_menu?:()=>void;
  private release_settings?:()=>void;
  markdown_preview?:ReturnType<typeof create_git_markdown_diff>;
  rendered_markdown=false;
  private markdown_epoch=0;
  private pending_anchor?:markdown_view_anchor;
  private release_presentation?:()=>void;
  private input_epoch=0;
  constructor(public data: diff_document, public extra_menu: () => workspace_menu_entry[] = () => [], shared_model?: monaco.editor.ITextModel) {
    if (data.left.includes("\0") || data.right?.includes("\0")) throw new Error(text("diff.binary_file"));
    this.wrapped=read_text_presentation().word_wrap;
    const preferences=read_git_diff_preferences();this.side_by_side=preferences.render_side_by_side;this.inline_when_narrow=preferences.inline_when_narrow;this.ignore_whitespace=preferences.ignore_trim_whitespace;this.collapsed=preferences.hide_unchanged;this.show_moves=preferences.show_moves;
    initialize_editor(); this.container.setAttribute("data-linux-note-monaco-diff", "ready");
    this.container.append(this.toolbar);
    this.refresh_labels();this.container.append(this.labels, this.body);
    // 每个历史版本拥有独立模型；文件名只用于语言识别，不执行仓库中的任何代码。
    const model = (source: string, side: string) => {
      if (source.includes("\0")) throw new Error(text("diff.binary_file"));
      const uri = monaco.Uri.from({scheme: "linux-note-git", path: `/${++serial}/${side}/${data.file || data.title}`});
      const language = detect_file_language(data.file || data.title, source.split(/\r?\n/u, 1)[0]);
      const result = monaco.editor.createModel(source, language, uri); this.models.push(result); model_users.set(result, 1); return result;
    };
    const original = shared_model && data.right == null ? shared_model : model(data.left, "original");
    if (original === shared_model) { this.models.push(original); model_users.set(original, (model_users.get(original) || 0) + 1); }
    const color = getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number) || [0, 0, 0];
    // 普通单文件保留全文缩略图；Git 差异只显示原生红绿改动概览。
    const minimap: monaco.editor.IEditorMinimapOptions = {enabled: data.right == null, side: "right", size: "fit", showSlider: "mouseover", renderCharacters: true, maxColumn: 80, scale: 1};
    const options = {wordWrap:this.wrapped?"on" as const:"off" as const,automaticLayout: true, readOnly: true, fontSize: design_baseline.editor_font_size, lineHeight: design_baseline.editor_line_height, fontFamily: design_baseline.editor_font_family, minimap, scrollbar: {verticalScrollbarSize: 8, horizontalScrollbarSize: 8}, scrollBeyondLastLine: false, contextmenu: false, theme: color[0] + color[1] + color[2] > 450 ? "vs-dark" : "vs", padding: {top: 8}, links: false, unicodeHighlight: {ambiguousCharacters: false}, ariaLabel: data.title};
    if (data.right != null) {
      const modified = model(data.right, "modified");
      // 历史比较两侧只读，不实例化需要可写模型的hunk操作菜单及其延迟context订阅。
      const editor = monaco.editor.createDiffEditor(this.body, {...options, diffWordWrap:this.wrapped?"on":"off", renderSideBySide: this.side_by_side, useInlineViewWhenSpaceIsLimited: this.inline_when_narrow, originalEditable: false, renderGutterMenu:false, ignoreTrimWhitespace: this.ignore_whitespace, hideUnchangedRegions:{enabled:this.collapsed}, experimental:{showMoves:this.show_moves}, diffAlgorithm: "advanced", renderIndicators: true, renderOverviewRuler: true, enableSplitViewResizing: true, maxComputationTime: 10000});
      // 双栏保留各自的窄滚动条，由 Monaco 同步纵向位置；中间仍可拖动分界线。
      // 最右侧使用 Monaco 原生差异概览：左半红色标记删除，右半绿色标记新增。
      // 概览的宽度、点击定位和视口框由上游管理，不额外显示全文缩略图。
      this.editor = editor; editor.setModel({original, modified});
      let revealed = false;
      this.subscriptions.push(editor.onDidUpdateDiff(() => {
        const changes = editor.getLineChanges(); this.status.textContent = changes ? text("diff.change_count", {count: changes.length}) : text("diff.incomplete");
        this.container.setAttribute("data-diff-ready", String(changes !== null));
        if(changes&&this.rendered_markdown)void this.render_markdown();
        if (!revealed && changes) { revealed = true; if(!this.restoring_navigation)editor.revealFirstDiff(); }
      }));
      this.toolbar.append(git_icon_button("arrow-up", text("diff.previous_change_button"), () => this.navigate("previous")), git_icon_button("arrow-down", text("diff.next_change_button"), () => this.navigate("next")));
      for (const view of [editor.getOriginalEditor(), editor.getModifiedEditor()]) this.bind_editor(view);
    } else { this.editor = monaco.editor.create(this.body, {...options, model: original}); this.status.textContent = text("diff.readonly_revision"); this.bind_editor(this.editor); }
    // Monaco 0.56 的全局 hover factory 会被最新编辑器的子容器覆盖。
    // 绑定到窗口级服务，关闭某个比较页后其余页的 F7/动作提示仍有有效的服务所有者。
    const hover_owner=StandaloneServices.get(IInstantiationService);
    setHoverDelegateFactory((placement,instant)=>hover_owner.createInstance(WorkbenchHoverDelegate,placement,{instantHover:instant},{}));
    this.toolbar.setAttribute("role","toolbar");this.toolbar.setAttribute("aria-label",text("diff.editor_actions"));
    if(data.right!=null&&is_markdown_file(data.file||data.title)){
      this.markdown_preview=create_git_markdown_diff();this.markdown_preview.container.hidden=true;this.container.append(this.markdown_preview.container);
      const preview=git_icon_button('preview','Markdown渲染对比 / 源码对比',()=>this.set_preferences({render_markdown:!this.rendered_markdown}));preview.dataset.diffAction='markdown_preview';this.toolbar.append(preview);
      this.markdown_preview.set_wrap(this.wrapped);this.set_markdown_mode(preferences.render_markdown);
    }
    const find=git_icon_button("search",text("diff.find"),()=>{this.set_markdown_mode(false);this.focused_editor().getAction("actions.find")?.run();});find.dataset.diffAction="find";
    if(data.right!=null){const whitespace=git_icon_button("whitespace",text("diff.ignore_whitespace"),()=>this.set_preferences({ignore_trim_whitespace:!this.ignore_whitespace}));whitespace.dataset.diffAction="ignore_whitespace";whitespace.setAttribute("aria-pressed",String(this.ignore_whitespace));this.toolbar.append(whitespace);}
    const more=git_icon_button("more",text("history.more"),()=>{const rect=more.getBoundingClientRect();this.title_menu(new MouseEvent("contextmenu",{clientX:rect.right,clientY:rect.bottom}));});more.dataset.diffAction="more";
    this.toolbar.append(find,more,this.status);
    this.release_presentation=observe_text_presentation(value=>this.apply_wrap(value.word_wrap));
    for(const name of ['wheel','pointerdown','keydown'])this.container.addEventListener(name,()=>{this.input_epoch++;this.pending_anchor=undefined;},{capture:true,passive:true});
    this.release_settings=watch_git_diff_preferences(value=>this.apply_preferences(value));
    this.observer = new ResizeObserver(() => this.editor.layout()); this.observer.observe(this.body);
    const diff_root=this.body.querySelector(".monaco-diff-editor");
    if(diff_root){this.mode_observer=new MutationObserver(()=>this.refresh_labels());this.mode_observer.observe(diff_root,{attributes:true,attributeFilter:["class"]});this.refresh_labels();}
    this.container.oncontextmenu = event => this.context_menu(event);
    this.container.addEventListener("keydown",event=>{
      if(this.disposed)return;
      const now=Date.now(),modifier=event.ctrlKey||event.metaKey;
      if(this.range_action&&modifier&&event.key.toLowerCase()==="k"&&!event.altKey&&!event.shiftKey){this.range_chord_until=now+2000;event.preventDefault();event.stopImmediatePropagation();return;}
      if(this.range_chord_until&&!["Control","Meta","Alt","Shift"].includes(event.key)){
        const pending=now<=this.range_chord_until;this.range_chord_until=0;
        if(pending&&modifier&&event.altKey&&!event.shiftKey&&["s","r"].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();void this.run_ranges(event.key.toLowerCase()==="s"?"stage":"revert");return;}
      }
      if(event.key==="F7"&&"accessibleDiffViewerNext" in this.editor){event.preventDefault();event.stopImmediatePropagation();if(this.rendered_markdown)this.navigate(event.shiftKey?"previous":"next");else this.accessible_diff(event.shiftKey);}
    },true);
    this.container.addEventListener("keydown", event => {
      // 源码编辑器自行处理查找、选择与复制，不能被提交图或 Markdown 快捷键拦截。
      event.stopPropagation();
    });
  }
  /** 右侧动作属于此编辑组，与标签共享一行；不使用跨组定位或负偏移。 */
  attach_toolbar(header:HTMLElement):void {
    this.detach_toolbar();this.toolbar.hidden=true;
    const mount=()=>{const strip=header.closest<HTMLElement>(".workspace-tab-strip");if(!strip||!header.isConnected)return;strip.append(this.toolbar);this.toolbar.hidden=false;this.toolbar_observer?.disconnect();this.toolbar_observer=undefined;};
    this.toolbar_observer=new MutationObserver(mount);this.toolbar_observer.observe(header.parentElement||document.body,{childList:true,subtree:true});mount();
  }
  detach_toolbar():void {this.toolbar_observer?.disconnect();this.toolbar_observer=undefined;this.toolbar.remove();}
  refresh_labels():void {
    const left=this.data.left_label||text("diff.original"),right=this.data.right_label||text("diff.modified");
    const inline=this.data.right!=null&&this.body.querySelector(".monaco-diff-editor")?.classList.contains("side-by-side")===false;
    this.labels.dataset.diffLayout=inline?"inline":"split";
    const path=el("div","git-editor-path"),file=this.data.file||this.data.title;
    const parts=file.replace(/\\/gu,"/").split("/").filter(Boolean);
    for(const [index,part] of parts.entries()){
      if(index)path.append(git_icon("chevron-right"));
      path.append(el("span","git-editor-path-segment",part));
    }
    path.title=this.data.right!=null?`${file} — ${left} ↔ ${right}`:`${file} — ${left}`;
    path.setAttribute("aria-label",path.title);this.labels.replaceChildren(path);
    if(this.data.right!=null){
      const mode=el("button","git-diff-mode",this.rendered_markdown?"Markdown渲染对比":text(inline?"diff.inline_view":"diff.side_by_side"));mode.type="button";mode.append(git_icon("chevron-down"));mode.title=text("diff.editor_mode");mode.setAttribute("aria-label",text("diff.editor_mode"));mode.setAttribute("aria-haspopup","menu");
      mode.onclick=()=>{const rect=mode.getBoundingClientRect();workspace_menu(new MouseEvent("contextmenu",{clientX:rect.left,clientY:rect.bottom}),this.view_entries());};this.labels.append(mode);
    }
  }
  accessible_diff(previous=false):void {this.set_markdown_mode(false);if("accessibleDiffViewerNext" in this.editor){if(previous)this.editor.accessibleDiffViewerPrev();else this.editor.accessibleDiffViewerNext();}}
  capture_content_anchor():markdown_view_anchor|undefined {
    if(this.rendered_markdown)return this.markdown_preview?.capture()||this.pending_anchor;
    const view=this.focused_editor(),range=view.getVisibleRanges()[0];if(!range)return;
    const line=range.startLineNumber,top=view.getTopForLineNumber(line),height=Math.max(1,view.getTopForLineNumber(line+1)-top);
    const box=view.getDomNode()!.getBoundingClientRect(),layout=view.getLayoutInfo(),hit=view.getTargetAtClientPoint(box.left+layout.contentLeft+2,box.top+2)?.position;
    const column=hit?.lineNumber===line?hit.column:range.startColumn;
    return {column,delta:view.getScrollTop()-view.getTopForPosition(line,column),side:'getOriginalEditor' in this.editor&&view===this.editor.getOriginalEditor()?'left':'right',line,fraction:Math.max(0,Math.min(.999999,(view.getScrollTop()-top)/height))};
  }
  restore_content_anchor(anchor:markdown_view_anchor){
    if(this.rendered_markdown){this.markdown_preview?.restore(anchor);return;}
    const view='getOriginalEditor' in this.editor?(anchor.side==='left'?this.editor.getOriginalEditor():this.editor.getModifiedEditor()):this.editor;
    const line=Math.min(anchor.line,view.getModel()?.getLineCount()||1),top=view.getTopForLineNumber(line),height=Math.max(1,view.getTopForLineNumber(line+1)-top);
    const column=Math.min(anchor.column??Math.max(1,Math.round((view.getModel()?.getLineMaxColumn(line)||1)*anchor.fraction)),view.getModel()?.getLineMaxColumn(line)||1);
    view.revealPosition({lineNumber:line,column});
    view.setScrollTop(anchor.column!==undefined?view.getTopForPosition(line,column)+(anchor.delta||0):top+height*anchor.fraction);this.last_focused_editor=view;
  }
  apply_wrap(value:boolean){
    if(this.wrapped===value)return;const anchor=this.capture_content_anchor();this.wrapped=value;
    this.editor.updateOptions({wordWrap:value?'on':'off',...('getOriginalEditor' in this.editor?{diffWordWrap:value?'on':'off'}:{})});this.editor.layout();
    this.markdown_preview?.set_wrap(value);if(anchor)this.restore_content_anchor(anchor);
  }
  async set_markdown_mode(value:boolean):Promise<void> {
    if(!this.markdown_preview||value===this.rendered_markdown)return;
    const anchor=this.capture_content_anchor();this.pending_anchor=anchor;
    this.rendered_markdown=value;this.body.hidden=value;this.markdown_preview.container.hidden=!value;
    this.container.dataset.markdownDiff=String(value);this.toolbar.querySelector('[data-diff-action="markdown_preview"]')?.setAttribute('aria-pressed',String(value));
    this.refresh_labels();
    if(value)await this.render_markdown();else{this.invalidate_markdown();this.editor.layout();if(anchor)this.restore_content_anchor(anchor);this.pending_anchor=undefined;}
  }
  /** 呈现方式及两侧编辑器位置归比较视图所有，导航服务只保存和交还快照。 */
  capture_navigation_state(){
    const view=this.focused_editor(),scroll=this.rendered_markdown?this.markdown_preview?.scroll:undefined;
    return {word_wrap:this.wrapped,content_anchor:this.capture_content_anchor(),rendered_markdown:this.rendered_markdown,view_state:this.editor.saveViewState(),
      original:'getOriginalEditor' in this.editor&&view===this.editor.getOriginalEditor(),
      scroll_top:scroll?.scrollTop??view.getScrollTop(),scroll_left:scroll?.scrollLeft??view.getScrollLeft(),
      cursor:this.rendered_markdown?null:view.getPosition()};
  }
  async restore_navigation_state(state:ReturnType<git_diff_editor['capture_navigation_state']>,signal:AbortSignal):Promise<boolean>{
    if(signal.aborted||this.disposed)return false;
    this.restoring_navigation=true;
    try{
    if(this.rendered_markdown!==state.rendered_markdown)await this.set_markdown_mode(state.rendered_markdown);
    const start=Date.now();
    while(('getLineChanges' in this.editor&&this.editor.getLineChanges()===null)||(this.rendered_markdown&&this.markdown_preview?.container.dataset.ready!=='true')){
      if(signal.aborted||this.disposed||Date.now()-start>15000)return false;
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    if(signal.aborted||this.disposed)return false;
    this.editor.layout();
    // Monaco的单编辑器与差异编辑器分别接受自己保存的状态。
    this.editor.restoreViewState(state.view_state as never);
    const scroll=this.rendered_markdown?this.markdown_preview?.scroll:undefined;
    if(scroll){scroll.scrollTop=state.scroll_top;scroll.scrollLeft=state.scroll_left;scroll.tabIndex=-1;scroll.focus({preventScroll:true});}
    else{const view='getOriginalEditor' in this.editor?(state.original?this.editor.getOriginalEditor():this.editor.getModifiedEditor()):this.editor;view.setScrollTop(state.scroll_top);view.setScrollLeft(state.scroll_left);view.focus();}
    if(state.content_anchor&&typeof state.word_wrap==='boolean'&&state.word_wrap!==this.wrapped)this.restore_content_anchor(state.content_anchor);
    return true;
    }finally{this.restoring_navigation=false;}
  }
  private markdown_render_key='';
  private markdown_render_task?:Promise<void>;
  private invalidate_markdown(){this.markdown_epoch++;this.markdown_render_key='';this.markdown_render_task=undefined;this.markdown_preview?.invalidate();}
  private async render_markdown():Promise<void>{
    if(!this.markdown_preview||!this.rendered_markdown||!('getLineChanges' in this.editor))return;
    const changes=this.editor.getLineChanges();if(changes===null){this.status.textContent=text('diff.calculating');return;}
    const key=JSON.stringify([this.models.map(model=>[model.id,model.getVersionId()]),this.data.left_label,this.data.right_label,changes.map(change=>[change.originalStartLineNumber,change.originalEndLineNumber,change.modifiedStartLineNumber,change.modifiedEndLineNumber])]);
    // Monaco延迟重算相同结果不应重建已显示的排版或暂时撤销位置映射。
    if(key===this.markdown_render_key){if(this.markdown_render_task)return this.markdown_render_task;if(this.markdown_preview.container.dataset.ready==='true')return;}
    this.markdown_render_key=key;
    const epoch=++this.markdown_epoch,input_epoch=this.input_epoch,anchor=this.pending_anchor||this.markdown_preview.capture();
    if(anchor)this.pending_anchor=anchor;
    const task=(async()=>{
      try{await this.markdown_preview!.render(this.models[0].getValue(),this.models[1].getValue(),changes,[this.data.left_label||text('diff.original'),this.data.right_label||text('diff.modified')]);if(!this.disposed&&epoch===this.markdown_epoch&&input_epoch===this.input_epoch&&anchor)this.restore_content_anchor(anchor);if(epoch===this.markdown_epoch)this.pending_anchor=undefined;}
      catch(error){if(!this.disposed&&epoch===this.markdown_epoch){this.set_markdown_mode(false);this.status.textContent=String(error instanceof Error?error.message:error);this.report_error?.(error);}}
    })();
    this.markdown_render_task=task;
    try{await task;}finally{if(this.markdown_render_task===task)this.markdown_render_task=undefined;}
  }

  set_side_by_side(value:boolean):void {this.set_preferences({render_side_by_side:value});}
  set_preferences(change:Partial<git_diff_preferences>):void {update_git_diff_preferences(change);}
  apply_preferences(value:git_diff_preferences):void {
    this.side_by_side=value.render_side_by_side;this.inline_when_narrow=value.inline_when_narrow;this.ignore_whitespace=value.ignore_trim_whitespace;this.collapsed=value.hide_unchanged;this.show_moves=value.show_moves;
    if("getModifiedEditor" in this.editor){const anchor=this.capture_content_anchor(),state=this.editor.saveViewState();this.editor.updateOptions({renderSideBySide:this.side_by_side,useInlineViewWhenSpaceIsLimited:this.inline_when_narrow,ignoreTrimWhitespace:this.ignore_whitespace,hideUnchangedRegions:{enabled:this.collapsed},experimental:{showMoves:this.show_moves}});this.editor.restoreViewState(state);if(anchor)this.restore_content_anchor(anchor);this.refresh_labels();}
    this.toolbar.querySelector('[data-diff-action="ignore_whitespace"]')?.setAttribute("aria-pressed",String(this.ignore_whitespace));
    if(this.markdown_preview&&this.rendered_markdown!==value.render_markdown)this.set_markdown_mode(value.render_markdown);
  }
  view_entries():workspace_menu_entry[] {
    const inline=this.body.querySelector(".monaco-diff-editor")?.classList.contains("side-by-side")===false;
    return [
      ...(this.markdown_preview?[{id:'diff_mode_markdown',title:'Markdown渲染对比',checked:this.rendered_markdown,action:()=>this.set_preferences({render_markdown:true})},{id:'diff_mode_source',title:'源码对比',checked:!this.rendered_markdown,action:()=>this.set_preferences({render_markdown:false})}]:[]),
      {id:"diff_mode_inline",title:text("diff.inline_view"),checked:!this.side_by_side,action:()=>this.set_preferences({render_side_by_side:false,render_markdown:false})},
      {id:"diff_mode_split",title:text("diff.side_by_side"),checked:this.side_by_side&&!this.inline_when_narrow,action:()=>this.set_preferences({render_side_by_side:true,inline_when_narrow:false,render_markdown:false})},
      {id:"diff_mode_auto",title:text(inline?"diff.automatic_inline":"diff.automatic_split"),checked:this.side_by_side&&this.inline_when_narrow,action:()=>this.set_preferences({render_side_by_side:true,inline_when_narrow:true,render_markdown:false})}
    ];
  }
  range_snapshot():diff_range_snapshot|undefined {
    if(this.disposed||this.rendered_markdown||!this.range_action||!this.range_available()||this.range_pending||!("getModifiedEditor" in this.editor))return;
    if(this.focused_editor()!==this.editor.getModifiedEditor())return;
    const model=this.editor.getModel(),changes=this.editor.getLineChanges(),selections=this.editor.getModifiedEditor().getSelections();
    if(!model||!changes?.length||!selections?.some(selection=>!selection.isEmpty()))return;
    return {original_text:model.original.getValue(),modified_text:model.modified.getValue(),line_changes:changes,selections};
  }
  async run_ranges(action:"stage"|"revert",snapshot=this.range_snapshot()):Promise<void> {
    if(this.disposed||this.rendered_markdown||!snapshot||!this.range_action||!this.range_available()||this.range_pending)return;
    this.range_pending=true;
    try{await this.range_action(action,snapshot);}
    catch(error){this.status.textContent=String(error instanceof Error?error.message:error);if(!this.disposed)this.report_error?.(error);}
    finally{this.range_pending=false;}
  }
  title_menu(event:MouseEvent):void {
    if(this.disposed)return;
    const entries:workspace_menu_entry[]=[];
    if("getModifiedEditor" in this.editor)entries.push(
      {id:"hide_unchanged",title:text("diff.hide_unchanged"),checked:this.collapsed,action:()=>this.set_preferences({hide_unchanged:!this.collapsed})},
      {id:"diff_view",title:text("diff.view"),separator:true,children:this.view_entries(),action:()=>{}},
      {id:"show_moves",title:text("diff.show_moves"),checked:this.show_moves,action:()=>this.set_preferences({show_moves:!this.show_moves})},
      {id:"ignore_whitespace",title:text("diff.ignore_whitespace"),checked:this.ignore_whitespace,action:()=>this.set_preferences({ignore_trim_whitespace:!this.ignore_whitespace})},
      {id:"accessible_diff",title:text("diff.accessible_diff"),shortcut:"F7",separator:true,action:()=>this.accessible_diff()});
    const file_entries=this.extra_menu().filter(entry=>["stage","unstage","open_file","refresh_diff","previous_file","next_file"].includes(entry.id||""));
    if(file_entries[0])file_entries[0]={...file_entries[0],separator:true};entries.push(...file_entries);
    if(this.range_action){const snapshot=this.range_snapshot();entries.push(
      {id:"stage_ranges",title:text("diff.stage_ranges"),shortcut:"Ctrl+K Ctrl+Alt+S",separator:true,disabled:!snapshot,action:()=>void this.run_ranges("stage",snapshot)},
      {id:"revert_ranges",title:text("diff.revert_ranges"),shortcut:"Ctrl+K Ctrl+Alt+R",disabled:!snapshot,action:()=>void this.run_ranges("revert",snapshot)});}
    entries.push({id:"word_wrap",title:text("diff.word_wrap"),checked:this.wrapped,action:()=>update_text_presentation(!this.wrapped)});
    entries.push(...this.title_entries());
    this.close_menu=workspace_menu(event,entries,"workspace-menu-compact git-diff-title-menu");
  }
  focused_editor(): monaco.editor.IStandaloneCodeEditor {
    if (!("getModifiedEditor" in this.editor)) return this.editor;
    // 模式切换和无障碍查看器退出后，以真实焦点归属修正Monaco尚未刷新的焦点缓存。
    for(const view of [this.editor.getOriginalEditor(),this.editor.getModifiedEditor()])if(view.getDomNode()?.contains(document.activeElement)){this.last_focused_editor=view;return view;}
    return this.last_focused_editor || (this.editor.getOriginalEditor().hasTextFocus() ? this.editor.getOriginalEditor() : this.editor.getModifiedEditor());
  }
  /** 历史文本只提供可核实的模型状态；Git 输出字符串不携带原文件编码。 */
  create_readonly_status(): HTMLElement {
    if(this.readonly_status)return this.readonly_status;
    const controls=el("div","workspace-editor-status-controls workspace-footer-group");this.readonly_status=controls;
    const side=el("span","workspace-file-detail"),location=el("span","workspace-file-location"),eol=el("span","workspace-file-detail"),language=el("span","workspace-file-detail"),readonly=el("span","workspace-file-detail",text("diff.readonly"));
    side.setAttribute("aria-label",text("diff.comparison_side"));eol.setAttribute("aria-label",text("diff.end_of_line"));language.setAttribute("aria-label",text("diff.language_mode"));
    for(const node of [side,location,eol,language,readonly])node.classList.add("workspace-footer-text");
    controls.append(side,location,eol,language,readonly);
    const refresh=()=>{
      const editor=this.focused_editor(),model=editor.getModel(),position=editor.getPosition();
      const original="getOriginalEditor" in this.editor && editor===this.editor.getOriginalEditor();
      side.textContent="getOriginalEditor" in this.editor?(original?text("diff.original"):text("diff.modified")):text("diff.historical_revision");
      side.title=original?this.data.left_label||text("diff.original"):this.data.right_label||this.data.left_label||text("diff.historical_revision");
      location.textContent=text("diff.cursor_position", {line: position?.lineNumber||1, column: position?.column||1});
      eol.textContent=model?.getEOL()==="\r\n"?"CRLF":"LF";language.textContent=model?.getLanguageId()||"plaintext";
    };
    const views="getOriginalEditor" in this.editor?[this.editor.getOriginalEditor(),this.editor.getModifiedEditor()]:[this.editor];
    for(const view of views)this.subscriptions.push(view.onDidFocusEditorText(refresh),view.onDidChangeCursorPosition(()=>{if(view===this.focused_editor())refresh();}),view.onDidChangeModelLanguage(refresh),view.onDidChangeModelContent(refresh));
    refresh();return controls;
  }
  sync_theme(): void {
    const color = getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number) || [0, 0, 0];
    monaco.editor.setTheme(color[0] + color[1] + color[2] > 450 ? "vs-dark" : "vs");
  }
  bind_editor(view: monaco.editor.IStandaloneCodeEditor): void {
    this.subscriptions.push(view.onDidFocusEditorText(()=>{this.last_focused_editor=view;}));
    // 右键不受正文是否先获焦影响；菜单作用于刚刚右击的这一侧。
    this.subscriptions.push(view.onContextMenu(event => { view.focus(); this.context_menu(event.event.browserEvent as MouseEvent); }));
    const root = view.getDomNode();
    let pending: {query: string; selection: monaco.Selection; x: number; y: number} | undefined;
    const lookup = (event: MouseEvent) => {
      pending = undefined;
      if (!event.isTrusted || event.button !== 0 || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const selection = view.getSelection(), model = view.getModel();
      const target = view.getTargetAtClientPoint(event.clientX, event.clientY)?.position;
      if (!selection || selection.isEmpty() || !model || !target || !selection.containsPosition(target)) return;
      const query = model.getValueInRange(selection); if (!query.trim()) return;
      // 在 Monaco 折叠选区之前捕获；只接管点在现有选区内的 Ctrl+左键。
      event.preventDefault(); event.stopImmediatePropagation();
      pending = {query, selection, x: event.clientX, y: event.clientY};
    };
    const click = (event: MouseEvent) => {
      const candidate = pending; pending = undefined;
      if (!candidate || !event.isTrusted || event.button !== 0 || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 5) return;
      event.preventDefault(); event.stopImmediatePropagation(); const {query, selection} = candidate;
      window.dispatchEvent(new CustomEvent("linux-note-search-selection", {detail: {query, source_path: this.data.file,
        line: selection.startLineNumber, column: selection.startColumn, end_line: selection.endLineNumber, end_column: selection.endColumn}}));
    };
    root?.addEventListener("mousedown", lookup, true);
    root?.addEventListener("click", click, true);
    this.subscriptions.push({dispose: () => {pending = undefined; root?.removeEventListener("mousedown", lookup, true); root?.removeEventListener("click", click, true);}});
  }
  navigate(direction: "next" | "previous"): void { if(this.rendered_markdown){this.markdown_preview?.navigate(direction);return;}if ("goToDiff" in this.editor) this.editor.goToDiff(direction); }
  update(data: diff_document): void {
    if (data.left.includes("\0") || data.right?.includes("\0")) throw new Error(text("diff.became_binary"));
    const replace_models = () => { if (this.models[0].getValue() !== data.left) this.models[0].setValue(data.left); if (data.right != null && this.models[1].getValue() !== data.right) this.models[1].setValue(data.right); };
    if ("getModifiedEditor" in this.editor) { const view_state = this.editor.saveViewState(); replace_models(); this.editor.restoreViewState(view_state); }
    else { const view_state = this.editor.saveViewState(); replace_models(); this.editor.restoreViewState(view_state); }
    this.data = data;this.refresh_labels();
    this.invalidate_markdown();
    if(this.rendered_markdown)void this.render_markdown();
  }
  context_menu(event: MouseEvent): void {
    if(this.rendered_markdown){this.title_menu(event);return;}
    const view = this.focused_editor();
    const entries: workspace_menu_entry[] = [
      {id: "copy", title: text("diff.copy"), action: () => void view.getAction("editor.action.clipboardCopyAction")?.run()},
      {id: "select_all", title: text("diff.select_all"), action: () => view.trigger("menu", "editor.action.selectAll", null)},
      {id: "find", title: text("diff.find_shortcut"), action: () => void view.getAction("actions.find")?.run()},
      {id: "word_wrap", title: text("diff.word_wrap"), checked: this.wrapped, separator: true, action: () => update_text_presentation(!this.wrapped)},
    ];
    if ("getModifiedEditor" in this.editor) {
      const editor = this.editor;
      entries.push({id: "previous_change", title: text("diff.previous_change"), action: () => editor.goToDiff("previous")}, {id: "next_change", title: text("diff.next_change"), action: () => editor.goToDiff("next")},
        {id: "side_by_side", title: text("diff.inline_view"), checked: !this.side_by_side, action: () => this.set_side_by_side(!this.side_by_side)},
        {id: "hide_unchanged", title: text("diff.hide_unchanged"), checked: this.collapsed, action: () => { this.set_preferences({hide_unchanged:!this.collapsed}); }},
        {id: "show_moves", title: text("diff.show_moves"), checked: this.show_moves, action: () => {this.set_preferences({show_moves:!this.show_moves});}},
        {id: "inline_when_narrow", title: text("diff.inline_when_narrow"), checked: this.inline_when_narrow, action: () => {this.set_preferences({inline_when_narrow:!this.inline_when_narrow});}},
        {id: "accessible_diff", title: text("diff.accessible_diff"), action:()=>this.accessible_diff()},
        {id: "ignore_whitespace", title: text("diff.ignore_whitespace"), checked: this.ignore_whitespace, action: () => { this.set_preferences({ignore_trim_whitespace:!this.ignore_whitespace}); }});
    }
    workspace_menu(event, [...entries, ...this.extra_menu()]);
  }
  dispose(): void { if(this.disposed)return;this.disposed=true;this.markdown_epoch++;this.markdown_preview?.dispose();this.range_action=undefined;this.range_available=()=>false;this.title_entries=()=>[];this.close_menu?.();this.release_settings?.();this.release_presentation?.();this.detach_toolbar();this.mode_observer?.disconnect();this.observer.disconnect(); this.subscriptions.forEach(item => item.dispose()); this.editor.dispose(); this.models.forEach(model => { const count = (model_users.get(model) || 1) - 1; if (count) model_users.set(model, count); else { model_users.delete(model); model.dispose(); } }); this.container.remove(); }
}
