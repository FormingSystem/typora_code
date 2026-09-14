import {git_operation_progress} from "./git_operation_progress";
import {bind_git_progress_view} from "./git_progress_view";
import {git_scm_ref_picker} from "./git_scm_ref_picker";
import {prepare_quick_git_action,type quick_git_action,type quick_git_options} from "./git_quick_actions";
import {git_discard_confirmation} from "./git_discard_confirmation";
import {commit_entries} from "./git_scm_menus";
import {workspace_file_icon} from "./workspace_file_icons";
import { git_graph_find } from "./git_graph_find";
import { show_pull_request_dialog } from "./git_graph_pull_request_dialog";
import { git_source_control } from "./git_source_control";
import { git_icon, git_icon_button } from "./git_icons";
import { graph_file_icon } from "./git_graph_file_icon";
import type { workspace_menu_entry } from "./workspace_widgets";
import emoji_data from "../vendor/gemoji/emoji.json";
import { build_git_graph, type graph_row, type git_ref } from "./git_graph_data";
import { read_repository, compare_files, commit_containment, pull_request_url, WORKTREE, INDEX, EMPTY,
  type repository_state, type graph_commit, type graph_change } from "./git_graph_repository";
import { graph_defaults, settings_choices, settings_labels_for, settings_choice_label, GRAPH_SETTINGS_KEY, load_graph_settings, validate_settings, load_reviews, save_reviews, type graph_settings } from "./git_graph_settings";
import { graph_actions, plan_git_action, execute_git_action, type graph_action, type action_plan } from "./git_graph_actions";
import { workspace_element as el, workspace_button as button, workspace_option as option, workspace_dialog, workspace_menu, inline_message, shortcut_matches } from "./workspace_widgets";
import { is_composing_key, is_terminal_input } from "./workspace_keyboard";
import type { graph_host } from "./git_graph_host";
import { git_graph_language_tag, git_graph_text as text, type git_graph_text_key } from "./git_graph_i18n";

const graph_dialog = (title: string) => workspace_dialog(title, text("common.close"));
const revision_label = (revision: string): string => revision === WORKTREE ? text("graph.revision.worktree") : revision === INDEX ? text("graph.revision.index") : revision === EMPTY ? text("graph.revision.empty") : revision;
const short_revision_label = (revision: string): string => revision === WORKTREE || revision === INDEX || revision === EMPTY ? revision_label(revision) : revision.slice(0, 8);
const operation_label = (operation: string): string => {
  const key = ({ merge: "graph.operation.merge", rebase: "graph.operation.rebase", "cherry-pick": "graph.operation.cherry_pick", revert: "graph.operation.revert" } as const)[operation as "merge" | "rebase" | "cherry-pick" | "revert"];
  return key ? text(key) : operation;
};
const target_kind_label = (kind: string): string => text(({
  repository: "graph.target.repository", changes: "graph.target.changes", branch: "graph.target.branch", remote: "graph.target.remote",
  tag: "graph.target.tag", commit: "graph.target.commit", stash: "graph.target.stash", file: "graph.target.file",
} as Record<string, git_graph_text_key>)[kind] || "graph.target.repository");

export class git_graph_panel {
  root: string; settings: graph_settings; state?: repository_state;
  container = el("section", "linux-note-git-graph"); toolbar = el("div", "git-graph-toolbar");
  status = el("div", "git-graph-status"); list = el("div", "git-graph-list"); details = el("section", "git-graph-details");
  branch_select = el("select", "git-graph-branch"); repo_select = el("select", "git-graph-repositories"); search = el("input", "git-graph-search");
  show_remote_input = el("input", "git-graph-show-remote-input"); find_widget = el("div", "git-graph-find-widget"); find_position = el("span", "git-graph-find-position");
  workbench: git_source_control; finder: git_graph_find;
  ref_picker = new git_scm_ref_picker(this);
  remote_picker?: ReturnType<typeof workspace_dialog>;
  private action_epoch = 0;
  progress = new git_operation_progress();
  private progress_views:ReturnType<typeof bind_git_progress_view>[]=[];
  private read_progress?:ReturnType<git_operation_progress["begin"]>;
  private write_progress?:ReturnType<git_operation_progress["begin"]>;
  discard_confirmation = new git_discard_confirmation(this);
  body = el("div", "git-graph-body"); header = el("div", "git-graph-columns");
  refresh_button = git_icon_button("refresh", text("graph.refresh"), () => void this.refresh(), "git-graph-refresh");
  more_button = button(text("graph.load_more"), () => { this.count += this.settings.page_count; void this.refresh(false); }, "git-graph-load-more");
  runner: ReturnType<graph_host["runner"]>; writer: ReturnType<graph_host["runner"]>;
  count: number; branches: string[] = []; selected = ""; from = EMPTY; to = "";
  repository_epoch = 0; epoch = 0; detail_epoch = 0; pending = false; writing = false; loaded = false; active = false; disposed = false;
  last_refreshed_at = 0; refresh_started_at = 0;
  private state_listeners = new Set<() => void>();
  private refresh_task?: Promise<void>; private refresh_request = ""; private rendered_snapshot = "";
  private refresh_runner?: typeof this.runner; private detail_refresh_needed = false;
  files: graph_change[] = []; containment = new Map<string, string>(); ancestors = new Set<string>();
  detail_graph_rows = new Map<string, graph_row>();
  detail_summary_ratio = .5;
  key_handler: (event: KeyboardEvent) => void;

