import {workspace_file_icon, acquire_workspace_file_icons} from "./workspace_file_icons";
import { bind_terminal_workspace } from "./terminal_workspace";
import { git_diff_editor, type diff_document } from "./git_diff_editor";
import { append_git_ignore } from "./git_ignore";
import { create_git_runner } from "./git_graph_runtime";
import { EMPTY, INDEX, WORKTREE, require_revision } from "./git_graph_repository";
import { workspace_button, workspace_dialog, workspace_element, type workspace_menu_entry } from "./workspace_widgets";
import type { graph_settings } from "./git_graph_settings";
import { git_icon, git_icon_button } from "./git_icons";
import { get_workspace_files } from "./workspace_files";
import { bind_workspace_editor_status } from "./workspace_editor_status";
import { git_graph_language_tag, git_graph_text as text } from "./git_graph_i18n";
import {is_markdown_file} from "./file_language";
import {create_git_revision_reader} from "./git_revision_reader";
import {create_text_document} from "./workspace_text_document";

const graph_dialog = (title: string) => workspace_dialog(title, text("common.close"));

export type graph_leaf = { state: { path: string; git_cwd?: string; workspace_preview?: boolean }; view: { containerEl: HTMLElement }; containerEl: HTMLElement;
  parent: { containerEl?: HTMLElement; tabHeader?: {getTabById(path:string):HTMLElement|undefined}; appendChild(leaf: graph_leaf): void; toggleTab(path: string): graph_leaf; removeTab?(path: string): unknown } };
