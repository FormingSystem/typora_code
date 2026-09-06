import { GIT_GRAPH_COMMAND, GIT_GRAPH_TYPE } from "./git_graph_data";
import { create_graph_host, type graph_core, type graph_leaf } from "./git_graph_host";
import { git_graph_panel } from "./git_graph_panel";
import { graph_element, graph_button, graph_dialog } from "./git_graph_widgets";
import { GRAPH_SETTINGS_KEY, load_graph_settings, save_reviews } from "./git_graph_settings";
import graph_css from "./git_graph.css";

export function bind_git_graph(): void {
  if (document.documentElement.hasAttribute("data-linux-note-git-graph")) return;
  const core = (window as unknown as Record<symbol, graph_core>)[Symbol.for("typora-plugin-core@v2")];
  if (!core?.app || !(window as unknown as { reqnode?: unknown }).reqnode) return;
  const style = graph_element("style"); style.textContent = graph_css; document.head.append(style);
  const host = create_graph_host(core); const panels = new Map<graph_leaf, git_graph_panel>();
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
      this.panel = new git_graph_panel(host, cwd || host.context_path()); this.containerEl = this.panel.container; panels.set(leaf, this.panel);
    }
    onOpen() { this.panel.open(); }
    onClose() {
      this.panel.close();
      setTimeout(() => { let exists = false; core.app.workspace.eachLeaves(leaf => { if (leaf === this.leaf) exists = true; }); if (!exists) panels.delete(this.leaf); }, 0);
    }
  }
  core.app.viewManager.registerView(GIT_GRAPH_TYPE, leaf => new git_graph_view(leaf));
  const open_graph = (cwd?: string): git_graph_panel | undefined => {
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
  const launch = (callback?: (panel: git_graph_panel) => void) => { const panel = open_graph(); if (panel) callback?.(panel); };
  const commands: [string, string, (panel: git_graph_panel) => void][] = [
    ["view", "Git Graph：查看提交关系图", () => {}], ["add_repository", "Git Graph：添加 Git 仓库", panel => panel.manage_repositories()],
    ["remove_repository", "Git Graph：移除仓库记录", panel => panel.manage_repositories()],
    ["fetch", "Git Graph：Fetch 远端", panel => void (async () => { while (panel.pending) await new Promise(resolve => setTimeout(resolve, 50)); panel.action_dialog("fetch", "repository"); })()],
    ["reviews", "Git Graph：继续或结束评审", panel => panel.reviews_dialog()], ["clear_avatars", "Git Graph：清空头像缓存", () => host.clear_avatars()],
    ["end_all_reviews", "Git Graph：结束全部评审", panel => { save_reviews(localStorage, []); if (panel.to) void panel.show_comparison(panel.from, panel.to); }],
    ["end_review", "Git Graph：结束指定评审", panel => panel.reviews_dialog()], ["resume_review", "Git Graph：恢复指定评审", panel => panel.reviews_dialog()],
    ["version", "Git Graph：版本与诊断", panel => { const dialog = graph_dialog("Git Graph 诊断"); dialog.content.textContent = "Typora Git Graph · 2\n功能对照：VS Code Git Graph 1.30.0\n" + panel.root; void panel.runner.run(panel.root, ["--version"]).then(version => { dialog.content.textContent += "\n" + version; }).catch(error => { dialog.content.textContent += String(error); }); }],
  ];
  core.app.commands.register({ id: GIT_GRAPH_COMMAND, title: commands[0][1], scope: "global", callback: () => launch() });
  for (const [id, title, callback] of commands.slice(1)) core.app.commands.register({ id: "linux_note:git_graph_" + id, title, scope: "global", callback: () => launch(callback) });
  const icon = graph_element("i", "fa fa-code-fork");
  core.app.workspace.ribbon.addButton({ id: GIT_GRAPH_COMMAND, title: "Git Graph：查看提交关系图", group: "bottom", icon, onclick: () => launch() });
  const settings = context_settings(); if (settings.icon_color !== "auto") icon.style.color = settings.icon_color;
  const status_button = graph_button("Git Graph", () => launch(), "git-graph-status-launch"); status_button.hidden = !settings.show_status_button; document.body.append(status_button);
  window.addEventListener("linux-note-git-settings", ((event: CustomEvent) => { status_button.hidden = !event.detail.show_status_button; icon.style.color = event.detail.icon_color === "auto" ? "" : event.detail.icon_color; }) as EventListener);
  core.app.workspace.on("file-menu", ({ menu, path }) => {
    menu.containerEl.querySelector("[data-git-graph-launch]")?.remove();
    if (!context_settings().file_menu_entry) return;
    const item = graph_element("li"); item.setAttribute("data-git-graph-launch", "true"); const link = graph_element("a", "", "Git Graph：查看所属仓库"); item.append(link);
    for (const name of ["pointerdown", "mousedown", "mouseup"]) item.addEventListener(name, event => { event.preventDefault(); event.stopImmediatePropagation(); });
    item.onclick = event => { event.preventDefault(); event.stopImmediatePropagation(); menu.containerEl.style.display = "none";
      try { const cwd = host.fs.statSync(path).isDirectory() ? path : host.path_api.dirname(path); open_graph(cwd); } catch (error) { const dialog = graph_dialog("仓库打开失败"); dialog.content.textContent = String(error); }
    }; menu.containerEl.append(item);
  });
  document.documentElement.setAttribute("data-linux-note-git-graph", "ready");
  document.documentElement.setAttribute("data-linux-note-git-graph-actions", "ready");
}
