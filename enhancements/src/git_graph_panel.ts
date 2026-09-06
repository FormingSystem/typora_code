import emoji_data from "../vendor/gemoji/emoji.json";
import { build_git_graph, type graph_row, type git_ref } from "./git_graph_data";
import { read_repository, compare_files, compare_patch, commit_containment, pull_request_url, WORKTREE, INDEX, EMPTY,
  type repository_state, type graph_commit, type graph_change } from "./git_graph_repository";
import { graph_defaults, GRAPH_SETTINGS_KEY, load_graph_settings, validate_settings, settings_choices, settings_labels, load_reviews, save_reviews, type graph_settings } from "./git_graph_settings";
import { graph_actions, plan_git_action, execute_git_action, type graph_action, type action_plan } from "./git_graph_actions";
import { graph_element as el, graph_button as button, graph_option as option, graph_dialog, graph_menu, inline_message, shortcut_matches } from "./git_graph_widgets";
import type { graph_host } from "./git_graph_host";

export class git_graph_panel {
  root: string; settings: graph_settings; state?: repository_state;
  container = el("section", "linux-note-git-graph"); toolbar = el("div", "git-graph-toolbar"); root_label = el("div", "git-graph-root");
  status = el("div", "git-graph-status"); list = el("div", "git-graph-list"); details = el("div", "git-graph-details", "选择提交查看详情；Ctrl / Cmd 点击第二条提交进行比较。");
  branch_select = el("select", "git-graph-branch"); repo_select = el("select", "git-graph-repositories"); search = el("input", "git-graph-search");
  body = el("div", "git-graph-body"); header = el("div", "git-graph-columns");
  refresh_button = button("刷新", () => void this.refresh()); more_button = button("加载更多", () => { this.count += this.settings.page_count; void this.refresh(false); });
  runner: ReturnType<graph_host["runner"]>; writer: ReturnType<graph_host["runner"]>;
  count: number; branches: string[] = []; selected = ""; from = EMPTY; to = "";
  epoch = 0; detail_epoch = 0; patch_epoch = 0; pending = false; writing = false; loaded = false; active = false;
  files: graph_change[] = []; containment = new Map<string, string>(); ancestors = new Set<string>();
  key_handler: (event: KeyboardEvent) => void;