  constructor(public host: graph_host, cwd: string) {
    this.root = cwd; this.settings = load_graph_settings(localStorage, cwd); this.count = this.settings.initial_count;
    this.runner = host.runner(this.settings); this.writer = host.runner(this.settings, true);
    this.branches = [...this.settings.on_load_branches]; if (this.settings.on_load_branch) this.branches = ["HEAD"];
    this.container.setAttribute("aria-label", text("graph.aria_label")); this.status.setAttribute("role", "status");
    this.branch_select.setAttribute("aria-label", text("graph.branches")); this.branch_select.append(option("", text("graph.all_branches")));
    this.branch_select.onchange = () => {
      if (this.branch_select.value === "__multiple__") { this.branch_select.value = this.branches.length === 1 ? this.branches[0] : ""; this.filter_branches(); return; }
      this.branches = this.branch_select.value ? [this.branch_select.value] : []; void this.refresh();
    };
    this.repo_select.setAttribute("aria-label", text("graph.repository")); this.repo_select.onchange = () => {
      if (this.repo_select.value === "__manage__") { this.repo_select.value = this.root; this.manage_repositories(); return; }
      this.switch_repo(this.repo_select.value);
    };
    this.show_remote_input.type = "checkbox"; this.show_remote_input.checked = this.settings.show_remotes;
    this.show_remote_input.onchange = () => { this.settings.show_remotes = this.show_remote_input.checked; this.persist_settings(); void this.refresh(); };
    this.search.placeholder = text("graph.find_placeholder"); this.search.setAttribute("aria-label", text("graph.find_history"));
    const repo_control = el("label", "git-graph-control git-graph-repository-control", text("graph.repository")); repo_control.hidden = true; repo_control.append(this.repo_select);
    const branch_control = el("label", "git-graph-control git-graph-branch-control", text("graph.branches")); branch_control.append(this.branch_select);
    const remote_control = el("label", "git-graph-control git-graph-remote-control", text("graph.show_remote_branches")); remote_control.prepend(this.show_remote_input);
    const actions = el("div", "git-graph-toolbar-actions");
    actions.append(
      git_icon_button("search", text("graph.find_commit"), () => this.open_find(), "git-graph-find-toggle"),
      git_icon_button("terminal", text("graph.open_terminal"), () => this.host.terminal(this.root, this.settings.terminal_shell), "git-graph-terminal"),
      git_icon_button("settings-gear", text("graph.actions_and_settings"), () => this.repository_menu(), "git-graph-settings"),
      git_icon_button("git-fetch", text("graph.fetch"), () => this.action_dialog("fetch", "repository"), "git-graph-fetch"),
      this.refresh_button,
    );
    this.toolbar.append(repo_control, branch_control, remote_control, actions);
    this.find_widget.setAttribute("aria-label", text("graph.find_commit")); this.find_widget.dataset.open = "false";
    this.finder = new git_graph_find(this);
    this.header.oncontextmenu = event => this.layout_menu(event);
    this.container.oncontextmenu = event => {
      if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      this.background_menu(event);
    };
    this.body.append(this.list); this.workbench = new git_source_control(this); this.container.append(this.toolbar, this.find_widget, this.status, this.body, this.more_button);
    this.progress.configure(this.settings.show_progress);
    this.progress_views=[this.toolbar,this.workbench.input_heading,this.workbench.history.header].map(owner=>bind_git_progress_view(owner,this.progress));
    this.list.addEventListener("scroll", () => {
      if (this.settings.auto_load && !this.pending && this.state?.more && this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 60) { this.count += this.settings.page_count; void this.refresh(false); }
    });
    this.key_handler = event => this.keydown(event);
  }
  open(): void {
    if (this.disposed) return;
    this.active = true; window.addEventListener("keydown", this.key_handler, true);
    // 标签切换只改变可见性；在途读取继续填充同一视图，已有详情和滚动状态保留。
    if (!this.pending && (!this.loaded || !this.settings.retain_context)) void this.refresh(false);
  }
  close(): void { this.active = false; window.removeEventListener("keydown", this.key_handler, true); }
  /** 选择远端期间尚未执行网络命令，可以取消；已开始的写操作保持原有关闭保护。 */
  private cancel_remote_picker(): void {
    const picker = this.remote_picker; if (!picker) return;
    this.action_epoch++; this.remote_picker = undefined;
    picker.close(false); this.writing = false;this.write_progress?.finish();this.write_progress=undefined;
  }
  assert_can_dispose(): void { if (this.writing && !this.remote_picker) throw new Error(text("graph.operation_pending")); }
  dispose(): void {
    if (this.disposed) return;
    this.assert_can_dispose(); this.cancel_remote_picker(); this.ref_picker.close(false); this.discard_confirmation.close(false); this.disposed = true; this.close(); this.epoch++; this.runner.cancel(); this.pending = false; this.writer.cancel(); this.close_details();
    this.progress.dispose();for(const view of this.progress_views)view.dispose();this.progress_views=[];
    this.workbench.dispose(); this.container.remove(); this.container.replaceChildren(); this.state = undefined;
    this.publish_state(); this.state_listeners.clear();
    this.finder.close(); this.containment.clear(); this.ancestors.clear();
  }
  report(error: unknown): void { if (this.disposed) return; this.status.textContent = String(error instanceof Error ? error.message : error); if (this.workbench) this.workbench.notice.textContent = this.status.textContent; }
  persist_settings(): void { localStorage.setItem(GRAPH_SETTINGS_KEY + "settings:" + this.root, JSON.stringify(this.settings));this.progress.configure(this.settings.show_progress); window.dispatchEvent(new CustomEvent("linux-note-git-settings", { detail: this.settings })); }
  repository_paths(repos:string[]):string[]{
    const found=new Set<string>();return repos.filter(root=>{if(typeof root!=="string"||!root)return false;let key=this.host.path_api.normalize(root);if(this.host.path_api.sep==="\\")key=key.toLowerCase();if(found.has(key))return false;found.add(key);return true;});
  }
  known_repos(): string[] { try { return this.repository_paths(JSON.parse(localStorage.getItem(GRAPH_SETTINGS_KEY + "repositories") || "[]")); } catch { return []; } }
  save_repos(repos: string[]): void { localStorage.setItem(GRAPH_SETTINGS_KEY + "repositories", JSON.stringify(this.repository_paths(repos))); }
  async switch_repo(root: string): Promise<void> {
    this.cancel_remote_picker();
    if (this.writing) { this.report(text("graph.operation_pending")); return; }
    this.ref_picker.close(false); this.remote_picker?.close(false); this.discard_confirmation.close(false);
    this.progress.reset();this.repository_epoch++; this.root = root; this.workbench.load_layout(); this.state = undefined; this.loaded = false; this.close_details(); this.branches = [];
    this.last_refreshed_at = 0; this.publish_state();
    this.settings = load_graph_settings(localStorage, root); this.runner.cancel(); this.runner = this.host.runner(this.settings); this.writer = this.host.runner(this.settings, true);
    this.branches = this.settings.on_load_branch ? ["HEAD"] : [...this.settings.on_load_branches]; await this.refresh();
  }
  update_scm_actions():void{this.progress.configure(this.settings.show_progress);this.workbench.history.toolbar.update();this.workbench.repositories.update_disabled();this.workbench.update_actions();this.discard_confirmation.update_state();this.ref_picker.update_state();}
  subscribe_state(listener: () => void): () => void { this.state_listeners.add(listener); listener(); return () => this.state_listeners.delete(listener); }
  private publish_state(): void { for (const listener of this.state_listeners) listener(); }
  refresh(reset = true): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const request = JSON.stringify([this.repository_epoch, this.root, this.settings, reset ? this.settings.initial_count : this.count, this.branches]);
    // 同一目标的并发入口共享读取；筛选、配置或切库变化仍使旧请求失效。
    if (this.pending && this.refresh_task && this.refresh_request === request && this.refresh_runner === this.runner) return this.refresh_task;
    if (this.refresh_runner && this.refresh_runner !== this.runner) this.detail_refresh_needed = true;
    this.refresh_runner = this.runner;
    this.refresh_request = request;
    const task = this.refresh_repository(reset); this.refresh_task = task;
    void task.then(() => { if (this.refresh_task === task) this.refresh_task = undefined; });
    return task;
  }
  private async refresh_repository(reset: boolean): Promise<void> {
    if (this.disposed) return;
    this.refresh_started_at = Date.now();
    const epoch = ++this.epoch;
    // 正常刷新不取消仍在读取的历史详情；替换在途查询时才使旧详情失效。
    if (this.pending) { this.detail_epoch++; this.detail_refresh_needed = true; this.runner.cancel(); }
    this.pending = true;
    const previous_progress=this.read_progress,activity=this.progress.begin("refresh",text("graph.loading_repository"));this.read_progress=activity;previous_progress?.finish();
    if (reset) this.count = this.settings.initial_count;
    this.refresh_button.disabled = true; this.more_button.disabled = true; this.container.dataset.state = "loading"; this.status.textContent = text("graph.loading_repository");this.update_scm_actions();
    try {
      if (!this.root) throw new Error(text("graph.open_repository_first"));
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
      state.operation = this.host.operation(state.operation);
      const repository_paths = this.repository_paths([state.root, ...this.known_repos()]);
      const snapshot = JSON.stringify([state, this.settings, this.branches, this.count, repository_paths]);
      const changed = first_load || snapshot !== this.rendered_snapshot;
      this.state = state; this.root = state.root; this.loaded = true;
      if (changed) {
        this.containment.clear();
        if (first_load && !this.workbench.message.value) this.workbench.load_layout();
        this.save_repos(repository_paths); const repos = this.known_repos();
        if (this.settings.repository_order !== "recent") repos.sort((a, b) => (this.settings.repository_order === "name" ? this.host.path_api.basename(a).localeCompare(this.host.path_api.basename(b)) : a.localeCompare(b)));
        this.repo_select.replaceChildren(...repos.map(root => option(root, this.host.path_api.basename(root) || root)), option("__manage__", text("graph.manage_repositories"))); this.repo_select.value = this.root;
        const repository_control = this.repo_select.closest<HTMLElement>(".git-graph-repository-control"); if (repository_control) repository_control.hidden = repos.length <= 1;
        this.container.title = `${state.root}${state.branch ? " · " + state.branch : state.head ? " · " + text("graph.detached_head") : ""}`;
        this.branch_select.replaceChildren(option("", text("graph.all_branches")), option("HEAD", text("graph.current_head")));
        for (const ref of state.refs) this.branch_select.append(option(ref.name, ref.name.replace(/^refs\//u, "")));
        for (const glob of this.settings.branch_globs) this.branch_select.append(option("glob:" + glob.glob, glob.name));
        this.branch_select.append(option("__multiple__", text("graph.select_multiple_branches")));
        this.branch_select.value = this.branches.length === 1 ? this.branches[0] : "";
        this.show_remote_input.checked = this.settings.show_remotes;
        this.ancestors.clear();
        if (this.settings.mute_unreachable && state.head) {
          const hashes = await this.runner.run(this.root, ["rev-list", state.head, `--max-count=${this.count * 4}`]); if (epoch !== this.epoch) return;
          this.ancestors = new Set(hashes.trim().split("\n"));
        }
        this.render_history();
      }
      await this.workbench.refresh(changed); if (epoch !== this.epoch) return; this.more_button.hidden = !state.more;
      this.rendered_snapshot = snapshot;
      this.status.textContent = `${state.commits.length ? text("graph.loaded_commits", {count: state.commits.length}) : text("graph.no_commits")} · ${text("graph.uncommitted_files", {count: state.changes.length})}${state.operation ? " · " + text("graph.operation_in_progress", {operation: operation_label(state.operation)}) : ""}`;
      this.container.dataset.state = "ready";
      if (first_load && this.settings.on_load_head) this.scroll_to(state.head);
      if (this.selected && (this.selected === WORKTREE && state.changes.length > 0 || state.commits.some(commit => commit.hash === this.selected))) {
        // 文件仍为M不代表内容未变；可变版本继续取内容，历史版本保留阅读位置。
        if (changed || this.detail_refresh_needed || [WORKTREE, INDEX].includes(this.from) || [WORKTREE, INDEX].includes(this.to)) void this.show_comparison(this.from, this.to);
      }
      else this.close_details();
      this.detail_refresh_needed = false;
    } catch (error) { if (epoch === this.epoch) { this.report(error); this.container.dataset.state = "error"; } }
    finally { if (epoch === this.epoch) { this.pending = false; this.last_refreshed_at = Date.now(); this.refresh_button.disabled = false; this.more_button.disabled = false; this.update_scm_actions(); if(this.workbench.show_repositories)this.workbench.repositories.refresh(); this.publish_state(); }activity.finish();if(this.read_progress===activity)this.read_progress=undefined; }
  }
  date(commit: graph_commit): string {
    const source = this.settings.date_type === "author" ? commit.date : commit.commit_date || commit.date;
    if (this.settings.date_format === "iso") return source;
    if (this.settings.date_format === "iso_date") return source.slice(0, 10);
    if (this.settings.date_format === "date") return new Date(source).toLocaleDateString(git_graph_language_tag());
    if (this.settings.date_format === "relative") {
      const seconds = (new Date(source).getTime() - Date.now()) / 1000;
      const unit = Math.abs(seconds) >= 86400 ? "day" : Math.abs(seconds) >= 3600 ? "hour" : Math.abs(seconds) >= 60 ? "minute" : "second";
      return new Intl.RelativeTimeFormat(git_graph_language_tag(), {numeric: "auto"}).format(Math.round(seconds / ({day: 86400, hour: 3600, minute: 60, second: 1}[unit])), unit);
    }
    return new Date(source).toLocaleString(git_graph_language_tag());
  }
  draw_graph(row: graph_row, width: number, geometry = {lane_width: 16, first_x: 10, right_gap: 10, height: 24}): SVGSVGElement {
    const ns = "http://www.w3.org/2000/svg"; const svg = document.createElementNS(ns, "svg"); svg.setAttribute("width", String((width - 1) * geometry.lane_width + geometry.first_x + geometry.right_gap)); svg.setAttribute("height", String(geometry.height)); svg.setAttribute("aria-hidden", "true");
    const x = (lane: number) => lane * geometry.lane_width + geometry.first_x;
    const half_height = geometry.height / 2;
    for (const edge of row.edges) {
      const path = document.createElementNS(ns, "path"); const top = edge.upper ? 0 : half_height; const bottom = top + half_height;
      path.setAttribute("d", this.settings.graph_style === "straight" ? `M${x(edge.from)},${top} L${x(edge.to)},${bottom}` : `M${x(edge.from)},${top} C${x(edge.from)},${top + half_height / 2} ${x(edge.to)},${bottom - half_height / 2} ${x(edge.to)},${bottom}`);
      path.setAttribute("fill", "none"); path.setAttribute("stroke", this.settings.colors[edge.color % this.settings.colors.length]); path.setAttribute("stroke-width", "2"); svg.append(path);
    }
    const dot = document.createElementNS(ns, "circle"); dot.setAttribute("cx", String(x(row.lane))); dot.setAttribute("cy", String(half_height)); dot.setAttribute("r", "4"); dot.setAttribute("fill", this.settings.colors[row.color % this.settings.colors.length]); svg.append(dot); return svg;
  }
  render_history(): void {
    const state = this.state!;
    this.container.setAttribute("data-details-location", this.settings.details_location);
    this.container.setAttribute("data-label-alignment", this.settings.label_alignment);
    for (const key of ["date", "author", "hash"] as const) this.container.dataset["show" + key] = String(this.settings[("show_" + key) as "show_date" | "show_author" | "show_hash"]);
    const columns = ["var(--git-graph-width)", "minmax(var(--git-subject-width), 1fr)", ...(["date", "author", "hash"] as const).filter(key => this.settings[("show_" + key) as "show_date" | "show_author" | "show_hash"]).map(key => `var(--git-${key}-width)`)];
    this.container.style.setProperty("--git-visible-columns", columns.join(" "));
    this.container.style.setProperty("--git-visible-min-width", `calc(var(--git-graph-width) + var(--git-subject-width)${(["date", "author", "hash"] as const).filter(key => this.settings[("show_" + key) as "show_date" | "show_author" | "show_hash"]).map(key => ` + var(--git-${key}-width)`).join("")})`);
    const connected = state.changes.length > 0 && this.settings.show_changes;
    const graph = build_git_graph(connected ? [{ hash: WORKTREE, parents: state.head ? [state.head] : [], author: "", date: "", subject: "" }, ...state.commits] : state.commits);
    this.detail_graph_rows.clear();
    if (connected) this.detail_graph_rows.set(WORKTREE, graph.rows[0]);
    state.commits.forEach((commit, index) => this.detail_graph_rows.set(commit.hash, graph.rows[index + (connected ? 1 : 0)]));
    const fragment = document.createDocumentFragment();
    const graph_width = Math.max(58, (graph.width - 1) * 16 + 20) + (this.settings.label_alignment === "graph" ? 140 : 0); this.container.style.setProperty("--git-graph-width", graph_width + "px");
    for (const [key, width] of Object.entries(this.settings.column_widths)) this.container.style.setProperty(`--git-${key}-width`, width + "px");
    this.header.replaceChildren();
    this.header.append(el("div", "git-graph-column git-graph-column-graph", text("graph.column.graph")));
    for (const [key, title] of [["subject", text("graph.column.description")], ["date", text("graph.column.date")], ["author", text("graph.column.author")], ["hash", text("graph.column.commit")]]) {
      const label = el("div", "git-graph-column git-graph-column-" + key, title); const handle = el("span", "git-graph-column-resize"); label.append(handle);
      handle.onpointerdown = event => {
        event.preventDefault(); handle.setPointerCapture(event.pointerId); const start = event.clientX; const width = label.getBoundingClientRect().width;
        handle.onpointermove = move => { this.settings.column_widths[key as keyof graph_settings["column_widths"]] = Math.max(40, Math.min(1500, width + move.clientX - start)); this.container.style.setProperty(`--git-${key}-width`, this.settings.column_widths[key as keyof graph_settings["column_widths"]] + "px"); };
        handle.onpointerup = () => { handle.onpointermove = null; this.persist_settings(); };
      }; this.header.append(label);
    }
    if (state.changes.length && this.settings.show_changes) {
      const row = el("div", "git-graph-row git-graph-worktree"); row.dataset.hash = WORKTREE; row.tabIndex = 0; row.setAttribute("role", "button"); row.setAttribute("aria-pressed", String(this.selected === WORKTREE));
      row.append(connected ? this.draw_graph(graph.rows[0], graph.width) : el("span", "git-graph-worktree-node", "●"), el("span", "git-graph-subject", text("graph.uncommitted_changes_files", {count: state.changes.length})), el("span", "git-graph-date"), el("span", "git-graph-author"), el("code", "git-graph-hash", revision_label(WORKTREE)));
      const activate = (event: MouseEvent | KeyboardEvent) => this.activate_row(WORKTREE, state.head || EMPTY, event);
      row.onclick = activate;
      row.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(event); } };
      row.oncontextmenu = event => this.target_menu(event, "changes", "", state.head); row.classList.add("connected"); row.dataset.node_style = this.settings.uncommitted_style; fragment.append(row);
    }
    const ref_map = new Map<string, git_ref[]>();
    for (const ref of state.refs) {
      if ((!this.settings.show_tags && ref.name.startsWith("refs/tags/")) || (!this.settings.show_remotes && ref.name.startsWith("refs/remotes/")) || (!this.settings.show_remote_heads && /refs\/remotes\/.+\/HEAD$/u.test(ref.name))) continue;
      ref_map.set(ref.hash, [...(ref_map.get(ref.hash) || []), ref]);
    }
    state.commits.forEach((commit, index) => {
      const row = el("div", "git-graph-row"); row.dataset.hash = commit.hash; row.tabIndex = 0; row.setAttribute("role", "button"); row.setAttribute("aria-pressed", String(this.selected === commit.hash));
      if (state.head === commit.hash) row.dataset.head = "true";
      row.title = `${commit.hash}\n${commit.author} · ${this.date(commit)}\n${commit.subject}`;
      if (this.settings.mute_merges && commit.parents.length > 1 || this.settings.mute_unreachable && !this.ancestors.has(commit.hash)) row.classList.add("git-graph-muted");
      const activate = (event: MouseEvent | KeyboardEvent) => this.activate_row(commit.hash, commit.parents[0] || EMPTY, event);
      row.onclick = activate;
      row.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(event); } };
      row.oncontextmenu = event => this.target_menu(event, commit.stash ? "stash" : "commit", commit.stash || commit.hash, commit.hash);
      const graph_row = graph.rows[index + (connected ? 1 : 0)];
      row.style.setProperty("--git-graph-ref-color", this.settings.colors[graph_row.color % this.settings.colors.length]);
      const svg = this.draw_graph(graph_row, graph.width);
      svg.onmouseenter = () => { const epoch = this.epoch; if (!this.containment.has(commit.hash)) void commit_containment(this.runner.run, state, commit.hash).then(value => { if (this.disposed || epoch !== this.epoch) return; this.containment.set(commit.hash, value); row.title = value + "\n" + commit.subject; }).catch(() => {}); else row.title = this.containment.get(commit.hash)!; };
      const subject = el("span", "git-graph-subject"); const refs = el("span", "git-graph-labels");
      const head_dot = state.head === commit.hash ? el("span", "git-graph-head-dot") : undefined;
      if (head_dot) { head_dot.title = text("graph.current_head"); head_dot.setAttribute("aria-label", head_dot.title); head_dot.setAttribute("role", "img"); }
      if (commit.stash) { const badge = el("span", "git-graph-refs git-ref-stash"); badge.append(git_icon("archive"), el("span", "git-graph-ref-name", commit.stash.replace(/^stash/u, ""))); badge.title = commit.stash; badge.onclick = event => { event.stopPropagation(); this.target_menu(event, "stash", commit.stash!, commit.hash); }; refs.append(badge); }
      const items = ref_map.get(commit.hash) || []; const seen = new Set<string>();
      for (const ref of items) {
        const kind = ref.name.startsWith("refs/tags/") ? "tag" : ref.name.startsWith("refs/remotes/") ? "remote" : "branch";
        const name = ref.name.replace(/^refs\/(heads|tags|remotes)\//u, "");
        const base_name = kind === "remote" ? name.slice(name.indexOf("/") + 1) : name;
        if (this.settings.combine_refs && kind === "remote" && items.some(item => item.name === "refs/heads/" + base_name)) continue;
        if (seen.has(name)) continue; seen.add(name);
        const combined = this.settings.combine_refs && kind === "branch" ? items.filter(item => item.name.startsWith("refs/remotes/") && item.name.slice(item.name.indexOf("/", 13) + 1) === name).map(item => item.name.slice(13, item.name.indexOf("/", 13))) : [];
        const badge = el("span", "git-graph-refs git-ref-" + kind); badge.dataset.ref = ref.name; badge.title = ref.name;
        const active = kind === "branch" && name === state.branch; if (active) badge.dataset.active = "true";
        badge.append(git_icon(kind === "tag" ? "tag" : "git-branch"), el("span", "git-graph-ref-name", name));
        for (const remote of combined) {
          const remote_segment = el("span", "git-graph-ref-remote", remote); remote_segment.dataset.ref = `refs/remotes/${remote}/${name}`; remote_segment.title = `${remote}/${name}`;
          remote_segment.onclick = event => { event.stopPropagation(); this.target_menu(event, "remote", `${remote}/${name}`, commit.hash); };
          remote_segment.oncontextmenu = event => { event.stopPropagation(); this.target_menu(event, "remote", `${remote}/${name}`, commit.hash); }; badge.append(remote_segment);
        }
        badge.onclick = event => { event.stopPropagation(); this.target_menu(event, kind, name, commit.hash); }; badge.oncontextmenu = event => { event.stopPropagation(); this.target_menu(event, kind, name, commit.hash); };
        if (active) { const stash = refs.querySelector(".git-ref-stash"); if (stash) stash.after(badge); else refs.prepend(badge); } else refs.append(badge);
      }
      const tag_refs = el("span", "git-graph-labels git-graph-tag-labels");
      if (this.settings.label_alignment !== "normal") for (const badge of [...refs.querySelectorAll(".git-ref-tag")]) tag_refs.append(badge);
      if (head_dot) subject.append(head_dot);
      subject.append(refs, el("span", "git-graph-subject-text", this.emoji(commit.subject)));
      if (tag_refs.childElementCount) subject.append(tag_refs);
      const graph_cell = el("span", "git-graph-cell"); graph_cell.append(svg);
      if (this.settings.label_alignment === "graph") graph_cell.append(refs);
      if (state.head === commit.hash && this.settings.uncommitted_style === "head") row.classList.add("git-graph-open-head");
      row.append(graph_cell, subject, el("span", "git-graph-date", this.date(commit)), el("span", "git-graph-author", commit.author), el("code", "git-graph-hash", commit.hash.slice(0, 8)));
      fragment.append(row);
    });
    const scroll = this.list.scrollTop; this.list.replaceChildren(this.header, fragment); this.place_details(); this.list.scrollTop = scroll; this.finder.update(false);
  }
  place_details(): void {
    const row = [...this.list.querySelectorAll<HTMLElement>("[data-hash]")].find(item => item.dataset.hash === this.selected);
    this.details.querySelector(".git-graph-detail-rail")?.remove();
    if (this.to && row) {
      if (this.settings.details_location === "docked") this.body.append(this.details);
      else {
        row.after(this.details);
        const rail = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        rail.setAttribute("class", "git-graph-detail-rail"); rail.setAttribute("aria-hidden", "true");
        rail.setAttribute("width", "100%"); rail.setAttribute("height", "300");
        for (const edge of this.detail_graph_rows.get(this.selected)?.edges || []) if (!edge.upper) {
          const line = document.createElementNS(rail.namespaceURI, "path");
          const x = edge.to * 16 + 10;
          line.setAttribute("d", `M${x},0 V300`); line.setAttribute("fill", "none");
          line.setAttribute("stroke", this.settings.colors[edge.color % this.settings.colors.length]); line.setAttribute("stroke-width", "2");
          rail.append(line);
        }
        this.details.prepend(rail);
      }
    } else this.details.remove();
  }
  close_details(): void {
    this.detail_epoch++; this.selected = ""; this.from = EMPTY; this.to = ""; this.files = []; this.details.replaceChildren(); this.place_details();
    for (const row of this.list.querySelectorAll<HTMLElement>("[data-hash]")) row.setAttribute("aria-pressed", "false");
  }
  open_find(): void { this.find_widget.dataset.open = "true"; this.finder.update(false); this.search.focus(); this.search.select(); }
  close_find(): void { this.find_widget.dataset.open = "false"; this.finder.close(); }
  emoji(text: string): string { return text.replace(/:[a-z_0-9+-]+:/giu, code => this.settings.emoji[code] || builtin_emoji[code] || code); }
  scroll_to(hash: string): void { const row = [...this.list.querySelectorAll<HTMLElement>("[data-hash]")].find(item => item.dataset.hash === hash); if (row) this.list.scrollTop = row.offsetTop - this.list.clientHeight / 2; }
  activate_row(hash: string, parent: string, event: MouseEvent | KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && this.selected && this.selected !== hash) {
      void this.show_comparison(this.selected === WORKTREE ? hash : this.selected, this.selected === WORKTREE ? WORKTREE : hash); return;
    }
    if (this.selected === hash && !(event.ctrlKey || event.metaKey)) { this.close_details(); return; }
    this.selected = hash;
    if (hash !== WORKTREE && this.settings.auto_center) this.scroll_to(hash);
    void this.show_comparison(parent, hash);
  }
  select_commit(commit: graph_commit): void { this.selected = commit.hash; if (this.settings.auto_center) this.scroll_to(commit.hash); void this.show_comparison(commit.parents[0] || EMPTY, commit.hash); }
  find_next(direction = 1): void { this.finder.move(direction); }
  review_key(): string { return JSON.stringify([this.root, this.from, this.to]); }
  is_reviewed(file: string): boolean { return load_reviews(localStorage).find(review => JSON.stringify([review.root, review.from, review.to]) === this.review_key())?.reviewed.includes(file) || false; }
  review_active(): boolean { return load_reviews(localStorage).some(review => JSON.stringify([review.root, review.from, review.to]) === this.review_key()); }
  mark_reviewed(file: string): void {
    const reviews = load_reviews(localStorage); const review = reviews.find(item => JSON.stringify([item.root, item.from, item.to]) === this.review_key());
    if (review) { review.reviewed = [...new Set([...review.reviewed, file])]; review.updated_at = Date.now(); save_reviews(localStorage, reviews); }
    for (const node of this.details.querySelectorAll<HTMLElement>("[data-file]")) if (node.dataset.file === file) node.classList.remove("git-file-unreviewed");
  }
  async show_comparison(from: string, to: string): Promise<void> {
    if (this.disposed || !this.state) return;
    const same_comparison = this.from === from && this.to === to;
    const summary_scroll = same_comparison ? this.details.querySelector(".git-graph-detail-summary")?.scrollTop || 0 : 0;
    const files_scroll = same_comparison ? this.details.querySelector(".git-graph-files")?.scrollTop || 0 : 0;
    const epoch = ++this.detail_epoch; this.from = from; this.to = to; this.files = [];
    this.details.dataset.from = from; this.details.dataset.to = to;
    this.place_details();
    const commit = this.state.commits.find(item => item.hash === to);
    const content = el("div", "git-graph-detail-content"); const summary = el("section", "git-graph-detail-summary"); const files_pane = el("section", "git-graph-detail-files"); const controls = el("nav", "git-graph-detail-controls");
    const metadata = (label: string, value: string) => { const field = el("div", "git-graph-detail-field"); field.append(el("strong", "", label + ": "), document.createTextNode(value)); summary.append(field); };
    metadata(text("graph.detail_commit"), revision_label(to));
    content.append(summary, files_pane); this.details.replaceChildren(content, controls);
    const divider = el("div", "git-graph-detail-divider"); divider.tabIndex = 0;
    divider.setAttribute("role", "separator"); divider.setAttribute("aria-orientation", "vertical"); divider.setAttribute("aria-label", text("graph.detail_resize"));
    divider.setAttribute("aria-valuemin", "20"); divider.setAttribute("aria-valuemax", "80");
    const resize_summary = (ratio: number) => { this.detail_summary_ratio = Math.max(.2, Math.min(.8, ratio)); content.style.setProperty("--git-detail-summary-width", `${this.detail_summary_ratio * 100}%`); divider.setAttribute("aria-valuenow", String(Math.round(this.detail_summary_ratio * 100))); };
    resize_summary(this.detail_summary_ratio);
    divider.onpointerdown = event => { if (event.button !== 0) return; event.preventDefault(); divider.focus(); divider.setPointerCapture(event.pointerId); divider.onpointermove = move => { const bounds = content.getBoundingClientRect(); if (bounds.width) resize_summary((move.clientX - bounds.left) / bounds.width); }; };
    divider.onpointerup = divider.onpointercancel = () => { divider.onpointermove = null; };
    divider.onkeydown = event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); resize_summary(this.detail_summary_ratio + (event.key === "ArrowLeft" ? -.05 : .05)); } };
    content.append(divider);
    this.place_details();
    for (const row of this.list.querySelectorAll<HTMLElement>("[data-hash]")) row.setAttribute("aria-pressed", String(row.dataset.hash === this.selected));
    controls.append(git_icon_button("close", text("graph.details_close"), () => this.close_details(), "git-graph-detail-close"));
    if (to === WORKTREE || to === INDEX) {
      const mode = el("select", "git-graph-parent"); mode.append(option("all", text("graph.head_to_worktree")), option("staged", text("graph.head_to_index")), option("unstaged", text("graph.index_to_worktree")));
      mode.value = to === INDEX ? "staged" : from === INDEX ? "unstaged" : "all";
      mode.onchange = () => void this.show_comparison(mode.value === "unstaged" ? INDEX : this.state!.head || EMPTY, mode.value === "staged" ? INDEX : WORKTREE);
      const mode_label = el("label", "git-graph-detail-option", text("graph.comparison")); mode_label.append(mode); summary.append(mode_label);
    } else {
      if (commit) {
        metadata(text("graph.detail_author"), commit.author + (commit.email ? ` <${commit.email}>` : ""));
        if (commit.committer && (commit.committer !== commit.author || commit.committer_email !== commit.email)) metadata(text("graph.detail_committer"), commit.committer + (commit.committer_email ? ` <${commit.committer_email}>` : ""));
        metadata(text("graph.detail_date"), new Date(commit.date).toLocaleString(git_graph_language_tag()));
        if (commit.commit_date && commit.commit_date !== commit.date) metadata(text("graph.detail_committer") + " " + text("graph.detail_date"), new Date(commit.commit_date).toLocaleString(git_graph_language_tag()));
        if (this.settings.fetch_avatars && commit.email) { const img = el("img", "git-graph-avatar"); img.alt = commit.author; summary.append(img); void this.host.avatar(commit.email).then(url => { if (epoch === this.detail_epoch) img.src = url; }).catch(() => img.remove()); }
        const parent = el("select", "git-graph-parent"); parent.setAttribute("aria-label", text("graph.compare_parent"));
        if (!commit.parents.length) parent.append(option(EMPTY, text("graph.initial_commit_empty_tree")));
        commit.parents.forEach((hash, index) => parent.append(option(hash, text("graph.parent_commit", {number: index + 1, hash: hash.slice(0, 8)}))));
        if (![...parent.options].some(item => item.value === from)) parent.append(option(from, text("graph.selected_comparison", {hash: from.slice(0, 8)})));
        parent.value = from; parent.onchange = () => void this.show_comparison(parent.value, to);
        const parent_label = el("label", "git-graph-detail-option"); parent_label.append(el("strong", "", text("graph.detail_parents") + ": "), parent); summary.children[0].after(parent_label);
      }
      const review_button = git_icon_button("check", this.review_active() ? text("graph.review_end") : text("graph.review_start"), () => this.toggle_review(from, to), "git-graph-detail-review"); review_button.setAttribute("aria-pressed", String(this.review_active())); controls.append(review_button);
      const message = el("div", "git-graph-message", text("graph.loading_message")); summary.append(message);
      void this.runner.run(this.root, ["show", "-s", `--format=%B${this.settings.show_signature ? "%n" + text("graph.signature_label") + "%G?%n%GS%n%GK" : ""}`, to, "--"]).then(message_text => {
        if (epoch === this.detail_epoch) { message.replaceChildren(inline_message(message_text, { markdown: this.settings.inline_markdown, emoji: { ...builtin_emoji, ...this.settings.emoji }, issue_pattern: this.settings.issue_pattern, issue_url: this.settings.issue_url }, url => void this.host.open_url(url).catch(error => this.report(error)))); summary.scrollTop = summary_scroll; }
      }).catch(error => { if (epoch === this.detail_epoch) message.textContent = String(error); });
    }
    const tree_button = git_icon_button("list-tree", text("graph.files_tree"), () => this.set_file_view("tree", from, to), "git-graph-detail-tree"); tree_button.setAttribute("aria-pressed", String(this.settings.file_view === "tree"));
    const list_button = git_icon_button("list-flat", text("graph.files_list"), () => this.set_file_view("list", from, to), "git-graph-detail-list"); list_button.setAttribute("aria-pressed", String(this.settings.file_view === "list"));
    controls.append(tree_button, list_button, git_icon_button("more", text("graph.more_commit_actions"), () => this.repository_menu(to === WORKTREE || to === INDEX ? "changes" : "repository"), "git-graph-detail-more"));
    const files_heading = el("div", "git-graph-files-heading", text("graph.changed_files")); const files = el("div", "git-graph-files"); files_pane.append(files_heading, files);
    try {
      const changes = await compare_files(this.runner.run, this.state, from, to); if (epoch !== this.detail_epoch) return;
      this.files = changes;
      files_heading.textContent = text("graph.changed_files_count", {count: this.files.length});
      if (!this.files.length) { files.textContent = text("graph.no_file_differences"); return; }
      this.render_files(files);
      files.scrollTop = files_scroll;
    } catch (error) { if (epoch === this.detail_epoch) files.textContent = String(error); }
  }
  toggle_review(from: string, to: string): void {
    const reviews = load_reviews(localStorage); const filtered = reviews.filter(item => JSON.stringify([item.root, item.from, item.to]) !== this.review_key());
    if (reviews.length === filtered.length) filtered.push({ root: this.root, from, to, reviewed: [], updated_at: Date.now() });
    save_reviews(localStorage, filtered); void this.show_comparison(from, to);
  }
  set_file_view(view: "tree" | "list", from: string, to: string): void {
    if (this.settings.file_view === view) return; this.settings.file_view = view; this.persist_settings(); void this.show_comparison(from, to);
  }
  render_files(container: HTMLElement): void {
    const directories = new Map<string, HTMLElement>(); directories.set("", container);
    const parent_for = (path: string): HTMLElement => {
      if (directories.has(path)) return directories.get(path)!;
      const parts = path.split("/"); const parent = parent_for(parts.slice(0, -1).join("/"));
      const group = el("details", "git-file-directory"); group.open = true; const summary = el("summary"); summary.append(git_icon("chevron-right", "git-graph-file-disclosure"), graph_file_icon("folder-open", "git-graph-file-folder"), el("span", "git-graph-directory-name", parts.at(-1)!)); group.append(summary);
      group.ontoggle = () => { const current = summary.querySelector(".git-graph-file-folder"); current?.replaceWith(graph_file_icon(group.open ? "folder-open" : "folder", "git-graph-file-folder")); };
      parent.append(group); directories.set(path, group); return group;
    };
    for (const file of this.files) {
      const row = button("", () => {
        for (const node of container.querySelectorAll(".selected")) node.classList.remove("selected"); row.classList.add("selected");
        void this.workbench.open_default_file(file, this.from, this.to, this.files);
      }, "git-graph-file"); row.dataset.file = file.path; row.title = file.path;
      const display_path = file.old_path ? file.old_path + " → " + file.path : file.path; const parts = display_path.split("/");
      const file_icon = workspace_file_icon(file.path); file_icon.classList.add("git-graph-file-icon");
      row.append(file_icon, el("span", "git-graph-file-name", parts.pop() || display_path), el("span", "git-graph-file-path", parts.join("/")), el("span", "git-graph-file-status", file.status));
      row.querySelector(".git-graph-file-name")?.prepend(git_icon("circle-filled","git-graph-unreviewed-icon"));
      if (this.review_active() && !this.is_reviewed(file.path)) row.classList.add("git-file-unreviewed");
      row.oncontextmenu = event => this.file_menu(event, file);
      (this.settings.file_view === "tree" ? parent_for(file.path.split("/").slice(0, -1).join("/")) : container).append(row);
    }
    if (this.settings.compact_folders) {
      for (const directory of [...container.querySelectorAll("details")].reverse()) {
        const children = [...directory.children];
        if (children.length === 2 && children[1].tagName === "DETAILS") {
          const child = children[1]; directory.querySelector(".git-graph-directory-name")!.textContent += "/" + child.querySelector(".git-graph-directory-name")!.textContent;
          directory.append(...[...child.children].slice(1)); child.remove();
        }
      }
    }
  }
  file_menu(event: MouseEvent, file: graph_change): void {
    const root = this.root, from = this.from, to = this.to, files = [...this.files];
    const entries: workspace_menu_entry[] = [
      { id: "file_history", title: text("graph.file_history"), action: () => void this.workbench.file_history(file.path) },
      this.workbench.file_entries(file, this.from, this.to, this.files).find(entry => entry.id === "open_file")!,
      { id: "copy_relative", title: text("graph.copy_relative_path"), action: () => void this.host.copy(file.path) }, { id: "copy_absolute", title: text("graph.copy_absolute_path"), action: () => void this.host.copy(this.host.file_path(this.root, file.path)) },
      { id: "open_diff", title: text("graph.open_side_by_side_diff"), action: () => void this.workbench.open_file(file, from, to, files) },
      { id: "left_revision", title: text("graph.open_left_revision"), disabled: from === EMPTY || file.status.startsWith('A') || file.status === '??', action: () => void this.open_revision(from, file.old_path || file.path) },
      { id: "right_revision", title: text("graph.open_right_revision"), disabled: file.status.startsWith('D'), action: () => void this.open_revision(to, file.path) },
      { id: "reviewed", title: text("graph.mark_reviewed"), action: () => this.mark_reviewed(file.path) },
    ];
    if (this.to === WORKTREE || this.to === INDEX) for (const id of ["stage", "unstage"]) entries.push({ id, title: graph_actions.find(action => action.id === id)!.title, action: () => void this.quick_action(id, [file.path, ...(file.old_path ? [file.old_path] : [])]) });
    entries.push(...this.workbench.file_entries(file, this.from, this.to, this.files).filter(entry => entry.id === "ignore_file"));
    this.configured_menu(event, "file", entries.map(entry=>({...entry,action:()=>{if(this.workbench.repository_action_available(root))void entry.action?.();}})));
  }
  async open_revision(revision: string, file: string): Promise<void> {
    await this.workbench.open_revision(revision, file);
  }
  async open_diff(file: graph_change): Promise<void> {
    await this.workbench.open_file(file, this.from, this.to, this.files);
  }
  target_action_enabled(id: string, kind: string, target: string): boolean {
    return !(id === "pull" && kind === "branch" && target !== this.state?.branch);
  }
  target_menu(event: MouseEvent, kind: string, target: string, hash: string): void {
    if(kind==="commit"){this.configured_menu(event,kind,commit_entries(this,hash));return;}
    const entries: workspace_menu_entry[] = graph_actions.filter(action => action.targets.includes(kind) && !this.settings.hidden_actions.includes(action.id)).map(action => ({ title: action.title, id: action.id, disabled: !this.target_action_enabled(action.id, kind, target), action: () => this.action_dialog(action.id, kind, target, hash) }));
    entries.push({ title: text("graph.copy_name_or_hash"), id: "copy_name", action: () => void this.host.copy(target || hash) }, { title: text("graph.copy_commit_hash"), id: "copy_hash", action: () => void this.host.copy(hash) });
    const commit = this.state?.commits.find(item => item.hash === hash);
    if (commit) entries.push({ title: text("graph.copy_commit_subject"), id: "copy_subject", action: () => void this.host.copy(commit.subject) });
    if (kind === "tag") entries.push({ title: text("graph.tag_details"), id: "tag_details", action: () => void this.tag_details(target) });
    if (kind === "branch" || kind === "remote") {
      entries.push({ title: text("graph.open_pull_request"), id: "pull_request", action: () => this.pr_dialog(kind === "remote" ? target.slice(target.indexOf("/") + 1) : target) });
      const name = kind === "branch" ? "refs/heads/" + target : "refs/remotes/" + target;
      entries.push({ title: this.branches.includes(name) ? text("graph.filter_remove") : text("graph.filter_add"), id: "filter", action: () => { this.branches = this.branches.includes(name) ? this.branches.filter(item => item !== name) : [...this.branches, name]; void this.refresh(); } });
    }
    if (["branch", "remote", "tag", "commit"].includes(kind)) entries.push({ title: text("graph.archive_zip"), id: "archive", action: () => this.archive_dialog(hash) });
    this.configured_menu(event, kind, entries);
  }
  layout_entries(): workspace_menu_entry[] {
    return [
      ...(["date", "author", "hash"] as const).map(key => ({ id: "show_" + key, title: text(key === "hash" ? "graph.column.commit" : key === "date" ? "graph.column.date" : "graph.column.author"), checked: this.settings[("show_" + key) as "show_date" | "show_author" | "show_hash"], action: () => { const setting = ("show_" + key) as "show_date" | "show_author" | "show_hash"; this.settings[setting] = !this.settings[setting]; this.persist_settings(); if (this.state) this.render_history(); } })),
      { title: text("graph.reset_columns"), action: () => { this.settings.column_widths = { ...graph_defaults.column_widths }; this.persist_settings(); if (this.state) this.render_history(); } },
      { title: text("graph.all_settings"), action: () => this.settings_dialog() },
    ];
  }
  layout_menu(event: MouseEvent): void { workspace_menu(event, this.layout_entries()); }
  layout_dialog(): void { const dialog = graph_dialog(text("graph.layout_title")); for (const entry of this.layout_entries()) dialog.content.append(button((entry.checked ? "✓ " : "") + entry.title, () => { dialog.close(); entry.action(); })); }
  configured_menu(event: MouseEvent, kind: string, entries: workspace_menu_entry[]): void {
    const root=this.root,runner=this.runner;
    const guard=(items:workspace_menu_entry[]):workspace_menu_entry[]=>items.map(entry=>({...entry,children:entry.children?guard(entry.children):undefined,action:()=>{if(!this.disposed&&root===this.root&&runner===this.runner)entry.action();}}));
    entries=guard(entries);
    const hidden = (id: string) => this.settings.hidden_actions.includes(id) || this.settings.hidden_actions.includes(kind + ":" + id);
    const filter_entries = (items: workspace_menu_entry[]): workspace_menu_entry[] => items.filter(entry => !entry.id || !hidden(entry.id)).map(entry => entry.children ? {...entry, children: filter_entries(entry.children)} : entry);
    const all_entries = (items: workspace_menu_entry[]): workspace_menu_entry[] => items.flatMap(entry => [entry, ...all_entries(entry.children || [])]);
    workspace_menu(event, [...filter_entries(entries), { id: "configure_menu", title: text("graph.configure_context_menu"), separator: true, action: () => {
      const dialog = graph_dialog(text("graph.context_menu_title", {kind: target_kind_label(kind)})); const choices = new Map<string, HTMLInputElement>();
      for (const entry of all_entries(entries)) { if (!entry.id || choices.has(entry.id)) continue; const label = el("label", "git-graph-filter", entry.title); const input = el("input"); input.type = "checkbox"; input.checked = !hidden(entry.id); input.setAttribute("data-action-id", entry.id); label.prepend(input); choices.set(entry.id, input); dialog.content.append(label); }
      dialog.footer.prepend(button(text("graph.apply"), () => {
        if(this.disposed||root!==this.root||runner!==this.runner){dialog.close();return;}
        for (const [id, input] of choices) { this.settings.hidden_actions = this.settings.hidden_actions.filter(value => value !== kind + ":" + id); if (!input.checked) this.settings.hidden_actions.push(kind + ":" + id); else this.settings.hidden_actions = this.settings.hidden_actions.filter(value => value !== id); }
        this.persist_settings(); dialog.close();
      }), button(text("graph.restore_menu"), () => { if(this.disposed||root!==this.root||runner!==this.runner){dialog.close();return;}this.settings.hidden_actions = this.settings.hidden_actions.filter(id => !id.startsWith(kind + ":") && !choices.has(id)); this.persist_settings(); dialog.close(); }));
    } }]);
  }
  background_menu(event: MouseEvent): void {
    const entries: workspace_menu_entry[] = graph_actions.filter(action => action.targets.includes("repository")).map(action => ({ id: action.id, title: action.title, disabled: !this.state || this.writing, action: () => this.action_dialog(action.id, "repository", "", this.state?.head) }));
    entries.push({ id: "refresh", title: text("graph.refresh_short"), separator: true, action: () => void this.refresh() },
      { id: "terminal", title: text("graph.open_terminal"), action: () => this.host.terminal(this.root, this.settings.terminal_shell) },
      { id: "terminal_admin", title: text("graph.open_admin_terminal"), disabled: this.host.process_api.platform !== "win32", action: () => this.host.terminal(this.root, "", true) },
      { id: "remotes", title: text("graph.remotes"), action: () => this.remotes_dialog() },
      { id: "copy_root", title: text("graph.copy_repository_root"), action: () => void this.host.copy(this.root) },
      { id: "layout", title: text("graph.column_layout"), separator: true, action: () => this.layout_dialog() },
      { id: "settings", title: text("graph.all_settings"), action: () => this.settings_dialog() });
    this.configured_menu(event, "repository", entries);
  }
  repository_menu(kind = "repository"): void {
    const dialog = graph_dialog(kind === "changes" ? text("graph.changes_actions") : text("graph.repository_actions"));
    for (const action of graph_actions.filter(item => item.targets.includes(kind) && !this.settings.hidden_actions.includes(item.id))) dialog.content.append(button(action.title, () => { dialog.close(); this.action_dialog(action.id, kind, "", this.state?.head); }));
    dialog.content.append(button(text("graph.remotes"), () => { dialog.close(); this.remotes_dialog(); }), button(text("graph.open_repository_terminal"), () => { this.host.terminal(this.root, this.settings.terminal_shell); dialog.close(); }), button(text("graph.open_admin_terminal"), () => { this.host.terminal(this.root, "", true); dialog.close(); }), button(text("graph.manage_reviews"), () => { dialog.close(); this.reviews_dialog(); }), button(text("graph.clear_avatar_cache"), () => { this.host.clear_avatars(); dialog.close(); }));
  }
  remotes_dialog(): void {
    const dialog = graph_dialog(text("graph.repository_remotes"));
    if (!this.state?.remotes.length) dialog.content.append(el("p", "", text("graph.no_remotes")));
    for (const remote of this.state?.remotes || []) {
      const row = el("div", "git-graph-repo-entry", text("graph.remote_addresses", {name: remote.name, fetch: remote.fetch, push: remote.push}));
      for (const [title, id, preset] of [[text("graph.edit_fetch_url"), "remote_edit", { url: remote.fetch }], [text("graph.edit_push_url"), "remote_edit", { url: remote.push, push_url: true }], [text("graph.fetch"), "fetch", {}], [text("graph.prune_remote"), "remote_prune", {}], [text("graph.delete"), "remote_remove", {}]] as const) row.append(button(title, () => { dialog.close(); this.action_dialog(id, "repository", "", "", { remote: remote.name, ...preset }); }));
      dialog.content.append(row);
    }
    dialog.footer.prepend(button(text("graph.add_remote"), () => { dialog.close(); this.action_dialog("remote_add", "repository"); }));
  }
  async quick_action(id: string, paths: string[] = [], values: Record<string, unknown> = {}): Promise<void> {
    if (!this.state || this.writing || this.pending || this.disposed) return;
    const submitted_message=this.workbench.message.value;
    try {
      const message=await this.prepare_and_execute_action(writer=>plan_git_action(writer.run, id, {root: this.root, target: paths[0] || "", paths: paths.length ? paths : undefined, hash: this.state!.head, operation: this.state!.operation, sign_commits: this.settings.sign_commits, sign_tags: this.settings.sign_tags, reference_space: this.settings.reference_space}, values),this.writer,id);
      // 刷新期间可以继续填写下次提交，不能用上一笔提交的收尾清掉新输入。
      if (id === "commit"&&this.workbench.message.value===submitted_message) { this.workbench.message.value = ""; localStorage.removeItem(this.workbench.storage_key("message")); }
      this.report(message);
    } catch (error) { this.report(error); }
  }
  /** 所有写入口共用业务锁、真实活动、失败与后续刷新生命周期。 */
  async run_operation<T>(id:string,operation:(writer:typeof this.writer)=>Promise<T>,expected_writer=this.writer):Promise<T>{
    if (this.disposed || !this.state || this.pending || this.writing || this.writer !== expected_writer) throw new Error(text("graph.wait_for_repository"));
    const root = this.root, writer = expected_writer, action_epoch = ++this.action_epoch;
    this.writing = true;const activity=this.progress.begin(id,this.operation_label(id));this.write_progress=activity;this.update_scm_actions();
    try {
      return await operation(writer);
    } finally {
      // 切库或关闭取消了选择后，旧准备任务不再释放新事务，也不刷新其他仓库。
      try{if (action_epoch === this.action_epoch) {
        this.writing = false;activity.phase(text("graph.loading_repository"));
        if (!this.disposed && this.root === root && this.writer === writer) await this.refresh(false);
      }}finally{activity.finish();if(this.write_progress===activity)this.write_progress=undefined;}
    }
  }
  private operation_label(id:string):string{return text("progress.running",{action:graph_actions.find(action=>action.id===id)?.title||(id==="ignore"?text("scm.add_to_gitignore"):text("graph.executing"))});}
  async prepare_and_execute_action(prepare: (writer: typeof this.writer) => Promise<action_plan | undefined>, expected_writer = this.writer,id="operation"): Promise<string> {
    const root=this.root;
    return this.run_operation(id,async writer=>{
      const activity=this.write_progress,plan=await prepare(writer);
      if(!plan)return "";
      if(this.disposed||activity!==this.write_progress||this.root!==root||this.writer!==writer||plan.context.root!==root)throw new Error(text("quick.target_changed"));
      activity?.phase(this.operation_label(plan.action.id));
      return await execute_git_action(writer.run,plan,()=>this.host.can_change_files(),{trash_files:(root,files)=>this.host.trash_files(root,files)})||text("graph.action_complete");
    },expected_writer);
  }
  async execute_prepared_action(plan: action_plan, writer = this.writer): Promise<string> {
    return this.prepare_and_execute_action(async () => plan, writer,plan.action.id);
  }
  async network_action(id: quick_git_action, options: quick_git_options = {}): Promise<void> {
    if (!this.state || this.pending || this.writing || this.disposed) return;
    const state = this.state, root = this.root, settings = this.settings, expected_writer = this.writer;
    try {
      const result = await this.prepare_and_execute_action(writer => prepare_quick_git_action(writer.run, id,
        {root, target: "", hash: state.head, operation: state.operation, sign_commits: settings.sign_commits, reference_space: settings.reference_space}, settings,
        (remotes, branch) => new Promise(resolve => {
          let selected: string | undefined;
          const activity=this.write_progress;activity?.phase(text("progress.waiting_remote"),true);
          const dialog = workspace_dialog(text("quick.choose_remote"), text("discard.cancel"), () => { this.remote_picker = undefined;activity?.phase(this.operation_label(id)); resolve(selected); });
          this.remote_picker = dialog; dialog.root.dataset.gitRemotePicker = "ready";
          dialog.content.append(el("p", "", branch));
          for (const remote of remotes) {
            const choice = button(remote.name, () => { selected = remote.name; dialog.close(); }, "git-graph-remote-choice");
            choice.dataset.remote = remote.name; dialog.content.append(choice);
          }
        }), options), expected_writer,id);
      if (result && !this.disposed && this.root === root && this.writer === expected_writer) this.report(result);
    } catch (error) { if (!this.disposed && this.root === root && this.writer === expected_writer) this.report(error); }
  }
  action_dialog(id: string, kind: string, target = "", hash = this.selected, preset: Record<string, string | boolean> = {}, paths?: string[]): void {
    if (!this.state || this.writing || this.pending) { this.report(text("graph.wait_for_repository")); return; }
    if (["fetch", "pull", "push", "sync"].includes(id) && kind === "repository") {
      void this.network_action(id as quick_git_action, {remote: typeof preset.remote === "string" ? preset.remote : undefined, publish: preset.upstream === true}); return;
    }
    if (id === "discard_changes") {
      this.discard_confirmation.open(paths || this.workbench.groups_state.find(group => group.id === "changes")?.files.map(file => file.path) || [], kind, target); return;
    }
    if (["fetch", "pull"].includes(id) && kind === "remote") {
      void this.network_action(id as quick_git_action, {remote_ref: target}); return;
    }
    if (["push", "pull"].includes(id) && kind === "branch") {
      void this.network_action(id as quick_git_action, {branch: target, target_hash: hash}); return;
    }
    const root=this.root,state=this.state,runner=this.runner,writer=this.writer;
    const action = graph_actions.find(item => item.id === id)!; const dialog = graph_dialog(action.title); const fields = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
    const available=()=>!this.disposed&&this.root===root&&this.runner===runner&&dialog.root.isConnected;
    if (id === "sync") dialog.root.setAttribute("data-linux-note-git-sync", "ready");
    const defaults = { ...graph_defaults.dialog_defaults[id], ...this.settings.dialog_defaults[id], ...(id === "reset" && kind === "changes" ? this.settings.dialog_defaults.reset_changes : {}), ...preset };
    dialog.content.append(el("p", "", text("graph.repository_target", {root: this.root, target: revision_label(target || hash || this.state.branch)})));
    const form = el("form", "git-graph-form"); const result = el("pre", "git-graph-action-preview"); dialog.content.append(form, result);
    for (const item of action.fields) {
      const input = item.type === "choice" ? el("select") : ["message", "todo"].includes(item.key) ? el("textarea") : el("input");
      let initial = defaults[item.key] ?? item.initial ?? "";
      if (item.key === "remote" && !Object.hasOwn(preset,"remote")) initial = (kind === "remote" ? this.state.remotes.filter(remote => target.startsWith(remote.name + "/")).sort((a, b) => b.name.length - a.name.length)[0]?.name : "") || initial || this.state.remotes[0]?.name || "";
      if (item.key === "branch") initial = initial || (kind === "remote" ? target.slice(target.indexOf("/") + 1) : kind === "branch" && !["branch_create", "branch_rename"].includes(id) ? target : ["push", "pull"].includes(id) ? this.state.branch : "");
      if (item.key === "source") initial = initial || (kind === "remote" ? target.slice(target.indexOf("/") + 1) : kind === "branch" ? target : "");
      if (item.key === "prune") initial = defaults.prune ?? this.settings.fetch_prune;
      if (item.key === "prune_tags") initial = defaults.prune_tags ?? this.settings.fetch_prune_tags;
      if (item.key === "sign") initial = defaults.sign ?? this.settings.sign_tags;
      if (input instanceof HTMLSelectElement) { for (const value of item.choices!) input.append(option(value, item.choice_labels?.[value] || value)); input.value = String(initial); }
      else if (item.type === "boolean") { (input as HTMLInputElement).type = "checkbox"; (input as HTMLInputElement).checked = Boolean(initial); }
      else input.value = String(initial);
      input.dataset.field = item.key; fields.set(item.key, input); const label = el("label", "", item.title); label.append(input); form.append(label);
    }
    let plan: action_plan | undefined;
    let form_revision = 0;
    const execute = button(id === "sync" ? text("graph.sync_confirm") : text("graph.execute_action"), () => void submit()); execute.disabled = true; execute.setAttribute("data-git-execute", id);
    const preview = button(text("graph.preview_action"), () => void prepare()); preview.setAttribute("data-git-preview", id);
    form.oninput = () => { form_revision++; execute.disabled = true; plan = undefined; };
    const prepare = async () => {
      if(!available()||this.writing||preview.disabled)return;
      try {
        const revision = form_revision;
        preview.disabled = true; execute.disabled = true;
        const values: Record<string, unknown> = {};
        for (const [key, input] of fields) values[key] = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
        if (id === "rebase" && values.interactive && !values.todo) {
          fields.get("todo")!.value = await runner.run(root, ["log", "--reverse", "--no-merges", "--format=pick %H %s", `${hash}..HEAD`, "--"]);
          result.textContent = text("graph.rebase_todo_ready"); return;
        }
        const prepared = await plan_git_action(runner.run, id, { root, target, paths, hash: hash === WORKTREE ? state.head : hash, operation: state.operation, sign_commits: this.settings.sign_commits, sign_tags: this.settings.sign_tags, reference_space: this.settings.reference_space }, values);
        if (!available() || revision !== form_revision) { plan = undefined; result.textContent = text("graph.parameters_changed"); return; }
        plan=prepared;
        result.textContent = (action.destructive ? action.destructive + "\n\n" : "") + plan.preview; execute.disabled = false;
      } catch (error) { result.textContent = String(error); } finally { preview.disabled = false; }
    };
    const submit = async () => {
      if (!plan||!available()||this.writing||this.pending) return; preview.disabled = true; execute.disabled = true;
      result.textContent += "\n\n" + text("graph.executing");
      try { const output = await this.execute_prepared_action(plan, writer); result.textContent += "\n" + (output || text("graph.action_complete")); }
      catch (error) { result.textContent += "\n" + String(error); }
      finally { plan = undefined; preview.disabled = false; }
    };
    form.onsubmit = event => { event.preventDefault(); if (plan && !execute.disabled) void submit(); else void prepare(); };
    dialog.root.addEventListener("keydown", event => { if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); if (plan && !execute.disabled) void submit(); else void prepare(); } });
    dialog.footer.prepend(preview, execute);
    if (id === "sync") void prepare();
  }
  async tag_details(name: string): Promise<void> {
    const dialog = graph_dialog(text("graph.tag_details_title", {name}));
    try {
      const text = await this.runner.run(this.root, ["for-each-ref", "--format=%(refname)%0a%(objecttype)%0a%(taggername) %(taggeremail)%0a%(taggerdate:iso8601)%0a%(contents)", "refs/tags/" + name]);
      dialog.content.append(inline_message(text, { markdown: this.settings.inline_markdown, emoji: { ...builtin_emoji, ...this.settings.emoji }, issue_pattern: this.settings.issue_pattern, issue_url: this.settings.issue_url }, url => void this.host.open_url(url).catch(error => this.report(error))));
    }
    catch (error) { dialog.content.textContent = String(error); }
  }
  pr_dialog(branch: string): void { show_pull_request_dialog(this,branch); }
  archive_dialog(hash: string): void {
    const dialog = graph_dialog(text("graph.archive_title")); const target = el("input"); target.value = this.host.path_api.join(this.root, hash.slice(0, 8) + ".zip"); const error = el("pre"); dialog.content.append(target, error);
    dialog.footer.prepend(button(text("graph.export_zip"), () => void (async () => {
      try { if (this.host.fs.existsSync(target.value)) throw new Error(text("graph.target_exists"));
        await this.writer.run(this.root, ["archive", "--format=zip", "--output=" + target.value, hash]); error.textContent = text("graph.exported", {path: target.value});
      } catch (problem) { error.textContent = String(problem); }
    })()));
  }
  filter_branches(): void { this.ref_picker.open(); }
  manage_repositories(): void {
    const dialog = graph_dialog(text("graph.manage_repositories_title")); const input = el("input"); input.placeholder = text("graph.repository_path_placeholder"); input.value = this.root; const error = el("p"); const list = el("div");
    const render = () => { list.replaceChildren(); for (const root of this.known_repos()) {
      const row = el("div", "git-graph-repo-entry", root); row.append(button(text("graph.open"), () => { this.switch_repo(root); dialog.close(); }), button(text("graph.remove_record"), () => { this.save_repos(this.known_repos().filter(item => item !== root)); render(); })); list.append(row);
    } }; render(); dialog.content.append(input, list, error);
    dialog.footer.prepend(button(text("graph.add_repository"), () => void this.runner.run(input.value, ["rev-parse", "--show-toplevel"]).then(root => { this.save_repos([...this.known_repos(), root.trim()]); render(); }).catch(problem => { error.textContent = String(problem); })),
      button(text("graph.discover_subrepositories"), () => void this.host.discover(input.value, this.settings.search_depth).then(roots => { this.save_repos([...this.known_repos(), ...roots]); render(); error.textContent = text("graph.discovered_repositories", {count: roots.length}); }).catch(problem => { error.textContent = String(problem); })));
  }
  settings_dialog(): void {
    if (this.disposed) return;
    if (this.writing) { this.report(text("graph.operation_pending")); return; }
    const root = this.root, dialog = graph_dialog(text("graph.settings_title"));
    const form = el("div", "git-graph-settings-form"), error = el("p"); error.setAttribute("role", "alert");
    const fields = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
    const labels = settings_labels_for();
    for (const [key, value] of Object.entries(this.settings)) {
      const input = settings_choices[key] ? el("select") : typeof value === "object" ? el("textarea") : el("input");
      input.dataset.setting = key; input.setAttribute("aria-label", labels[key as keyof graph_settings]);
      if (input instanceof HTMLSelectElement) for (const choice of settings_choices[key]) input.append(option(choice, settings_choice_label(key as keyof graph_settings, choice)));
      if (typeof value === "boolean") { (input as HTMLInputElement).type = "checkbox"; (input as HTMLInputElement).checked = value; }
      else { input.value = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value); if (typeof value === "number") (input as HTMLInputElement).type = "number"; }
      const label = el("label", "", labels[key as keyof graph_settings]); label.append(input); form.append(label); fields.set(key, input);
    }
    dialog.content.append(form, error);
    const apply = (settings: graph_settings) => {
      if (this.disposed || this.writing || this.root !== root || !dialog.root.isConnected) throw new Error(text("graph.operation_pending"));
      const previous = this.settings; this.settings = settings;
      try { this.persist_settings(); } catch (problem) { this.settings = previous; throw problem; }
      this.runner.cancel(); this.writer.cancel(); this.runner = this.host.runner(settings); this.writer = this.host.runner(settings, true);
      dialog.close(); void this.refresh();
    };
    const file = el("input"); file.type = "file"; file.accept = ".json"; file.hidden = true;
    file.onchange = () => void file.files?.[0]?.text().then(contents => {
      try { const settings = validate_settings(JSON.parse(contents)); apply({...settings, git_path:this.settings.git_path, terminal_shell:this.settings.terminal_shell, fetch_avatars:this.settings.fetch_avatars}); }
      catch (problem) { error.textContent = String(problem); }
    }); dialog.content.append(file);
    const save = button(text("graph.save_settings"), () => {
      try {
        const values: Record<string, unknown> = {};
        for (const [key, input] of fields) {
          const baseline = graph_defaults[key as keyof graph_settings];
          try { values[key] = typeof baseline === "boolean" ? (input as HTMLInputElement).checked : typeof baseline === "number" ? Number(input.value) : typeof baseline === "object" ? JSON.parse(input.value) : input.value; }
          catch (problem) { input.focus(); throw new Error(labels[key as keyof graph_settings] + ": " + String(problem)); }
        }
        apply(validate_settings(values));
      } catch (problem) { error.textContent = String(problem); }
    }); save.dataset.settingsAction = "save";
    dialog.footer.prepend(save, button(text("graph.restore_defaults"), () => { try { apply(structuredClone(graph_defaults)); } catch (problem) { error.textContent = String(problem); } }),
      button(text("graph.import_settings"), () => file.click()), button(text("graph.export_settings"), () => void this.host.export_file(root, ".typora_git_graph.json", JSON.stringify({...this.settings, git_path:"git", terminal_shell:"", fetch_avatars:false}, null, 2)).catch(problem => { error.textContent = String(problem); })));
  }
  reviews_dialog(): void {
    const dialog = graph_dialog(text("graph.reviews_title")); const render = () => {
      dialog.content.replaceChildren(); const reviews = load_reviews(localStorage);
      if (!reviews.length) dialog.content.textContent = text("graph.no_reviews");
      for (const review of reviews) {
        const row = el("div", "git-graph-review", text("graph.review_record", {root: review.root, from: short_revision_label(review.from), to: short_revision_label(review.to), count: review.reviewed.length}));
        row.append(button(text("graph.resume_review"), () => { dialog.close(); if (review.root !== this.root) this.switch_repo(review.root); void (async () => { while (this.pending) await new Promise(resolve => setTimeout(resolve, 50)); this.selected = review.to; void this.show_comparison(review.from, review.to); })(); }),
          button(text("graph.finish"), () => { save_reviews(localStorage, reviews.filter(item => item !== review)); render(); })); dialog.content.append(row);
      }
    }; render(); dialog.footer.prepend(button(text("graph.finish_all_reviews"), () => { save_reviews(localStorage, []); render(); }));
  }
  keydown(event: KeyboardEvent): void {
    if (!this.active || this.host.core.app.workspace.activeLeaf?.view.containerEl !== this.container || document.querySelector('.git-graph-dialog-shade, .git-graph-menu, .git-scm-ref-picker') || is_composing_key(event) || is_terminal_input(event)) return;
    if (event.target instanceof Element && event.target.closest("[role=separator], .git-graph-document")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") { event.preventDefault(); this.host.core.app.workspace.sidebar.toggle(); return; }
    if (event.target instanceof Element && event.target.closest(".git-scm-sidebar")) return;
    const editing = event.target instanceof Element && event.target.matches("input,textarea,select");
    let handled = true;
    if (shortcut_matches(event, this.settings.shortcuts.find)) this.open_find();
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
    } else if (event.key === "Escape" && this.find_widget.dataset.open === "true") this.close_find();
    else if (event.key === "Escape") this.close_details();
    else handled = false;
    if (handled) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
}

