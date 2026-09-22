import {register_workspace_context_guard,workspace_context_switching} from "./workspace_context";
import {is_composing_key} from "./workspace_keyboard";
import {acquire_workspace_style} from "./workspace_styles";
import {bind_git_file_title_actions} from "./git_file_title_actions";
import { git_graph_tab_icon } from "./git_graph_tab_icon";
import { create_workspace_lifetime } from "./workspace_lifetime";
import { GIT_GRAPH_COMMAND, GIT_GRAPH_TYPE } from "./git_graph_data";
import { create_graph_host, type graph_core, type graph_leaf } from "./git_graph_host";
import { git_graph_panel } from "./git_graph_panel";
import { git_refresh_scheduler } from "./git_refresh_scheduler";
import { observe_workspace_file_saved } from "./workspace_file_events";
import { workspace_element, workspace_dialog } from "./workspace_widgets";
import { bind_git_status_bar } from "./git_status_bar";
import { GRAPH_SETTINGS_KEY, load_graph_settings, save_reviews } from "./git_graph_settings";
import graph_css from "./git_graph.css";
import { git_icon } from "./git_icons";
import { git_graph_text as text, type git_graph_text_key } from "./git_graph_i18n";

const graph_dialog = (title: string) => workspace_dialog(title, text("common.close"));

