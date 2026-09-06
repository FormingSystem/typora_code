import type { graph_core, graph_leaf } from "./git_graph_host";
import { git_diff_editor } from "./git_diff_editor";
import { graph_element as el, graph_button as button, graph_menu } from "./git_graph_widgets";
import { decode_file_bytes, detect_binary_bytes, detect_file_language, is_markdown_file } from "./file_language";
import files_css from "./workspace_files.css";

export type file_location = {line?: number; column?: number; end_line?: number; end_column?: number; source?: boolean};
export type workspace_file_host = ReturnType<typeof bind_workspace_files>;
const FILE_VIEW = "linux_note.source_file";
let active_host: workspace_file_host | undefined;
export function get_workspace_files(): workspace_file_host | undefined { return active_host; }

/** Markdown 保留原生编辑面；其他文本与搜索定位使用有行号和语言识别的源码标签。 */
export function bind_workspace_files(core: graph_core) {
  const runtime = window as unknown as {reqnode(name: string): any; File?: any};
  const fs = runtime.reqnode("fs"); const path_api = runtime.reqnode("path"); const shell = runtime.reqnode("electron").shell;
  const native_open = core.app.openFile.bind(core.app);
  const style = el("style"); style.textContent = files_css; document.head.append(style);
  const group_locations = new Map<string, file_location>();
  const views = new Set<source_file_view>();
  const real_path = (leaf: graph_leaf | null): string => {
    if (!leaf) return "";
    if (path_api.isAbsolute(leaf.state.path)) return leaf.state.path;
    if (leaf.state.path.startsWith(`typ://${FILE_VIEW}/`)) return decodeURIComponent(leaf.state.path.slice(`typ://${FILE_VIEW}/`.length));
    return "";
  };
  const context_root = () => runtime.File?.getMountFolder?.() || core.app.workspace.activeLeaf?.state.git_cwd || path_api.dirname(real_path(core.app.workspace.activeLeaf) || core.app.workspace.activeFile || "");
  class source_file_view extends core.WorkspaceView {
    containerEl = el("section", "linux-note-source-file"); icon = "fa-file-code-o";
    editor?: git_diff_editor; file_path: string; loaded = false; loading = false; disposed=false; target?:file_location;
    toolbar = el("div", "workspace-file-toolbar"); status = el("span", "workspace-file-status"); body = el("div", "workspace-file-body");
    constructor(leaf: graph_leaf) {
      super(leaf); this.file_path = real_path(leaf); leaf.state.git_cwd = path_api.dirname(this.file_path); views.add(this);
      this.target=group_locations.get(leaf.state.path);group_locations.delete(leaf.state.path);
      this.toolbar.append(button("重新加载", () => void this.load()), button("在文件夹中显示", () => shell.showItemInFolder(this.file_path)), this.status);
      if (is_markdown_file(this.file_path)) this.toolbar.prepend(button("打开 Markdown 渲染", () => native_open(this.file_path)));
      this.containerEl.append(this.toolbar, this.body);
    }
    onOpen() {
      for (const tab of document.querySelectorAll<HTMLElement>(".typ-tab[data-id]")) if (tab.dataset.id === this.leaf.state.path) {
        const label = tab.querySelector(".typ-file-basename"); if (label) label.textContent = path_api.basename(this.file_path);
        tab.querySelector(".typ-file-ext")?.remove(); tab.title = this.file_path;
      }
      if (!this.loaded && !this.loading) void this.load(); else this.reveal();
    }
    async load() {
      if (this.loading||this.disposed) return; this.loading = true; this.status.textContent = "正在读取…";
      try {
        const stat = await fs.promises.stat(this.file_path);
        if(this.disposed)return;
        if (!stat.isFile()) throw new Error("该项目不是普通文件，请在目录中展开文件夹。");
        if (stat.size > 16 * 1024 * 1024) throw new Error("文件超过 16 MiB，已保留目录项目；请使用系统程序打开。");
        const bytes = await fs.promises.readFile(this.file_path);
        if(this.disposed)return;
        if (detect_binary_bytes(bytes)) throw new Error("这是二进制文件，不能按文本显示；可使用系统程序打开。");
        const decoded = decode_file_bytes(bytes);
        const data = {title: path_api.basename(this.file_path), file: this.file_path, left: decoded.text, left_label: this.file_path};
        if (this.editor) this.editor.update(data);
        else { this.editor = new git_diff_editor(data); this.body.replaceChildren(this.editor.container); }
        this.status.textContent = `${detect_file_language(this.file_path, decoded.text.split(/\r?\n/u, 1)[0])} · ${decoded.encoding} · 只读`;
        this.loaded = true; this.reveal();
      } catch (error) {
        if(this.disposed)return;
        this.status.textContent = "无法作为文本预览";
        if (!this.editor) this.body.replaceChildren(el("p", "workspace-file-notice", String(error)), button("使用系统程序打开", () => void shell.openPath(this.file_path)));
        else this.status.textContent = String(error);
      } finally { this.loading = false; }
    }
    reveal() {
      if(this.disposed)return;this.editor?.editor.layout();
      const target = this.target; if (!target || !this.editor) return;
      const editor = this.editor.focused_editor(); const model = editor.getModel(); if (!model) return;
      const line = Math.max(1, Math.min(model.getLineCount(), target.line || 1));
      editor.setSelection({startLineNumber: line, startColumn: target.column || 1, endLineNumber: target.end_line || line, endColumn: target.end_column || target.column || 1});
      editor.revealLineInCenter(line); editor.focus(); this.target=undefined;
    }
    onClose() { setTimeout(() => { let present = false; core.app.workspace.eachLeaves(leaf => { if (leaf === this.leaf) present = true; }); if (!present) { this.disposed=true;this.editor?.dispose(); views.delete(this); } }, 0); }
  }
  core.app.viewManager.registerView(FILE_VIEW, leaf => new source_file_view(leaf));
  const open_file = async (file_path: string, location: file_location = {}, group = "active") => {
    file_path = path_api.resolve(file_path);
    if (is_markdown_file(file_path) && !location.source && location.line == null) {
      if (group === "active") native_open(file_path);
      else core.app.commands.run(group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [file_path]);
      return;
    }
    const uri = `typ://${FILE_VIEW}/${encodeURIComponent(file_path)}`;
    let existing: graph_leaf | undefined;
    core.app.workspace.eachLeaves(leaf => { if (leaf.state.path === uri) existing = leaf; });
    if (existing && group === "active") { const view=existing.view as source_file_view;if(location.line!=null)view.target=location;core.app.workspace.activeLeaf = existing.parent.toggleTab(uri);view.reveal();return; }
    if (group !== "active") { if(location.line!=null)group_locations.set(uri,location);core.app.commands.run(group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [uri]); return; }
    const parent = core.app.workspace.activeLeaf?.parent; if (!parent) throw new Error("当前没有可用的编辑器组。");
    const leaf = core.app.workspace.createLeaf({type: FILE_VIEW, state: {path: uri, git_cwd: path_api.dirname(file_path)}});
    if(location.line!=null)(leaf.view as source_file_view).target=location;
    parent.appendChild(leaf); core.app.workspace.activeLeaf = leaf;
  };
  // 社区核心默认把不支持的文件送到外部程序；所有应用内打开入口统一分流。
  const markdown_target=(target:string)=>is_markdown_file(target)||is_markdown_file(target.split("#",1)[0]);
  core.app.openFile = (target: string) => {
    if (!target.startsWith("typ://") && !markdown_target(target)) return open_file(path_api.isAbsolute(target) ? target : path_api.resolve(context_root(), target));
    return native_open(target);
  };
  const library = runtime.File?.editor?.library;
  if (library?.openFile) {
    const open = library.openFile;
    library.openFile = function (target: string, ...args: unknown[]) {
      if (typeof target === "string" && !target.startsWith("typ://") && !markdown_target(target)) return open_file(target);
      return open.call(this, target, ...args);
    };
  }
  const copy = (text: string) => runtime.reqnode("electron").clipboard.writeText(text);
  const file_menu = (event: MouseEvent, file_path: string) => graph_menu(event, [
    {title: "打开文件", action: () => void open_file(file_path)},
    {title: "在右侧打开", action: () => void open_file(file_path, {}, "right")},
    {title: "复制路径", action: () => copy(file_path)},
    {title: "复制相对路径", action: () => copy(path_api.relative(context_root(), file_path))},
    {title: "在文件夹中显示", action: () => shell.showItemInFolder(file_path)}
  ]);
  document.documentElement.setAttribute("data-linux-note-workspace-files", "ready");
  const host = {fs, path_api, core, open_file, context_root, file_menu, copy,
    current_file: () => real_path(core.app.workspace.activeLeaf),
    can_write: (file_path: string) => !runtime.File?.changeCounter?.isDocumentEdited() || runtime.File?.bundle?.filePath !== file_path,
    refresh_files: (paths: string[]) => { for (const view of views) if (paths.includes(view.file_path)) void view.load(); }
  }; active_host=host; return host;
}