  constructor(public host: graph_host, cwd: string) {
    this.root = cwd; this.settings = load_graph_settings(localStorage, cwd); this.count = this.settings.initial_count;
    this.runner = host.runner(this.settings); this.writer = host.runner(this.settings, true);
    this.branches = [...this.settings.on_load_branches]; if (this.settings.on_load_branch) this.branches = ["HEAD"];
    this.container.setAttribute("aria-label", "Git Graph 提交历史"); this.status.setAttribute("role", "status");
    this.branch_select.setAttribute("aria-label", "分支或标签"); this.branch_select.append(option("", "全部分支"));
    this.branch_select.onchange = () => { this.branches = this.branch_select.value ? [this.branch_select.value] : []; void this.refresh(); };
    this.repo_select.setAttribute("aria-label", "Git 仓库"); this.repo_select.onchange = () => this.switch_repo(this.repo_select.value);
    this.search.placeholder = "查找提交、日期、作者、编号和引用"; this.search.setAttribute("aria-label", "查找 Git 历史");
    this.search.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); this.find_next(event.shiftKey ? -1 : 1); } };
    this.toolbar.append(this.repo_select, button("仓库", () => this.manage_repositories()), this.branch_select, button("多选分支", () => this.filter_branches()), this.refresh_button,
      button("Fetch", () => this.action_dialog("fetch", "repository")), button("操作", () => this.repository_menu()), button("设置", () => this.settings_dialog()), this.search, button("查找", () => this.find_next()));
    this.body.append(this.list, this.details); this.container.append(this.root_label, this.toolbar, this.status, this.body, this.more_button);
    this.list.addEventListener("scroll", () => {
      if (this.settings.auto_load && !this.pending && this.state?.more && this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 60) { this.count += this.settings.page_count; void this.refresh(false); }
    });
    this.key_handler = event => this.keydown(event);
  }
  open(): void {
    this.active = true; window.addEventListener("keydown", this.key_handler, true);
    if (!this.loaded || this.pending || !this.settings.retain_context) void this.refresh(false);
    else if (this.selected) void this.show_comparison(this.from, this.to);
  }
  close(): void { this.active = false; this.epoch++; this.detail_epoch++; this.patch_epoch++; this.runner.cancel(); window.removeEventListener("keydown", this.key_handler, true); }
  report(error: unknown): void { this.status.textContent = String(error instanceof Error ? error.message : error); }
  persist_settings(): void { localStorage.setItem(GRAPH_SETTINGS_KEY + "settings:" + this.root, JSON.stringify(this.settings)); window.dispatchEvent(new CustomEvent("linux-note-git-settings", { detail: this.settings })); }
  known_repos(): string[] { try { return JSON.parse(localStorage.getItem(GRAPH_SETTINGS_KEY + "repositories") || "[]").filter((value: unknown) => typeof value === "string"); } catch { return []; } }
  save_repos(repos: string[]): void { localStorage.setItem(GRAPH_SETTINGS_KEY + "repositories", JSON.stringify([...new Set(repos)])); }
  switch_repo(root: string): void {
    if (this.writing) { this.report("Git 操作仍在执行，请等待结果。"); return; }
    this.root = root; this.state = undefined; this.loaded = false; this.selected = ""; this.branches = [];
    this.settings = load_graph_settings(localStorage, root); this.runner.cancel(); this.runner = this.host.runner(this.settings); this.writer = this.host.runner(this.settings, true);
    this.branches = this.settings.on_load_branch ? ["HEAD"] : [...this.settings.on_load_branches]; void this.refresh();
  }
  async refresh(reset = true): Promise<void> {
    const epoch = ++this.epoch; this.detail_epoch++; this.patch_epoch++; this.runner.cancel(); this.pending = true;
    if (reset) this.count = this.settings.initial_count;
    this.refresh_button.disabled = true; this.more_button.disabled = true; this.container.dataset.state = "loading"; this.status.textContent = "正在读取 Git 仓库…";
    try {
      if (!this.root) throw new Error("请先打开仓库中的文档，或通过“仓库”添加文件夹。");
      let state = await read_repository(this.runner.run, this.root, this.settings, this.count, this.branches);
      if (epoch !== this.epoch) return;
      if (!this.loaded) {
        const stored = load_graph_settings(localStorage, state.root);
        const config_path = this.host.path_api.join(state.root, ".typora_git_graph.json");
        if (!localStorage.getItem(GRAPH_SETTINGS_KEY + "settings:" + state.root) && this.host.fs.existsSync(config_path)) {
          const info = this.host.fs.statSync(config_path);
          if (info.size < 100000) {
            const imported = validate_settings(JSON.parse(this.host.fs.readFileSync(config_path, "utf8")));
            // 仓库共享配置只影响显示；不从项目文件取得可执行程序，也不自动启用联网头像。
            Object.assign(stored, imported, { git_path: stored.git_path, terminal_shell: stored.terminal_shell, fetch_avatars: stored.fetch_avatars });
          }
        }
        if (JSON.stringify(stored) !== JSON.stringify(this.settings)) {
          this.settings = stored; this.count = stored.initial_count; this.runner = this.host.runner(stored); this.writer = this.host.runner(stored, true);
          this.branches = stored.on_load_branch ? ["HEAD"] : [...stored.on_load_branches];
          state = await read_repository(this.runner.run, state.root, stored, this.count, this.branches);
          if (epoch !== this.epoch) return;
        }
      }
      const first_load = !this.loaded;
      state.operation = this.host.operation(state.operation); this.state = state; this.root = state.root; this.loaded = true; this.containment.clear();
      this.save_repos([this.root, ...this.known_repos()]); const repos = this.known_repos();
      if (this.settings.repository_order !== "recent") repos.sort((a, b) => (this.settings.repository_order === "name" ? this.host.path_api.basename(a).localeCompare(this.host.path_api.basename(b)) : a.localeCompare(b)));
      this.repo_select.replaceChildren(...repos.map(root => option(root, this.host.path_api.basename(root) || root))); this.repo_select.value = this.root;
      this.root_label.textContent = `${state.root}${state.branch ? " · " + state.branch : state.head ? " · 游离 HEAD" : ""}`; this.root_label.title = state.root;
      this.branch_select.replaceChildren(option("", "全部分支"), option("HEAD", "当前 HEAD"));
      for (const ref of state.refs) this.branch_select.append(option(ref.name, ref.name.replace(/^refs\//u, "")));
      for (const glob of this.settings.branch_globs) this.branch_select.append(option("glob:" + glob.glob, glob.name));
      this.branch_select.value = this.branches.length === 1 ? this.branches[0] : "";
      this.ancestors.clear();
      if (this.settings.mute_unreachable && state.head) {
        const hashes = await this.runner.run(this.root, ["rev-list", state.head, `--max-count=${this.count * 4}`]); if (epoch !== this.epoch) return;
        this.ancestors = new Set(hashes.trim().split("\n"));
      }
      this.render_history(); this.more_button.hidden = !state.more;
      this.status.textContent = `${state.commits.length ? `已加载 ${state.commits.length} 条提交` : "此仓库尚无提交"} · ${state.changes.length} 个未提交文件${state.operation ? " · 进行中：" + state.operation : ""}`;
      this.container.dataset.state = "ready";
      if (first_load && this.settings.on_load_head) this.scroll_to(state.head);
      if (this.selected && (this.selected === WORKTREE || state.commits.some(commit => commit.hash === this.selected))) void this.show_comparison(this.from, this.to);
      else { this.selected = ""; this.details.textContent = "选择提交查看详情；Ctrl / Cmd 点击第二条提交进行比较。"; }
    } catch (error) { if (epoch === this.epoch) { this.report(error); this.container.dataset.state = "error"; } }
    finally { if (epoch === this.epoch) { this.pending = false; this.refresh_button.disabled = false; this.more_button.disabled = false; } }
  }
  date(commit: graph_commit): string {
    const source = this.settings.date_type === "author" ? commit.date : commit.commit_date || commit.date;
    if (this.settings.date_format === "iso") return source;
    if (this.settings.date_format === "relative") { const days = Math.floor((Date.now() - new Date(source).getTime()) / 86400000); return days ? `${days} 天前` : "今天"; }
    return new Date(source).toLocaleString();
  }
  draw_graph(row: graph_row, width: number): SVGSVGElement {
    const ns = "http://www.w3.org/2000/svg"; const svg = document.createElementNS(ns, "svg"); svg.setAttribute("width", String(width * 18 + 18)); svg.setAttribute("height", "34"); svg.setAttribute("aria-hidden", "true");
    const x = (lane: number) => lane * 18 + 16;
    for (const edge of row.edges) {
      const path = document.createElementNS(ns, "path"); const top = edge.upper ? 0 : 17; const bottom = top + 17;
      path.setAttribute("d", this.settings.graph_style === "straight" ? `M${x(edge.from)},${top} L${x(edge.to)},${bottom}` : `M${x(edge.from)},${top} C${x(edge.from)},${top + 9} ${x(edge.to)},${bottom - 9} ${x(edge.to)},${bottom}`);
      path.setAttribute("fill", "none"); path.setAttribute("stroke", this.settings.colors[edge.color % this.settings.colors.length]); path.setAttribute("stroke-width", "2"); svg.append(path);
    }
    const dot = document.createElementNS(ns, "circle"); dot.setAttribute("cx", String(x(row.lane))); dot.setAttribute("cy", "17"); dot.setAttribute("r", "4"); dot.setAttribute("fill", this.settings.colors[row.color % this.settings.colors.length]); svg.append(dot); return svg;
  }
  render_history(): void {
    const state = this.state!;
    const connected = state.changes.length > 0 && this.settings.show_changes && this.settings.uncommitted_style === "connected";
    const graph = build_git_graph(connected ? [{ hash: WORKTREE, parents: state.head ? [state.head] : [], author: "", date: "", subject: "" }, ...state.commits] : state.commits);
    const fragment = document.createDocumentFragment();
    this.container.dataset.details = this.settings.details_location;
    this.container.dataset.labels = this.settings.label_alignment;
    for (const [key, width] of Object.entries(this.settings.column_widths)) this.container.style.setProperty(`--git-${key}-width`, width + "px");
    this.header.replaceChildren();
    this.header.style.paddingLeft = (graph.width * 18 + 26) + "px";
    for (const [key, title] of [["subject", "提交说明"], ["author", "作者"], ["date", "日期"], ["hash", "提交编号"]]) {
      if (key !== "subject" && !this.settings[("show_" + key) as keyof graph_settings]) continue;
      const label = el("div", "git-graph-column", title); label.style.width = `var(--git-${key}-width)`; const handle = el("span", "git-graph-column-resize"); label.append(handle);
      handle.onpointerdown = event => {
        event.preventDefault(); handle.setPointerCapture(event.pointerId); const start = event.clientX; const width = label.getBoundingClientRect().width;
        handle.onpointermove = move => { this.settings.column_widths[key as keyof graph_settings["column_widths"]] = Math.max(40, Math.min(1500, width + move.clientX - start)); this.container.style.setProperty(`--git-${key}-width`, this.settings.column_widths[key as keyof graph_settings["column_widths"]] + "px"); };
        handle.onpointerup = () => { handle.onpointermove = null; this.persist_settings(); };
      }; this.header.append(label);
    }
    if (state.changes.length && this.settings.show_changes) {
      const row = el("div", "git-graph-row git-graph-worktree", `● 未提交改动 · ${state.changes.length} 个文件`); row.dataset.hash = WORKTREE; row.tabIndex = 0;
      if (connected) row.prepend(this.draw_graph(graph.rows[0], graph.width));
      row.onclick = event => { if ((event.ctrlKey || event.metaKey) && this.selected && this.selected !== WORKTREE) void this.show_comparison(this.selected, WORKTREE); else { this.selected = WORKTREE; void this.show_comparison(state.head || EMPTY, WORKTREE); } };
      row.oncontextmenu = event => this.target_menu(event, "changes", "", state.head); if (this.settings.uncommitted_style === "connected") row.classList.add("connected"); fragment.append(row);
    }
    const ref_map = new Map<string, git_ref[]>();
    for (const ref of state.refs) {
      if ((!this.settings.show_tags && ref.name.startsWith("refs/tags/")) || (!this.settings.show_remotes && ref.name.startsWith("refs/remotes/")) || (!this.settings.show_remote_heads && /refs\/remotes\/.+\/HEAD$/u.test(ref.name))) continue;
      ref_map.set(ref.hash, [...(ref_map.get(ref.hash) || []), ref]);
    }
    state.commits.forEach((commit, index) => {
      const row = el("div", "git-graph-row"); row.dataset.hash = commit.hash; row.tabIndex = 0; row.setAttribute("role", "button"); row.setAttribute("aria-pressed", String(this.selected === commit.hash));
      row.title = `${commit.hash}\n${commit.author} · ${this.date(commit)}\n${commit.subject}`;
      if (this.settings.mute_merges && commit.parents.length > 1 || this.settings.mute_unreachable && !this.ancestors.has(commit.hash)) row.classList.add("git-graph-muted");
      row.onclick = event => { if ((event.ctrlKey || event.metaKey) && this.selected && this.selected !== commit.hash) void this.show_comparison(this.selected === WORKTREE ? commit.hash : this.selected, this.selected === WORKTREE ? WORKTREE : commit.hash); else this.select_commit(commit); };
      row.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.select_commit(commit); } };
      row.oncontextmenu = event => this.target_menu(event, commit.stash ? "stash" : "commit", commit.stash || commit.hash, commit.hash);
      const svg = this.draw_graph(graph.rows[index + (connected ? 1 : 0)], graph.width);
      svg.onmouseenter = () => { if (!this.containment.has(commit.hash)) void commit_containment(this.runner.run, state, commit.hash).then(value => { this.containment.set(commit.hash, value); row.title = value + "\n" + commit.subject; }).catch(() => {}); else row.title = this.containment.get(commit.hash)!; };
      const subject = el("span", "git-graph-subject"); const refs = el("span", "git-graph-labels");
      if (state.head === commit.hash) refs.append(el("span", "git-graph-refs", "HEAD"));
      if (commit.stash) { const badge = el("span", "git-graph-refs", commit.stash); badge.onclick = event => { event.stopPropagation(); this.target_menu(event, "stash", commit.stash!, commit.hash); }; refs.append(badge); }
      const items = ref_map.get(commit.hash) || []; const seen = new Set<string>();
      for (const ref of items) {
        const kind = ref.name.startsWith("refs/tags/") ? "tag" : ref.name.startsWith("refs/remotes/") ? "remote" : "branch";
        const name = ref.name.replace(/^refs\/(heads|tags|remotes)\//u, "");
        const base_name = kind === "remote" ? name.slice(name.indexOf("/") + 1) : name;
        if (this.settings.combine_refs && kind === "remote" && items.some(item => item.name === "refs/heads/" + base_name)) continue;
        if (seen.has(name)) continue; seen.add(name);
        const combined = this.settings.combine_refs && kind === "branch" ? items.filter(item => item.name.startsWith("refs/remotes/") && item.name.slice(item.name.indexOf("/", 13) + 1) === name).map(item => item.name.slice(13, item.name.indexOf("/", 13))) : [];
        const badge = el("span", "git-graph-refs git-ref-" + kind, name + (combined.length ? " · " + combined.join(", ") : "")); badge.dataset.ref = ref.name; badge.title = ref.name;
        badge.onclick = event => { event.stopPropagation(); this.target_menu(event, kind, name, commit.hash); }; badge.oncontextmenu = event => this.target_menu(event, kind, name, commit.hash); refs.append(badge);
      }
      subject.append(refs, el("span", "git-graph-subject-text", this.emoji(commit.subject)));
      row.append(svg, subject);
      if (this.settings.show_author) row.append(el("span", "git-graph-author", commit.author));
      if (this.settings.show_date) row.append(el("span", "git-graph-date", this.date(commit)));
      if (this.settings.show_hash) row.append(el("code", "git-graph-hash", commit.hash.slice(0, 8)));
      fragment.append(row);
    });
    const scroll = this.list.scrollTop; this.list.replaceChildren(this.header, fragment); this.place_details(); this.list.scrollTop = scroll;
  }
  place_details(): void {
    const row = [...this.list.querySelectorAll<HTMLElement>("[data-hash]")].find(item => item.dataset.hash === this.selected);
    if (this.settings.details_location === "inline" && row) row.after(this.details);
    else this.body.append(this.details);
  }
  emoji(text: string): string { return text.replace(/:[a-z_0-9+-]+:/giu, code => this.settings.emoji[code] || builtin_emoji[code] || code); }
  scroll_to(hash: string): void { const row = [...this.list.querySelectorAll<HTMLElement>("[data-hash]")].find(item => item.dataset.hash === hash); if (row) this.list.scrollTop = row.offsetTop - this.list.clientHeight / 2; }
  select_commit(commit: graph_commit): void { this.selected = commit.hash; if (this.settings.auto_center) this.scroll_to(commit.hash); void this.show_comparison(commit.parents[0] || EMPTY, commit.hash); }
  find_next(direction = 1): void {
    const query = this.search.value.trim().toLocaleLowerCase(); if (!query || !this.state) return;
    const matches = this.state.commits.filter(commit => [commit.subject, commit.author, this.date(commit), commit.hash, ...this.state!.refs.filter(ref => ref.hash === commit.hash).map(ref => ref.name)].some(value => value.toLocaleLowerCase().includes(query)));
    if (!matches.length) { this.status.textContent = "已加载历史中没有匹配项，可继续加载。"; return; }
    const current = matches.findIndex(commit => commit.hash === this.selected);
    const index = current < 0 ? direction > 0 ? 0 : matches.length - 1 : (current + direction + matches.length) % matches.length;
    this.select_commit(matches[index]); this.scroll_to(matches[index].hash); this.status.textContent = `找到 ${matches.length} 条 · 第 ${index + 1} 条`;
  }
  review_key(): string { return JSON.stringify([this.root, this.from, this.to]); }
  is_reviewed(file: string): boolean { return load_reviews(localStorage).find(review => JSON.stringify([review.root, review.from, review.to]) === this.review_key())?.reviewed.includes(file) || false; }
  review_active(): boolean { return load_reviews(localStorage).some(review => JSON.stringify([review.root, review.from, review.to]) === this.review_key()); }
  mark_reviewed(file: string): void {
    const reviews = load_reviews(localStorage); const review = reviews.find(item => JSON.stringify([item.root, item.from, item.to]) === this.review_key());
    if (review) { review.reviewed = [...new Set([...review.reviewed, file])]; review.updated_at = Date.now(); save_reviews(localStorage, reviews); }
    for (const node of this.details.querySelectorAll<HTMLElement>("[data-file]")) if (node.dataset.file === file) node.classList.remove("git-file-unreviewed");
  }
  async show_comparison(from: string, to: string): Promise<void> {
    if (!this.state) return; const epoch = ++this.detail_epoch; this.patch_epoch++; this.from = from; this.to = to;
    this.place_details();
    const commit = this.state.commits.find(item => item.hash === to);
    this.details.replaceChildren(el("div", "git-graph-commit-title", to === WORKTREE ? "未提交改动" : to === INDEX ? "已暂存改动" : commit?.subject || "提交比较"));
    this.details.append(el("code", "git-graph-full-hash", `${from} → ${to}`));
    for (const row of this.list.querySelectorAll<HTMLElement>("[data-hash]")) row.setAttribute("aria-pressed", String(row.dataset.hash === this.selected));
    const controls = el("div", "git-graph-detail-controls"); this.details.append(controls);
    if (to === WORKTREE || to === INDEX) {
      const mode = el("select", "git-graph-parent"); mode.append(option("all", "HEAD → 工作区"), option("staged", "HEAD → 暂存区"), option("unstaged", "暂存区 → 工作区"));
      mode.value = to === INDEX ? "staged" : from === INDEX ? "unstaged" : "all";
      mode.onchange = () => void this.show_comparison(mode.value === "unstaged" ? INDEX : this.state!.head || EMPTY, mode.value === "staged" ? INDEX : WORKTREE); controls.append(mode);
      controls.append(button("操作", () => this.repository_menu("changes")));
    } else {
      if (commit) {
        this.details.append(el("div", "git-graph-meta", `作者：${commit.author} <${commit.email || ""}> · ${commit.date}\n提交者：${commit.committer || commit.author} <${commit.committer_email || ""}> · ${commit.commit_date || commit.date}`));
        if (this.settings.fetch_avatars && commit.email) { const img = el("img", "git-graph-avatar"); img.alt = commit.author; this.details.append(img); void this.host.avatar(commit.email).then(url => { if (epoch === this.detail_epoch) img.src = url; }).catch(() => img.remove()); }
        const parent = el("select", "git-graph-parent"); parent.setAttribute("aria-label", "对比父提交");
        if (!commit.parents.length) parent.append(option(EMPTY, "首次提交 · 空树"));
        commit.parents.forEach((hash, index) => parent.append(option(hash, `父提交 ${index + 1} · ${hash.slice(0, 8)}`)));
        if (![...parent.options].some(item => item.value === from)) parent.append(option(from, "所选比较提交 · " + from.slice(0, 8)));
        parent.value = from; parent.onchange = () => void this.show_comparison(parent.value, to); controls.append(parent);
      }
      controls.append(button(this.review_active() ? "结束评审" : "开始评审", () => {
        const reviews = load_reviews(localStorage); const filtered = reviews.filter(item => JSON.stringify([item.root, item.from, item.to]) !== this.review_key());
        if (reviews.length === filtered.length) filtered.push({ root: this.root, from, to, reviewed: [], updated_at: Date.now() });
        save_reviews(localStorage, filtered); void this.show_comparison(from, to);
      }));
      const message = el("div", "git-graph-message", "正在读取提交说明…"); this.details.append(message);
      void this.runner.run(this.root, ["show", "-s", `--format=%B${this.settings.show_signature ? "%n签名：%G?%n%GS%n%GK" : ""}`, to, "--"]).then(text => {
        if (epoch === this.detail_epoch) message.replaceChildren(inline_message(text, { markdown: this.settings.inline_markdown, emoji: { ...builtin_emoji, ...this.settings.emoji }, issue_pattern: this.settings.issue_pattern, issue_url: this.settings.issue_url }, url => void this.host.open_url(url).catch(error => this.report(error))));
      }).catch(error => { if (epoch === this.detail_epoch) message.textContent = String(error); });
    }
    controls.append(button(this.settings.file_view === "tree" ? "切换列表" : "切换目录树", () => { this.settings.file_view = this.settings.file_view === "tree" ? "list" : "tree"; this.persist_settings(); void this.show_comparison(from, to); }));
    const files = el("div", "git-graph-files"); const patch = el("pre", "git-graph-patch", "选择文件查看差异。"); patch.tabIndex = 0;
    this.details.append(files, patch);
    try {
      this.files = await compare_files(this.runner.run, this.state, from, to); if (epoch !== this.detail_epoch) return;
      if (!this.files.length) { files.textContent = "没有文件差异。"; return; }
      this.render_files(files, patch);
    } catch (error) { if (epoch === this.detail_epoch) files.textContent = String(error); }
  }
  render_files(container: HTMLElement, patch: HTMLElement): void {
    const directories = new Map<string, HTMLElement>(); directories.set("", container);
    const parent_for = (path: string): HTMLElement => {
      if (directories.has(path)) return directories.get(path)!;
      const parts = path.split("/"); const parent = parent_for(parts.slice(0, -1).join("/"));
      const group = el("details", "git-file-directory"); group.open = true; group.append(el("summary", "", parts.at(-1)!)); parent.append(group); directories.set(path, group); return group;
    };
    for (const file of this.files) {
      const row = button(`${file.status}  ${file.old_path ? file.old_path + " → " : ""}${file.path}`, () => {
        for (const node of container.querySelectorAll(".selected")) node.classList.remove("selected"); row.classList.add("selected");
        void this.show_patch(file, patch).then(success => { if (success) this.mark_reviewed(file.path); });
      }, "git-graph-file"); row.dataset.file = file.path; row.title = file.path;
      if (this.review_active() && !this.is_reviewed(file.path)) row.classList.add("git-file-unreviewed");
      row.oncontextmenu = event => this.file_menu(event, file);
      (this.settings.file_view === "tree" ? parent_for(file.path.split("/").slice(0, -1).join("/")) : container).append(row);
    }
    if (this.settings.compact_folders) {
      for (const directory of [...container.querySelectorAll("details")].reverse()) {
        const children = [...directory.children];
        if (children.length === 2 && children[1].tagName === "DETAILS") {
          const child = children[1]; directory.querySelector("summary")!.textContent += "/" + child.querySelector("summary")!.textContent;
          directory.append(...[...child.children].slice(1)); child.remove();
        }
      }
    }
  }
  async show_patch(file: graph_change, target: HTMLElement): Promise<boolean> {
    const epoch = ++this.patch_epoch; target.textContent = "正在读取差异…";
    try {
      let text = await compare_patch(this.runner.run, this.state!, this.from, this.to, file);
      if (file.status === "??" || this.from === EMPTY && this.to === WORKTREE) text = (await this.host.revision_text(this.root, WORKTREE, file.path, this.settings)).split("\n").map(line => "+" + line).join("\n");
      if (epoch !== this.patch_epoch) return false;
      const fragment = document.createDocumentFragment(); const lines = text.split("\n");
      for (const line of lines.slice(0, 10000)) fragment.append(el("span", line.startsWith("+") ? "git-diff-add" : line.startsWith("-") ? "git-diff-delete" : line.startsWith("@@") ? "git-diff-hunk" : "", line + "\n"));
      if (lines.length > 10000) fragment.append(document.createTextNode("\n此处展示前 10000 行；右键文件可打开完整历史文本视图。"));
      target.replaceChildren(fragment); target.scrollTop = 0; return true;
    } catch (error) { if (epoch === this.patch_epoch) target.textContent = String(error); return false; }
  }
  file_menu(event: MouseEvent, file: graph_change): void {
    const entries = [
      { title: "打开当前文件", action: () => void this.host.open_file(this.root, file.path, this.settings).then(() => this.mark_reviewed(file.path)).catch(error => this.report(error)) },
      { title: "复制相对路径", action: () => void this.host.copy(file.path) }, { title: "复制绝对路径", action: () => void this.host.copy(this.host.file_path(this.root, file.path)) },
      { title: "打开双栏差异", action: () => void this.open_diff(file) },
      { title: "查看左侧历史版本", action: () => void this.open_revision(this.from, file.old_path || file.path) },
      { title: "查看右侧历史版本", action: () => void this.open_revision(this.to, file.path) },
      { title: "标记已评审", action: () => this.mark_reviewed(file.path) },
    ];
    if (this.to === WORKTREE || this.to === INDEX) for (const id of ["stage", "unstage"]) entries.push({ title: graph_actions.find(action => action.id === id)!.title, action: () => this.action_dialog(id, "file", file.path) });
    graph_menu(event, entries);
  }
  async open_revision(revision: string, file: string): Promise<void> {
    try { const text = await this.host.revision_text(this.root, revision, file, this.settings); this.host.open_document(`${revision.slice(0, 8)} · ${file}`, text, undefined, this.settings.new_tab_group); this.mark_reviewed(file); }
    catch (error) { this.report(error); }
  }
  async open_diff(file: graph_change): Promise<void> {
    try {
      const left = file.status.startsWith("A") || file.status === "??" ? "" : await this.host.revision_text(this.root, this.from, file.old_path || file.path, this.settings);
      const right = file.status.startsWith("D") ? "" : await this.host.revision_text(this.root, this.to, file.path, this.settings);
      const patch = await compare_patch(this.runner.run, this.state!, this.from, this.to, file);
      this.host.open_document(`${this.from.slice(0, 8)} ↔ ${this.to.slice(0, 8)} · ${file.path}`, left, right, this.settings.new_tab_group, patch); this.mark_reviewed(file.path);
    } catch (error) { this.report(error); }
  }
  target_menu(event: MouseEvent, kind: string, target: string, hash: string): void {
    const entries = graph_actions.filter(action => action.targets.includes(kind) && !this.settings.hidden_actions.includes(action.id)).map(action => ({ title: action.title, id: action.id, action: () => this.action_dialog(action.id, kind, target, hash) }));
    entries.push({ title: "复制名称或编号", id: "copy_name", action: () => void this.host.copy(target || hash) }, { title: "复制提交编号", id: "copy_hash", action: () => void this.host.copy(hash) });
    const commit = this.state?.commits.find(item => item.hash === hash);
    if (commit) entries.push({ title: "复制提交标题", id: "copy_subject", action: () => void this.host.copy(commit.subject) });
    if (kind === "tag") entries.push({ title: "查看标签详情", id: "tag_details", action: () => void this.tag_details(target) });
    if (kind === "branch" || kind === "remote") {
      entries.push({ title: "打开 Pull Request 表单", id: "pull_request", action: () => this.pr_dialog(kind === "remote" ? target.slice(target.indexOf("/") + 1) : target) });
      const name = kind === "branch" ? "refs/heads/" + target : "refs/remotes/" + target;
      entries.push({ title: this.branches.includes(name) ? "从分支筛选中移除" : "加入分支筛选", id: "filter", action: () => { this.branches = this.branches.includes(name) ? this.branches.filter(item => item !== name) : [...this.branches, name]; void this.refresh(); } });
    }
    if (["branch", "remote", "tag", "commit"].includes(kind)) entries.push({ title: "导出此版本的 ZIP 归档", id: "archive", action: () => this.archive_dialog(hash) });
    graph_menu(event, entries.filter(entry => !this.settings.hidden_actions.includes(entry.id)));
  }
  repository_menu(kind = "repository"): void {
    const dialog = graph_dialog(kind === "changes" ? "未提交改动操作" : "仓库操作");
    for (const action of graph_actions.filter(item => item.targets.includes(kind) && !this.settings.hidden_actions.includes(item.id))) dialog.content.append(button(action.title, () => { dialog.close(); this.action_dialog(action.id, kind, "", this.state?.head); }));
    dialog.content.append(button("远端配置", () => { dialog.close(); this.remotes_dialog(); }), button("打开仓库终端", () => { this.host.terminal(this.root, this.settings.terminal_shell); dialog.close(); }), button("管理评审记录", () => { dialog.close(); this.reviews_dialog(); }), button("清空头像缓存", () => { this.host.clear_avatars(); dialog.close(); }));
  }
  remotes_dialog(): void {
    const dialog = graph_dialog("仓库远端配置");
    if (!this.state?.remotes.length) dialog.content.append(el("p", "", "此仓库尚未配置远端。"));
    for (const remote of this.state?.remotes || []) {
      const row = el("div", "git-graph-repo-entry", `${remote.name}\nFetch：${remote.fetch}\nPush：${remote.push}`);
      for (const [title, id, preset] of [["修改 Fetch URL", "remote_edit", { url: remote.fetch }], ["修改 Push URL", "remote_edit", { url: remote.push, push_url: true }], ["Fetch", "fetch", {}], ["Prune", "remote_prune", {}], ["删除", "remote_remove", {}]] as const) row.append(button(title, () => { dialog.close(); this.action_dialog(id, "repository", "", "", { remote: remote.name, ...preset }); }));
      dialog.content.append(row);
    }
    dialog.footer.prepend(button("添加远端", () => { dialog.close(); this.action_dialog("remote_add", "repository"); }));
  }
  action_dialog(id: string, kind: string, target = "", hash = this.selected, preset: Record<string, string | boolean> = {}): void {
    if (!this.state || this.writing) { this.report("请等待仓库读取或当前操作完成。"); return; }
    const action = graph_actions.find(item => item.id === id)!; const dialog = graph_dialog(action.title); const fields = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
    const defaults = { ...this.settings.dialog_defaults[id], ...preset };
    dialog.content.append(el("p", "", `仓库：${this.root}\n目标：${target || hash || this.state.branch}`));
    const form = el("form", "git-graph-form"); const result = el("pre", "git-graph-action-preview"); dialog.content.append(form, result);
    for (const item of action.fields) {
      const input = item.type === "choice" ? el("select") : ["message", "todo"].includes(item.key) ? el("textarea") : el("input");
      let initial = defaults[item.key] ?? item.initial ?? "";
      if (item.key === "remote") initial = (kind === "remote" ? this.state.remotes.filter(remote => target.startsWith(remote.name + "/")).sort((a, b) => b.name.length - a.name.length)[0]?.name : "") || initial || this.state.remotes[0]?.name || "";
      if (item.key === "branch") initial = initial || (kind === "remote" ? target.slice(target.indexOf("/") + 1) : kind === "branch" && !["branch_create", "branch_rename"].includes(id) ? target : ["push", "pull"].includes(id) ? this.state.branch : "");
      if (item.key === "source" && kind === "remote") initial = target.slice(target.indexOf("/") + 1);
      if (item.key === "prune") initial = defaults.prune ?? this.settings.fetch_prune;
      if (item.key === "prune_tags") initial = defaults.prune_tags ?? this.settings.fetch_prune_tags;
      if (item.key === "sign") initial = defaults.sign ?? this.settings.sign_tags;
      if (input instanceof HTMLSelectElement) { for (const value of item.choices!) input.append(option(value, value)); input.value = String(initial); }
      else if (item.type === "boolean") { (input as HTMLInputElement).type = "checkbox"; (input as HTMLInputElement).checked = Boolean(initial); }
      else input.value = String(initial);
      input.dataset.field = item.key; fields.set(item.key, input); const label = el("label", "", item.title); label.append(input); form.append(label);
    }
    let plan: action_plan | undefined;
    let form_revision = 0;
    const execute = button("执行此操作", () => void submit()); execute.disabled = true; execute.setAttribute("data-git-execute", id);
    const preview = button("预览操作", () => void prepare()); preview.setAttribute("data-git-preview", id);
    form.oninput = () => { form_revision++; execute.disabled = true; plan = undefined; };
    const prepare = async () => {
      try {
        const revision = form_revision;
        preview.disabled = true; execute.disabled = true;
        const values: Record<string, unknown> = {};
        for (const [key, input] of fields) values[key] = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
        if (id === "rebase" && values.interactive && !values.todo) {
          fields.get("todo")!.value = await this.runner.run(this.root, ["log", "--reverse", "--no-merges", "--format=pick %H %s", `${hash}..HEAD`, "--"]);
          result.textContent = "已生成交互列表。可以调整顺序或改为 reword / edit / squash / fixup / drop；reword 的标题将作为新说明。确认列表后再次预览。"; return;
        }
        plan = await plan_git_action(this.runner.run, id, { root: this.root, target, hash: hash === WORKTREE ? this.state!.head : hash, operation: this.state!.operation, sign_commits: this.settings.sign_commits, sign_tags: this.settings.sign_tags }, values);
        if (revision !== form_revision) { plan = undefined; result.textContent = "参数已改变，请重新预览。"; return; }
        result.textContent = (action.destructive ? action.destructive + "\n\n" : "") + plan.preview; execute.disabled = false;
      } catch (error) { result.textContent = String(error); } finally { preview.disabled = false; }
    };
    const submit = async () => {
      if (!plan) return; this.writing = true; preview.disabled = true; execute.disabled = true;
      result.textContent += "\n\n执行中…";
      try { const output = await execute_git_action(this.writer.run, plan, () => this.host.can_change_files()); result.textContent += "\n" + (output || "操作完成。"); }
      catch (error) { result.textContent += "\n" + String(error); }
      finally { this.writing = false; plan = undefined; preview.disabled = false; await this.refresh(false); }
    };
    form.onsubmit = event => { event.preventDefault(); if (plan && !execute.disabled) void submit(); else void prepare(); };
    dialog.root.addEventListener("keydown", event => { if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); if (plan && !execute.disabled) void submit(); else void prepare(); } });
    dialog.footer.prepend(preview, execute);
  }
  async tag_details(name: string): Promise<void> {
    const dialog = graph_dialog("标签详情 · " + name);
    try {
      const text = await this.runner.run(this.root, ["for-each-ref", "--format=%(refname)%0a%(objecttype)%0a%(taggername) %(taggeremail)%0a%(taggerdate:iso8601)%0a%(contents)", "refs/tags/" + name]);
      dialog.content.append(inline_message(text, { markdown: this.settings.inline_markdown, emoji: { ...builtin_emoji, ...this.settings.emoji }, issue_pattern: this.settings.issue_pattern, issue_url: this.settings.issue_url }, url => void this.host.open_url(url).catch(error => this.report(error))));
    }
    catch (error) { dialog.content.textContent = String(error); }
  }
  pr_dialog(branch: string): void {
    const dialog = graph_dialog("创建 Pull Request"); const remote = el("select"); const base = el("input"); base.value = this.settings.pr_base; const error = el("p");
    for (const item of this.state!.remotes) remote.append(option(item.fetch, item.name)); dialog.content.append(el("p", "", "选择远端与目标分支，在浏览器打开预填表单。"), remote, base, error);
    dialog.footer.prepend(button("打开表单", () => { try { void this.host.open_url(pull_request_url(remote.value, branch, base.value, this.settings.pr_url)).catch(problem => { error.textContent = String(problem); }); } catch (problem) { error.textContent = String(problem); } }));
  }
  archive_dialog(hash: string): void {
    const dialog = graph_dialog("导出版本归档"); const target = el("input"); target.value = this.host.path_api.join(this.root, hash.slice(0, 8) + ".zip"); const error = el("pre"); dialog.content.append(target, error);
    dialog.footer.prepend(button("导出 ZIP", () => void (async () => {
      try { if (this.host.fs.existsSync(target.value)) throw new Error("目标已存在，请换一个名称。");
        await this.writer.run(this.root, ["archive", "--format=zip", "--output=" + target.value, hash]); error.textContent = "已导出：" + target.value;
      } catch (problem) { error.textContent = String(problem); }
    })()));
  }
  filter_branches(): void {
    if (!this.state) { this.report("请先打开有效仓库。"); return; }
    const dialog = graph_dialog("选择一个或多个分支"); const selected = new Set(this.branches);
    for (const [name, title] of [["HEAD", "当前 HEAD"], ...this.state!.refs.map(ref => [ref.name, ref.name.replace(/^refs\//u, "")]), ...this.settings.branch_globs.map(item => ["glob:" + item.glob, item.name])]) {
      const check = el("input"); check.type = "checkbox"; check.checked = selected.has(name); check.onchange = () => check.checked ? selected.add(name) : selected.delete(name);
      const label = el("label", "git-graph-filter", title); label.prepend(check); dialog.content.append(label);
    }
    dialog.footer.prepend(button("全部分支", () => { this.branches = []; dialog.close(); void this.refresh(); }), button("应用选择", () => { this.branches = [...selected]; dialog.close(); void this.refresh(); }));
  }
  manage_repositories(): void {
    const dialog = graph_dialog("管理 Git 仓库"); const input = el("input"); input.placeholder = "粘贴仓库文件夹路径"; input.value = this.root; const error = el("p"); const list = el("div");
    const render = () => { list.replaceChildren(); for (const root of this.known_repos()) {
      const row = el("div", "git-graph-repo-entry", root); row.append(button("打开", () => { this.switch_repo(root); dialog.close(); }), button("移除记录", () => { this.save_repos(this.known_repos().filter(item => item !== root)); render(); })); list.append(row);
    } }; render(); dialog.content.append(input, list, error);
    dialog.footer.prepend(button("添加仓库", () => void this.runner.run(input.value, ["rev-parse", "--show-toplevel"]).then(root => { this.save_repos([...this.known_repos(), root.trim()]); render(); }).catch(problem => { error.textContent = String(problem); })),
      button("发现子仓库", () => void this.host.discover(input.value, this.settings.search_depth).then(roots => { this.save_repos([...this.known_repos(), ...roots]); render(); error.textContent = `发现 ${roots.length} 个仓库。`; }).catch(problem => { error.textContent = String(problem); })));
  }
  settings_dialog(): void {
    if (this.writing) { this.report("Git 操作仍在执行，请等待结果。"); return; }
    const dialog = graph_dialog("Git Graph 设置"); const form = el("div", "git-graph-settings-form"); const fields = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(); const error = el("p");
    for (const [key, value] of Object.entries(this.settings)) {
      const input = settings_choices[key] ? el("select") : typeof value === "object" ? el("textarea") : el("input");
      input.dataset.setting = key;
      if (input instanceof HTMLSelectElement) for (const value of settings_choices[key]) input.append(option(value, value));
      if (typeof value === "boolean") { (input as HTMLInputElement).type = "checkbox"; (input as HTMLInputElement).checked = value; }
      else { input.value = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value); if (typeof value === "number") (input as HTMLInputElement).type = "number"; }
      const label = el("label", "", settings_labels[key as keyof graph_settings]); label.append(input); form.append(label); fields.set(key, input);
    }
    dialog.content.append(form, error);
    const apply = (settings: graph_settings) => { this.settings = settings; this.persist_settings(); this.runner.cancel(); this.runner = this.host.runner(settings); this.writer = this.host.runner(settings, true); dialog.close(); void this.refresh(); };
    const file = el("input"); file.type = "file"; file.accept = ".json"; file.hidden = true;
    file.onchange = () => void file.files?.[0]?.text().then(text => {
      try { const settings = validate_settings(JSON.parse(text)); apply({ ...settings, git_path: this.settings.git_path, terminal_shell: this.settings.terminal_shell, fetch_avatars: this.settings.fetch_avatars }); } catch (problem) { error.textContent = String(problem); }
    }); dialog.content.append(file);
    dialog.footer.prepend(button("保存设置", () => {
      try { const values: Record<string, unknown> = {}; for (const [key, input] of fields) {
        const baseline = graph_defaults[key as keyof graph_settings]; values[key] = typeof baseline === "boolean" ? (input as HTMLInputElement).checked : typeof baseline === "number" ? Number(input.value) : typeof baseline === "object" ? JSON.parse(input.value) : input.value;
      } apply(validate_settings(values)); } catch (problem) { error.textContent = String(problem); }
    }), button("恢复默认", () => apply(structuredClone(graph_defaults))), button("导入配置", () => file.click()), button("导出配置", () => this.host.export_file(this.root, ".typora_git_graph.json", JSON.stringify({ ...this.settings, git_path: "git", terminal_shell: "", fetch_avatars: false }, null, 2))));
  }
  reviews_dialog(): void {
    const dialog = graph_dialog("评审记录"); const render = () => {
      dialog.content.replaceChildren(); const reviews = load_reviews(localStorage);
      if (!reviews.length) dialog.content.textContent = "暂无评审记录。";
      for (const review of reviews) {
        const row = el("div", "git-graph-review", `${review.root}\n${review.from.slice(0, 8)} → ${review.to.slice(0, 8)} · 已读 ${review.reviewed.length} 个文件`);
        row.append(button("继续评审", () => { dialog.close(); if (review.root !== this.root) this.switch_repo(review.root); void (async () => { while (this.pending) await new Promise(resolve => setTimeout(resolve, 50)); this.selected = review.to; void this.show_comparison(review.from, review.to); })(); }),
          button("结束", () => { save_reviews(localStorage, reviews.filter(item => item !== review)); render(); })); dialog.content.append(row);
      }
    }; render(); dialog.footer.prepend(button("结束全部评审", () => { save_reviews(localStorage, []); render(); }));
  }
  keydown(event: KeyboardEvent): void {
    if (!this.active || this.host.core.app.workspace.activeLeaf?.view.containerEl !== this.container || document.querySelector('.git-graph-dialog-shade, .git-graph-menu') || event.isComposing) return;
    const editing = event.target instanceof Element && event.target.matches("input,textarea,select");
    let handled = true;
    if (shortcut_matches(event, this.settings.shortcuts.find)) this.search.focus();
    else if (shortcut_matches(event, this.settings.shortcuts.head)) this.scroll_to(this.state?.head || "");
    else if (shortcut_matches(event, this.settings.shortcuts.refresh)) void this.refresh();
    else if (shortcut_matches(event, this.settings.shortcuts.stash_next) || shortcut_matches(event, this.settings.shortcuts.stash_previous)) {
      const stashes = this.state?.commits.filter(commit => commit.stash) || []; const direction = event.shiftKey ? -1 : 1;
      if (stashes.length) {
        const current = stashes.findIndex(commit => commit.hash === this.selected);
        const index = current < 0 ? direction > 0 ? 0 : stashes.length - 1 : (current + direction + stashes.length) % stashes.length;
        this.select_commit(stashes[index]);
      }
    } else if (!editing && ["ArrowUp", "ArrowDown"].includes(event.key) && this.state) {
      const index = this.state.commits.findIndex(commit => commit.hash === this.selected); const current = this.state.commits[index]; let next: graph_commit | undefined;
      if (current && (event.ctrlKey || event.metaKey)) {
        if (event.key === "ArrowDown") next = this.state.commits.find(commit => commit.hash === current.parents[event.shiftKey ? 1 : 0]);
        else next = this.state.commits.filter(commit => commit.parents.includes(current.hash))[event.shiftKey ? 1 : 0];
      } else next = this.state.commits[Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1))];
      if (next) this.select_commit(next);
    } else if (event.key === "Escape") { this.detail_epoch++; this.patch_epoch++; this.details.textContent = "选择提交查看详情。"; this.selected = ""; }
    else handled = false;
    if (handled) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
}

// 常用 gitmoji 短代码；用户可在设置中覆盖或扩充映射。
const builtin_emoji: Record<string, string> = { ":art:": "🎨", ":zap:": "⚡️", ":fire:": "🔥", ":bug:": "🐛", ":ambulance:": "🚑️", ":sparkles:": "✨", ":memo:": "📝", ":rocket:": "🚀", ":lipstick:": "💄", ":tada:": "🎉", ":white_check_mark:": "✅", ":lock:": "🔒️", ":closed_lock_with_key:": "🔐", ":bookmark:": "🔖", ":rotating_light:": "🚨", ":construction:": "🚧", ":green_heart:": "💚", ":arrow_down:": "⬇️", ":arrow_up:": "⬆️", ":pushpin:": "📌", ":construction_worker:": "👷", ":chart_with_upwards_trend:": "📈", ":recycle:": "♻️", ":heavy_plus_sign:": "➕", ":heavy_minus_sign:": "➖", ":wrench:": "🔧", ":hammer:": "🔨", ":globe_with_meridians:": "🌐", ":pencil2:": "✏️", ":poop:": "💩", ":rewind:": "⏪️", ":twisted_rightwards_arrows:": "🔀", ":package:": "📦️", ":alien:": "👽️", ":truck:": "🚚", ":page_facing_up:": "📄", ":boom:": "💥", ":bento:": "🍱", ":wheelchair:": "♿️", ":bulb:": "💡", ":beers:": "🍻", ":speech_balloon:": "💬", ":card_file_box:": "🗃️", ":loud_sound:": "🔊", ":mute:": "🔇", ":busts_in_silhouette:": "👥", ":children_crossing:": "🚸", ":building_construction:": "🏗️", ":iphone:": "📱", ":clown_face:": "🤡", ":egg:": "🥚", ":see_no_evil:": "🙈", ":camera_flash:": "📸", ":alembic:": "⚗️", ":mag:": "🔍️", ":label:": "🏷️", ":seedling:": "🌱", ":triangular_flag_on_post:": "🚩", ":goal_net:": "🥅", ":dizzy:": "💫", ":wastebasket:": "🗑️", ":passport_control:": "🛂", ":adhesive_bandage:": "🩹", ":monocle_face:": "🧐", ":coffin:": "⚰️", ":test_tube:": "🧪", ":necktie:": "👔", ":stethoscope:": "🩺", ":bricks:": "🧱", ":technologist:": "🧑‍💻", ":money_with_wings:": "💸", ":thread:": "🧵", ":safety_vest:": "🦺", ":smile:": "😄", ":thumbsup:": "👍", ":heart:": "❤️" };

for (const item of emoji_data) for (const alias of item.aliases) builtin_emoji[":" + alias + ":"] ??= item.emoji;
