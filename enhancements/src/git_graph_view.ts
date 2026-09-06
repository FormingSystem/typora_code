import { build_git_graph, GIT_GRAPH_COMMAND, GIT_GRAPH_TYPE, GIT_MAX_COMMITS, GIT_PAGE_SIZE,
  read_git_files, read_git_message, read_git_patch, read_git_snapshot, type git_commit, type git_snapshot, type graph_row } from "./git_graph_data";
import { create_git_runner } from "./git_graph_runtime";
import graph_css from "./git_graph.css";

type graph_leaf = {
  state: { path: string; git_cwd?: string };
  containerEl: HTMLElement;
  parent: { appendChild(leaf: graph_leaf): void; toggleTab(path: string): graph_leaf };
};
type graph_core = {
  WorkspaceView: new (leaf: graph_leaf) => { containerEl: HTMLElement; icon: string; leaf: graph_leaf };
  app: {
    viewManager: { registerView(type: string, factory: (leaf: graph_leaf) => unknown): void };
    commands: { register(command: { id: string; title: string; scope: string; callback(): void }): void };
    workspace: {
      activeLeaf: graph_leaf | null; activeFile: string;
      eachLeaves(callback: (leaf: graph_leaf) => void): void;
      createLeaf(state: { type: string; state: graph_leaf["state"] }): graph_leaf;
      ribbon: { addButton(button: { id: string; title: string; group: string; icon: HTMLElement; onclick(): void }): void };
    };
  };
};
const colors = ["#2684d4", "#b462d6", "#209572", "#db8540", "#d4567d", "#7783cc"];
function element<K extends keyof HTMLElementTagNameMap>(tag: K, class_name: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = class_name; node.textContent = text; return node;
}
function button(text: string, action: () => void, class_name = ""): HTMLButtonElement {
  const node = element("button", class_name, text); node.type = "button"; node.addEventListener("click", action); return node;
}
function option(value: string, text: string): HTMLOptionElement {
  const node = element("option", "", text); node.value = value; return node;
}
function graph_svg(row: graph_row, width: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(width * 18 + 18)); svg.setAttribute("height", "34");
  svg.setAttribute("aria-hidden", "true");
  const x = (lane: number) => lane * 18 + 16;
  for (const edge of row.edges) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    const top = edge.upper ? 0 : 17; const bottom = edge.upper ? 17 : 34;
    path.setAttribute("d", `M ${x(edge.from)} ${top} C ${x(edge.from)} ${top + 9}, ${x(edge.to)} ${bottom - 9}, ${x(edge.to)} ${bottom}`);
    path.setAttribute("fill", "none"); path.setAttribute("stroke", colors[edge.color % colors.length]); path.setAttribute("stroke-width", "2");
    svg.append(path);
  }
  const circle = document.createElementNS(svg.namespaceURI, "circle");
  circle.setAttribute("cx", String(x(row.lane))); circle.setAttribute("cy", "17"); circle.setAttribute("r", "4");
  circle.setAttribute("fill", colors[row.color % colors.length]); svg.append(circle); return svg;
}

