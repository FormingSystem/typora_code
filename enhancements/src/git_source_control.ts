import { workspace_element as el, workspace_button as button, type workspace_menu_entry } from "./workspace_widgets";
import { compare_files, read_file_history, EMPTY, INDEX, WORKTREE, type graph_change } from "./git_graph_repository";
import { graph_actions } from "./git_graph_actions";
import { git_scm_history } from "./git_scm_history";
import { create_workspace_sash } from "./workspace_sash";
import type { git_graph_panel } from "./git_graph_panel";
import { git_icon, git_icon_button as icon_button, git_disclosure } from "./git_icons";

type change_group = {id: string; title: string; from: string; to: string; files: graph_change[]};
const short_revision = (revision: string) => ({[EMPTY]: "空文件", [INDEX]: "暂存区", [WORKTREE]: "工作区"}[revision] || revision.slice(0, 8));

/** 源代码管理与可展开提交历史共用主侧栏；完整提交图和文件差异使用中央编辑标签。 */
export class git_source_control {
  sidebar = el("aside", "git-scm-sidebar"); groups = el("div", "git-scm-groups"); filter = el("input", "git-scm-filter");
  message = el("textarea", "git-scm-message"); branch = el("div", "git-scm-branch"); title = el("div", "git-scm-title", "源代码管理"); repo_select = el("select", "git-scm-repository");
  notice = el("div", "git-scm-notice");
  sections = el("div", "git-scm-sections"); changes_pane = el("section", "git-scm-changes-pane");
  input_section = el("details", "git-scm-input-section"); repositories_view = el("section", "git-scm-repositories-view"); message_resize: ResizeObserver;
  show_repositories = false; show_changes = true; show_history = true; sort_order = "path"; history_tree = false;
  history: git_scm_history; history_sash: HTMLElement; history_ratio = .55; history_open = true;
  load_epoch = 0; groups_epoch = 0; tree = false; groups_state: change_group[] = [];
  constructor(public panel: git_graph_panel) {
    this.sidebar.setAttribute("data-linux-note-source-control", "ready");
    this.sidebar.setAttribute("data-linux-note-git-commit-shortcut", "ready");
    const tools = el("div", "git-scm-tools");
    tools.append(icon_button("refresh", "刷新源代码管理", () => void panel.refresh()), icon_button("more", "选择源代码管理视图", () => {}));
    tools.children[1].addEventListener("click", event => this.view_menu(event as MouseEvent));
    tools.children[1].classList.add("git-scm-view-menu");
    tools.children[0].setAttribute("title", "刷新源代码管理"); tools.children[1].setAttribute("title", "选择源代码管理视图"); this.title.append(tools);
    this.message.placeholder = "消息（Ctrl+Enter 提交）"; this.message.setAttribute("aria-label", "提交消息");
    this.message.rows = 1;
    this.message.oninput = () => { localStorage.setItem(this.storage_key("message"), this.message.value); this.fit_message(); };
    let message_width = 0;
    this.message_resize = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width || 0; if (width && width !== message_width) { message_width = width; this.fit_message(); } }); this.message_resize.observe(this.message);
    this.message.onkeydown = event => {
      if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey) || event.altKey || event.isComposing) return;
      event.preventDefault(); event.stopPropagation(); if (!event.repeat) this.commit();
    };
    const commit = button("提交", () => this.commit(), "git-scm-commit git-labeled-button"); commit.prepend(git_icon("check")); commit.setAttribute("data-scm-action", "commit");
    const commit_options = icon_button("chevron-down", "更多提交方式", () => {}, "git-scm-commit-options");
    commit_options.onclick = event => panel.configured_menu(event, "scm_commit_options", [
      {id: "commit", title: "提交已暂存内容", action: () => this.commit()},
      {id: "commit_options", title: "打开提交选项…", action: () => panel.action_dialog("commit", "changes", "", panel.state?.head, {message: this.message.value, amend: false})},
      {id: "commit_amend", title: "修改上一次提交…", disabled: !panel.state?.head, action: () => panel.action_dialog("commit", "changes", "", panel.state?.head, {message: this.message.value, amend: true})},
    ]);
    const commit_bar = el("div", "git-scm-commit-bar"); commit_bar.append(commit, commit_options);
    this.filter.placeholder = "筛选更改文件"; this.filter.setAttribute("aria-label", "筛选更改文件"); this.filter.oninput = () => this.render_groups();
    this.repo_select.setAttribute("aria-label", "源代码管理仓库"); this.repo_select.onchange = () => panel.switch_repo(this.repo_select.value);
    this.changes_pane.setAttribute("aria-label", "工作区更改");
    this.notice.setAttribute("role", "status");
    const input_heading = el("summary", "git-scm-input-heading"); const input_menu = icon_button("more", "更改与 Git 操作", () => {}, "git-scm-operation-menu");
    input_menu.onclick = event => this.more_menu(event); input_heading.append(git_disclosure(), el("span", "git-scm-input-title", "更改"), this.branch, input_menu);
    const inputs = el("div", "git-scm-inputs"); inputs.append(this.message, commit_bar);
    this.input_section.append(input_heading, inputs); this.input_section.ontoggle = () => this.save_layout();
    const repo_heading = el("div", "git-scm-repositories-heading", "仓库"); const manage = icon_button("more", "管理仓库", () => panel.manage_repositories()); repo_heading.append(manage);
    this.repositories_view.append(repo_heading, this.repo_select);
    this.changes_pane.append(this.input_section, this.filter, this.groups, this.notice);
    this.history = new git_scm_history(this);
    this.history_sash = create_workspace_sash({ label: "调整更改与提交图区域高度", area: this.sections, vertical: () => false,
      ratio: () => this.history_ratio, change: ratio => { this.history_ratio = ratio; this.apply_history_layout(); }, save: () => this.save_layout(), reset: .55 });
    this.history_sash.classList.add("git-scm-history-sash");
    this.sections.append(this.changes_pane, this.history_sash, this.history.container); this.sidebar.append(this.title, this.repositories_view, this.sections);
    this.sidebar.oncontextmenu = event => {
      if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      this.more_menu(event);
    };
    this.load_layout();
  }
  storage_key(suffix: string): string { return "linux-note-source-control:v1:" + suffix + ":" + this.panel.root; }
  load_layout(): void {
    this.tree = false; this.history_ratio = .55; this.history_open = true; this.input_section.open = true;
    this.show_repositories = false; this.show_changes = true; this.show_history = true; this.sort_order = "path"; this.history_tree = false;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storage_key("layout")) || "{}"); this.tree = saved.tree === true;
      if (typeof saved.history_ratio === "number" && Number.isFinite(saved.history_ratio)) this.history_ratio = Math.max(.15, Math.min(.85, saved.history_ratio));
      this.history_open = saved.history_open !== false;
      this.input_section.open = saved.input_open !== false;
      this.show_repositories = saved.show_repositories === true; this.show_changes = saved.show_changes !== false; this.show_history = saved.show_history !== false;
      if (!this.show_repositories && !this.show_changes && !this.show_history) this.show_changes = true;
      if (["path", "name", "status"].includes(saved.sort_order)) this.sort_order = saved.sort_order;
      this.history_tree = saved.history_tree === true;
    } catch { /* 使用默认布局。 */ }
    this.history.reset(); this.apply_history_layout();
    this.message.value = localStorage.getItem(this.storage_key("message")) || "";
    this.fit_message();
  }
  save_layout(): void { localStorage.setItem(this.storage_key("layout"), JSON.stringify({tree: this.tree, history_ratio: this.history_ratio, history_open: this.history_open, input_open: this.input_section.open, show_repositories: this.show_repositories, show_changes: this.show_changes, show_history: this.show_history, sort_order: this.sort_order, history_tree: this.history_tree})); }
  fit_message(): void {
    this.message.style.height = "0px";
    // 空输入框维持单行高度，不让窄侧栏内换行的占位提示撑高输入区。
    const height = this.message.value ? this.message.scrollHeight + 2 : 30;
    this.message.style.height = Math.min(120, Math.max(30, height)) + "px";
    this.message.style.overflowY = height > 120 ? "auto" : "hidden";
  }
  view_menu(event: MouseEvent): void {
    const views = [["show_repositories", "仓库"], ["show_changes", "更改"], ["show_history", "提交图"]] as const;
    const count = views.filter(([key]) => this[key]).length;
    this.panel.configured_menu(event, "source_control_views", views.map(([key, title]) => ({id: key, title, checked: this[key], disabled: count === 1 && this[key], action: () => { this[key] = !this[key]; this.apply_history_layout(); this.save_layout(); }})));
  }
  toggle_history(): void { this.history_open = !this.history_open; this.apply_history_layout(); this.save_layout(); }
  apply_history_layout(): void {
    this.repositories_view.hidden = !this.show_repositories; this.changes_pane.hidden = !this.show_changes; this.history.container.hidden = !this.show_history;
    this.sections.hidden = !this.show_changes && !this.show_history;
    this.sections.setAttribute("data-show-changes", String(this.show_changes)); this.sections.setAttribute("data-show-history", String(this.show_history));
    this.sections.setAttribute("data-history-open", String(this.history_open)); this.history_sash.hidden = !this.history_open || !this.show_changes || !this.show_history;
    this.sections.style.setProperty("--git-scm-changes-size", this.history_ratio * 100 + "fr");
    this.sections.style.setProperty("--git-scm-history-size", (1 - this.history_ratio) * 100 + "fr");
    this.history.set_open(this.history_open);
  }
  commit(): void {
    if (!this.message.value.trim()) { this.message.focus(); this.panel.report("请先输入提交消息。"); return; }
    void this.panel.quick_action("commit", [], {message: this.message.value, amend: false});
  }
  async refresh(): Promise<void> {
    const state = this.panel.state; if (!state) return; const epoch = ++this.groups_epoch;
    this.fit_message();
    this.history.render(state);
    this.repo_select.replaceChildren(...[...this.panel.repo_select.options].map(item => item.cloneNode(true))); this.repo_select.value = this.panel.root;
    this.branch.replaceChildren(git_icon("git-branch"), el("span", "git-scm-branch-label", `${state.branch || "游离 HEAD"}${state.operation ? " · " + state.operation : ""}`));
    this.branch.title = this.panel.root; this.branch.onclick = event => this.panel.configured_menu(event, "checkout", [
      ...state.refs.filter(ref => ref.name.startsWith("refs/heads/")).map(ref => ({id: ref.name, title: "检出 " + ref.name.slice(11), checked: ref.name.slice(11) === state.branch, action: () => this.panel.action_dialog("branch_checkout", "branch", ref.name.slice(11), ref.hash)})),
      {id: "branch_create", title: "创建分支…", separator: true, disabled: !state.head, action: () => this.panel.action_dialog("branch_create", "commit", state.head, state.head)},
    ]);
    try {
      const [staged, unstaged] = await Promise.all([compare_files(this.panel.runner.run, state, state.head || EMPTY, INDEX), compare_files(this.panel.runner.run, state, INDEX, WORKTREE)]);
      if (epoch !== this.groups_epoch || state !== this.panel.state) return;
      const conflicts = new Set(state.changes.filter(file => file.status.includes("U") || ["AA", "DD"].includes(file.status)).map(file => file.path));
      this.groups_state = [
        {id: "staged", title: "暂存的更改", from: state.head || EMPTY, to: INDEX, files: staged.filter(file => !conflicts.has(file.path))},
        {id: "changes", title: "更改", from: INDEX, to: WORKTREE, files: unstaged},
      ];
      this.render_groups();
    } catch (error) { if (epoch === this.groups_epoch) this.panel.report(error); }
  }
  render_groups(): void {
    const scroll = this.groups.scrollTop; this.groups.replaceChildren(); const filter = this.filter.value.toLowerCase();
    for (const group of this.groups_state) {
      const section = el("details", "git-scm-group"); section.setAttribute("data-scm-group", group.id); section.open = localStorage.getItem(this.storage_key("collapsed:" + group.id)) !== "true";
      section.ontoggle = () => localStorage.setItem(this.storage_key("collapsed:" + group.id), String(!section.open));
      const heading = el("summary", ""); const label = el("span", "git-scm-group-label"); label.append(el("span", "git-scm-group-name", group.title), el("span", "git-scm-badge", String(group.files.length))); heading.append(git_disclosure(), label);
      const action_id = group.id === "staged" ? "unstage" : "stage";
      const group_action = () => void this.panel.quick_action(action_id, [...new Set(group.files.flatMap(file => [file.path, ...(file.old_path ? [file.old_path] : [])]))]);
      const all = icon_button(group.id === "staged" ? "remove" : "add", group.id === "staged" ? "取消本组所有暂存" : "暂存本组所有更改", group_action, "git-scm-inline-action");
      all.title = group.id === "staged" ? "取消本组所有暂存" : "暂存本组所有更改"; all.onclick = event => { event.preventDefault(); event.stopPropagation(); group_action(); }; all.disabled = !group.files.length;
      const open = icon_button("diff-multiple", "打开本组更改（可切换文件）", () => {}, "git-scm-inline-action"); open.disabled = !group.files.length;
      open.onclick = event => { event.preventDefault(); event.stopPropagation(); if (group.files[0]) void this.open_file(group.files[0], group.from, group.to, group.files); };
      const discard = icon_button("discard", "放弃本组所有更改…", () => {}, "git-scm-inline-action"); discard.disabled = group.id === "staged" || !group.files.length;
      discard.onclick = event => { event.preventDefault(); event.stopPropagation(); this.panel.action_dialog("discard_changes", "changes", "", this.panel.state?.head, {include_untracked: true}, group.files.map(file => file.path)); };
      const actions = el("span", "git-scm-row-actions"); actions.append(open, discard, all);
      const placeholder = el("span", "git-scm-status-slot"); placeholder.setAttribute("aria-hidden", "true"); heading.append(actions, placeholder);
      heading.oncontextmenu = event => this.panel.configured_menu(event, "changes_group", [
        {id: action_id, title: all.title, disabled: !group.files.length, action: group_action},
        {id: "collapse", title: "折叠所有更改分组", action: () => this.groups.querySelectorAll("details").forEach(item => { item.open = false; })},
        {id: "expand", title: "展开所有更改分组", action: () => this.groups.querySelectorAll("details").forEach(item => { item.open = true; })},
        {id: "tree", title: "以树形显示", checked: this.tree, action: () => { this.tree = !this.tree; this.save_layout(); this.render_groups(); }},
      ]);
      section.append(heading); this.groups.append(section); const directories = new Map<string, HTMLElement>([["", section]]);
      const parent_for = (path: string): HTMLElement => {
        if (!this.tree || !path) return section; if (directories.has(path)) return directories.get(path)!;
        const parts = path.split("/"); const parent = parent_for(parts.slice(0, -1).join("/")); const directory = el("details", "git-scm-directory"); directory.open = true; const heading = el("summary", "", parts.at(-1)!); heading.prepend(git_disclosure()); directory.append(heading); parent.append(directory); directories.set(path, directory); return directory;
      };
      for (const file of group.files.filter(file => file.path.toLowerCase().includes(filter)).sort((a, b) => this.sort_files(a, b))) {
        const row = el("div", "git-scm-file"); row.setAttribute("data-file", file.path); row.tabIndex = 0; row.setAttribute("role", "button"); row.title = `${file.old_path ? file.old_path + " → " : ""}${file.path}\n${short_revision(group.from)} ↔ ${short_revision(group.to)}`;
        const label = el("span", "git-scm-file-label"); label.append(el("span", "git-scm-file-name", file.path.split("/").at(-1)!));
        if (!this.tree) label.append(el("span", "git-scm-file-directory", file.path.split("/").slice(0, -1).join("/")));
        const action = group.id === "staged" ? "unstage" : "stage";
        const mini = icon_button(group.id === "staged" ? "remove" : "add", group.id === "staged" ? "取消暂存" : "暂存更改", () => {}, "git-scm-inline-action");
        mini.onclick = event => { event.stopPropagation(); void this.panel.quick_action(action, [file.path, ...(file.old_path ? [file.old_path] : [])]); };
        const actions = el("span", "git-scm-row-actions"); actions.append(mini);
        const status = el("span", "git-scm-file-status", file.status === "??" ? "U" : file.status); status.title = file.status; status.setAttribute("data-status", file.status === "??" ? "U" : file.status[0]);
        row.append(label, actions, status);
        row.onclick = () => { for (const item of this.groups.querySelectorAll(".selected")) item.classList.remove("selected"); row.classList.add("selected"); void this.open_file(file, group.from, group.to, group.files); };
        row.onkeydown = event => { if (event.target === row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); row.click(); } };
        row.oncontextmenu = event => this.panel.configured_menu(event, "scm_file", this.file_entries(file, group.from, group.to, group.files));
        parent_for(file.path.split("/").slice(0, -1).join("/")).append(row);
      }
      if (!group.files.length) section.append(el("div", "git-scm-empty", "无更改"));
    }
    this.groups.scrollTop = scroll;
  }
  sort_files(a: graph_change, b: graph_change): number {
    const value = (file: graph_change) => this.sort_order === "name" ? file.path.split("/").at(-1)! : this.sort_order === "status" ? file.status : file.path;
    return value(a).localeCompare(value(b)) || a.path.localeCompare(b.path);
  }
  file_entries(file: graph_change, from: string, to: string, files: graph_change[]): workspace_menu_entry[] {
    const entries: workspace_menu_entry[] = [
      {id: "open_diff", title: "打开更改", action: () => void this.open_file(file, from, to, files)},
      {id: "open_file", title: "打开文件", action: () => void this.panel.host.open_file(this.panel.root, file.path, this.panel.settings).catch(error => this.panel.report(error))},
      {id: "file_history", title: "打开文件历史（时间线）", action: () => void this.file_history(file.path)},
      {id: "copy_relative", title: "复制相对路径", separator: true, action: () => void this.panel.host.copy(file.path)},
      {id: "copy_absolute", title: "复制路径", action: () => void this.panel.host.copy(this.panel.host.file_path(this.panel.root, file.path))},
      {id: "reveal_file", title: "在文件资源管理器中显示", action: () => this.panel.host.reveal_file(this.panel.root, file.path)},
    ];
    if (to === INDEX || to === WORKTREE) {
      const staged = to === INDEX;
      if (!staged && file.status === "??") entries.push(
        {id: "ignore_file", title: "添加到 .gitignore", separator: true, action: () => void this.ignore_file(file.path)},
      );
      entries.push({id: staged ? "unstage" : "stage", title: staged ? "取消暂存更改" : "暂存更改", separator: true, action: () => void this.panel.quick_action(staged ? "unstage" : "stage", [file.path, ...(file.old_path ? [file.old_path] : [])])});
      if (!staged) entries.push({id: "discard_file", title: "放弃更改…", action: () => this.panel.action_dialog("discard_changes", "file", file.path, this.panel.state?.head, {include_untracked: true}, [file.path])});
    }
    return entries;
  }
  async ignore_file(file: string): Promise<void> {
    if (this.panel.writing) return;
    this.panel.writing = true; let message = "";
    try { const result = await this.panel.host.ignore_file(this.panel.root, file, this.panel.settings); message = result.changed ? `已添加到 .gitignore：${file}` : `已忽略：${file}`; }
    catch (error) { message = String(error); }
    finally { this.panel.writing = false; await this.panel.refresh(false); this.panel.report(message); }
  }
  async open_file(file: graph_change, from: string, to: string, files: graph_change[] = [file]): Promise<void> {
    const epoch = ++this.load_epoch; const root = this.panel.root;
    this.panel.status.textContent = "正在打开文件差异…";
    try {
      if (file.status === "U") throw new Error("此文件有未解决的合并冲突。请用“打开文件”编辑冲突标记，解决后暂存；暂存区目前没有可比较的单一版本。");
      const [left, right] = await Promise.all([
        file.status.startsWith("A") || file.status === "??" ? "" : this.panel.host.revision_text(root, from, file.old_path || file.path, this.panel.settings),
        file.status.startsWith("D") ? "" : this.panel.host.revision_text(root, to, file.path, this.panel.settings),
      ]);
      if (epoch !== this.load_epoch || root !== this.panel.root) return;
      this.panel.host.open_document({title: file.path.split("/").at(-1)! + "（更改）", file: file.path, left, right, left_label: `${file.old_path || file.path} · ${short_revision(from)}（只读）`, right_label: `${file.path} · ${short_revision(to)}（只读）`}, "active", {
        root, key: JSON.stringify([from, to, file.path]), menu: () => this.file_entries(file, from, to, files),
        refresh: () => void this.open_file(file, from, to, files),
        adjacent: direction => { const index = files.findIndex(item => item.path === file.path); void this.open_file(files[(index + direction + files.length) % files.length], from, to, files); },
      });
      // 侧栏历史可独立选择版本，不能把同名文件误记到中央页正在进行的另一场评审。
      if (this.panel.from === from && this.panel.to === to) this.panel.mark_reviewed(file.path);
      this.panel.status.textContent = `${file.path} · ${short_revision(from)} ↔ ${short_revision(to)}`;
    } catch (error) { if (epoch === this.load_epoch) this.panel.report(error); }
  }
  async file_history(file: string): Promise<void> {
    const root = this.panel.root;
    const view = el("div", "git-file-timeline"); const title = el("div", "git-scm-title", "时间线 · " + file); const list = el("div", "git-file-timeline-list"); view.append(title, list);
    this.panel.host.open_panel("◷ " + file.split("/").at(-1)!, "timeline:" + file, root, view);
    let count = this.panel.settings.initial_count;
    const load = async () => {
      list.textContent = "正在读取文件历史…";
      try {
        const records = this.panel.state?.head ? await read_file_history(this.panel.runner.run, root, file, count) : [];
        if (root !== this.panel.root) return; list.replaceChildren();
        for (const record of records) {
          const row = button(record.commit.subject, () => void this.open_file(record.file, record.commit.parents[0] || EMPTY, record.commit.hash), "git-file-history-row");
          row.append(el("span", "", `${record.commit.author} · ${this.panel.date(record.commit)} · ${record.commit.hash.slice(0, 8)} · ${record.file.status} ${record.file.path}`));
          row.oncontextmenu = event => this.panel.configured_menu(event, "timeline", [
            {id: "open_diff", title: "打开更改", action: () => row.click()},
            {id: "open_revision", title: "打开此版本", action: () => void this.panel.open_revision(record.commit.hash, record.file.path)},
            {id: "copy_hash", title: "复制提交编号", action: () => void this.panel.host.copy(record.commit.hash)},
            {id: "commit_actions", title: "提交操作…", action: () => this.panel.target_menu(event, "commit", record.commit.hash, record.commit.hash)},
          ]); list.append(row);
        }
        if (!records.length) list.textContent = "此文件没有 Git 提交历史。";
        if (records.length >= count) list.append(button("加载更多文件历史", () => { count += this.panel.settings.page_count; void load(); }));
      } catch (error) { list.textContent = String(error); }
    }; void load();
  }
  more_menu(event: MouseEvent): void {
    const panel = this.panel;
    const actions = (ids: string[]) => ids.map(id => ({id, title: graph_actions.find(action => action.id === id)!.title, action: () => ["stage_all", "unstage_all"].includes(id) ? void panel.quick_action(id) : id === "commit" ? this.commit() : panel.action_dialog(id, id.startsWith("stash") ? "changes" : "repository", "", panel.state?.head)}));
    const submenu = (title: string, entries: workspace_menu_entry[]): workspace_menu_entry => ({title, children: entries, disabled: !entries.length, action() {}});
    const target_actions = (kind: string, target: string, hash: string) => graph_actions.filter(action => action.targets.includes(kind)).map(action => ({id: action.id, title: action.title, action: () => panel.action_dialog(action.id, kind, target, hash)}));
    const refs = panel.state?.refs || [];
    const branches = refs.filter(ref => ref.name.startsWith("refs/heads/")).map(ref => submenu(ref.name.slice(11), target_actions("branch", ref.name.slice(11), ref.hash)));
    const remotes = (panel.state?.remotes || []).map(remote => submenu(remote.name, [
      {title: "获取", action: () => panel.action_dialog("fetch", "repository", "", "", {remote: remote.name})},
      {title: "编辑远端 URL…", action: () => panel.action_dialog("remote_edit", "repository", "", "", {remote: remote.name, url: remote.fetch})},
      {title: "移除远端…", action: () => panel.action_dialog("remote_remove", "repository", "", "", {remote: remote.name})},
    ]));
    const stashes = (panel.state?.stashes || []).map(stash => submenu(stash.subject, target_actions("stash", stash.name, stash.hash)));
    const tags = refs.filter(ref => ref.name.startsWith("refs/tags/")).map(ref => submenu(ref.name.slice(10), target_actions("tag", ref.name.slice(10), ref.hash)));
    panel.configured_menu(event, "source_control", [
      {id: "view_list", title: "以列表显示", checked: !this.tree, action: () => { this.tree = false; this.save_layout(); this.render_groups(); }},
      {id: "view_tree", title: "以树形显示", checked: this.tree, action: () => { this.tree = true; this.save_layout(); this.render_groups(); }},
      submenu("视图与排序", [...[["name", "按名称排序"], ["path", "按路径排序"], ["status", "按状态排序"]].map(([value, title]) => ({id: "sort_" + value, title, checked: this.sort_order === value, action: () => { this.sort_order = value; this.save_layout(); this.render_groups(); }})), {title: "展开所有分组", action: () => this.groups.querySelectorAll("details").forEach(item => { item.open = true; })}, {title: "折叠所有分组", action: () => this.groups.querySelectorAll("details").forEach(item => { item.open = false; })}]),
      ...actions(["pull", "push", "clone", "fetch"]),
      {id: "checkout", title: "检出到…", action: () => this.branch.click()},
      submenu("提交", [...actions(["commit"]), {title: "提交已暂存内容并修改上次提交…", action: () => panel.action_dialog("commit", "changes", "", panel.state?.head, {message: this.message.value, amend: true})}]),
      submenu("更改", actions(["stage_all", "unstage_all", "discard_changes", "stash_create", "clean"])),
      submenu("拉取、推送", actions(["sync", "fetch", "pull", "push"])),
      submenu("分支", [{id: "checkout", title: "检出到…", action: () => this.branch.click()}, {id: "branch_create", title: "创建分支…", action: () => panel.action_dialog("branch_create", "commit", "", panel.state?.head)}, ...branches]),
      submenu("远端", [{id: "remote_add", title: "添加远端…", action: () => panel.action_dialog("remote_add", "repository")}, ...remotes]),
      submenu("贮藏", [...actions(["stash_create"]), ...stashes]),
      submenu("标签", [{id: "tag_add", title: "创建标签…", action: () => panel.action_dialog("tag_add", "commit", "", panel.state?.head)}, ...tags]),
      {id: "output", title: "显示 Git 输出", separator: true, action: () => panel.host.show_output(panel.root)},
      {id: "graph", title: "打开 Git Graph", separator: true, action: () => panel.host.show_history(panel.root)},
      {id: "terminal", title: "在仓库根目录打开终端", action: () => panel.host.terminal(panel.root, panel.settings.terminal_shell)},
      {id: "terminal_admin", title: "以管理员身份打开仓库终端（UAC）", action: () => panel.host.terminal(panel.root, "", true)},
      {id: "settings", title: "Git 设置…", action: () => panel.settings_dialog()},
    ]);
  }
  dispose(): void { this.load_epoch++; this.groups_epoch++; this.history.dispose(); this.message_resize.disconnect(); }
}
