import {plan_git_diff_ranges} from "./git_diff_ranges";
import {git_scm_repositories} from "./git_scm_repositories";
import {checkout_entries,show_worktrees} from "./git_scm_menus";
import {workspace_menu} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_file_icons} from "./workspace_file_icons";
import {git_file_label} from "./git_file_label";
import { workspace_element as el, workspace_button as button, type workspace_menu_entry } from "./workspace_widgets";
import { compare_files, read_file_history, EMPTY, INDEX, WORKTREE, type graph_change } from "./git_graph_repository";
import { graph_actions } from "./git_graph_actions";
import { git_scm_history } from "./git_scm_history";
import { create_workspace_sash } from "./workspace_sash";
import type { git_graph_panel } from "./git_graph_panel";
import { git_icon, git_icon_button as icon_button, git_disclosure } from "./git_icons";
import { git_graph_text as text, type git_graph_text_key } from "./git_graph_i18n";

type change_group = {id: string; title: string; from: string; to: string; files: graph_change[]};
const short_revision = (revision: string) => ({[EMPTY]: text("scm.revision.empty"), [INDEX]: text("scm.revision.index"), [WORKTREE]: text("scm.revision.worktree")}[revision] || revision.slice(0, 8));


/** 源代码管理与可展开提交历史共用主侧栏；完整提交图和文件差异使用中央编辑标签。 */
export class git_source_control {
  private file_icon_style = acquire_workspace_file_icons();
  sidebar = el("aside", "git-scm-sidebar"); groups = el("div", "git-scm-groups");
  message = el("textarea", "git-scm-message"); title = el("div", "git-scm-title");
  private input_actions = new Map<"commit" | "refresh" | "graph", HTMLButtonElement>();
  private interaction_style = acquire_workspace_interaction(this.sidebar);
  notice = el("div", "git-scm-notice");
  sections = el("div", "git-scm-sections"); changes_pane = el("section", "git-scm-changes-pane");
  input_section = el("details", "git-scm-input-section"); changes_body = el("div", "git-scm-changes-body"); groups_scroll = 0; repositories_view = el("section", "git-scm-repositories-view"); message_resize: ResizeObserver;
  input_heading=el("summary","git-scm-input-heading");
  show_repositories = false; show_changes = true; show_history = true; sort_order = "path"; history_tree = false;
  repositories:git_scm_repositories;
  history: git_scm_history; history_sash: HTMLElement; history_ratio = .55; history_open = true;
  load_epoch = 0; groups_epoch = 0; tree = false; groups_state: change_group[] = [];
  private groups_layout_changed = true;
  constructor(public panel: git_graph_panel) {
    this.sidebar.setAttribute("data-linux-note-source-control", "ready");
    this.sidebar.setAttribute("data-linux-note-git-commit-shortcut", "ready");
    const title_label=el("span", "git-scm-title-label", text("scm.source_control"));title_label.title=text("scm.source_control");this.title.append(title_label);
    const tools = el("div", "git-scm-tools");
    const views = icon_button("more", text("scm.select_views"), () => {}, "git-scm-view-menu");
    views.onclick = event => this.view_menu(event); tools.append(views); this.title.append(tools);
    this.message.placeholder = text("scm.message_placeholder"); this.message.setAttribute("aria-label", text("scm.commit_message"));
    this.message.rows = 1;
    this.message.oninput = () => { localStorage.setItem(this.storage_key("message"), this.message.value); this.fit_message(); };
    let message_width = 0;
    this.message_resize = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width || 0; if (width && width !== message_width) { message_width = width; this.fit_message(); } }); this.message_resize.observe(this.message);
    this.message.onkeydown = event => {
      if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey) || event.altKey || event.isComposing) return;
      event.preventDefault(); event.stopPropagation(); if (!event.repeat) this.commit();
    };
    const commit = button(text("scm.commit"), () => this.commit(), "git-scm-commit git-labeled-button"); commit.prepend(git_icon("check")); commit.setAttribute("data-scm-action", "commit");
    const commit_options = icon_button("chevron-down", text("scm.more_commit_actions"), () => {}, "git-scm-commit-options");
    commit_options.onclick = event => panel.configured_menu(event, "scm_commit_options", [
      {id: "commit", title: text("scm.commit_staged"), action: () => this.commit()},
      {id: "commit_options", title: text("scm.open_commit_options"), action: () => panel.action_dialog("commit", "changes", "", panel.state?.head, {message: this.message.value, amend: false})},
      {id: "commit_amend", title: text("scm.amend_last_commit"), disabled: !panel.state?.head, action: () => panel.action_dialog("commit", "changes", "", panel.state?.head, {message: this.message.value, amend: true})},
    ]);
    commit.dataset.workspaceInteraction="primary";commit_options.dataset.workspaceInteraction="primary";
    const commit_bar = el("div", "git-scm-commit-bar"); commit_bar.append(commit, commit_options);
    this.changes_pane.setAttribute("aria-label", text("scm.working_tree_changes"));
    this.notice.setAttribute("role", "status");
    const input_heading = this.input_heading; const input_menu = icon_button("more", text("scm.changes_and_operations"), () => {}, "git-scm-operation-menu");
    const input_actions = el("div", "git-scm-input-actions");
    for (const [id, icon, label] of [["commit", "check", text("scm.commit")], ["refresh", "refresh", text("history.refresh")], ["graph", "git-branch", text("scm.open_graph")]] as const) {
      const control = icon_button(icon, label, () => {});
      control.dataset.scmTitleAction = id;
      control.onclick = event => {
        // summary 内的操作按钮不参与折叠；键盘激活同样走原生 click。
        event.preventDefault(); event.stopPropagation();
        if (!this.input_action_enabled(id)) return;
        if (id === "commit") this.commit();
        else if (id === "refresh") this.history.toolbar.execute("refresh");
        else panel.host.show_history(panel.root);
      };
      this.input_actions.set(id, control); input_actions.append(control);
    }
    input_menu.onclick = event => { event.preventDefault(); event.stopPropagation(); this.more_menu(event); };
    input_actions.append(input_menu);
    const input_title = el("span", "git-scm-input-title", text("scm.changes")); input_title.title = text("scm.changes");
    input_heading.append(git_disclosure(), input_title, input_actions);
    const inputs = el("div", "git-scm-inputs"); inputs.append(this.message, commit_bar);
    this.changes_body.append(inputs, this.groups, this.notice);
    this.input_section.append(input_heading, this.changes_body);
    this.groups.onscroll = () => { if (this.input_section.open) this.groups_scroll = this.groups.scrollTop; };
    this.input_section.ontoggle = () => {
      this.changes_body.inert = !this.input_section.open;
      if (this.input_section.open) this.groups.scrollTop = this.groups_scroll;
      this.save_layout();
    };
    const repo_heading = el("div", "git-scm-repositories-heading", text("scm.repositories")); const manage = icon_button("more", text("scm.manage_repositories"), () => panel.manage_repositories()); repo_heading.append(manage);
    this.repositories=new git_scm_repositories(this);this.repositories_view.append(repo_heading,this.repositories.container);
    repo_heading.oncontextmenu=event=>this.view_menu(event,"show_repositories");
    input_heading.oncontextmenu=event=>this.view_menu(event,"show_changes");
    this.changes_pane.append(this.input_section);
    this.history = new git_scm_history(this);
    this.history_sash = create_workspace_sash({ label: text("scm.resize_sections"), area: this.sections, vertical: () => false,
      ratio: () => this.history_ratio, change: ratio => { this.history_ratio = ratio; this.apply_history_layout(); }, save: () => this.save_layout(), reset: .55 });
    this.history_sash.classList.add("git-scm-history-sash");
    this.sections.append(this.changes_pane, this.history_sash, this.history.container); this.sidebar.append(this.title, this.repositories_view, this.sections);
    this.sidebar.oncontextmenu = event => {
      if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      this.view_menu(event);
    };
    this.load_layout(); this.update_actions();
  }
  storage_key(suffix: string): string { return "linux-note-source-control:v1:" + suffix + ":" + this.panel.root; }
  load_layout(): void {
    this.groups_layout_changed = true;
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
  view_menu(event: MouseEvent,current?:"show_repositories"|"show_changes"|"show_history"): void {
    const views = [["show_repositories", text("scm.repositories")], ["show_changes", text("scm.changes")], ["show_history", text("scm.graph")]] as const;
    const count = views.filter(([key]) => this[key]).length;
    const root=this.panel.root,runner=this.panel.runner;
    const entries:workspace_menu_entry[]=views.map(([key, title]) => ({id: key, title, checked: this[key], disabled: count === 1 && this[key], action: () => { if(root!==this.panel.root||runner!==this.panel.runner||this.panel.disposed)return;this[key] = !this[key]; this.apply_history_layout(); this.save_layout();if(this.show_repositories)this.repositories.refresh(); }}));
    if(current)entries.unshift({id:"hide_section",title:text("scm.hide_action",{name:views.find(([key])=>key===current)![1]}),disabled:count===1,action:()=>{if(root!==this.panel.root||runner!==this.panel.runner||this.panel.disposed)return;this[current]=false;this.apply_history_layout();this.save_layout();}});
    workspace_menu(event,entries);
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
  input_action_enabled(id: "commit" | "refresh" | "graph"): boolean {
    const panel = this.panel;
    if (!this.history.toolbar.enabled("refresh")) return false;
    return id === "refresh" || !!panel.state && panel.state.root === panel.root && panel.container.dataset.state !== "error";
  }
  update_actions(): void {
    this.message.disabled=this.panel.writing&&this.panel.progress.state.kind==="commit";
    for (const [id, control] of this.input_actions) control.disabled = !this.input_action_enabled(id);
    for (const control of this.changes_body.querySelectorAll<HTMLButtonElement>(".git-scm-commit, .git-scm-commit-options")) control.disabled = !this.input_action_enabled("commit");
  }
  commit(): void {
    if (!this.input_action_enabled("commit")) return;
    if (!this.message.value.trim()) {
      // 标题在折叠时仍可操作；需要输入消息时先显式展开并解除 inert。
      this.input_section.open = true; this.changes_body.inert = false;
      this.message.focus(); this.panel.report(text("scm.message_required")); return;
    }
    void this.panel.quick_action("commit", [], {message: this.message.value, amend: false});
  }
  async refresh(history_changed = true): Promise<void> {
    const state = this.panel.state; if (!state) return; const epoch = ++this.groups_epoch;
    this.fit_message();
    if (history_changed) this.history.render(state);
    try {
      const [staged, unstaged] = await Promise.all([compare_files(this.panel.runner.run, state, state.head || EMPTY, INDEX), compare_files(this.panel.runner.run, state, INDEX, WORKTREE)]);
      if (epoch !== this.groups_epoch || state !== this.panel.state) return;
      const conflicts = new Set(state.changes.filter(file => file.status.includes("U") || ["AA", "DD"].includes(file.status)).map(file => file.path));
      const groups_state = [
        {id: "staged", title: text("scm.staged_changes"), from: state.head || EMPTY, to: INDEX, files: staged.filter(file => !conflicts.has(file.path))},
        {id: "changes", title: text("scm.changes"), from: INDEX, to: WORKTREE, files: unstaged},
      ];
      const changed = JSON.stringify(groups_state) !== JSON.stringify(this.groups_state);
      this.groups_state = groups_state;
      if (changed || this.groups_layout_changed || !this.groups.childElementCount) this.render_groups();
    } catch (error) { if (epoch === this.groups_epoch) this.panel.report(error); }
  }
  render_groups(): void {
    this.groups_layout_changed = false;
    const scroll = this.input_section.open ? this.groups.scrollTop : this.groups_scroll; this.groups.replaceChildren();
    for (const group of this.groups_state) {
      const section = el("details", "git-scm-group"); section.setAttribute("data-scm-group", group.id); section.open = localStorage.getItem(this.storage_key("collapsed:" + group.id)) !== "true";
      section.ontoggle = () => localStorage.setItem(this.storage_key("collapsed:" + group.id), String(!section.open));
      const heading = el("summary", ""); const label = el("span", "git-scm-group-label"); label.append(el("span", "git-scm-group-name", group.title)); label.title=group.title; heading.append(git_disclosure(), label);
      const action_id = group.id === "staged" ? "unstage" : "stage";
      const group_action = () => void this.panel.quick_action(action_id, [...new Set(group.files.flatMap(file => [file.path, ...(file.old_path ? [file.old_path] : [])]))]);
      const all = icon_button(group.id === "staged" ? "remove" : "add", group.id === "staged" ? text("scm.unstage_all_group") : text("scm.stage_all_group"), group_action, "git-scm-inline-action");
      all.title = group.id === "staged" ? text("scm.unstage_all_group") : text("scm.stage_all_group"); all.onclick = event => { event.preventDefault(); event.stopPropagation(); group_action(); }; all.disabled = !group.files.length;
      const open = icon_button("diff-multiple", text("scm.open_group_changes"), () => {}, "git-scm-inline-action"); open.disabled = !group.files.length;
      open.onclick = event => { event.preventDefault(); event.stopPropagation(); if (group.files[0]) void this.open_file(group.files[0], group.from, group.to, group.files); };
      const discard = icon_button("discard", text("scm.discard_group_changes"), () => {}, "git-scm-inline-action"); discard.disabled = group.id === "staged" || !group.files.length;
      discard.onclick = event => { event.preventDefault(); event.stopPropagation(); this.panel.action_dialog("discard_changes", "changes", "", this.panel.state?.head, {include_untracked: true}, group.files.map(file => file.path)); };
      const actions = el("span", "git-scm-row-actions"); actions.append(open, discard, all);
      heading.append(actions, el("span", "git-scm-badge", String(group.files.length)));
      heading.oncontextmenu = event => this.panel.configured_menu(event, "changes_group", [
        {id: action_id, title: all.title, disabled: !group.files.length, action: group_action},
        {id: "collapse", title: text("scm.collapse_groups"), action: () => this.groups.querySelectorAll("details").forEach(item => { item.open = false; })},
        {id: "expand", title: text("scm.expand_groups"), action: () => this.groups.querySelectorAll("details").forEach(item => { item.open = true; })},
        {id: "tree", title: text("scm.tree_view"), checked: this.tree, action: () => { this.tree = !this.tree; this.save_layout(); this.render_groups(); }},
      ]);
      section.append(heading); this.groups.append(section); const directories = new Map<string, HTMLElement>([["", section]]);
      const parent_for = (path: string): HTMLElement => {
        if (!this.tree || !path) return section; if (directories.has(path)) return directories.get(path)!;
        const parts = path.split("/"); const parent = parent_for(parts.slice(0, -1).join("/")); const directory = el("details", "git-scm-directory"); directory.open = true; const heading = el("summary", "", parts.at(-1)!); heading.prepend(git_disclosure()); directory.append(heading); parent.append(directory); directories.set(path, directory); return directory;
      };
      for (const file of [...group.files].sort((a, b) => this.sort_files(a, b))) {
        const row = el("div", "git-scm-file"); row.style.lineHeight = "var(--git-scm-row-height,22px)"; row.setAttribute("data-file", file.path); row.tabIndex = 0; row.setAttribute("role", "button"); row.title = `${file.old_path ? file.old_path + " → " : ""}${file.path}\n${short_revision(group.from)} ↔ ${short_revision(group.to)}`;
        const label = git_file_label(file.path, !this.tree);
        const action = group.id === "staged" ? "unstage" : "stage";
        const mini = icon_button(group.id === "staged" ? "remove" : "add", group.id === "staged" ? text("scm.unstage_change") : text("scm.stage_change"), () => {}, "git-scm-inline-action");
        mini.onclick = event => { event.stopPropagation(); void this.panel.quick_action(action, [file.path, ...(file.old_path ? [file.old_path] : [])]); };
        const actions = el("span", "git-scm-row-actions");
        const open_current=icon_button("go-to-file",text("scm.open_file"),()=>{},"git-scm-inline-action");open_current.dataset.scmFileAction="open";open_current.disabled=file.status.startsWith("D");
        open_current.onclick=event=>{event.stopPropagation();if(!open_current.disabled)void this.open_current_file(file);};
        actions.append(open_current);
        if(group.to===WORKTREE){const discard_current=icon_button("discard",text("scm.discard_change"),()=>{},"git-scm-inline-action");discard_current.dataset.scmFileAction="discard";discard_current.onclick=event=>{event.stopPropagation();this.panel.action_dialog("discard_changes","file",file.path,this.panel.state?.head,{include_untracked:true},[file.path]);};actions.append(discard_current);}
        mini.dataset.scmFileAction=action;actions.append(mini);
        const status = el("span", "git-scm-file-status", file.status === "??" ? "U" : file.status); status.title = file.status; status.setAttribute("data-status", file.status === "??" ? "U" : file.status[0]);
        row.append(label, actions, status);
        row.onclick = () => { for (const item of this.groups.querySelectorAll(".selected")) item.classList.remove("selected"); row.classList.add("selected"); void this.open_default_file(file, group.from, group.to, group.files); };
        row.onkeydown = event => { if (event.target === row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); row.click(); } };
        row.oncontextmenu = event => this.panel.configured_menu(event, "scm_file", this.file_entries(file, group.from, group.to, group.files));
        parent_for(file.path.split("/").slice(0, -1).join("/")).append(row);
      }
      if (!group.files.length) section.append(el("div", "git-scm-empty", text("scm.no_changes")));
    }
    this.groups.scrollTop = scroll;
  }
  sort_files(a: graph_change, b: graph_change): number {
    const value = (file: graph_change) => this.sort_order === "name" ? file.path.split("/").at(-1)! : this.sort_order === "status" ? file.status : file.path;
    return value(a).localeCompare(value(b)) || a.path.localeCompare(b.path);
  }
  repository_action_available(root: string): boolean {
    if (!this.panel.disposed && root === this.panel.root) return true;
    this.panel.report(text("scm.repository_changed"));
    return false;
  }
  file_entries(file: graph_change, from: string, to: string, files: graph_change[], root = this.panel.root): workspace_menu_entry[] {
    const runner=this.panel.runner;
    const historical = to !== INDEX && to !== WORKTREE;
    const head=this.panel.state?.head||"",change=this.panel.state?.changes.find(item=>item.path===file.path||item.path===file.old_path);
    const head_path=change?.old_path||file.old_path||file.path;
    const has_head=!!head&&file.status!=="??"&&change?.index_status!=="A"&&!(to===INDEX&&file.status.startsWith("A"));
    const entries: workspace_menu_entry[] = [
      {id: "open_diff", title: text("scm.open_changes"), action: () => void this.open_file(file, from, to, files)},
      {id: "open_file", title: text(historical ? "scm.open_revision" : "scm.open_file"), disabled: historical ? file.status.startsWith("D") && from === EMPTY : file.status.startsWith("D"), action: () => historical ? void this.open_revision_file(file, from, to) : void this.open_current_file(file)},
      ...(!historical?[{id:"open_head",title:text("scm.open_head"),disabled:!has_head,action:()=>void this.open_revision(head,head_path)}]:[]),
      {id: "file_history", title: text("scm.file_history"), action: () => void this.file_history(file.path)},
      {id: "copy_relative", title: text("scm.copy_relative_path"), separator: true, action: () => void this.panel.host.copy(file.path)},
      {id: "copy_absolute", title: text("scm.copy_path"), action: () => void this.panel.host.copy(this.panel.host.file_path(this.panel.root, file.path))},
      {id: "reveal_file", title: text("scm.reveal_file"),disabled:file.status.startsWith("D"), action: () => this.panel.host.reveal_file(this.panel.root, file.path)},
      {id:"reveal_explorer",title:text("scm.reveal_explorer"),disabled:file.status.startsWith("D"),action:()=>this.panel.host.reveal_explorer(root,file.path)},
    ];
    if (to === INDEX || to === WORKTREE) {
      const staged = to === INDEX;
      if (!file.status.startsWith("D")) entries.push(
        {id: "ignore_file", title: text("scm.add_to_gitignore"), separator: true, action: () => void this.ignore_file(file.path,file.status!=="??")},
      );
      entries.push({id: staged ? "unstage" : "stage", title: staged ? text("scm.unstage_change") : text("scm.stage_change"), separator: true, action: () => void this.panel.quick_action(staged ? "unstage" : "stage", [file.path, ...(file.old_path ? [file.old_path] : [])])});
      if (!staged) entries.push({id: "discard_file", title: text("scm.discard_change"), action: () => this.panel.action_dialog("discard_changes", "file", file.path, this.panel.state?.head, {include_untracked: true}, [file.path])});
    }
    // 菜单可能在切换仓库前已创建；执行时仍须核对生成比较的仓库身份。
    return entries.map(entry => ({...entry, action: () => { if (this.repository_action_available(root)&&runner===this.panel.runner&&!this.panel.pending&&!this.panel.writing) void entry.action?.(); }}));
  }
  async ignore_file(file: string,tracked=false): Promise<void> {
    if (this.panel.writing||this.panel.pending||this.panel.disposed) return;
    let message = "";
    try { const result = await this.panel.run_operation("ignore",()=>this.panel.host.ignore_file(this.panel.root, file, this.panel.settings)); message = result.changed ? text("scm.added_to_gitignore", {file}) : text("scm.already_ignored", {file});if(tracked)message+="\n"+text("scm.ignore_keeps_tracking"); }
    catch (error) { message = String(error); }
    finally { this.panel.report(message); }
  }
  /** 默认资源点击：仅当前比较的新增项没有旧基线；显式比较入口仍走 open_file。 */
  async open_default_file(file:graph_change,from:string,to:string,files:graph_change[]):Promise<void>{
    if((to===WORKTREE||to===INDEX)&&(file.status==="??"||/^A[0-9]*$/u.test(file.status))){
      await this.open_current_file(file);
      return;
    }
    await this.open_file(file,from,to,files);
  }
  async open_current_file(file: graph_change): Promise<void> {
    // 当前文件导航取代仍在读取的比较，避免旧 diff 完成后抢回活动标签。
    const epoch = ++this.load_epoch; const root = this.panel.root;
    try { await this.panel.host.open_file(root, file.path, this.panel.settings); }
    catch (error) { if (epoch === this.load_epoch && root === this.panel.root) this.panel.report(error); }
  }
  async open_revision_file(file: graph_change, from: string, to: string): Promise<void> {
    const deleted = file.status.startsWith("D");
    await this.open_revision(deleted ? from : to, deleted ? file.old_path || file.path : file.path);
  }
  async open_revision(revision: string, file: string): Promise<void> {
    const epoch = ++this.load_epoch, root = this.panel.root, settings = {...this.panel.settings};
    try {
      const content = await this.panel.host.revision_text(root, revision, file, settings);
      if (this.panel.disposed || epoch !== this.load_epoch || root !== this.panel.root) return;
      this.panel.host.open_revision_document(root, revision, file, content, settings);
    } catch (error) { if (!this.panel.disposed && epoch === this.load_epoch && root === this.panel.root) this.panel.report(error); }
  }
  async open_file(file: graph_change, from: string, to: string, files: graph_change[] = [file]): Promise<void> {
    const epoch = ++this.load_epoch; const root = this.panel.root;
    this.panel.status.textContent = text("scm.opening_diff");
    try {
      if (file.status === "U") throw new Error(text("scm.unresolved_conflict"));
      const [left, right] = await Promise.all([
        file.status.startsWith("A") || file.status === "??" ? "" : this.panel.host.revision_text(root, from, file.old_path || file.path, this.panel.settings),
        file.status.startsWith("D") ? "" : this.panel.host.revision_text(root, to, file.path, this.panel.settings),
      ]);
      if (epoch !== this.load_epoch || root !== this.panel.root) return;
      this.panel.host.open_document({title: `${file.path.split("/").at(-1)!} (${short_revision(from)} ↔ ${short_revision(to)})`, file: file.path, left, right, left_label: text("scm.readonly_label", {file: file.old_path || file.path, revision: short_revision(from)}), right_label: text("scm.readonly_label", {file: file.path, revision: short_revision(to)})}, "active", {
        ...(from===INDEX&&to===WORKTREE&&file.status!=="??"&&!/^[ADRUT]/u.test(file.status)?{
          range_available:()=>this.repository_action_available(root)&&!this.panel.writing&&!this.panel.pending&&!this.panel.disposed,
          range_action:async(action,snapshot)=>{
            if(!this.repository_action_available(root))return;
            try{
              await this.panel.prepare_and_execute_action(async writer=>{
                const host=this.panel.host,target=host.file_path(root,file.path),stat=await host.fs.promises.lstat(target);
                if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw new Error(text("diff.range_file_unsupported"));
                const [real_root,real_target]=await Promise.all([host.fs.promises.realpath(root),host.fs.promises.realpath(target)]),relative=host.path_api.relative(real_root,real_target);
                if(host.path_api.isAbsolute(relative)||relative===".."||relative.startsWith(".."+host.path_api.sep))throw new Error(text("host.outside_repository"));
                const bytes=await host.fs.promises.readFile(target);
                return plan_git_diff_ranges(writer.run,{action,root,file:file.path,original_revision:from,modified_revision:to,...snapshot,worktree_bytes:new Uint8Array(bytes),encoding:"utf-8"});
              },this.panel.writer,action==="stage"?"stage":"discard_changes");
              if (this.repository_action_available(root)) await this.open_file(file,from,to,files);
            }catch(error){this.panel.report(error);throw error;}
          }
        }:{}),
        root, key: JSON.stringify([from, to, file.path]), menu: () => this.file_entries(file, from, to, files, root),
        refresh: () => { if (this.repository_action_available(root)) void this.open_file(file, from, to, files); },
        adjacent: direction => { if (!this.repository_action_available(root)) return; const index = files.findIndex(item => item.path === file.path); void this.open_default_file(files[(index + direction + files.length) % files.length], from, to, files); },
      });
      // 侧栏历史可独立选择版本，不能把同名文件误记到中央页正在进行的另一场评审。
      if (this.panel.from === from && this.panel.to === to) this.panel.mark_reviewed(file.path);
      this.panel.status.textContent = `${file.path} · ${short_revision(from)} ↔ ${short_revision(to)}`;
    } catch (error) { if (epoch === this.load_epoch) this.panel.report(error); }
  }
  async file_history(file: string): Promise<void> {
    const root = this.panel.root;
    const view = el("div", "git-file-timeline"); const title = el("div", "git-scm-title", text("scm.timeline", {file})); const list = el("div", "git-file-timeline-list"); view.append(title, list);
    this.panel.host.open_panel("◷ " + file.split("/").at(-1)!, "timeline:" + file, root, view);
    let count = this.panel.settings.initial_count;
    const load = async () => {
      list.textContent = text("scm.loading_file_history");
      try {
        const records = this.panel.state?.head ? await read_file_history(this.panel.runner.run, root, file, count) : [];
        if (root !== this.panel.root) return; list.replaceChildren();
        for (const record of records) {
          const row = button(record.commit.subject, () => void this.open_file(record.file, record.commit.parents[0] || EMPTY, record.commit.hash), "git-file-history-row");
          row.append(el("span", "", `${record.commit.author} · ${this.panel.date(record.commit)} · ${record.commit.hash.slice(0, 8)} · ${record.file.status} ${record.file.path}`));
          row.oncontextmenu = event => this.panel.configured_menu(event, "timeline", [
            {id: "open_diff", title: text("scm.open_changes"), action: () => row.click()},
            {id: "open_revision", title: text("scm.open_revision"), action: () => {if (this.repository_action_available(root)) void this.open_revision_file(record.file, record.commit.parents[0] || EMPTY, record.commit.hash);}},
            {id: "copy_hash", title: text("scm.copy_commit_hash"), action: () => void this.panel.host.copy(record.commit.hash)},
            {id: "commit_actions", title: text("scm.commit_actions"), action: () => this.panel.target_menu(event, "commit", record.commit.hash, record.commit.hash)},
          ]); list.append(row);
        }
        if (!records.length) list.textContent = text("scm.no_file_history");
        if (records.length >= count) list.append(button(text("scm.load_more_file_history"), () => { count += this.panel.settings.page_count; void load(); }));
      } catch (error) { list.textContent = String(error); }
    }; void load();
  }
  more_menu(event: MouseEvent): void {
    const panel = this.panel;
    const actions = (ids: string[]) => ids.map(id => ({id, title: graph_actions.find(action => action.id === id)!.title, action: () => ["stage_all", "unstage_all"].includes(id) ? void panel.quick_action(id) : id === "commit" ? this.commit() : panel.action_dialog(id, id.startsWith("stash") ? "changes" : "repository", "", panel.state?.head)}));
    const submenu = (title: string, entries: workspace_menu_entry[]): workspace_menu_entry => ({title, children: entries, disabled: !entries.length, action() {}});
    const target_actions = (kind: string, target: string, hash: string) => graph_actions.filter(action => action.targets.includes(kind)).map(action => ({id: action.id, title: action.title, disabled: !panel.target_action_enabled(action.id, kind, target), action: () => panel.action_dialog(action.id, kind, target, hash)}));
    const refs = panel.state?.refs || [];
    const branches = refs.filter(ref => ref.name.startsWith("refs/heads/")).map(ref => submenu(ref.name.slice(11), target_actions("branch", ref.name.slice(11), ref.hash)));
    const remotes = (panel.state?.remotes || []).map(remote => submenu(remote.name, [
      {title: text("scm.fetch_short"), action: () => panel.action_dialog("fetch", "repository", "", "", {remote: remote.name})},
      {title: text("scm.edit_remote_url"), action: () => panel.action_dialog("remote_edit", "repository", "", "", {remote: remote.name, url: remote.fetch})},
      {title: text("scm.remove_remote"), action: () => panel.action_dialog("remote_remove", "repository", "", "", {remote: remote.name})},
    ]));
    const stashes = (panel.state?.stashes || []).map(stash => submenu(stash.subject, target_actions("stash", stash.name, stash.hash)));
    const tags = refs.filter(ref => ref.name.startsWith("refs/tags/")).map(ref => submenu(ref.name.slice(10), target_actions("tag", ref.name.slice(10), ref.hash)));
    panel.configured_menu(event, "source_control", [
      {id: "view_list", title: text("scm.list_view"), checked: !this.tree, action: () => { this.tree = false; this.save_layout(); this.render_groups(); }},
      {id: "view_tree", title: text("scm.tree_view"), checked: this.tree, action: () => { this.tree = true; this.save_layout(); this.render_groups(); }},
      submenu(text("scm.view_and_sort"), [...[["name", "scm.sort_name"], ["path", "scm.sort_path"], ["status", "scm.sort_status"]].map(([value, title_key]) => ({id: "sort_" + value, title: text(title_key as git_graph_text_key), checked: this.sort_order === value, action: () => { this.sort_order = value; this.save_layout(); this.render_groups(); }})), {title: text("scm.expand_groups"), action: () => this.groups.querySelectorAll("details").forEach(item => { item.open = true; })}, {title: text("scm.collapse_groups"), action: () => this.groups.querySelectorAll("details").forEach(item => { item.open = false; })}]),
      ...["pull","push","fetch"].map(id=>({id,title:graph_actions.find(action=>action.id===id)!.title,disabled:!this.history.toolbar.enabled(id as "pull"|"push"|"fetch"),action:()=>this.history.network_action(id)})),...actions(["clone"]),
      {id: "checkout", title: text("scm.checkout"),children:checkout_entries(panel), action() {}},
      submenu(text("scm.commit_section"), [...actions(["commit"]), {title: text("scm.amend_staged"), action: () => panel.action_dialog("commit", "changes", "", panel.state?.head, {message: this.message.value, amend: true})}]),
      submenu(text("scm.changes_section"), actions(["stage_all", "unstage_all", "discard_changes", "stash_create", "clean"])),
      submenu(text("scm.pull_push_section"), actions(["sync", "fetch", "pull", "push"])),
      submenu(text("scm.branches_section"), [{id: "checkout", title: text("scm.checkout"),children:checkout_entries(panel), action() {}}, {id: "branch_create", title: text("scm.create_branch"), action: () => panel.action_dialog("branch_create", "commit", "", panel.state?.head)}, ...branches]),
      submenu(text("scm.remotes_section"), [{id: "remote_add", title: text("scm.add_remote"), action: () => panel.action_dialog("remote_add", "repository")}, ...remotes]),
      submenu(text("scm.stashes_section"), [...actions(["stash_create"]), ...stashes]),
      submenu(text("scm.tags_section"), [{id: "tag_add", title: text("scm.create_tag"), action: () => panel.action_dialog("tag_add", "commit", "", panel.state?.head)}, ...tags]),
      {id:"worktrees",...submenu(text("scm.worktrees"),[{id:"worktree_manage",title:text("scm.worktree_manage"),action:()=>show_worktrees(panel)},{id:"worktree_add",title:text("scm.worktree_add"),disabled:!panel.state?.head,action:()=>panel.action_dialog("worktree_add","repository","",panel.state?.head)}])},
      {id: "output", title: text("scm.show_output"), separator: true, action: () => panel.host.show_output(panel.root)},
      {id: "graph", title: text("scm.open_graph"), separator: true, action: () => panel.host.show_history(panel.root)},
      {id: "terminal", title: text("scm.open_terminal"), action: () => panel.host.terminal(panel.root, panel.settings.terminal_shell)},
      {id: "terminal_admin", title: text("scm.open_admin_terminal"), action: () => panel.host.terminal(panel.root, "", true)},
      {id: "settings", title: text("scm.settings"), action: () => panel.settings_dialog()},
    ]);
  }
  dispose(): void {this.update_actions();this.input_actions.clear();this.repositories.dispose(); this.interaction_style.remove();this.file_icon_style.remove(); this.load_epoch++; this.groups_epoch++; this.history.dispose(); this.message_resize.disconnect(); this.input_section.ontoggle = null; this.groups.onscroll = null; this.sidebar.remove(); this.sidebar.replaceChildren(); this.groups_state = []; }
}
