import { build_git_graph, type graph_row } from "./git_graph_data";
import { compare_files, EMPTY, type graph_change, type graph_commit, type repository_state } from "./git_graph_repository";
import { graph_element as el, graph_button as button, type graph_menu_entry } from "./git_graph_widgets";
import type { git_source_control } from "./git_source_control";

/** 复用仓库控制器的真实提交及拓扑；展开文件只读取所选提交，不切走当前文档。 */
export class git_scm_history {
  container = el("section", "git-scm-history"); header = el("div", "git-scm-history-header");
  list = el("div", "git-scm-history-list"); count = el("span", "git-scm-badge");
  toggle: HTMLButtonElement; selected = ""; epoch = 0; root = "";
  files_cache = new Map<string, graph_change[]>();
  collapsed_directories = new Set<string>();
  constructor(public owner: git_source_control) {
    this.container.setAttribute("aria-label", "提交图");
    this.container.setAttribute("data-linux-note-scm-history", "ready");
    this.toggle = button("⌄ 提交图", () => owner.toggle_history(), "git-scm-history-toggle");
    this.toggle.title = "展开或折叠提交图；右键筛选分支";
    this.toggle.setAttribute("aria-expanded", "true"); this.toggle.append(this.count);
    const refresh = button("↻", () => void owner.panel.refresh(false), "git-scm-history-refresh"); refresh.title = "刷新提交历史";
    const current = button("◎", () => void this.reveal_head(), "git-scm-history-head"); current.title = "定位当前提交（HEAD）"; current.setAttribute("aria-label", current.title);
    const launch = button("↗", () => owner.panel.host.show_history(owner.panel.root), "git-scm-graph-launch");
    launch.title = "在编辑区打开提交图"; launch.setAttribute("aria-label", launch.title);
    const branches = button("⑂", () => {}, "git-scm-history-branches"); branches.title = "筛选提交历史分支"; branches.onclick = event => owner.panel.configured_menu(event, "scm_history_branches", this.branch_entries());
    const more = button("…", () => {}, "git-scm-history-more-menu"); more.title = "更多提交图操作"; more.onclick = event => this.more_menu(event);
    const tools = el("span", "git-scm-history-toolbar");
    const network = [["fetch", "⇣", "获取远端更新"], ["pull", "↓", "拉取并整合远端更新"], ["push", "↑", "推送当前分支"]].map(([id, icon, title]) => {
      const action = button(icon, () => this.network_action(id), "git-scm-history-network"); action.title = title; action.setAttribute("aria-label", title); action.setAttribute("data-history-action", id); return action;
    });
    tools.append(branches, current, ...network, refresh, launch, more);
    for (const action of [branches, refresh, more]) action.setAttribute("aria-label", action.title);
    this.header.append(this.toggle, tools); this.container.append(this.header, this.list);
    this.header.oncontextmenu = event => this.more_menu(event);
    this.list.setAttribute("aria-label", "提交历史");
    this.list.addEventListener("keydown", event => {
      if (!event.target || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement; const row = target.closest<HTMLButtonElement>(".git-scm-history-commit");
      if (!row) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault(); event.stopPropagation();
        if ((event.key === "ArrowRight") !== (row.getAttribute("aria-expanded") === "true")) row.click();
      } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        const rows = [...this.list.querySelectorAll<HTMLButtonElement>(".git-scm-history-commit")]; const current = rows.indexOf(row);
        const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
        event.preventDefault(); event.stopPropagation(); rows[next]?.focus();
      }
    });
  }
  branch_entries(): graph_menu_entry[] {
    const panel = this.owner.panel; const select = (branches: string[]) => { panel.branches = branches; void panel.refresh(); };
    return [
      {id: "all_branches", title: "全部分支", checked: !panel.branches.length, action: () => select([])},
      {id: "current_branch", title: "当前 HEAD", checked: panel.branches.length === 1 && panel.branches[0] === "HEAD", action: () => select(["HEAD"])},
      ...(panel.state?.refs || []).filter(ref => ref.name.startsWith("refs/heads/")).map(ref => ({id: ref.name, title: ref.name.slice(11), checked: panel.branches.length === 1 && panel.branches[0] === ref.name, action: () => select([ref.name])})),
      {id: "multiple_branches", title: "选择多个分支…", separator: true, action: () => panel.filter_branches()},
    ];
  }
  network_action(id: string): void { this.owner.panel.action_dialog(id, "repository", "", this.owner.panel.state?.head); }
  more_menu(event: MouseEvent): void {
    const panel = this.owner.panel;
    const set_tree = (value: boolean) => { this.owner.history_tree = value; this.owner.save_layout(); if (panel.state) this.render(panel.state); };
    panel.configured_menu(event, "scm_history_toolbar", [
      {id: "history_list", title: "以列表显示", checked: !this.owner.history_tree, action: () => set_tree(false)},
      {id: "history_tree", title: "以树形显示", checked: this.owner.history_tree, action: () => set_tree(true)},
      {id: "branches", title: "分支范围", children: this.branch_entries(), separator: true, action() {}},
      {id: "head", title: "定位当前提交（HEAD）", action: () => void this.reveal_head()},
      ...[["fetch", "获取远端更新…"], ["pull", "拉取…"], ["push", "推送…"]].map(([id, title]) => ({id, title, action: () => this.network_action(id)})),
      {id: "refresh", title: "刷新提交历史", action: () => void panel.refresh(false)},
      {id: "open_graph", title: "在编辑区打开提交图", action: () => panel.host.show_history(panel.root)},
      {id: "settings", title: "提交图设置…", separator: true, action: () => panel.settings_dialog()},
    ]);
  }
  reset(): void { this.epoch++; this.root = this.owner.panel.root; this.selected = ""; this.files_cache.clear(); this.collapsed_directories.clear(); this.list.replaceChildren(); this.count.textContent = ""; }
  async reveal_head(): Promise<void> {
    const panel = this.owner.panel;
    if (!panel.state?.head) { panel.report("此仓库尚无当前提交。"); return; }
    if (!panel.state.commits.some(commit => commit.hash === panel.state!.head)) { panel.branches = ["HEAD"]; await panel.refresh(); }
    const state = panel.state; if (!state?.commits.some(commit => commit.hash === state.head)) return;
    this.selected = state.head; this.owner.history_open = true; this.owner.show_history = true; this.owner.apply_history_layout(); this.owner.save_layout(); this.render(state);
    const row = [...this.list.querySelectorAll<HTMLButtonElement>(".git-scm-history-commit")].find(item => item.dataset.hash === state.head);
    if (row) { this.list.scrollTop += row.getBoundingClientRect().top - this.list.getBoundingClientRect().top - this.list.clientHeight / 2 + row.clientHeight / 2; row.focus({preventScroll: true}); }
  }
  set_open(open: boolean): void {
    this.toggle.replaceChildren(document.createTextNode((open ? "⌄" : "›") + " 提交图"), this.count);
    this.toggle.setAttribute("aria-expanded", String(open)); this.list.hidden = !open;
  }
  render(state: repository_state): void {
    if (state.root !== this.root) this.reset();
    const epoch = ++this.epoch; const panel = this.owner.panel; const scroll = this.list.scrollTop;
    const focused_hash = this.list.contains(document.activeElement) ? (document.activeElement as Element | null)?.closest<HTMLElement>(".git-scm-history-commit")?.dataset.hash : undefined;
    if (!state.commits.some(commit => commit.hash === this.selected)) this.selected = "";
    const graph = build_git_graph(state.commits); const fragment = document.createDocumentFragment();
    this.count.textContent = String(state.commits.length) + (state.more ? "+" : "");
    const refs = new Map<string, string[]>();
    for (const ref of state.refs) {
      if (!panel.settings.show_tags && ref.name.startsWith("refs/tags/") || !panel.settings.show_remotes && ref.name.startsWith("refs/remotes/")) continue;
      if (!panel.settings.show_remote_heads && ref.name.startsWith("refs/remotes/") && ref.name.endsWith("/HEAD")) continue;
      refs.set(ref.hash, [...(refs.get(ref.hash) || []), ref.name.replace(/^refs\/(heads|remotes|tags)\//u, "")]);
    }
    for (const [index, commit] of state.commits.entries()) {
      const entry = el("div", "git-scm-history-entry"); const expanded = commit.hash === this.selected;
      const row = button("", () => { this.selected = this.selected === commit.hash ? "" : commit.hash; this.render(state); }, "git-scm-history-commit");
      row.dataset.hash = commit.hash; row.setAttribute("aria-expanded", String(expanded));
      const names = [...(commit.hash === state.head ? ["HEAD"] : []), ...(refs.get(commit.hash) || [])];
      row.title = `${commit.subject}\n${commit.author} · ${panel.date(commit)}\n${commit.hash}${names.length ? "\n" + names.join("、") : ""}`;
      const disclosure = el("span", "git-scm-history-disclosure", expanded ? "⌄" : "›"); disclosure.setAttribute("aria-hidden", "true");
      const summary = el("span", "git-scm-history-summary"); const subject = el("span", "git-scm-history-subject", panel.emoji(commit.subject));
      summary.append(subject);
      if (names.length) {
        const labels = el("span", "git-scm-history-refs"); labels.title = names.join("、");
        for (const name of names) labels.append(el("span", "git-scm-history-ref", name));
        summary.append(labels);
      }
      const svg = panel.draw_graph(graph.rows[index], graph.width);
      svg.setAttribute("viewBox", `0 0 ${graph.width * 18 + 18} 34`); svg.setAttribute("height", "26"); svg.setAttribute("preserveAspectRatio", "none");
      row.append(disclosure, svg, summary);
      row.oncontextmenu = event => panel.target_menu(event, "commit", commit.hash, commit.hash); entry.append(row);
      if (expanded) {
        const expansion = el("div", "git-scm-history-expansion"); expansion.style.setProperty("--git-history-lanes", graph.width * 18 + 34 + "px");
        const files = el("div", "git-scm-history-files"); files.dataset.commit = commit.hash;
        expansion.append(this.continuation(graph.rows[index], graph.width), files); entry.append(expansion);
        if (this.files_cache.has(commit.hash)) this.render_files(files, commit, this.files_cache.get(commit.hash)!);
        else { files.textContent = "正在读取提交文件…"; void this.load_files(state, commit, files, epoch); }
      }
      fragment.append(entry);
    }
    if (!state.commits.length) fragment.append(el("div", "git-scm-empty", state.head ? "当前分支筛选没有提交。" : "此仓库尚无提交。"));
    if (state.more) fragment.append(button("加载更多提交", () => { if (panel.pending) return; panel.count += panel.settings.page_count; void panel.refresh(false); }, "git-scm-history-more"));
    this.list.replaceChildren(fragment); this.list.scrollTop = scroll;
    if (focused_hash) [...this.list.querySelectorAll<HTMLButtonElement>(".git-scm-history-commit")].find(row => row.dataset.hash === focused_hash)?.focus({preventScroll: true});
  }
  /** 文件展开区域延长每条离开当前提交的轨道，保持上下提交连线连续。 */
  continuation(row: graph_row, width: number): SVGSVGElement {
    const ns = "http://www.w3.org/2000/svg"; const svg = document.createElementNS(ns, "svg");
    svg.classList.add("git-scm-history-continuation"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("width", String(width * 18 + 18));
    svg.setAttribute("viewBox", `0 0 ${width * 18 + 18} 1`); svg.setAttribute("preserveAspectRatio", "none");
    const lanes = new Set<number>();
    for (const edge of row.edges) if (!edge.upper && !lanes.has(edge.to)) {
      lanes.add(edge.to); const line = document.createElementNS(ns, "line"); const x = String(edge.to * 18 + 16);
      line.setAttribute("x1", x); line.setAttribute("x2", x); line.setAttribute("y1", "0"); line.setAttribute("y2", "1");
      line.setAttribute("stroke", this.owner.panel.settings.colors[edge.color % this.owner.panel.settings.colors.length]); line.setAttribute("stroke-width", "2"); line.setAttribute("vector-effect", "non-scaling-stroke"); svg.append(line);
    }
    return svg;
  }
  async load_files(state: repository_state, commit: graph_commit, target: HTMLElement, epoch: number): Promise<void> {
    try {
      const files = await compare_files(this.owner.panel.runner.run, state, commit.parents[0] || EMPTY, commit.hash);
      if (epoch !== this.epoch || state.root !== this.root) return;
      this.files_cache.set(commit.hash, files); this.render_files(target, commit, files);
    } catch (error) { if (epoch === this.epoch) { target.textContent = String(error instanceof Error ? error.message : error); target.append(button("重试", () => { const current = this.owner.panel.state; if (current) this.render(current); })); } }
  }
  render_files(target: HTMLElement, commit: graph_commit, files: graph_change[]): void {
    target.replaceChildren(); const from = commit.parents[0] || EMPTY;
    target.append(el("div", "git-scm-history-file-count", `${files.length} 个更改文件${commit.parents.length > 1 ? " · 对比第一个父提交" : ""}`));
    const directories = new Map<string, HTMLElement>([["", target]]);
    const parent_for = (path: string): HTMLElement => {
      if (!this.owner.history_tree || !path) return target;
      if (directories.has(path)) return directories.get(path)!;
      const parts = path.split("/"); const parent = parent_for(parts.slice(0, -1).join("/"));
      const directory = el("details", "git-scm-history-directory"); const key = commit.hash + ":" + path;
      directory.open = !this.collapsed_directories.has(key); directory.setAttribute("data-history-directory", path); directory.append(el("summary", "", parts.at(-1)!));
      directory.ontoggle = () => { if (directory.open) this.collapsed_directories.delete(key); else this.collapsed_directories.add(key); };
      parent.append(directory); directories.set(path, directory); return directory;
    };
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      const row = button("", () => void this.owner.open_file(file, from, commit.hash, files), "git-scm-history-file");
      row.setAttribute("data-history-file", file.path); row.title = (file.old_path ? file.old_path + " → " : "") + file.path;
      const label = el("span", "git-scm-file-label"); label.append(el("span", "git-scm-history-file-name", file.path.split("/").at(-1)!));
      if (!this.owner.history_tree) label.append(el("span", "git-scm-file-directory", file.path.split("/").slice(0, -1).join("/")));
      const status = el("span", "git-scm-file-status", file.status); status.title = file.status; status.setAttribute("data-status", file.status[0]); row.append(label, status);
      row.oncontextmenu = event => this.owner.panel.configured_menu(event, "scm_history_file", this.owner.file_entries(file, from, commit.hash, files)); parent_for(file.path.split("/").slice(0, -1).join("/")).append(row);
    }
  }
  dispose(): void { this.epoch++; this.files_cache.clear(); }
}
