import { bind_terminal_workspace } from "./terminal_workspace";
import { create_workspace_sash } from "./workspace_sash";
import { create_git_runner } from "./git_graph_runtime";
import { EMPTY, INDEX, WORKTREE, require_revision } from "./git_graph_repository";
import { graph_button, graph_dialog, graph_element } from "./git_graph_widgets";
import type { graph_settings } from "./git_graph_settings";

export type graph_leaf = { state: { path: string; git_cwd?: string }; view: { containerEl: HTMLElement }; containerEl: HTMLElement;
  parent: { appendChild(leaf: graph_leaf): void; toggleTab(path: string): graph_leaf } };
export type graph_core = {
  WorkspaceView: new (leaf: graph_leaf) => { containerEl: HTMLElement; icon: string; leaf: graph_leaf };
  app: {
    openFile(path: string): unknown;
    viewManager: { registerView(type: string, factory: (leaf: graph_leaf) => unknown): void };
    commands: { register(command: { id: string; title: string; scope: string; callback(): void }): void; run(id: string, args?: unknown[]): void };
    workspace: { activeLeaf: graph_leaf | null; activeFile: string; eachLeaves(callback: (leaf: graph_leaf) => void): void;
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
  const contents = new Map<string, { title: string; left: string; right?: string; patch?: string }>();
  const cache_path = path_api.join(runtime._options.userDataPath, "linux_note_enhancements", "git_graph", "avatars");
  let serial = 0;
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
    constructor(leaf: graph_leaf) { super(leaf); }
    onOpen() {
      if (this.containerEl.children.length) return;
      const document = contents.get(this.leaf.state.path);
      if (!document) { this.containerEl.textContent = "此临时历史视图已释放，请从提交图重新打开。"; return; }
      const body = graph_element("div", "git-graph-document-body");
      const changed = [new Set<number>(), new Set<number>()]; let old_line = 0; let new_line = 0;
      for (const line of (document.patch || "").split("\n")) {
        const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
        if (hunk) { old_line = Number(hunk[1]); new_line = Number(hunk[2]); }
        else if (old_line || new_line) {
          if (line.startsWith("-")) changed[0].add(old_line++);
          else if (line.startsWith("+")) changed[1].add(new_line++);
          else if (line.startsWith(" ")) { old_line++; new_line++; }
        }
      }
      const text_view = (source: string, side: number) => {
        const view = graph_element("pre"); view.tabIndex = 0;
        source.split("\n").forEach((line, index) => {
          const row = graph_element("span", "git-document-line", line + "\n"); row.dataset.line = String(index + 1);
          if (changed[side].has(index + 1) || document.right != null && !document.patch && (side ? !document.left : !document.right)) row.classList.add(side ? "git-diff-add" : "git-diff-delete");
          view.append(row);
        }); return view;
      };
      const left = text_view(document.left, 0); body.append(left);
      if (document.right != null) {
        const right = text_view(document.right, 1);
        let ratio = .5;
        const apply = (value: number) => { ratio = value; left.style.flex = `${ratio} 1 0`; right.style.flex = `${1 - ratio} 1 0`; };
        body.append(create_workspace_sash({ label: "调整左右历史版本宽度", area: body, vertical: () => true, ratio: () => ratio, change: apply, save: () => {} }), right); apply(ratio);
        let syncing = false;
        const sync = (a: HTMLElement, b: HTMLElement) => { if (syncing) return; syncing = true; b.scrollTop = a.scrollTop; requestAnimationFrame(() => { syncing = false; }); };
        left.onscroll = () => sync(left, right); right.onscroll = () => sync(right, left);
      }
      this.containerEl.append(graph_element("div", "git-graph-root", document.title), body);
    }
    onClose() {
      setTimeout(() => { let exists = false; core.app.workspace.eachLeaves(leaf => { if (leaf.state.path === this.leaf.state.path) exists = true; }); if (!exists) contents.delete(this.leaf.state.path); }, 0);
    }
  }
  core.app.viewManager.registerView("linux_note.git_document", leaf => new graph_document_view(leaf));
  let terminal_workspace: ReturnType<typeof bind_terminal_workspace>;
  const host = {
    core, fs, path_api, process_api,
    runner(settings: graph_settings, writable = false) { return create_git_runner({ child_process, process: process_api }, { executable: settings.git_path, writable }); },
    context_path(use_active = true): string {
      const active = core.app.workspace.activeLeaf;
      return use_active && active?.state.path && path_api.isAbsolute(active.state.path) ? path_api.dirname(active.state.path)
        : active?.state.git_cwd || runtime.File?.getMountFolder?.() || (core.app.workspace.activeFile ? path_api.dirname(core.app.workspace.activeFile) : "");
    },
    can_change_files() { return !runtime.File?.changeCounter?.isDocumentEdited(); },
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
      if (/\.(md|markdown)$/iu.test(target)) {
        if (settings.new_tab_group === "active") core.app.openFile(target);
        else core.app.commands.run(settings.new_tab_group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [target]);
      } else {
        const text = await this.revision_text(root, WORKTREE, file, settings); this.open_document(file, text, undefined, settings.new_tab_group);
      }
    },
    file_path: ensure_file_path,
    async revision_text(root: string, revision: string, file: string, settings: graph_settings): Promise<string> {
      if (revision === EMPTY) return "";
      if (revision === WORKTREE) {
        const target = ensure_file_path(root, file);
        if (!fs.existsSync(target)) return "";
        const stat = await fs.promises.stat(target); if (stat.size > 16 * 1024 * 1024) throw new Error("文件超过 16 MiB，无法在历史文本视图打开。");
        return new TextDecoder(settings.encoding).decode(await fs.promises.readFile(target));
      }
      const object = revision === INDEX ? `:${file}` : `${require_revision(revision)}:${file}`;
      const reader = create_git_runner({ child_process, process: process_api }, { executable: settings.git_path });
      return new TextDecoder(settings.encoding).decode(await reader.run_bytes(root, ["show", object]));
    },
    open_document(title: string, left: string, right: string | undefined, group: string, patch = "") {
      const uri = `typ://linux_note.git_document/${++serial}/${encodeURIComponent(title)}`; contents.set(uri, { title, left, right, patch });
      add_tab("linux_note.git_document", uri, group);
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
