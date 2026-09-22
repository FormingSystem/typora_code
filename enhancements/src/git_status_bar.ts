import {acquire_workspace_footer_layout} from "./workspace_footer_layout";
import {acquire_workspace_style} from "./workspace_styles";
import { workspace_element as el, workspace_button as button, workspace_menu } from "./workspace_widgets";
import type { graph_core, graph_host } from "./git_graph_host";
import type { git_graph_panel } from "./git_graph_panel";
import status_css from "./git_status_bar.css";
import { git_icon } from "./git_icons";
import { git_graph_text as text } from "./git_graph_i18n";

import type {branch_status} from "./git_scm_data";
import {repository_branch_status,repository_head_label} from "./git_graph_repository";
/** 使用控制器发布的同一仓库快照；底栏不另行轮询或因面板状态变化重复读取 Git。 */
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
  let panel: git_graph_panel | undefined; let snapshot: branch_status | undefined; let snapshot_root = ""; let disposed = false;
  let stop_progress:(()=>void)|undefined,stop_state:(()=>void)|undefined,normal_sync_title="",normal_sync_disabled=true;
  const render_progress=()=>{
    const state=panel?.progress.state,busy=state?.busy===true,spinning=state?.running===true&&["fetch","pull","push","sync"].includes(state.kind);
    branch.disabled=busy;sync.disabled=busy||normal_sync_disabled;
    const icon=spinning?"sync":snapshot?.upstream?"sync":"cloud-upload";
    if(sync.firstElementChild?.getAttribute("data-git-icon")!==icon)sync.firstElementChild?.replaceWith(git_icon(icon));
    sync.classList.toggle("git-operation-spinning",spinning);sync.title=busy?state!.label:normal_sync_title;sync.setAttribute("aria-label",sync.title);
    item.dataset.gitOperation=busy?state!.kind:"idle";item.setAttribute("aria-busy",String(busy));item.title=busy?state!.label:text("status.repository_status");
  };
  const unavailable = (message: string) => {
    snapshot = undefined; snapshot_root = ""; label.textContent = text("status.no_repository"); branch.title = text("status.select_repository_hint", {message});
    branch.setAttribute("aria-label", branch.title); sync.disabled = true; sync.title = message; counts.textContent = ""; item.dataset.repository = "none";
    normal_sync_title=message;normal_sync_disabled=true;render_progress();
  };
  const paint = (current: git_graph_panel) => {
    if (disposed || current !== panel) return;
    if (current.disposed || !current.root) { unavailable(text("status.open_repository_first")); return; }
    if (!current.pending && current.container.dataset.state === "error") { unavailable(text("status.read_failed", {error: current.status.textContent || "Git"})); return; }
    if (snapshot_root !== current.root) {
      snapshot = undefined; snapshot_root = ""; label.textContent = text("status.checking"); counts.textContent = "";
      normal_sync_disabled = true; normal_sync_title = text("status.checking"); item.dataset.repository = "loading";
    }
    if (!current.state || current.state.root !== current.root) { render_progress(); return; }
    const status = repository_branch_status(current.state);
    snapshot = status; snapshot_root = current.root; const detached = status.branch === "(detached)";
    const name = detached ? text("status.detached_name", {hash: status.head.slice(0, 8)}) : status.branch || "Git";
    const branch_label = repository_head_label(current.state); if (label.textContent !== branch_label) label.textContent = branch_label;
    const branch_symbol=detached?"git-commit":"git-branch";
    if(branch.firstElementChild?.getAttribute("data-git-icon")!==branch_symbol)branch.firstElementChild?.replaceWith(git_icon(branch_symbol));
    branch.title = text("status.branch_tooltip", {root: current.root, branch: detached ? text("status.detached_head") : text("status.current_branch", {branch: name}), initial: status.head === "(initial)" ? text("status.initial_suffix") : "", worktree: status.dirty ? text("status.dirty") : text("status.clean")});
    branch.setAttribute("aria-label", branch.title); item.dataset.repository = "ready";
    const count_label = status.upstream && (status.behind || status.ahead) ? `${status.behind}↓ ${status.ahead}↑` : ""; if (counts.textContent !== count_label) counts.textContent = count_label;
    sync.disabled = detached || status.head === "(initial)";
    sync.title = sync.disabled ? text("status.create_commit_first") : status.upstream ? text("status.sync_tooltip", {upstream: status.upstream, behind: status.behind, ahead: status.ahead}) : text("status.publish_tooltip");
    sync.setAttribute("aria-label", sync.title);
    normal_sync_title=sync.title;normal_sync_disabled=sync.disabled;render_progress();
  };
  const refresh = () => {
    if (disposed) return;
    const current = current_panel();
    if (current !== panel) {
      stop_progress?.(); stop_state?.(); panel = current;
      stop_progress = current.progress.subscribe(render_progress);
      stop_state = current.subscribe_state(() => paint(current));
    } else paint(current);
  };
  const ready = (event: MouseEvent, show: (panel: git_graph_panel, available: () => boolean) => void | Promise<void>) => {
    event.preventDefault(); event.stopPropagation();
    const current = current_panel(), repository_epoch = current.repository_epoch;
    const available = () => !disposed && !current.disposed && current === current_panel() && current.repository_epoch === repository_epoch;
    void (async () => {
      if (!current.state && !current.pending && !current.writing) await current.refresh(false);
      await current.when_refreshed();
      if (!available()) return;
      if (!current.state || current.container.dataset.state === "error") {
        workspace_menu(event, [{id: "select_repository", title: text("status.select_repository"), action: () => current.manage_repositories()}, {id: "refresh_status", title: text("status.recheck_repository"), action: () => void current.refresh(false)}]); return;
      }
      await show(current, available);
    })().catch(error => current.report(error));
  };
  branch.onclick = event => ready(event, current => current.branch_picker.open());
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
    refresh();
    if (!available() || snapshot_root !== current.root || !snapshot || sync.disabled) return;
    await current.network_action("sync");
  });
  sync.oncontextmenu = sync_menu;
  graph.oncontextmenu = event => ready(event, current => current.background_menu(event));
  const dispose = () => { if(disposed)return; disposed = true;stop_progress?.();stop_state?.();item.remove();layout.remove();style.remove();window.removeEventListener("pagehide",dispose); };
  window.addEventListener("pagehide", dispose, {once:true});
  void refresh();
  return {dispose, refresh: () => void refresh(), set_graph_visible: visible => { graph.hidden = !visible; }};
}
