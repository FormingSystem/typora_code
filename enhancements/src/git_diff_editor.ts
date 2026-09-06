import "monaco-editor/nls/lang/zh-cn";
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
import { graph_element as el, graph_button as button, graph_menu, type graph_menu_entry } from "./git_graph_widgets";

let initialized = false;
let serial = 0;
function initialize_editor(): void {
  if (initialized) return;
  const worker_url = URL.createObjectURL(new Blob([worker_source], {type: "text/javascript"}));
  (globalThis as unknown as {MonacoEnvironment: unknown}).MonacoEnvironment = {getWorker: () => new Worker(worker_url)};
  monaco.languages.register({id: "json", extensions: [".json", ".jsonc"]});
  monaco.languages.setTokensProvider("json", createTokenizationSupport(true));
  initialized = true;
}
export type diff_document = {title: string; file?: string; left: string; right?: string; left_label?: string; right_label?: string};
export class git_diff_editor {
  container = el("section", "git-graph-document"); toolbar = el("div", "git-diff-toolbar");
  body = el("div", "git-monaco-body"); status = el("span", "git-diff-count", "正在计算差异…");
  editor: monaco.editor.IStandaloneDiffEditor | monaco.editor.IStandaloneCodeEditor;
  models: monaco.editor.ITextModel[] = []; observer: ResizeObserver; subscriptions: monaco.IDisposable[] = [];
  side_by_side = true; wrapped = false; collapsed = false; ignore_whitespace = false;
  constructor(public data: diff_document, public extra_menu: () => graph_menu_entry[] = () => []) {
    if (data.left.includes("\0") || data.right?.includes("\0")) throw new Error("这是二进制文件，不能作为文本比较。请打开文件或查看 Git 文件状态。");
    initialize_editor(); this.container.setAttribute("data-linux-note-monaco-diff", "ready");
    this.container.append(this.toolbar);
    const labels = el("div", "git-diff-labels");
    labels.append(el("div", "", data.left_label || "原始版本"));
    if (data.right != null) labels.append(el("div", "", data.right_label || "修改版本"));
    this.container.append(labels, this.body);
    // 每个历史版本拥有独立模型；文件名只用于语言识别，不执行仓库中的任何代码。
    const model = (text: string, side: string) => {
      if (text.includes("\0")) throw new Error("这是二进制文件，不能作为文本比较。请打开文件或查看 Git 文件状态。");
      const uri = monaco.Uri.from({scheme: "linux-note-git", path: `/${++serial}/${side}/${data.file || data.title}`});
      const result = monaco.editor.createModel(text, undefined, uri); this.models.push(result); return result;
    };
    const original = model(data.left, "original");
    const color = getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number) || [0, 0, 0];
    const minimap: monaco.editor.IEditorMinimapOptions = {enabled: true, side: "right", size: "fit", showSlider: "mouseover", renderCharacters: true, maxColumn: 80, scale: 1};
    const options = {automaticLayout: true, readOnly: true, fontSize: 14, lineHeight: 22, fontFamily: "Consolas, ui-monospace, monospace", minimap, scrollbar: {verticalScrollbarSize: 8, horizontalScrollbarSize: 8}, scrollBeyondLastLine: false, contextmenu: false, theme: color[0] + color[1] + color[2] > 450 ? "vs-dark" : "vs", padding: {top: 8}, links: false, unicodeHighlight: {ambiguousCharacters: false}, ariaLabel: data.title};
    if (data.right != null) {
      const modified = model(data.right, "modified");
      const editor = monaco.editor.createDiffEditor(this.body, {...options, renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false, originalEditable: false, ignoreTrimWhitespace: false, diffAlgorithm: "advanced", renderIndicators: true, renderOverviewRuler: false, enableSplitViewResizing: true, maxComputationTime: 10000});
      // 双栏保留各自的窄滚动条，由 Monaco 同步纵向位置；中间仍可拖动分界线。
      // 关闭独立差异概览栏，释放其占用的 30px；修改侧以文档缩略图提供快速定位。
      const modified_view = editor.getModifiedEditor();
      // Monaco 的差异组件在更新任意选项时会关闭两侧缩略图；只为修改侧恢复文档地图。
      // 不接管滚轮、点击或拖动，沿用编辑器的定位与双栏滚动同步。
      this.subscriptions.push(modified_view.onDidChangeConfiguration(event => {
        if (event.hasChanged(monaco.editor.EditorOption.minimap) && !modified_view.getOption(monaco.editor.EditorOption.minimap).enabled) modified_view.updateOptions({minimap});
      }));
      modified_view.updateOptions({minimap});
      const minimap_changes = modified_view.createDecorationsCollection();
      this.editor = editor; editor.setModel({original, modified});
      let revealed = false;
      this.subscriptions.push(editor.onDidUpdateDiff(() => {
        const changes = editor.getLineChanges(); this.status.textContent = changes ? `${changes.length} 处改动` : "差异计算未完成";
        minimap_changes.set((changes || []).map(change => {
          const deleted = change.modifiedEndLineNumber === 0;
          const start = Math.max(1, Math.min(modified.getLineCount(), change.modifiedStartLineNumber));
          const end = deleted ? start : Math.max(start, change.modifiedEndLineNumber);
          return {range: new monaco.Range(start, 1, end, 1), options: {description: "git-diff-minimap", isWholeLine: true, minimap: {color: deleted ? "#c74e39" : change.originalEndLineNumber === 0 ? "#2e9d57" : "#3286c8", position: monaco.editor.MinimapPosition.Gutter}}};
        }));
        this.container.setAttribute("data-diff-ready", String(changes !== null));
        if (!revealed && changes) { revealed = true; editor.revealFirstDiff(); }
      }));
      this.toolbar.append(button("↑ 上一改动", () => editor.goToDiff("previous")), button("↓ 下一改动", () => editor.goToDiff("next")));
      for (const view of [editor.getOriginalEditor(), editor.getModifiedEditor()]) this.bind_editor(view);
    } else { this.editor = monaco.editor.create(this.body, {...options, model: original}); this.status.textContent = "只读版本"; this.bind_editor(this.editor); }
    this.toolbar.append(button("查找", () => this.focused_editor().getAction("actions.find")?.run()), button("…", () => {
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
    return this.editor.getOriginalEditor().hasTextFocus() ? this.editor.getOriginalEditor() : this.editor.getModifiedEditor();
  }
  bind_editor(view: monaco.editor.IStandaloneCodeEditor): void {
    // 右键不受正文是否先获焦影响；菜单作用于刚刚右击的这一侧。
    this.subscriptions.push(view.onContextMenu(event => { view.focus(); this.context_menu(event.event.browserEvent as MouseEvent); }));
  }
  navigate(direction: "next" | "previous"): void { if ("goToDiff" in this.editor) this.editor.goToDiff(direction); }
  update(data: diff_document): void {
    if (data.left.includes("\0") || data.right?.includes("\0")) throw new Error("此文件已变为二进制，无法刷新文本差异。请打开文件或查看 Git 文件状态。");
    const replace_models = () => { if (this.models[0].getValue() !== data.left) this.models[0].setValue(data.left); if (data.right != null && this.models[1].getValue() !== data.right) this.models[1].setValue(data.right); };
    if ("getModifiedEditor" in this.editor) { const view_state = this.editor.saveViewState(); replace_models(); this.editor.restoreViewState(view_state); }
    else { const view_state = this.editor.saveViewState(); replace_models(); this.editor.restoreViewState(view_state); }
    this.data = data;
  }
  context_menu(event: MouseEvent): void {
    const view = this.focused_editor();
    const entries: graph_menu_entry[] = [
      {id: "copy", title: "复制  Ctrl+C", action: () => void view.getAction("editor.action.clipboardCopyAction")?.run()},
      {id: "select_all", title: "全选  Ctrl+A", action: () => view.trigger("menu", "editor.action.selectAll", null)},
      {id: "find", title: "查找  Ctrl+F", action: () => void view.getAction("actions.find")?.run()},
      {id: "word_wrap", title: "自动换行", checked: this.wrapped, separator: true, action: () => { this.wrapped = !this.wrapped; this.editor.updateOptions({wordWrap: this.wrapped ? "on" : "off"}); }},
    ];
    if ("getModifiedEditor" in this.editor) {
      const editor = this.editor;
      entries.push({id: "previous_change", title: "上一处改动  Shift+F7", action: () => editor.goToDiff("previous")}, {id: "next_change", title: "下一处改动  F7", action: () => editor.goToDiff("next")},
        {id: "side_by_side", title: "并排比较", checked: this.side_by_side, action: () => { this.side_by_side = !this.side_by_side; editor.updateOptions({renderSideBySide: this.side_by_side}); }},
        {id: "hide_unchanged", title: "折叠未修改区域", checked: this.collapsed, action: () => { this.collapsed = !this.collapsed; editor.updateOptions({hideUnchangedRegions: {enabled: this.collapsed}}); }},
        {id: "ignore_whitespace", title: "忽略行首尾空白", checked: this.ignore_whitespace, action: () => { this.ignore_whitespace = !this.ignore_whitespace; editor.updateOptions({ignoreTrimWhitespace: this.ignore_whitespace}); }});
    }
    graph_menu(event, [...entries, ...this.extra_menu()]);
  }
  dispose(): void { this.observer.disconnect(); this.subscriptions.forEach(item => item.dispose()); this.editor.dispose(); this.models.forEach(item => item.dispose()); this.container.remove(); }
}
