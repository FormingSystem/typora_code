import "./monaco_locale";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/editor/browser/coreCommands";
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
import { workspace_element as el, workspace_button as button, workspace_menu, type workspace_menu_entry } from "./workspace_widgets";
import { detect_file_language } from "./file_language";
import { register_file_languages } from "./workspace_languages";
import { git_graph_text as text } from "./git_graph_i18n";

let initialized = false;
let serial = 0;
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
export class git_diff_editor {
  container = el("section", "git-graph-document"); toolbar = el("div", "git-diff-toolbar");
  body = el("div", "git-monaco-body"); status = el("span", "git-diff-count", text("diff.calculating"));
  editor: monaco.editor.IStandaloneDiffEditor | monaco.editor.IStandaloneCodeEditor;
  models: monaco.editor.ITextModel[] = []; observer: ResizeObserver; subscriptions: monaco.IDisposable[] = [];
  side_by_side = true; wrapped = false; collapsed = false; ignore_whitespace = false;
  last_focused_editor?: monaco.editor.IStandaloneCodeEditor;
  readonly_status?: HTMLElement;
  constructor(public data: diff_document, public extra_menu: () => workspace_menu_entry[] = () => []) {
    if (data.left.includes("\0") || data.right?.includes("\0")) throw new Error(text("diff.binary_file"));
    initialize_editor(); this.container.setAttribute("data-linux-note-monaco-diff", "ready");
    this.container.append(this.toolbar);
    const labels = el("div", "git-diff-labels");
    labels.append(el("div", "", data.left_label || text("diff.original")));
    if (data.right != null) labels.append(el("div", "", data.right_label || text("diff.modified")));
    this.container.append(labels, this.body);
    // 每个历史版本拥有独立模型；文件名只用于语言识别，不执行仓库中的任何代码。
    const model = (source: string, side: string) => {
      if (source.includes("\0")) throw new Error(text("diff.binary_file"));
      const uri = monaco.Uri.from({scheme: "linux-note-git", path: `/${++serial}/${side}/${data.file || data.title}`});
      const language = detect_file_language(data.file || data.title, source.split(/\r?\n/u, 1)[0]);
      const result = monaco.editor.createModel(source, language, uri); this.models.push(result); return result;
    };
    const original = model(data.left, "original");
    const color = getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number) || [0, 0, 0];
    // 普通单文件保留全文缩略图；Git 差异只显示原生红绿改动概览。
    const minimap: monaco.editor.IEditorMinimapOptions = {enabled: data.right == null, side: "right", size: "fit", showSlider: "mouseover", renderCharacters: true, maxColumn: 80, scale: 1};
    const options = {automaticLayout: true, readOnly: true, fontSize: 14, lineHeight: 22, fontFamily: "Consolas, ui-monospace, monospace", minimap, scrollbar: {verticalScrollbarSize: 8, horizontalScrollbarSize: 8}, scrollBeyondLastLine: false, contextmenu: false, theme: color[0] + color[1] + color[2] > 450 ? "vs-dark" : "vs", padding: {top: 8}, links: false, unicodeHighlight: {ambiguousCharacters: false}, ariaLabel: data.title};
    if (data.right != null) {
      const modified = model(data.right, "modified");
      const editor = monaco.editor.createDiffEditor(this.body, {...options, renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false, originalEditable: false, ignoreTrimWhitespace: false, diffAlgorithm: "advanced", renderIndicators: true, renderOverviewRuler: true, enableSplitViewResizing: true, maxComputationTime: 10000});
      // 双栏保留各自的窄滚动条，由 Monaco 同步纵向位置；中间仍可拖动分界线。
      // 最右侧使用 Monaco 原生差异概览：左半红色标记删除，右半绿色标记新增。
      // 概览的宽度、点击定位和视口框由上游管理，不额外显示全文缩略图。
      this.editor = editor; editor.setModel({original, modified});
      let revealed = false;
      this.subscriptions.push(editor.onDidUpdateDiff(() => {
        const changes = editor.getLineChanges(); this.status.textContent = changes ? text("diff.change_count", {count: changes.length}) : text("diff.incomplete");
        this.container.setAttribute("data-diff-ready", String(changes !== null));
        if (!revealed && changes) { revealed = true; editor.revealFirstDiff(); }
      }));
      this.toolbar.append(button(text("diff.previous_change_button"), () => editor.goToDiff("previous")), button(text("diff.next_change_button"), () => editor.goToDiff("next")));
      for (const view of [editor.getOriginalEditor(), editor.getModifiedEditor()]) this.bind_editor(view);
    } else { this.editor = monaco.editor.create(this.body, {...options, model: original}); this.status.textContent = text("diff.readonly_revision"); this.bind_editor(this.editor); }
    this.toolbar.append(button(text("diff.find"), () => this.focused_editor().getAction("actions.find")?.run()), button("…", () => {
      const rect = this.toolbar.getBoundingClientRect(); this.context_menu(new MouseEvent("contextmenu", {clientX: rect.right - 250, clientY: rect.bottom}));
    }), this.status);
    this.observer = new ResizeObserver(() => this.editor.layout()); this.observer.observe(this.body);
    this.container.oncontextmenu = event => this.context_menu(event);
    this.container.addEventListener("keydown", event => {
      // 源码编辑器自行处理查找、选择与复制，不能被提交图或 Markdown 快捷键拦截。
      if (event.key === "F7") { event.preventDefault(); this.navigate(event.shiftKey ? "previous" : "next"); }
      event.stopPropagation();
    });
  }
  focused_editor(): monaco.editor.IStandaloneCodeEditor {
    if (!("getModifiedEditor" in this.editor)) return this.editor;
    return this.last_focused_editor || (this.editor.getOriginalEditor().hasTextFocus() ? this.editor.getOriginalEditor() : this.editor.getModifiedEditor());
  }
  /** 历史文本只提供可核实的模型状态；Git 输出字符串不携带原文件编码。 */
  create_readonly_status(): HTMLElement {
    if(this.readonly_status)return this.readonly_status;
    const controls=el("div","workspace-editor-status-controls");this.readonly_status=controls;
    const side=el("span","workspace-file-detail"),location=el("span","workspace-file-location"),eol=el("span","workspace-file-detail"),language=el("span","workspace-file-detail"),readonly=el("span","workspace-file-detail",text("diff.readonly"));
    side.setAttribute("aria-label",text("diff.comparison_side"));eol.setAttribute("aria-label",text("diff.end_of_line"));language.setAttribute("aria-label",text("diff.language_mode"));
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
  navigate(direction: "next" | "previous"): void { if ("goToDiff" in this.editor) this.editor.goToDiff(direction); }
  update(data: diff_document): void {
    if (data.left.includes("\0") || data.right?.includes("\0")) throw new Error(text("diff.became_binary"));
    const replace_models = () => { if (this.models[0].getValue() !== data.left) this.models[0].setValue(data.left); if (data.right != null && this.models[1].getValue() !== data.right) this.models[1].setValue(data.right); };
    if ("getModifiedEditor" in this.editor) { const view_state = this.editor.saveViewState(); replace_models(); this.editor.restoreViewState(view_state); }
    else { const view_state = this.editor.saveViewState(); replace_models(); this.editor.restoreViewState(view_state); }
    this.data = data;
  }
  context_menu(event: MouseEvent): void {
    const view = this.focused_editor();
    const entries: workspace_menu_entry[] = [
      {id: "copy", title: text("diff.copy"), action: () => void view.getAction("editor.action.clipboardCopyAction")?.run()},
      {id: "select_all", title: text("diff.select_all"), action: () => view.trigger("menu", "editor.action.selectAll", null)},
      {id: "find", title: text("diff.find_shortcut"), action: () => void view.getAction("actions.find")?.run()},
      {id: "word_wrap", title: text("diff.word_wrap"), checked: this.wrapped, separator: true, action: () => { this.wrapped = !this.wrapped; this.editor.updateOptions({wordWrap: this.wrapped ? "on" : "off"}); }},
    ];
    if ("getModifiedEditor" in this.editor) {
      const editor = this.editor;
      entries.push({id: "previous_change", title: text("diff.previous_change"), action: () => editor.goToDiff("previous")}, {id: "next_change", title: text("diff.next_change"), action: () => editor.goToDiff("next")},
        {id: "side_by_side", title: text("diff.side_by_side"), checked: this.side_by_side, action: () => { this.side_by_side = !this.side_by_side; editor.updateOptions({renderSideBySide: this.side_by_side}); }},
        {id: "hide_unchanged", title: text("diff.hide_unchanged"), checked: this.collapsed, action: () => { this.collapsed = !this.collapsed; editor.updateOptions({hideUnchangedRegions: {enabled: this.collapsed}}); }},
        {id: "ignore_whitespace", title: text("diff.ignore_whitespace"), checked: this.ignore_whitespace, action: () => { this.ignore_whitespace = !this.ignore_whitespace; editor.updateOptions({ignoreTrimWhitespace: this.ignore_whitespace}); }});
    }
    workspace_menu(event, [...entries, ...this.extra_menu()]);
  }
  dispose(): void { this.observer.disconnect(); this.subscriptions.forEach(item => item.dispose()); this.editor.dispose(); this.models.forEach(item => item.dispose()); this.container.remove(); }
}