/** 注册普通工作区视图；图和差异使用文本节点，不将仓库内容作为 HTML 执行。 */
export function bind_git_graph(): void {
  if (document.documentElement.hasAttribute("data-linux-note-git-graph")) return;
  const core = (window as unknown as Record<symbol, graph_core>)[Symbol.for("typora-plugin-core@v2")];
  const runtime = window as unknown as {
    reqnode?: (name: string) => any;
    File?: { getMountFolder?(): string };
  };
  if (!core?.app || !runtime.reqnode) return;
  const style = element("style", ""); style.textContent = graph_css; document.head.append(style);
  const { app } = core;
  const path_api = runtime.reqnode("path") as { dirname(path: string): string; isAbsolute(path: string): boolean };
  const context_path = () => {
    const active = app.workspace.activeLeaf;
    const file = active?.state.path;
    // 普通文件先按自身查找仓库，正确处理根目录内的子模块和外部标签。
    return file && path_api.isAbsolute(file) ? path_api.dirname(file)
      : active?.state.git_cwd || runtime.File?.getMountFolder?.()
      || (app.workspace.activeFile ? path_api.dirname(app.workspace.activeFile) : "");
  };
  class git_graph_view extends core.WorkspaceView {
    containerEl = element("section", "linux-note-git-graph");
    icon = "fa-code-fork";
    runner = create_git_runner({ child_process: runtime.reqnode!("child_process"), process: runtime.reqnode!("process") });
    toolbar = element("div", "git-graph-toolbar");
    root_label = element("div", "git-graph-root", "Git Graph");
    status = element("div", "git-graph-status");
    branch = element("select", "git-graph-branch");
    refresh_button = button("刷新", () => void this.refresh());
    more_button = button("加载更多", () => { this.limit += GIT_PAGE_SIZE; void this.refresh(false); });
    list = element("div", "git-graph-list");
    details = element("div", "git-graph-details", "选择一条提交，查看说明和文件差异。");
    search = element("input", "git-graph-search");
    snapshot?: git_snapshot;
    limit = GIT_PAGE_SIZE;
    epoch = 0;
    selection_epoch = 0;
    patch_epoch = 0;
    pending = false;
    selected = "";

    constructor(leaf: graph_leaf) {
      super(leaf);
      // 社区核心按 URI 拆分标签，恢复其仓库上下文。
      if (!leaf.state.git_cwd) {
        const encoded = leaf.state.path.split("/")[3];
        try { const cwd = decodeURIComponent(encoded || ""); if (path_api.isAbsolute(cwd)) leaf.state.git_cwd = cwd; } catch { /* 显示常规上下文提示。 */ }
      }
      this.containerEl.setAttribute("aria-label", "Git Graph 提交历史");
      this.status.setAttribute("role", "status");
      this.branch.setAttribute("aria-label", "分支或标签"); this.branch.append(option("", "全部分支"));
      this.branch.addEventListener("change", () => void this.refresh());
      this.search.placeholder = "查找已加载提交，Enter 查找下一条";
      this.search.setAttribute("aria-label", "查找提交说明、作者或编号");
      this.search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); this.find_next(); }
      });
      this.toolbar.append(this.branch, this.refresh_button, this.search, button("查找", () => this.find_next()));
      const body = element("div", "git-graph-body"); body.append(this.list, this.details);
      this.more_button.hidden = true;
      this.containerEl.append(this.root_label, this.toolbar, this.status, body, this.more_button);
      // 输入只交给当前工具，避免 Typora 全局编辑快捷键操作隐藏的正文。
      this.containerEl.addEventListener("keydown", (event) => event.stopPropagation());
    }
    onOpen(): void {
      if (!this.snapshot || this.pending) void this.refresh(false);
      else if (this.selected) {
        const commit = this.snapshot.commits.find((item) => item.hash === this.selected);
        if (commit) void this.select_commit(commit);
      }
    }
    onClose(): void { this.epoch++; this.selection_epoch++; this.patch_epoch++; this.runner.cancel(); }

    async refresh(reset = true): Promise<void> {
      const epoch = ++this.epoch;
      this.selection_epoch++; this.patch_epoch++; this.runner.cancel(); this.pending = true;
      if (reset) this.limit = GIT_PAGE_SIZE;
      this.refresh_button.disabled = true; this.more_button.disabled = true; this.branch.disabled = true;
      this.containerEl.dataset.state = "loading"; this.status.textContent = "正在读取 Git 历史…";
      const chosen_ref = this.branch.value;
      try {
        const cwd = this.leaf.state.git_cwd || context_path();
        if (!cwd) throw new Error("请先打开仓库中的文档或文件夹，再打开 Git Graph。");
        // 每次先更新引用，再用新的分支尖端加载历史，刷新可看见其他程序的新提交。
        let snapshot = await read_git_snapshot(this.runner.run, cwd, this.limit);
        if (chosen_ref) {
          const current = chosen_ref === "HEAD" ? snapshot.head : snapshot.refs.find((item) => item.name === chosen_ref)?.hash;
          if (current) snapshot = await read_git_snapshot(this.runner.run, snapshot.root, this.limit, current);
        }
        if (epoch !== this.epoch) return;
        this.snapshot = snapshot; this.leaf.state.git_cwd = snapshot.root;
        this.root_label.textContent = snapshot.root; this.root_label.title = snapshot.root;
        this.branch.replaceChildren(option("", "全部分支"));
        if (snapshot.head) this.branch.append(option("HEAD", "当前 HEAD"));
        for (const ref of snapshot.refs) this.branch.append(option(ref.name, ref.name.replace(/^refs\/(heads|remotes|tags)\//u, "$1 / ")));
        this.branch.value = [...this.branch.options].some((item) => item.value === chosen_ref) ? chosen_ref : "";
        this.render_list();
        this.more_button.hidden = !snapshot.more || this.limit >= GIT_MAX_COMMITS;
        this.status.textContent = snapshot.commits.length ? `已加载 ${snapshot.commits.length} 条提交${snapshot.more ? " · 下方连线延续到更早历史" : ""}${this.limit >= GIT_MAX_COMMITS && snapshot.more ? " · 已达 5000 条上限，请选择分支缩小范围" : ""}` : "此仓库尚无提交。";
        this.containerEl.dataset.state = "ready";
        if (!snapshot.commits.some((item) => item.hash === this.selected)) {
          this.selected = ""; this.details.textContent = "选择一条提交，查看说明和文件差异。";
        } else {
          void this.select_commit(snapshot.commits.find((item) => item.hash === this.selected)!);
        }
      } catch (error) {
        if (epoch !== this.epoch) return;
        this.status.textContent = `无法读取 Git 历史：${error instanceof Error ? error.message : String(error)}`;
        this.containerEl.dataset.state = "error";
      } finally {
        if (epoch === this.epoch) {
          this.pending = false; this.refresh_button.disabled = false; this.more_button.disabled = false; this.branch.disabled = false;
        }
      }
    }

    render_list(): void {
      const snapshot = this.snapshot!;
      const graph = build_git_graph(snapshot.commits);
      const rows = document.createDocumentFragment();
      const refs = new Map<string, string[]>();
      if (snapshot.head) refs.set(snapshot.head, ["HEAD"]);
      for (const ref of snapshot.refs) refs.set(ref.hash, [...(refs.get(ref.hash) || []), ref.name.replace(/^refs\/(heads|remotes|tags)\//u, "")]);
      snapshot.commits.forEach((commit, index) => {
        const row = button("", () => void this.select_commit(commit), "git-graph-row");
        row.dataset.hash = commit.hash; row.setAttribute("aria-pressed", String(this.selected === commit.hash));
        const labels = (refs.get(commit.hash) || []).join(" · ");
        const subject = element("span", "git-graph-subject", commit.subject);
        if (labels) subject.prepend(element("span", "git-graph-refs", labels));
        row.title = `${commit.hash}\n${commit.author} · ${commit.date}\n${commit.subject}`;
        row.append(graph_svg(graph.rows[index], graph.width), subject, element("span", "git-graph-author", commit.author), element("code", "git-graph-hash", commit.hash.slice(0, 8)));
        rows.append(row);
      });
      this.list.replaceChildren(rows);
    }

    find_next(): void {
      const query = this.search.value.trim().toLocaleLowerCase();
      if (!query || !this.snapshot) return;
      const matches = this.snapshot.commits.filter((commit) => [commit.subject, commit.author, commit.hash].some((value) => value.toLocaleLowerCase().includes(query)));
      if (!matches.length) { this.status.textContent = "已加载历史中没有匹配项，可加载更多后重试。"; return; }
      const index = (matches.findIndex((item) => item.hash === this.selected) + 1) % matches.length;
      const commit = matches[index];
      const row = this.list.querySelector<HTMLElement>(`[data-hash="${commit.hash}"]`);
      if (row) this.list.scrollTop = row.offsetTop - this.list.offsetTop - this.list.clientHeight / 2;
      this.status.textContent = `找到 ${matches.length} 条 · 第 ${index + 1} 条`;
      void this.select_commit(commit);
    }

    async select_commit(commit: git_commit): Promise<void> {
      const epoch = ++this.selection_epoch;
      this.patch_epoch++; this.selected = commit.hash;
      for (const row of this.list.querySelectorAll<HTMLElement>(".git-graph-row")) row.setAttribute("aria-pressed", String(row.dataset.hash === commit.hash));
      this.details.replaceChildren(element("div", "git-graph-commit-title", commit.subject), element("code", "git-graph-full-hash", commit.hash),
        element("div", "git-graph-meta", `${commit.author} · ${new Date(commit.date).toLocaleString()}`));
      const message = element("pre", "git-graph-message", "正在读取提交说明…");
      const parent_select = element("select", "git-graph-parent"); parent_select.setAttribute("aria-label", "对比父提交");
      commit.parents.forEach((hash, index) => parent_select.append(option(hash, `对比父提交 ${index + 1} · ${hash.slice(0, 8)}`)));
      if (!commit.parents.length) parent_select.append(option("", "首次提交 · 与空树比较"));
      const files = element("div", "git-graph-files");
      const patch = element("pre", "git-graph-patch", "选择文件查看差异。"); patch.tabIndex = 0;
      this.details.append(message, parent_select, files, patch);
      void read_git_message(this.runner.run, this.snapshot!.root, commit.hash).then((text) => {
        if (epoch === this.selection_epoch) message.textContent = text.trim();
      }).catch((error) => { if (epoch === this.selection_epoch) message.textContent = String(error); });
      let file_epoch = 0;
      const load_files = async () => {
        const request = ++file_epoch; this.patch_epoch++;
        files.textContent = "正在读取变更文件…"; patch.textContent = "选择文件查看差异。";
        try {
          const entries = await read_git_files(this.runner.run, this.snapshot!.root, commit.hash, parent_select.value);
          if (epoch !== this.selection_epoch || request !== file_epoch) return;
          files.replaceChildren();
          if (!entries.length) files.textContent = "相对于此父提交没有文件变化。";
          for (const file of entries) {
            const file_button = button(`${file.status}  ${file.path}`, () => {
              for (const sibling of files.children) sibling.classList.remove("selected");
              file_button.classList.add("selected");
              void this.show_patch(commit.hash, parent_select.value, file.path, patch);
            }, "git-graph-file");
            file_button.title = file.path; files.append(file_button);
          }
        } catch (error) { if (epoch === this.selection_epoch && request === file_epoch) files.textContent = String(error); }
      };
      parent_select.addEventListener("change", () => void load_files());
      void load_files();
    }

    async show_patch(hash: string, parent: string, file: string, target: HTMLElement): Promise<void> {
      const epoch = ++this.patch_epoch;
      target.textContent = "正在读取差异…";
      try {
        const patch = await read_git_patch(this.runner.run, this.snapshot!.root, hash, parent, file);
        if (epoch !== this.patch_epoch) return;
        const lines = patch.split("\n"); const fragment = document.createDocumentFragment();
        for (const line of lines.slice(0, 4000)) fragment.append(element("span", line.startsWith("+") ? "git-diff-add" : line.startsWith("-") ? "git-diff-delete" : line.startsWith("@@") ? "git-diff-hunk" : "", line + "\n"));
        if (lines.length > 4000) fragment.append(document.createTextNode("\n差异超过 4000 行，当前展示前 4000 行。"));
        target.replaceChildren(fragment); target.scrollTop = 0; target.scrollLeft = 0;
      } catch (error) { if (epoch === this.patch_epoch) target.textContent = String(error); }
    }
  }
  app.viewManager.registerView(GIT_GRAPH_TYPE, (leaf) => new git_graph_view(leaf));
  const open_graph = () => {
    if (app.workspace.activeLeaf?.state.path.startsWith(`typ://${GIT_GRAPH_TYPE}/`)) return;
    const cwd = context_path();
    const uri = `typ://${GIT_GRAPH_TYPE}/${encodeURIComponent(cwd)}/Git Graph`;
    let existing: graph_leaf | undefined;
    app.workspace.eachLeaves((leaf) => { if (leaf.state.path === uri) existing = leaf; });
    if (existing) { app.workspace.activeLeaf = existing.parent.toggleTab(uri); return; }
    const parent = app.workspace.activeLeaf?.parent;
    if (!parent) return;
    const leaf = app.workspace.createLeaf({ type: GIT_GRAPH_TYPE, state: { path: uri, git_cwd: cwd } });
    parent.appendChild(leaf); app.workspace.activeLeaf = leaf;
  };
  app.commands.register({ id: GIT_GRAPH_COMMAND, title: "Git Graph：查看提交关系图", scope: "global", callback: open_graph });
  const icon = element("i", "fa fa-code-fork");
  app.workspace.ribbon.addButton({ id: GIT_GRAPH_COMMAND, title: "Git Graph：查看提交关系图", group: "bottom", icon, onclick: open_graph });
  document.documentElement.setAttribute("data-linux-note-git-graph", "ready");
}
