import {acquire_workspace_footer_layout} from "./workspace_footer_layout";
import {acquire_workspace_style} from "./workspace_styles";
import { workspace_element as el, workspace_button as button, workspace_menu, type workspace_menu_entry } from "./workspace_widgets";
import type { graph_core, graph_host } from "./git_graph_host";
import type { git_graph_panel } from "./git_graph_panel";
import status_css from "./git_status_bar.css";
import { git_icon } from "./git_icons";
import { git_graph_text as text } from "./git_graph_i18n";

import {parse_branch_status} from "./git_scm_data";
/** 使用窗口唯一状态栏；刷新只读取本地 Git，网络快捷操作复用控制器的自动目标与一次执行。 */
export function bind_git_status_bar(core: graph_core, host: graph_host, current_panel: () => git_graph_panel, launch_graph: () => void): {refresh(): void; set_graph_visible(visible: boolean): void; dispose():void} {
  const footer = document.querySelector<HTMLElement>("footer.ty-footer,footer");
  if (!footer) throw new Error("Typora Code status bar is unavailable.");
  const layout=acquire_workspace_footer_layout();
  const item = el("span", "linux-note-git-status workspace-footer-group");
  item.title = text("status.repository_status");
  item.setAttribute("data-linux-note-git-status", "ready");
  footer.prepend(item);
  const style = acquire_workspace_style("typora-code-style:git_status_bar", status_css, {});
  const branch = button("", () => {}, "git-status-branch workspace-footer-control"); branch.dataset.gitStatus = "branch";
  const branch_icon = git_icon("git-branch");
  const label = el("span", "git-status-branch-label", text("status.checking")); branch.append(branch_icon, label);
  const sync = button("", () => {}, "git-status-sync workspace-footer-control"); sync.dataset.gitStatus = "sync";
  const sync_icon = git_icon("sync");
  const counts = el("span", "git-status-sync-counts"); sync.append(sync_icon, counts);
  const graph = button("", launch_graph, "git-status-graph workspace-footer-control"); graph.dataset.gitStatus = "graph";
  const graph_icon = git_icon("git-branch"); graph.append(graph_icon, document.createTextNode("Git Graph"));
  graph.title = text("status.open_graph"); graph.setAttribute("aria-label", graph.title);
  item.append(branch, sync, graph);
  let panel: git_graph_panel | undefined; let snapshot: branch_status | undefined; let snapshot_root = ""; let epoch = 0; let disposed = false;
  let reader: ReturnType<graph_host["runner"]> | undefined;
  let stop_progress:(()=>void)|undefined,normal_sync_title="",normal_sync_disabled=true;
  const render_progress=()=>{
    const state=panel?.progress.state,busy=state?.busy===true,spinning=state?.running===true&&["fetch","pull","push","sync"].includes(state.kind);
    branch.disabled=busy;sync.disabled=busy||normal_sync_disabled;
    const icon=spinning?"sync":snapshot?.upstream?"sync":"cloud-upload";
    if(sync.firstElementChild?.getAttribute("data-git-icon")!==icon)sync.firstElementChild?.replaceWith(git_icon(icon));
    sync.classList.toggle("git-operation-spinning",spinning);sync.title=busy?state!.label:normal_sync_title;sync.setAttribute("aria-label",sync.title);
    item.dataset.gitOperation=busy?state!.kind:"idle";item.setAttribute("aria-busy",String(busy));item.title=busy?state!.label:text("status.repository_status");
  };
  const observer = new MutationObserver(() => { if (panel && !panel.pending) void refresh(); else window.setTimeout(() => void refresh(), 0); });
  const unavailable = (message: string) => {
    snapshot = undefined; snapshot_root = ""; label.textContent = text("status.no_repository"); branch.title = text("status.select_repository_hint", {message});
    branch.setAttribute("aria-label", branch.title); sync.disabled = true; sync.title = message; counts.textContent = ""; item.dataset.repository = "none";
    normal_sync_title=message;normal_sync_disabled=true;render_progress();
  };
  const refresh = async () => {
    if (disposed) return;
    const current = current_panel();
    if (current !== panel) { stop_progress?.();panel = current;stop_progress=panel.progress.subscribe(render_progress); observer.disconnect(); observer.observe(panel.container, {attributes: true, attributeFilter: ["data-state"]}); }
    if (snapshot_root !== current.root) { snapshot = undefined; label.textContent = text("status.checking"); counts.textContent = ""; sync.disabled = true; item.dataset.repository = "loading"; }
    const token = ++epoch; reader?.cancel(); reader = host.runner(current.settings);
    const root = current.root;
    if (!root) { unavailable(text("status.open_repository_first")); return; }
    try {
      const status = parse_branch_status(await reader.run(root, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"]));
      if (disposed || token !== epoch || current !== panel || root !== current.root) return;
      snapshot = status; snapshot_root = current.root; const detached = status.branch === "(detached)";
      const name = detached ? text("status.detached_name", {hash: status.head.slice(0, 8)}) : status.branch || "Git";
      label.textContent = name + (status.dirty ? "*" : "");
      branch.title = text("status.branch_tooltip", {root: current.root, branch: detached ? text("status.detached_head") : text("status.current_branch", {branch: name}), initial: status.head === "(initial)" ? text("status.initial_suffix") : "", worktree: status.dirty ? text("status.dirty") : text("status.clean")});
      branch.setAttribute("aria-label", branch.title); item.dataset.repository = "ready";
      counts.textContent = status.upstream && (status.behind || status.ahead) ? `↓${status.behind} ↑${status.ahead}` : "";
      sync.disabled = detached || status.head === "(initial)";
      sync.replaceChildren(git_icon(status.upstream ? "sync" : "cloud-upload"), counts);
      sync.title = sync.disabled ? text("status.create_commit_first") : status.upstream ? text("status.sync_tooltip", {upstream: status.upstream, behind: status.behind, ahead: status.ahead}) : text("status.publish_tooltip");
      sync.setAttribute("aria-label", sync.title);
      normal_sync_title=sync.title;normal_sync_disabled=sync.disabled;render_progress();
    } catch (error) { if (!disposed && token === epoch) unavailable(text("status.read_failed", {error: String(error instanceof Error ? error.message : error)})); }
  };
  const ready = (event: MouseEvent, show: (panel: git_graph_panel, available: () => boolean) => void | Promise<void>) => {
    event.preventDefault(); event.stopPropagation();
    const current = current_panel(), repository_epoch = current.repository_epoch;
    const available = () => !disposed && !current.disposed && current === current_panel() && current.repository_epoch === repository_epoch;
    void (async () => {
      if (!current.pending && !current.writing) await current.refresh(false);
      while (current.pending && available()) await new Promise(resolve => setTimeout(resolve, 50));
      if (!available()) return;
      if (!current.state || current.container.dataset.state === "error") {
        workspace_menu(event, [{id: "select_repository", title: text("status.select_repository"), action: () => current.manage_repositories()}, {id: "refresh_status", title: text("status.recheck_repository"), action: () => void current.refresh(false)}]); return;
      }
      await show(current, available);
    })().catch(error => current.report(error));
  };
  branch.onclick = event => ready(event, current => {
    const state = current.state!;
    const entries: workspace_menu_entry[] = state.refs.filter(ref => ref.name.startsWith("refs/heads/")).map(ref => ({
      id: "checkout:" + ref.name, title: ref.name.slice(11), checked: ref.name.slice(11) === state.branch,
      action: () => current.action_dialog("branch_checkout", "branch", ref.name.slice(11), ref.hash),
    }));
    entries.push(...state.refs.filter(ref => ref.name.startsWith("refs/remotes/") && !ref.name.endsWith("/HEAD")).map(ref => ({
      id: "checkout:" + ref.name, title: text("status.checkout_remote", {branch: ref.name.slice(13)}), action: () => current.action_dialog("remote_checkout", "remote", ref.name.slice(13), ref.hash),
    })));
    entries.push({id: "branch_create", title: text("status.create_branch"), separator: true, disabled: !state.head, action: () => current.action_dialog("branch_create", "commit", state.head, state.head)},
      {id: "select_repository", title: text("status.select_repository"), action: () => current.manage_repositories()});
    current.configured_menu(event, "status_checkout", entries);
  });
  branch.oncontextmenu = event => ready(event, current => {
    const state = current.state!;
    if (state.head) current.target_menu(event, state.branch ? "branch" : "commit", state.branch || state.head, state.head);
    else current.configured_menu(event, "status_unborn", [{id: "unborn", title: text("status.branch_has_no_commits", {branch: state.branch}), disabled: true, action: () => {}}, {id: "select_repository", title: text("status.select_repository"), action: () => current.manage_repositories()}]);
  });
  const sync_menu = (event: MouseEvent) => ready(event, current => {
    const state = current.state!; const upstream = snapshot_root === current.root && snapshot?.branch === state.branch ? snapshot.upstream : "";
    current.configured_menu(event, "status_sync", [
      {id: "sync", title: text("status.sync_changes"), disabled: !upstream || !state.head || !state.branch, action: () => void current.network_action("sync")},
      {id: "fetch", title: text("status.fetch"), action: () => void current.network_action("fetch")},
      {id: "pull", title: text("status.pull"), disabled: !state.head || !state.branch, action: () => void current.network_action("pull")},
      {id: "push", title: text("status.push"), disabled: !state.head || !state.branch, action: () => void current.network_action("push")},
      {id: "set_upstream", title: text("status.set_upstream"), separator: true, disabled: !state.head || !state.branch, action: () => void current.network_action("push", {publish: true})},
      {id: "remotes", title: text("status.configure_remotes"), action: () => current.remotes_dialog()},
      {id: "refresh_status", title: text("status.refresh"), separator: true, action: () => void current.refresh(false)},
    ]);
  });
  sync.onclick = event => ready(event, async (current, available) => {
    await refresh();
    if (!available() || snapshot_root !== current.root || !snapshot || sync.disabled) return;
    await current.network_action("sync");
  });
  sync.oncontextmenu = sync_menu;
  graph.oncontextmenu = event => ready(event, current => current.background_menu(event));
  const timer = window.setInterval(() => { if (document.visibilityState !== "hidden" && !panel?.writing) void refresh(); }, 8000);
  const on_focus = () => void refresh(); window.addEventListener("focus", on_focus);
  const dispose = () => { if(disposed)return; disposed = true; epoch++;stop_progress?.(); reader?.cancel(); clearInterval(timer); observer.disconnect(); window.removeEventListener("focus", on_focus); item.remove(); layout.remove();style.remove(); window.removeEventListener("pagehide",dispose); };
  window.addEventListener("pagehide", dispose, {once:true});
  void refresh();
  return {dispose, refresh: () => void refresh(), set_graph_visible: visible => { graph.hidden = !visible; }};
}