export function bind_git_graph() {
  if (document.documentElement.hasAttribute("data-linux-note-git-graph")) return;
  const core = (window as unknown as Record<symbol, graph_core>)[Symbol.for("typora-code:workspace")];
  if (!core?.app || !(window as unknown as { reqnode?: unknown }).reqnode) return;
  const lifetime=create_workspace_lifetime();
  try {
  const register_command=(command:Parameters<typeof core.app.commands.register>[0])=>lifetime.add(core.app.commands.register(command));
  const workspace_on=(event:string,callback:(context:any)=>void)=>lifetime.add(core.app.workspace.on(event,callback));
  const style = acquire_workspace_style("typora-code-style:git_graph_view", graph_css, {});
  const host = lifetime.own(create_graph_host(core)); const panels = new Map<graph_leaf, git_graph_panel>();
  const controllers = new Set<git_graph_panel>();
  const refresh_schedulers = new Map<git_graph_panel, git_refresh_scheduler>();
  const panel_subscriptions=new Map<git_graph_panel,()=>void>();
  lifetime.add(()=>{for(const stop of panel_subscriptions.values())stop();panel_subscriptions.clear();});
  lifetime.add(register_workspace_context_guard(()=>[...controllers].some(panel=>panel.writing)?"Git写操作正在执行，请完成后再切换工作区。":undefined));
  let sync_refresh_visibility = () => {};
  const track_panel = (panel: git_graph_panel) => {
    controllers.add(panel);
    const scheduler = new git_refresh_scheduler({refresh: () => panel.refresh(false), busy: () => panel.pending || panel.writing,
      allowed: () => !panel.disposed && document.visibilityState !== "hidden" && !document.querySelector(".git-graph-dialog-shade, .git-graph-menu, .git-scm-ref-picker"),
      last_refresh: () => panel.last_refreshed_at, last_started: () => panel.refresh_started_at});
    refresh_schedulers.set(panel, scheduler);
    panel_subscriptions.set(panel,panel.subscribe_state(() => { if (panel.disposed) scheduler.dispose(); else if (!panel.pending && panel.last_refreshed_at) scheduler.settled(); }));
    return panel;
  };
  lifetime.add(()=>{for(const panel of controllers)panel.dispose();for(const leaf of panels.keys()){leaf.parent.removeTab?.(leaf.state.path);leaf.view.containerEl.remove();}panels.clear();controllers.clear();style.remove();});
  const controller_for = (cwd: string): git_graph_panel => {
    for (const panel of controllers) {
      // 文件夹包含关系不等于仓库身份：子目录可能新建了独立仓库或 worktree。
      if (!panel.disposed && host.path_api.relative(panel.context_directory, cwd) === "") return panel;
    }
    const panel = track_panel(new git_graph_panel(host, cwd)); void panel.refresh(false); return panel;
  };
  lifetime.own(bind_git_file_title_actions(host,controller_for));
  const icon = workspace_element("span", "git-activity-icon"); icon.append(git_icon("source-control"));
  class source_control_sidebar extends core.SidebarPanel {
    containerEl = workspace_element("section", "linux-note-git-source-control"); panel?: git_graph_panel; visible = false;
    native_observer = new MutationObserver(() => this.clear_native_tabs());
    constructor() { super(); this.addRibbonButton({id: "linux_note:source_control", title: text("view.source_control"), icon, group: "top"}); }
    mount(panel: git_graph_panel) { this.panel = panel; if (this.containerEl.firstElementChild !== panel.workbench.sidebar) this.containerEl.replaceChildren(panel.workbench.sidebar); sync_refresh_visibility(); }
    clear_native_tabs() {
      const sidebar = document.querySelector("#typora-sidebar");
      const classes = ["active-tab-files", "active-tab-outline", "ty-show-search"];
      if (this.visible && sidebar && classes.some(name => sidebar.classList.contains(name))) sidebar.classList.remove(...classes);
    }
    onshow() {
      this.visible = true; this.clear_native_tabs();
      const native_sidebar = document.querySelector("#typora-sidebar");
      // showSidebar 与延迟大纲刷新会恢复原生标签 class；Git 面板显示期间由本面板持有显示状态。
      if (native_sidebar) this.native_observer.observe(native_sidebar, {attributes: true, attributeFilter: ["class"]});
      this.mount(controller_for(host.context_path()));
    }
    onhide() { this.visible = false; this.native_observer.disconnect(); sync_refresh_visibility(); }
  }
  const source_sidebar = new source_control_sidebar();lifetime.add(()=>{source_sidebar.onhide();source_sidebar.containerEl.remove();}); lifetime.add(core.app.workspace.sidebar.addPanel(source_sidebar));
  sync_refresh_visibility = () => {
    for (const [panel, scheduler] of refresh_schedulers) scheduler.set_visible(!lifetime.disposed && !panel.disposed && document.visibilityState !== "hidden" &&
      (panel.active || source_sidebar.visible && source_sidebar.panel === panel));
  };
  const show_source_control = (panel?: git_graph_panel, toggle = false) => {
    if(lifetime.disposed)return;
    if (!source_sidebar.visible) core.app.workspace.sidebar.switch(source_control_sidebar);
    else if (toggle) core.app.workspace.sidebar.toggle();
    else core.app.workspace.sidebar.show();
    source_sidebar.mount(panel || controller_for(host.context_path()));
  };
  const context_settings = () => {
    const active = core.app.workspace.activeLeaf; if (active && panels.has(active)) return panels.get(active)!.settings;
    const cwd = host.context_path(); let root = cwd;
    try {
      const repos = JSON.parse(localStorage.getItem(GRAPH_SETTINGS_KEY + "repositories") || "[]") as string[];
      for (const candidate of repos.sort((a, b) => b.length - a.length)) {
        const relative = host.path_api.relative(candidate, cwd);
        if (!host.path_api.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + host.path_api.sep)) { root = candidate; break; }
      }
    } catch { /* 损坏记录不影响打开图入口。 */ }
    return load_graph_settings(localStorage, root);
  };
  class git_graph_view extends core.WorkspaceView {
    declare containerEl: HTMLElement; icon = "fa-code-fork"; panel: git_graph_panel;
    constructor(leaf: graph_leaf) {
      super(leaf); let cwd = leaf.state.git_cwd || "";
      if (!cwd) for (const [existing, panel] of panels) if (existing.state.path === leaf.state.path) { cwd = panel.root; break; }
      if (!cwd) try { cwd = decodeURIComponent(leaf.state.path.split("/")[3] || ""); } catch { /* 显示仓库选择入口。 */ }
      const available = [...controllers].find(panel => panel.root === cwd && ![...panels.values()].includes(panel));
      this.panel = available || track_panel(new git_graph_panel(host, cwd || host.context_path()));
      this.containerEl = this.panel.container; panels.set(leaf, this.panel);
    }
    onOpen() {
      // 标签保留核心容器，用标准 SVG 替换默认字体图标。
      for (const tab of document.querySelectorAll<HTMLElement>(".typ-tab[data-id]")) if (tab.getAttribute("data-id") === this.leaf.state.path) {
        const icon = tab.querySelector(".typ-file-icon"); if (icon) { icon.className = "typ-file-icon git-tab-icon"; icon.replaceChildren(git_graph_tab_icon(this.panel.settings.tab_icon_theme)); }
        const label = tab.querySelector(".typ-file-basename"); if (label) label.textContent = "Git Graph";
        tab.querySelector(".typ-file-ext")?.remove(); tab.title = "Git Graph · " + this.panel.root;
      }
      this.panel.open(); sync_refresh_visibility();
    }
    onClose() {
      this.panel.close(); sync_refresh_visibility();
      setTimeout(() => { let exists = false; core.app.workspace.eachLeaves(leaf => { if (leaf === this.leaf) exists = true; }); if (!exists) { panels.delete(this.leaf); } }, 0);
    }
  }
  lifetime.add(core.app.viewManager.registerView(GIT_GRAPH_TYPE, leaf => new git_graph_view(leaf)));
  const open_graph = (cwd?: string): git_graph_panel | undefined => {
    if(lifetime.disposed)return;
    const active = core.app.workspace.activeLeaf;
    if (!cwd && active && panels.has(active)) return panels.get(active);
    const settings = context_settings();
    cwd ||= host.context_path(settings.open_active_repo);
    const uri = `typ://${GIT_GRAPH_TYPE}/${encodeURIComponent(cwd)}/Git Graph`; let existing: graph_leaf | undefined;
    core.app.workspace.eachLeaves(leaf => { if (leaf.state.path === uri || panels.get(leaf)?.root === cwd) existing = leaf; });
    if (existing) { core.app.workspace.activeLeaf = existing.parent.toggleTab(existing.state.path); return panels.get(existing); }
    const parent = active?.parent; if (!parent) return;
    const leaf = core.app.workspace.createLeaf({ type: GIT_GRAPH_TYPE, state: { path: uri, git_cwd: cwd } }); parent.appendChild(leaf); core.app.workspace.activeLeaf = leaf; return panels.get(leaf);
  };
  host.show_history = cwd => { const panel = open_graph(cwd); if (panel) show_source_control(panel); };
  lifetime.listen(window, "linux-note-open-git", ((event:CustomEvent<{path:string}>)=>{const path=event.detail.path;try{host.show_history(host.fs.statSync(path).isDirectory()?path:host.path_api.dirname(path));}catch(error){console.error(error);}}) as EventListener);
  const launch = (callback?: (panel: git_graph_panel) => void) => { const panel = open_graph(); if (panel) { show_source_control(panel); callback?.(panel); } };
  const commands: [string, git_graph_text_key, (panel: git_graph_panel) => void][] = [
    ["view", "view.command.view", () => {}], ["add_repository", "view.command.add_repository", panel => panel.manage_repositories()],
    ["remove_repository", "view.command.remove_repository", panel => panel.manage_repositories()],
    ["fetch", "view.command.fetch", panel => void (async () => { const repository_epoch=panel.repository_epoch; const available=()=>!lifetime.disposed&&!panel.disposed&&panel.repository_epoch===repository_epoch; await panel.when_refreshed(); if(!available())return; void panel.network_action("fetch"); })()],
    ["reviews", "view.command.reviews", panel => panel.reviews_dialog()], ["clear_avatars", "view.command.clear_avatars", () => host.clear_avatars()],
    ["end_all_reviews", "view.command.end_all_reviews", panel => { save_reviews(localStorage, []); if (panel.to) void panel.show_comparison(panel.from, panel.to); }],
    ["end_review", "view.command.end_review", panel => panel.reviews_dialog()], ["resume_review", "view.command.resume_review", panel => panel.reviews_dialog()],
    ["version", "view.command.version", panel => { const dialog = graph_dialog(text("view.diagnostics_title")); dialog.content.textContent = text("view.diagnostics_text", {root: panel.root}); void panel.runner.run(panel.root, ["--version"]).then(version => { dialog.content.textContent += "\n" + version; }).catch(error => { dialog.content.textContent += "\n" + String(error); }); }],
  ];
  register_command({ id: GIT_GRAPH_COMMAND, title: text(commands[0][1]), scope: "global", callback: () => launch() });
  for (const [id, title_key, callback] of commands.slice(1)) register_command({ id: "linux_note:git_graph_" + id, title: text(title_key), scope: "global", callback: () => launch(callback) });
  const settings = context_settings(); if (settings.icon_color !== "auto") icon.style.color = settings.icon_color;
  const status_bar = lifetime.own(bind_git_status_bar(core, host, () => panels.get(core.app.workspace.activeLeaf!) || controller_for(host.context_path()), () => launch()));
  status_bar.set_graph_visible(settings.show_status_button);
  lifetime.listen(window, "linux-note-git-settings", ((event: CustomEvent) => { status_bar.set_graph_visible(event.detail.show_status_button); status_bar.refresh(); for(const [leaf,panel]of panels)for(const tab of document.querySelectorAll<HTMLElement>(".typ-tab[data-id]"))if(tab.dataset.id===leaf.state.path)tab.querySelector(".typ-file-icon")?.replaceChildren(git_graph_tab_icon(panel.settings.tab_icon_theme)); icon.style.color = event.detail.icon_color === "auto" ? "" : event.detail.icon_color; }) as EventListener);
  workspace_on("file-menu", ({ menu, path }) => {
    menu.containerEl.querySelectorAll("[data-git-graph-launch]").forEach((item: Element) => item.remove());
    if (!context_settings().file_menu_entry) return;
    let directory = false; try { directory = host.fs.statSync(path).isDirectory(); } catch { return; }
    for (const [id, title_key] of [["graph", "view.file_menu_graph"], ...(!directory ? [["history", "view.file_menu_history"], ["changes", "view.file_menu_changes"]] : [])] as [string, git_graph_text_key][]) {
      const item = workspace_element("li"); item.setAttribute("data-git-graph-launch", id); item.append(workspace_element("a", "", text(title_key)));
      for (const name of ["pointerdown", "mousedown", "mouseup"]) item.addEventListener(name, event => { event.preventDefault(); event.stopImmediatePropagation(); });
      item.onclick = event => { event.preventDefault(); event.stopImmediatePropagation(); menu.containerEl.style.display = "none";
        const cwd = directory ? path : host.path_api.dirname(path);
        if (id === "graph") { host.show_history(cwd); return; }
        const panel = controller_for(cwd); show_source_control(panel);
        void (async () => {
          const epoch=panel.repository_epoch;
          await panel.when_refreshed(); if(lifetime.disposed||panel.disposed||epoch!==panel.repository_epoch)return;
          const file = host.path_api.relative(panel.root, path).replace(/\\/gu, "/");
          if (id === "history") await panel.workbench.file_history(file);
          else { const change = panel.state?.changes.find(item => item.path === file); await panel.workbench.open_file(change || {path: file, status: "M"}, panel.state?.head || "EMPTY", "WORKTREE"); }
        })().catch(error => panel.report(error));
      }; menu.containerEl.append(item);
    }
  });
  register_command({id: "linux_note:source_control", title: text("view.source_control_command"), scope: "global", callback: () => show_source_control()});
  workspace_on("active-leaf:change", leaf => {
    if(workspace_context_switching())return;
    if (source_sidebar.visible) source_sidebar.mount(panels.get(leaf) || controller_for(host.context_path()));
    status_bar.refresh();
  });
  lifetime.listen(window,"linux-note-workspace-context-changed",()=>{
    for(const leaf of [...panels.keys()])leaf.parent.removeTab?.(leaf.state.path);
    for(const stop of panel_subscriptions.values())stop();panel_subscriptions.clear();
    for(const scheduler of refresh_schedulers.values())scheduler.dispose();refresh_schedulers.clear();
    for(const panel of controllers)panel.dispose();controllers.clear();panels.clear();
    source_sidebar.panel=undefined;source_sidebar.containerEl.replaceChildren();
    if(source_sidebar.visible)source_sidebar.mount(controller_for(host.context_path()));
    status_bar.refresh();
  });
  lifetime.listen(window,"linux-note-workspace-context-refreshed",()=>{for(const scheduler of refresh_schedulers.values())scheduler.invalidate();status_bar.refresh();});
  lifetime.add(observe_workspace_file_saved(({file_path: path}) => {
    for (const [panel, scheduler] of refresh_schedulers) {
      const relative = typeof path === "string" ? host.path_api.relative(panel.root, path) : "";
      if (!host.path_api.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + host.path_api.sep)) scheduler.invalidate();
    }
  }));
  lifetime.listen(window, "focus", () => { for (const scheduler of refresh_schedulers.values()) scheduler.resume(); });
  lifetime.listen(document, "visibilitychange", () => sync_refresh_visibility());
  lifetime.listen(window, "keydown", event => {
    if (is_composing_key(event) || document.querySelector(".git-graph-dialog-shade, .git-graph-menu, .git-scm-ref-picker")) return;
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "g") { event.preventDefault(); event.stopImmediatePropagation(); show_source_control(); source_sidebar.panel?.workbench.message.focus(); }
    else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "b" && (source_sidebar.containerEl.contains(event.target as Node) || (event.target as Element)?.closest?.(".git-graph-document"))) { event.preventDefault(); event.stopImmediatePropagation(); core.app.workspace.sidebar.toggle(); }
  }, true);
  document.documentElement.setAttribute("data-linux-note-source-control", "ready");
  document.documentElement.setAttribute("data-linux-note-monaco-diff", "ready");
  document.documentElement.setAttribute("data-linux-note-git-graph", "ready");
  document.documentElement.setAttribute("data-linux-note-git-graph-actions", "ready");
  const assert_can_dispose=()=>{if([...controllers].some(panel=>panel.writing))throw new Error("Git 操作正在执行，请完成后再停用 Typora Code。");};
  return {assert_can_dispose, dispose(){
    assert_can_dispose();if(lifetime.disposed)return;
    status_bar.dispose();source_sidebar.onhide();
    if(core.app.workspace.sidebar.activePanel===source_sidebar){core.app.workspace.sidebar.hide();core.app.workspace.sidebar.activePanel=undefined;}
    for(const panel of controllers)panel.dispose();
    for(const leaf of panels.keys()){leaf.parent.removeTab?.(leaf.state.path);leaf.view.containerEl.remove();}
    lifetime.dispose();host.dispose();source_sidebar.containerEl.remove();style.remove();panels.clear();controllers.clear();refresh_schedulers.clear();
    document.querySelectorAll('[data-git-graph-launch]').forEach(item=>item.remove());
    for(const attribute of ["source-control","monaco-diff","git-graph","git-graph-actions"])document.documentElement.removeAttribute("data-linux-note-"+attribute);
  }};
  } catch(error) {lifetime.dispose();throw error;}
}