// 常用 gitmoji 短代码；用户可在设置中覆盖或扩充映射。
const builtin_emoji: Record<string, string> = { ":art:": "🎨", ":zap:": "⚡️", ":fire:": "🔥", ":bug:": "🐛", ":ambulance:": "🚑️", ":sparkles:": "✨", ":memo:": "📝", ":rocket:": "🚀", ":lipstick:": "💄", ":tada:": "🎉", ":white_check_mark:": "✅", ":lock:": "🔒️", ":closed_lock_with_key:": "🔐", ":bookmark:": "🔖", ":rotating_light:": "🚨", ":construction:": "🚧", ":green_heart:": "💚", ":arrow_down:": "⬇️", ":arrow_up:": "⬆️", ":pushpin:": "📌", ":construction_worker:": "👷", ":chart_with_upwards_trend:": "📈", ":recycle:": "♻️", ":heavy_plus_sign:": "➕", ":heavy_minus_sign:": "➖", ":wrench:": "🔧", ":hammer:": "🔨", ":globe_with_meridians:": "🌐", ":pencil2:": "✏️", ":poop:": "💩", ":rewind:": "⏪️", ":twisted_rightwards_arrows:": "🔀", ":package:": "📦️", ":alien:": "👽️", ":truck:": "🚚", ":page_facing_up:": "📄", ":boom:": "💥", ":bento:": "🍱", ":wheelchair:": "♿️", ":bulb:": "💡", ":beers:": "🍻", ":speech_balloon:": "💬", ":card_file_box:": "🗃️", ":loud_sound:": "🔊", ":mute:": "🔇", ":busts_in_silhouette:": "👥", ":children_crossing:": "🚸", ":building_construction:": "🏗️", ":iphone:": "📱", ":clown_face:": "🤡", ":egg:": "🥚", ":see_no_evil:": "🙈", ":camera_flash:": "📸", ":alembic:": "⚗️", ":mag:": "🔍️", ":label:": "🏷️", ":seedling:": "🌱", ":triangular_flag_on_post:": "🚩", ":goal_net:": "🥅", ":dizzy:": "💫", ":wastebasket:": "🗑️", ":passport_control:": "🛂", ":adhesive_bandage:": "🩹", ":monocle_face:": "🧐", ":coffin:": "⚰️", ":test_tube:": "🧪", ":necktie:": "👔", ":stethoscope:": "🩺", ":bricks:": "🧱", ":technologist:": "🧑‍💻", ":money_with_wings:": "💸", ":thread:": "🧵", ":safety_vest:": "🦺", ":smile:": "😄", ":thumbsup:": "👍", ":heart:": "❤️" };

for (const item of emoji_data) for (const alias of item.aliases) builtin_emoji[":" + alias + ":"] ??= item.emoji;