type sidebar_panel = {containerEl: HTMLElement; ribbonButton?: unknown; addRibbonButton(button: {id: string; title: string; icon: HTMLElement; group?: string}): void};
export type graph_core = {
  Notice: new(message:string,duration?:number)=>unknown;
  SidebarPanel: new () => sidebar_panel;
  WorkspaceView: new (leaf: graph_leaf) => { containerEl: HTMLElement; icon: string; leaf: graph_leaf };
  app: {
    vault?: { on(event: "mounted", callback: (path: string) => void): () => void };
    openFile(path: string): unknown;
    viewManager: { registerView(type: string, factory: (leaf: graph_leaf) => unknown): () => void };
    commands: { register(command: { id: string; title: string; scope: string; showInCommandPanel?:boolean; callback(...args:any[]): void }): () => void; run(id: string, args?: unknown[]): void };
    workspace: { sidebar: {addPanel(panel: sidebar_panel): () => void; switch(panel: new () => sidebar_panel): void; show(): void; hide(): void; toggle(): void; isShown: boolean; activePanel?: sidebar_panel}; activeLeaf: graph_leaf | null; activeFile: string; eachLeaves(callback: (leaf: graph_leaf) => void): void;
      createLeaf(state: { type: string; state: graph_leaf["state"] }): graph_leaf;
      on(event: string, callback: (context: any) => void): () => void;
      ribbon: { addButton(button: { id: string; title: string; group: string; icon: HTMLElement; onclick(): void }): () => void };
    };
  };
};
type native_file = { getMountFolder?(): string; bundle?: { filePath?: string }; changeCounter?: { isDocumentEdited(): boolean } };
export function create_graph_host(core: graph_core) {
  const runtime = window as unknown as { reqnode(name: string): any; File?: native_file; JSBridge: { invoke(command: string, ...args: unknown[]): Promise<unknown> }; _options: { userDataPath: string } };
  const fs = runtime.reqnode("fs"); const path_api = runtime.reqnode("path"); const process_api = runtime.reqnode("process");
  const editor_status=bind_workspace_editor_status(core);
  const file_icon_style=acquire_workspace_file_icons();
  const child_process = runtime.reqnode("child_process"); const crypto = runtime.reqnode("crypto");
  type document_options = {root?: string; key?: string; file?: string; dispose?: () => void; menu?: () => workspace_menu_entry[]; refresh?: () => void; adjacent?: (direction: number) => void};
  const contents = new Map<string, {data?: diff_document; panel?: HTMLElement; options: document_options}>();
  const cache_path = path_api.join(runtime._options.userDataPath, "linux_note_enhancements", "git_graph", "avatars");
  let serial = 0, disposed = false;
  const views=new Set<graph_document_view>();
  const runners=new Set<ReturnType<typeof create_git_runner>>();
  const output_lines = new Map<string, string[]>();
  const redact = (text: string) => text.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gu, "$1***@").replace(/([?&](?:access_token|token|password)=)[^&\s]+/giu, "$1***");
  const ensure_file_path = (root: string, file: string) => {
    const absolute = path_api.resolve(root, file); const relative = path_api.relative(root, absolute);
    if (path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) throw new Error(text("host.outside_repository"));
    return absolute;
  };
  const add_tab = (type: string, uri: string, group: string) => {
    if(disposed)return;
    if (group !== "active") { core.app.commands.run(group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [uri]); return; }
    const parent = core.app.workspace.activeLeaf?.parent; if (!parent) return;
    const leaf = core.app.workspace.createLeaf({ type, state: { path: uri } }); parent.appendChild(leaf); core.app.workspace.activeLeaf = leaf;
  };
  class graph_document_view extends core.WorkspaceView {
    containerEl = workspace_element("section", "git-graph-document"); icon = "fa-code-fork";
    editor?: git_diff_editor; document?: typeof contents extends Map<string, infer value> ? value : never;
    constructor(leaf: graph_leaf) { super(leaf); views.add(this); try { leaf.state.git_cwd ||= decodeURIComponent(leaf.state.path.split("/")[3]); } catch { /* 无效 URI 由打开入口处理。 */ } }
    // WorkspaceView.open/renameTab 共用此上游钩子；自定义文件图标不再启动基类延迟字体图标写入。
    setIcon(_icon: string): void { this.sync_tab(); }
    sync_tab(): void {
      if (disposed) return;
      // createTabs 先 open 视图再挂载整个新组；通过所属组 API 可访问尚未进入 document 的标签。
      const tab = this.leaf.parent?.tabHeader?.getTabById(this.leaf.state.path); if (!tab) return;
      const payload = contents.get(this.leaf.state.path), icon = tab.querySelector('.typ-file-icon');
      if (icon) {
        const file_path = payload?.data?.file || payload?.options.file;
        icon.className = file_path ? 'typ-file-icon workspace-file-theme-slot' : 'typ-file-icon git-tab-icon';
        icon.replaceChildren(file_path ? workspace_file_icon(file_path) : git_icon('compare-changes'));
      }
      const title = payload?.data?.title || decodeURIComponent(this.leaf.state.path.split('/').at(-1)!);
      const label = tab.querySelector('.typ-file-basename'); if (label) label.textContent = title;
      tab.querySelector('.typ-file-ext')?.remove(); tab.title = title;
    }
    onOpen() {
      if(disposed)return;
      const payload = contents.get(this.leaf.state.path);
      this.sync_tab();
      if (!payload) { this.containerEl.textContent = text("host.expired_view"); return; }
      if (payload === this.document) { this.editor?.editor.layout();this.sync_file_action();this.attach_toolbar();editor_status.refresh(); return; }
      if (this.editor && payload.data && this.document?.data) {
        try { this.editor.update(payload.data); this.document = payload;this.sync_file_action();this.attach_toolbar(); }
        catch (error) { this.editor.status.textContent = String(error); }
        return;
      }
      this.document = payload; this.containerEl.replaceChildren();
      if (payload.panel) { this.containerEl.append(payload.panel); return; }
      try {
        this.editor = new git_diff_editor(payload.data!, () => {
          const options = this.document?.options; const entries: workspace_menu_entry[] = [...(options?.menu?.() || [])];
          if (options?.adjacent) entries.push({id:"previous_file",title:text("host.previous_file"),action:()=>this.document?.options.adjacent?.(-1)}, {id:"next_file",title:text("host.next_file"),action:()=>this.document?.options.adjacent?.(1)});
          if (options?.refresh) entries.push({id:"refresh_diff",title:text("host.refresh_diff"),action:()=>this.document?.options.refresh?.()});
          entries.push({id:"toggle_sidebar",title:text("host.toggle_sidebar"),action:()=>core.app.workspace.sidebar.toggle()}); return entries;
        });
        this.sync_file_action();
        this.containerEl.append(this.editor.container);
        this.attach_toolbar();
        editor_status.register(this.leaf,this.editor.create_readonly_status());
      } catch (error) { this.containerEl.append(workspace_element("p", "git-scm-empty", String(error))); }
    }
    attach_toolbar(){const header=this.leaf.parent.containerEl?.querySelector<HTMLElement>(".typ-workspace-tab-header");if(header)this.editor?.attach_toolbar(header);}
    sync_file_action(){
      if(!this.editor)return;
      const entry=this.document?.options.menu?.().find(item=>item.id==="open_file");
      let button=this.editor.toolbar.querySelector<HTMLButtonElement>("[data-diff-open-file]");
      if(!entry){button?.remove();return;}
      if(!button){button=git_icon_button("go-to-file",entry.title,()=>{const current=this.document?.options.menu?.().find(item=>item.id==="open_file");if(current&&!current.disabled)void current.action?.();});button.dataset.diffOpenFile="true";button.style.marginLeft="auto";this.editor.toolbar.append(button);}
      button.disabled=Boolean(entry.disabled); button.title=entry.title; button.setAttribute("aria-label",entry.title);
    }
    onClose() {
      this.editor?.detach_toolbar();
      editor_status.schedule();
      setTimeout(() => { let payload_exists = false; let view_exists = false; core.app.workspace.eachLeaves(leaf => { if (leaf.state.path === this.leaf.state.path) payload_exists = true; if (leaf === this.leaf) view_exists = true; }); if (!view_exists) {views.delete(this);editor_status.release(this.leaf);this.editor?.dispose();} if (!payload_exists) {contents.get(this.leaf.state.path)?.options.dispose?.();contents.delete(this.leaf.state.path);} }, 0);
    }
  }
  const unregister_view=core.app.viewManager.registerView("linux_note.git_document", leaf => new graph_document_view(leaf));
  let terminal_workspace: ReturnType<typeof bind_terminal_workspace>;
  const host = {
    core, fs, path_api, process_api,
    dispose(){
      if(disposed)return;disposed=true;if(typeof unregister_compare==="function")unregister_compare();file_icon_style.remove();terminal_workspace.dispose();
      for(const runner of runners)runner.cancel();runners.clear();
      for(const view of views){view.editor?.dispose();editor_status.release(view.leaf);view.leaf.parent.removeTab?.(view.leaf.state.path);view.containerEl.remove();}
      views.clear();for(const payload of contents.values())payload.options.dispose?.();contents.clear();output_lines.clear();if(typeof unregister_view==="function")unregister_view();
    },
    ignore_file(root: string, file: string, settings: graph_settings) { if(get_workspace_files()?.can_write(path_api.join(root,".gitignore"))===false)throw new Error(text("action.error.unsaved_document"));return append_git_ignore({fs, path_api}, this.runner(settings).run, root, file); },
    show_history: (_root: string) => {},
    runner(settings: graph_settings, writable = false) {
      const runner = create_git_runner({ child_process, process: process_api }, { executable: settings.git_path, writable });
      runners.add(runner);
      const run: typeof runner.run = async (root, args, execution) => {
        if(disposed)throw new Error("Typora Code 已停用。");
        const record = (text: string) => { const lines = output_lines.get(root) || []; lines.push(redact(text)); output_lines.set(root, lines.slice(-100)); };
        const start = Date.now(); record(new Date().toLocaleTimeString(git_graph_language_tag()) + " > git " + args.map(arg => JSON.stringify(arg)).join(" "));
        try { const result = await runner.run(root, args, execution); record(text("host.run_complete", {duration: Date.now() - start}) + (writable ? "\n" + result.slice(0, 12000) : "")); return result; }
        catch (error) { record(String(error)); throw error; }
      };
      return {...runner, run, dispose:()=>{runner.cancel();runners.delete(runner);}};
    },
    show_output(root: string) {
      const view = workspace_element("div", "git-output"); const output = workspace_element("pre");
      const refresh = () => { output.textContent = (output_lines.get(root) || [text("host.no_git_output")]).join("\n"); output.scrollTop = output.scrollHeight; };
      view.append(workspace_button(text("host.refresh_output"), refresh), output); refresh(); this.open_panel(text("host.git_output"), "git_output", root, view);
    },
    context_path(use_active = true): string {
      const active = core.app.workspace.activeLeaf;
      return use_active && active?.state.path && path_api.isAbsolute(active.state.path) ? path_api.dirname(active.state.path)
        : active?.state.git_cwd || runtime.File?.getMountFolder?.() || (core.app.workspace.activeFile ? path_api.dirname(core.app.workspace.activeFile) : "");
    },
    can_change_files() { return !runtime.File?.changeCounter?.isDocumentEdited(); },
    async trash_files(root: string, files: string[]): Promise<void> {
      const shell = runtime.reqnode("electron").shell;
      if (typeof shell.trashItem !== "function") throw new Error(text("host.trash_unavailable"));
      const real_root = await fs.promises.realpath(root);
      const targets: string[] = [];
      for (const file of files) {
        const target = ensure_file_path(root, file);
        const parent = await fs.promises.realpath(path_api.dirname(target));
        const relative = path_api.relative(real_root, parent);
        if (path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) throw new Error(text("host.real_directory_outside", {file}));
        const stat = await fs.promises.lstat(target);
        if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(text("host.files_only_trash", {file}));
        targets.push(target);
      }
      for (let index = 0; index < targets.length; index++) {
        try { await shell.trashItem(targets[index]); }
        catch (error) { throw new Error(text("host.trash_partial_failure", {count: index, file: files[index], error: String(error)})); }
      }
    },
    operation(git_dir: string): string {
      for (const [file, operation] of [["rebase-merge", "rebase"], ["rebase-apply", "rebase"], ["MERGE_HEAD", "merge"], ["CHERRY_PICK_HEAD", "cherry-pick"], ["REVERT_HEAD", "revert"]]) if (fs.existsSync(path_api.join(git_dir, file))) return operation;
      return "";
    },
    copy(text: string) { return runtime.JSBridge.invoke("clipboard.write", JSON.stringify({ text })); },
    open_url(url: string) {
      const parsed = new URL(url); if (!["https:", "http:"].includes(parsed.protocol)) throw new Error(text("host.http_only"));
      return runtime.reqnode("electron").shell.openExternal(parsed.href);
    },
    async open_file(root: string, file: string, settings: graph_settings) {
      const target = ensure_file_path(root, file);
      if (!fs.existsSync(target)) throw new Error(text("host.current_file_missing"));
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
    open_folder(path:string,new_window=false){core.app.commands.run(new_window?"linux_note:open_folder_new_window":"linux_note:open_folder_path",[path]);},
    reveal_explorer(root:string,file:string){core.app.commands.run("linux_note:reveal_in_explorer",[ensure_file_path(root,file),root]);},
    reveal_file(root: string, file: string) { runtime.reqnode("electron").shell.showItemInFolder(ensure_file_path(root, file)); },
    async revision_text(root: string, revision: string, file: string, settings: graph_settings): Promise<string> {
      if (revision === EMPTY) return "";
      if (revision === WORKTREE) {
        const target = ensure_file_path(root, file);
        if (!fs.existsSync(target)) return "";
        const stat = await fs.promises.lstat(target);
        if (stat.isSymbolicLink()) return fs.promises.readlink(target);
        if (!stat.isFile()) throw new Error(text("host.non_text_comparison"));
        if (stat.size > 16 * 1024 * 1024) throw new Error(text("host.file_too_large"));
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
    workspace_path():string {
      return get_workspace_files()?.context_root() || this.context_path() || process_api.env.USERPROFILE || process_api.env.HOME || process_api.cwd();
    },
    open_revision_document(root: string, revision: string, file: string, content: string, settings: graph_settings, fragment = "") {
      const group = settings.new_tab_group; let reader_disposed = false;
      const title = `${revision.slice(0, 8)} · ${file}`, label = text("scm.readonly_label", {file, revision: revision.slice(0, 8)});
      if (!is_markdown_file(file)) { this.open_document({title, file, left: content, left_label: label}, group, {root, key: JSON.stringify(["revision", revision, file])}); return; }
      const relative_target = (href: string) => {
        if (!href || /^[a-z][a-z\d+.-]*:/iu.test(href) || /^[\\/]{2}/u.test(href)) throw new Error(text("host.historical_relative_only"));
        const relative = decodeURIComponent(href.split(/[?#]/u)[0]).replace(/\\/gu, '/');
        const target = path_api.posix.normalize(relative.startsWith('/') ? relative.slice(1) : path_api.posix.join(path_api.posix.dirname(file), relative));
        ensure_file_path(root, target); return target;
      };
      const reader = create_git_revision_reader(content, label, async href => {
        if (/^https?:\/\//iu.test(href)) { await this.open_url(href); return; }
        const target = relative_target(href);
        const value = await this.revision_text(root, revision, target, settings);
        if (!disposed && !reader_disposed) this.open_revision_document(root, revision, target, value, settings, href.includes('#') ? href.slice(href.indexOf('#')) : '');
      }, async href => {
        const target = relative_target(href), extension = path_api.posix.extname(target).toLowerCase();
        const mime: Record<string,string> = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.bmp':'image/bmp'};
        if (!mime[extension]) throw new Error(text("host.historical_image_unsupported"));
        const data = await this.runner(settings).run_bytes(root, ['show',`${require_revision(revision)}:${target}`]);
        return `data:${mime[extension]};base64,${runtime.reqnode('buffer').Buffer.from(data).toString('base64')}`;
      });
      this.open_panel(title, JSON.stringify(["revision", revision, file]), root, reader.container, {file, dispose: () => {reader_disposed = true; reader.dispose();}}, group);
      reader.reveal_fragment(fragment);
    },
    open_panel(title: string, key: string, root: string, panel: HTMLElement, options: document_options = {}, group = "active") {
      const uri = `typ://linux_note.git_document/${encodeURIComponent(root)}/${encodeURIComponent(key)}/${encodeURIComponent(title)}`;
      contents.get(uri)?.options.dispose?.(); contents.set(uri, {panel, options: {...options, root}}); let existing: graph_leaf | undefined;
      core.app.workspace.eachLeaves(leaf => { if (leaf.state.path === uri) existing = leaf; });
      if (existing) { core.app.workspace.activeLeaf = existing.parent.toggleTab(uri); (existing.view as unknown as {onOpen(): void}).onOpen(); }
      else add_tab("linux_note.git_document", uri, group);
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
          if (response.statusCode !== 200 || !String(response.headers["content-type"]).startsWith("image/png")) { response.resume(); reject(new Error(text("host.avatar_unavailable"))); return; }
          const chunks: Uint8Array[] = []; let size = 0;
          response.on("data", (chunk: Uint8Array) => { size += chunk.length; if (size > 256000) { request.destroy(); reject(new Error(text("host.avatar_too_large"))); } else chunks.push(chunk); });
          response.on("end", () => { const data = runtime.reqnode("buffer").Buffer.concat(chunks); fs.mkdirSync(cache_path, { recursive: true }); fs.writeFileSync(target, data); resolve("data:image/png;base64," + data.toString("base64")); });
        }); request.setTimeout(10000, () => request.destroy(new Error(text("host.avatar_timeout")))); request.on("error", reject);
      });
    },
    clear_avatars() {
      if (!fs.existsSync(cache_path)) return;
      for (const file of fs.readdirSync(cache_path)) if (/^[a-f\d]{32}\.png$/u.test(file)) fs.unlinkSync(path_api.join(cache_path, file));
    },
    terminal(root: string, program: string, admin = false) { if (admin) terminal_workspace.admin(root); else terminal_workspace.open(root, program); },
    export_file(root: string, filename: string, content: string) {
      const dialog = graph_dialog(text("host.export_configuration")); const target = workspace_element("input"); target.value = path_api.join(root, filename);
      const preview = workspace_element("pre", "", content); const error = workspace_element("p"); dialog.content.append(target, preview, error);
      dialog.footer.prepend(workspace_button(text("host.save_to_path"), () => {
        try { fs.writeFileSync(target.value, content, { encoding: "utf8", flag: "wx" }); dialog.close(); }
        catch (problem) { error.textContent = text("host.export_failure_hint", {error: String(problem)}); }
      }));
    },
  };
  const unregister_compare=core.app.commands.register({id:"linux_note:compare_files",title:"文件：比较所选文件",scope:"global",showInCommandPanel:false,callback:(left:string,right:string)=>{
    void (async()=>{
      const files=get_workspace_files();
      const read=async(target:string)=>{
        if(typeof target!=="string"||!path_api.isAbsolute(target))throw new Error("比较目标必须是文件。");
        // 当前内存正文优先，比较不会自动保存或丢弃未保存内容。
        if(files)return files.read_text(target);
        return (await create_text_document({fs,path_api},target).load()).text;
      };
      const [before,after]=await Promise.all([read(left),read(right)]);if(disposed)return;
      host.open_document({title:path_api.basename(left)+" ↔ "+path_api.basename(right),file:right,left:before,right:after,left_label:path_api.basename(left),right_label:path_api.basename(right)},"active",{root:files?.context_root(),key:JSON.stringify(["compare",left,right]),menu:()=>[{id:"open_file",title:"打开右侧文件",action:()=>void files?.open_file(right)}]});
    })().catch(error=>{if(!disposed){const dialog=graph_dialog("比较文件");dialog.content.textContent=String(error instanceof Error?error.message:error);}});
  }});
  terminal_workspace = bind_terminal_workspace(host);
  return host;
}
export type graph_host = ReturnType<typeof create_graph_host>;
