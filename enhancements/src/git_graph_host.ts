import { bind_terminal_workspace } from "./terminal_workspace";
import { git_diff_editor, type diff_document } from "./git_diff_editor";
import { append_git_ignore } from "./git_ignore";
import { create_git_runner } from "./git_graph_runtime";
import { EMPTY, INDEX, WORKTREE, require_revision } from "./git_graph_repository";
import { graph_button, graph_dialog, graph_element, type graph_menu_entry } from "./git_graph_widgets";
import type { graph_settings } from "./git_graph_settings";
import { git_icon } from "./git_icons";
import { get_workspace_files } from "./workspace_files";

export type graph_leaf = { state: { path: string; git_cwd?: string }; view: { containerEl: HTMLElement }; containerEl: HTMLElement;
  parent: { appendChild(leaf: graph_leaf): void; toggleTab(path: string): graph_leaf } };
type sidebar_panel = {containerEl: HTMLElement; ribbonButton?: unknown; addRibbonButton(button: {id: string; title: string; icon: HTMLElement; group?: string}): void};
export type graph_core = {
  SidebarPanel: new () => sidebar_panel;
  WorkspaceView: new (leaf: graph_leaf) => { containerEl: HTMLElement; icon: string; leaf: graph_leaf };
  app: {
    openFile(path: string): unknown;
    viewManager: { registerView(type: string, factory: (leaf: graph_leaf) => unknown): void };
    commands: { register(command: { id: string; title: string; scope: string; callback(): void }): void; run(id: string, args?: unknown[]): void };
    workspace: { sidebar: {addPanel(panel: sidebar_panel): unknown; switch(panel: new () => sidebar_panel): void; show(): void; hide(): void; toggle(): void; isShown: boolean}; activeLeaf: graph_leaf | null; activeFile: string; eachLeaves(callback: (leaf: graph_leaf) => void): void;
      createLeaf(state: { type: string; state: graph_leaf["state"] }): graph_leaf;
      on(event: string, callback: (context: any) => void): void;
      ribbon: { addButton(button: { id: string; title: string; group: string; icon: HTMLElement; onclick(): void }): void };
    };
  };
};
type native_file = { getMountFolder?(): string; bundle?: { filePath?: string }; changeCounter?: { isDocumentEdited(): boolean } };
export function create_graph_host(core: graph_core) {
  const runtime = window as unknown as { reqnode(name: string): any; File?: native_file; JSBridge: { invoke(command: string, ...args: unknown[]): Promise<unknown> }; _options: { userDataPath: string } };
  const fs = runtime.reqnode("fs"); const path_api = runtime.reqnode("path"); const process_api = runtime.reqnode("process");
  const child_process = runtime.reqnode("child_process"); const crypto = runtime.reqnode("crypto");
  type document_options = {root?: string; key?: string; menu?: () => graph_menu_entry[]; refresh?: () => void; adjacent?: (direction: number) => void};
  const contents = new Map<string, {data?: diff_document; panel?: HTMLElement; options: document_options}>();
  const cache_path = path_api.join(runtime._options.userDataPath, "linux_note_enhancements", "git_graph", "avatars");
  let serial = 0;
  const output_lines = new Map<string, string[]>();
  const redact = (text: string) => text.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gu, "$1***@").replace(/([?&](?:access_token|token|password)=)[^&\s]+/giu, "$1***");
  const ensure_file_path = (root: string, file: string) => {
    const absolute = path_api.resolve(root, file); const relative = path_api.relative(root, absolute);
    if (path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) throw new Error("文件路径超出仓库。");
    return absolute;
  };
  const add_tab = (type: string, uri: string, group: string) => {
    if (group !== "active") { core.app.commands.run(group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [uri]); return; }
    const parent = core.app.workspace.activeLeaf?.parent; if (!parent) return;
    const leaf = core.app.workspace.createLeaf({ type, state: { path: uri } }); parent.appendChild(leaf); core.app.workspace.activeLeaf = leaf;
  };
  class graph_document_view extends core.WorkspaceView {
    containerEl = graph_element("section", "git-graph-document"); icon = "fa-code-fork";
    editor?: git_diff_editor; document?: typeof contents extends Map<string, infer value> ? value : never;
    constructor(leaf: graph_leaf) { super(leaf); try { leaf.state.git_cwd ||= decodeURIComponent(leaf.state.path.split("/")[3]); } catch { /* 无效 URI 由打开入口处理。 */ } }
    onOpen() {
      const payload = contents.get(this.leaf.state.path);
      // 核心把 URI 作为 HTML 标签名插入；URI 保持编码，显示名单独通过 textContent 写入。
      for (const tab of document.querySelectorAll<HTMLElement>(".typ-tab[data-id]")) if (tab.getAttribute("data-id") === this.leaf.state.path) {
        const icon = tab.querySelector(".typ-file-icon"); if (icon) { icon.className = "typ-file-icon git-tab-icon"; icon.replaceChildren(git_icon("compare-changes")); }
        const title = payload?.data?.title || decodeURIComponent(this.leaf.state.path.split("/").at(-1)!);
        const label = tab.querySelector(".typ-file-basename"); if (label) label.textContent = title;
        tab.querySelector(".typ-file-ext")?.remove(); tab.title = title;
      }
      if (!payload) { this.containerEl.textContent = "此临时历史视图已释放，请从提交图重新打开。"; return; }
      if (payload === this.document) { this.editor?.editor.layout(); return; }
      if (this.editor && payload.data && this.document?.data) {
        try { this.editor.update(payload.data); this.document = payload; }
        catch (error) { this.editor.status.textContent = String(error); }
        return;
      }
      this.document = payload; this.containerEl.replaceChildren();
      if (payload.panel) { this.containerEl.append(payload.panel); return; }
      try {
        this.editor = new git_diff_editor(payload.data!, payload.options.menu);
        if (payload.options.refresh) this.editor.toolbar.prepend(graph_button("刷新差异", payload.options.refresh));
        if (payload.options.adjacent) this.editor.toolbar.prepend(graph_button("上一文件", () => payload.options.adjacent!(-1)), graph_button("下一文件", () => payload.options.adjacent!(1)));
        this.editor.toolbar.append(graph_button("切换侧栏", () => core.app.workspace.sidebar.toggle()));
        this.containerEl.append(this.editor.container);
      } catch (error) { this.containerEl.append(graph_element("p", "git-scm-empty", String(error))); }
    }
    onClose() {
      setTimeout(() => { let payload_exists = false; let view_exists = false; core.app.workspace.eachLeaves(leaf => { if (leaf.state.path === this.leaf.state.path) payload_exists = true; if (leaf === this.leaf) view_exists = true; }); if (!view_exists) this.editor?.dispose(); if (!payload_exists) contents.delete(this.leaf.state.path); }, 0);
    }
  }
  core.app.viewManager.registerView("linux_note.git_document", leaf => new graph_document_view(leaf));
  let terminal_workspace: ReturnType<typeof bind_terminal_workspace>;
  const host = {
    core, fs, path_api, process_api,
    ignore_file(root: string, file: string, settings: graph_settings) { return append_git_ignore({fs, path_api}, this.runner(settings).run, root, file); },
    show_history: (_root: string) => {},
    runner(settings: graph_settings, writable = false) {
      const runner = create_git_runner({ child_process, process: process_api }, { executable: settings.git_path, writable });
      const run: typeof runner.run = async (root, args, execution) => {
        const record = (text: string) => { const lines = output_lines.get(root) || []; lines.push(redact(text)); output_lines.set(root, lines.slice(-100)); };
        const start = Date.now(); record(new Date().toLocaleTimeString() + " > git " + args.map(arg => JSON.stringify(arg)).join(" "));
        try { const result = await runner.run(root, args, execution); record(`完成 · ${Date.now() - start} ms` + (writable ? "\n" + result.slice(0, 12000) : "")); return result; }
        catch (error) { record(String(error)); throw error; }
      };
      return {...runner, run};
    },
    show_output(root: string) {
      const view = graph_element("div", "git-output"); const text = graph_element("pre");
      const refresh = () => { text.textContent = (output_lines.get(root) || ["暂无 Git 输出。"]).join("\n"); text.scrollTop = text.scrollHeight; };
      view.append(graph_button("刷新输出", refresh), text); refresh(); this.open_panel("Git 输出", "git_output", root, view);
    },
    context_path(use_active = true): string {
      const active = core.app.workspace.activeLeaf;
      return use_active && active?.state.path && path_api.isAbsolute(active.state.path) ? path_api.dirname(active.state.path)
        : active?.state.git_cwd || runtime.File?.getMountFolder?.() || (core.app.workspace.activeFile ? path_api.dirname(core.app.workspace.activeFile) : "");
    },
    can_change_files() { return !runtime.File?.changeCounter?.isDocumentEdited(); },
    async trash_files(root: string, files: string[]): Promise<void> {
      const shell = runtime.reqnode("electron").shell;
      if (typeof shell.trashItem !== "function") throw new Error("当前 Typora 无法将文件移至回收站，未删除文件。");
      const real_root = await fs.promises.realpath(root);
      const targets: string[] = [];
      for (const file of files) {
        const target = ensure_file_path(root, file);
        const parent = await fs.promises.realpath(path_api.dirname(target));
        const relative = path_api.relative(real_root, parent);
        if (path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) throw new Error("文件的实际目录超出仓库，已停止回收：" + file);
        const stat = await fs.promises.lstat(target);
        if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error("只支持回收明确选择的文件：" + file);
        targets.push(target);
      }
      for (let index = 0; index < targets.length; index++) {
        try { await shell.trashItem(targets[index]); }
        catch (error) { throw new Error(`已回收 ${index} 个文件；无法回收 ${files[index]}，其余文件保留：${String(error)}`); }
      }
    },
    operation(git_dir: string): string {
      for (const [file, operation] of [["rebase-merge", "rebase"], ["rebase-apply", "rebase"], ["MERGE_HEAD", "merge"], ["CHERRY_PICK_HEAD", "cherry-pick"], ["REVERT_HEAD", "revert"]]) if (fs.existsSync(path_api.join(git_dir, file))) return operation;
      return "";
    },
    copy(text: string) { return runtime.JSBridge.invoke("clipboard.write", JSON.stringify({ text })); },
    open_url(url: string) {
      const parsed = new URL(url); if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("只允许打开 HTTP 或 HTTPS 链接。");
      return runtime.reqnode("electron").shell.openExternal(parsed.href);
    },
    async open_file(root: string, file: string, settings: graph_settings) {
      const target = ensure_file_path(root, file);
      if (!fs.existsSync(target)) throw new Error("当前工作区已没有此文件，可查看历史版本。");
      const file_host = get_workspace_files();
      if (file_host) { await file_host.open_file(target, {}, settings.new_tab_group); return; }
      if (/\.(md|markdown)$/iu.test(target)) {
        if (settings.new_tab_group === "active") core.app.openFile(target);
        else core.app.commands.run(settings.new_tab_group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [target]);
      } else {
        const text = await this.revision_text(root, WORKTREE, file, settings); this.open_document({title: file, file, left: text}, settings.new_tab_group, {root});
      }
    },
    file_path: ensure_file_path,
    reveal_file(root: string, file: string) { runtime.reqnode("electron").shell.showItemInFolder(ensure_file_path(root, file)); },
    async revision_text(root: string, revision: string, file: string, settings: graph_settings): Promise<string> {
      if (revision === EMPTY) return "";
      if (revision === WORKTREE) {
        const target = ensure_file_path(root, file);
        if (!fs.existsSync(target)) return "";
        const stat = await fs.promises.lstat(target);
        if (stat.isSymbolicLink()) return fs.promises.readlink(target);
        if (!stat.isFile()) throw new Error("目录或子模块不能作为普通文本比较，请打开对应仓库。");
        if (stat.size > 16 * 1024 * 1024) throw new Error("文件超过 16 MiB，无法在历史文本视图打开。");
        return new TextDecoder(settings.encoding).decode(await fs.promises.readFile(target));
      }
      const object = revision === INDEX ? `:${file}` : `${require_revision(revision)}:${file}`;
      const reader = create_git_runner({ child_process, process: process_api }, { executable: settings.git_path });
      return new TextDecoder(settings.encoding).decode(await reader.run_bytes(root, ["show", object]));
    },
    open_document(data: diff_document, group = "active", options: document_options = {}) {
      const uri = `typ://linux_note.git_document/${encodeURIComponent(options.root || "")}/${encodeURIComponent(options.key || String(++serial))}/${encodeURIComponent(data.title)}`;
      contents.set(uri, {data, options});
      let existing: graph_leaf | undefined;
      core.app.workspace.eachLeaves(leaf => { if (leaf.state.path === uri) existing = leaf; });
      if (existing && group === "active") { core.app.workspace.activeLeaf = existing.parent.toggleTab(uri); (existing.view as unknown as {onOpen(): void}).onOpen(); }
      else add_tab("linux_note.git_document", uri, group);
    },
    open_panel(title: string, key: string, root: string, panel: HTMLElement) {
      const uri = `typ://linux_note.git_document/${encodeURIComponent(root)}/${encodeURIComponent(key)}/${encodeURIComponent(title)}`;
      contents.set(uri, {panel, options: {root}}); let existing: graph_leaf | undefined;
      core.app.workspace.eachLeaves(leaf => { if (leaf.state.path === uri) existing = leaf; });
      if (existing) { core.app.workspace.activeLeaf = existing.parent.toggleTab(uri); (existing.view as unknown as {onOpen(): void}).onOpen(); }
      else add_tab("linux_note.git_document", uri, "active");
    },
    async discover(root: string, depth: number): Promise<string[]> {
      const found: string[] = []; let visited = 0;
      const walk = async (directory: string, level: number) => {
        if (++visited > 1500) return;
        const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
        if (entries.some((entry: { name: string }) => entry.name === ".git")) found.push(directory);
        if (level >= depth) return;
        for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink() && ![".git", "node_modules", ".cache", ".svn"].includes(entry.name)) await walk(path_api.join(directory, entry.name), level + 1);
      };
      await walk(root, 0); return found;
    },
    async avatar(email: string): Promise<string> {
      const hash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
      const target = path_api.join(cache_path, hash + ".png");
      if (fs.existsSync(target)) return "data:image/png;base64," + fs.readFileSync(target).toString("base64");
      return new Promise((resolve, reject) => {
        const request = runtime.reqnode("https").get(`https://www.gravatar.com/avatar/${hash}?s=32&d=identicon`, (response: any) => {
          if (response.statusCode !== 200 || !String(response.headers["content-type"]).startsWith("image/png")) { response.resume(); reject(new Error("头像不可用")); return; }
          const chunks: Uint8Array[] = []; let size = 0;
          response.on("data", (chunk: Uint8Array) => { size += chunk.length; if (size > 256000) { request.destroy(); reject(new Error("头像过大")); } else chunks.push(chunk); });
          response.on("end", () => { const data = runtime.reqnode("buffer").Buffer.concat(chunks); fs.mkdirSync(cache_path, { recursive: true }); fs.writeFileSync(target, data); resolve("data:image/png;base64," + data.toString("base64")); });
        }); request.setTimeout(10000, () => request.destroy(new Error("头像查询超时"))); request.on("error", reject);
      });
    },
    clear_avatars() {
      if (!fs.existsSync(cache_path)) return;
      for (const file of fs.readdirSync(cache_path)) if (/^[a-f\d]{32}\.png$/u.test(file)) fs.unlinkSync(path_api.join(cache_path, file));
    },
    terminal(root: string, program: string, admin = false) { if (admin) terminal_workspace.admin(root); else terminal_workspace.open(root, program); },
    export_file(root: string, filename: string, content: string) {
      const dialog = graph_dialog("导出配置"); const target = graph_element("input"); target.value = path_api.join(root, filename);
      const preview = graph_element("pre", "", content); const error = graph_element("p"); dialog.content.append(target, preview, error);
      dialog.footer.prepend(graph_button("保存到此路径", () => {
        try { fs.writeFileSync(target.value, content, { encoding: "utf8", flag: "wx" }); dialog.close(); }
        catch (problem) { error.textContent = String(problem) + "；文件已存在时请换一个导出名称。"; }
      }));
    },
  };
  terminal_workspace = bind_terminal_workspace(host);
  return host;
}
export type graph_host = ReturnType<typeof create_graph_host>;
