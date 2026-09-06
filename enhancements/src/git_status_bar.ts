import { graph_element as el, graph_button as button, graph_menu, type graph_menu_entry } from "./git_graph_widgets";
import type { graph_core, graph_host } from "./git_graph_host";
import type { git_graph_panel } from "./git_graph_panel";
import status_css from "./git_status_bar.css";

type status_plugin = {addStatusBarItem(options: {position: "left"; type: "item"; hint: string}): HTMLElement; unload(): void};
type status_core = graph_core & {Plugin: new (app: graph_core["app"], manifest: {id: string; name: string}) => status_plugin};
type branch_status = {branch: string; head: string; upstream: string; ahead: number; behind: number; dirty: boolean};

/** porcelain v2 的分支头与路径记录以 NUL 分隔；重命名的第二个路径不能当成另一条记录。 */
export function parse_branch_status(source: string): branch_status {
  const status: branch_status = {branch: "", head: "", upstream: "", ahead: 0, behind: 0, dirty: false};
  const records = source.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.startsWith("# branch.head ")) status.branch = record.slice(14);
    else if (record.startsWith("# branch.oid ")) status.head = record.slice(13);
    else if (record.startsWith("# branch.upstream ")) status.upstream = record.slice(18);
    else if (record.startsWith("# branch.ab ")) {
      const counts = /^# branch\.ab \+(\d+) -(\d+)$/u.exec(record);
      if (counts) { status.ahead = Number(counts[1]); status.behind = Number(counts[2]); }
    } else if (/^[12u?] /u.test(record)) { status.dirty = true; if (record.startsWith("2 ")) index += 1; }
  }
  return status;
}

/** 使用社区核心原有状态栏；刷新只读取本地 Git，远端写操作仍经过现有预览弹窗。 */
export function bind_git_status_bar(core: graph_core, host: graph_host, current_panel: () => git_graph_panel, launch_graph: () => void): {refresh(): void; set_graph_visible(visible: boolean): void} {
  const status_core = core as status_core;
  const plugin = new status_core.Plugin(core.app, {id: "linux_note.git_status", name: "Git 状态栏"});
  const item = plugin.addStatusBarItem({position: "left", type: "item", hint: "Git 仓库状态"});
  item.classList.add("linux-note-git-status"); item.setAttribute("data-linux-note-git-status", "ready");
  item.parentElement?.prepend(item);
  const style = el("style"); style.textContent = status_css; document.head.append(style);
  const branch = button("", () => {}, "git-status-branch"); branch.dataset.gitStatus = "branch";
  const branch_icon = el("i", "fa fa-code-fork"); branch_icon.setAttribute("aria-hidden", "true");
  const label = el("span", "git-status-branch-label", "正在检查 Git…"); branch.append(branch_icon, label);
  const sync = button("", () => {}, "git-status-sync"); sync.dataset.gitStatus = "sync";
  const sync_icon = el("i", "fa fa-refresh"); sync_icon.setAttribute("aria-hidden", "true");
  const counts = el("span", "git-status-sync-counts"); sync.append(sync_icon, counts);
  const graph = button("", launch_graph, "git-status-graph"); graph.dataset.gitStatus = "graph";
  const graph_icon = el("i", "fa fa-code-fork"); graph_icon.setAttribute("aria-hidden", "true"); graph.append(graph_icon, document.createTextNode("Git Graph"));
  graph.title = "打开或切换到当前仓库的 Git Graph 提交图"; graph.setAttribute("aria-label", graph.title);
  item.append(branch, sync, graph);
  let panel: git_graph_panel | undefined; let snapshot: branch_status | undefined; let snapshot_root = ""; let epoch = 0; let disposed = false;
  let reader: ReturnType<graph_host["runner"]> | undefined;
  const observer = new MutationObserver(() => { if (panel && !panel.pending) void refresh(); else window.setTimeout(() => void refresh(), 0); });
  const unavailable = (message: string) => {
    snapshot = undefined; snapshot_root = ""; label.textContent = "无 Git 仓库"; branch.title = message + "；点击选择仓库";
    branch.setAttribute("aria-label", branch.title); sync.disabled = true; sync.title = message; counts.textContent = ""; item.dataset.repository = "none";
  };
  const refresh = async () => {
    if (disposed) return;
    const current = current_panel();
    if (current !== panel) { panel = current; observer.disconnect(); observer.observe(panel.container, {attributes: true, attributeFilter: ["data-state"]}); }
    if (snapshot_root !== current.root) { snapshot = undefined; label.textContent = "正在检查 Git…"; counts.textContent = ""; sync.disabled = true; item.dataset.repository = "loading"; }
    const token = ++epoch; reader?.cancel(); reader = host.runner(current.settings);
    const root = current.root;
    if (!root) { unavailable("请先打开仓库中的文件或文件夹"); return; }
    try {
      const status = parse_branch_status(await reader.run(root, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"]));
      if (disposed || token !== epoch || current !== panel || root !== current.root) return;
      snapshot = status; snapshot_root = current.root; const detached = status.branch === "(detached)";
      const name = detached ? status.head.slice(0, 8) + "（游离）" : status.branch || "Git";
      label.textContent = name + (status.dirty ? "*" : "");
      branch.title = `${current.root}\n${detached ? "游离 HEAD" : "当前分支：" + name}${status.head === "(initial)" ? "（尚无提交）" : ""}${status.dirty ? "\n有未提交更改" : "\n工作区干净"}\n点击切换分支；右键管理当前分支`;
      branch.setAttribute("aria-label", branch.title); item.dataset.repository = "ready";
      counts.textContent = status.upstream && (status.behind || status.ahead) ? `↓${status.behind} ↑${status.ahead}` : "";
      sync.disabled = detached || status.head === "(initial)";
      sync_icon.className = status.upstream ? "fa fa-refresh" : "fa fa-cloud-upload";
      sync.title = sync.disabled ? "请先在分支上创建提交，再发布或同步更改" : status.upstream ? `上游：${status.upstream}\n待拉取 ${status.behind}，待推送 ${status.ahead}\n点击确认同步（先拉取、再推送）；右键选择其他操作` : "尚未配置上游；点击发布分支并设置上游；右键选择其他操作";
      sync.setAttribute("aria-label", sync.title);
    } catch (error) { if (!disposed && token === epoch) unavailable("无法读取 Git 仓库：" + String(error instanceof Error ? error.message : error)); }
  };
  const ready = (event: MouseEvent, show: (panel: git_graph_panel) => void | Promise<void>) => {
    event.preventDefault(); event.stopPropagation();
    const current = current_panel();
    void (async () => {
      if (!current.pending && !current.writing) await current.refresh(false);
      while (current.pending) await new Promise(resolve => setTimeout(resolve, 50));
      if (disposed || current !== current_panel()) return;
      if (!current.state || current.container.dataset.state === "error") {
        graph_menu(event, [{id: "select_repository", title: "选择 Git 仓库…", action: () => current.manage_repositories()}, {id: "refresh_status", title: "重新检查仓库", action: () => void refresh()}]); return;
      }
      await show(current);
    })().catch(error => current.report(error));
  };
  branch.onclick = event => ready(event, current => {
    const state = current.state!;
    const entries: graph_menu_entry[] = state.refs.filter(ref => ref.name.startsWith("refs/heads/")).map(ref => ({
      id: "checkout:" + ref.name, title: ref.name.slice(11), checked: ref.name.slice(11) === state.branch,
      action: () => current.action_dialog("branch_checkout", "branch", ref.name.slice(11), ref.hash),
    }));
    entries.push(...state.refs.filter(ref => ref.name.startsWith("refs/remotes/") && !ref.name.endsWith("/HEAD")).map(ref => ({
      id: "checkout:" + ref.name, title: "检出远端 " + ref.name.slice(13), action: () => current.action_dialog("remote_checkout", "remote", ref.name.slice(13), ref.hash),
    })));
    entries.push({id: "branch_create", title: "创建分支…", separator: true, disabled: !state.head, action: () => current.action_dialog("branch_create", "commit", state.head, state.head)},
      {id: "select_repository", title: "选择 Git 仓库…", action: () => current.manage_repositories()});
    current.configured_menu(event, "status_checkout", entries);
  });
  branch.oncontextmenu = event => ready(event, current => {
    const state = current.state!;
    if (state.head) current.target_menu(event, state.branch ? "branch" : "commit", state.branch || state.head, state.head);
    else current.configured_menu(event, "status_unborn", [{id: "unborn", title: `${state.branch} 尚无提交`, disabled: true, action: () => {}}, {id: "select_repository", title: "选择 Git 仓库…", action: () => current.manage_repositories()}]);
  });
  const sync_menu = (event: MouseEvent) => ready(event, current => {
    const state = current.state!; const upstream = snapshot_root === current.root && snapshot?.branch === state.branch ? snapshot.upstream : "";
    // 远端名允许包含斜杠；优先完整的最长名称，避免把 origin/team 误认为 origin。
    const remote = state.remotes.filter(item => upstream.startsWith(item.name + "/")).sort((left, right) => right.name.length - left.name.length)[0]?.name || state.remotes[0]?.name || "";
    const branch = upstream.startsWith(remote + "/") ? upstream.slice(remote.length + 1) : state.branch;
    current.configured_menu(event, "status_sync", [
      {id: "sync", title: "同步更改（先拉取、再推送）…", disabled: !upstream || !state.head || !state.branch, action: () => current.action_dialog("sync", "repository", "", state.head, {mode: "merge"})},
      {id: "fetch", title: "获取远端更新…", action: () => current.action_dialog("fetch", "repository", "", state.head, {remote})},
      {id: "pull", title: "拉取到当前分支…", disabled: !state.head || !state.branch, action: () => current.action_dialog("pull", "repository", "", state.head, {remote, branch, mode: "ff-only"})},
      {id: "push", title: "推送当前分支…", disabled: !state.head || !state.branch, action: () => current.action_dialog("push", "repository", "", state.head, {remote, branch: state.branch})},
      {id: "set_upstream", title: "推送并设置上游分支…", separator: true, disabled: !state.head || !state.branch, action: () => current.action_dialog("push", "repository", "", state.head, {remote, branch: state.branch, upstream: true})},
      {id: "remotes", title: "配置远端…", action: () => current.remotes_dialog()},
      {id: "refresh_status", title: "刷新本地 Git 状态", separator: true, action: () => void refresh()},
    ]);
  });
  sync.onclick = event => ready(event, async current => {
    await refresh();
    if (snapshot_root !== current.root || !snapshot || sync.disabled) return;
    if (snapshot.upstream) current.action_dialog("sync", "repository", "", current.state!.head, {mode: "merge"});
    else current.action_dialog("push", "repository", "", current.state!.head, {remote: current.state!.remotes[0]?.name || "", branch: snapshot.branch, upstream: true});
  });
  sync.oncontextmenu = sync_menu;
  graph.oncontextmenu = event => ready(event, current => current.background_menu(event));
  const timer = window.setInterval(() => { if (document.visibilityState !== "hidden" && !panel?.writing) void refresh(); }, 8000);
  const on_focus = () => void refresh(); window.addEventListener("focus", on_focus);
  window.addEventListener("pagehide", () => { disposed = true; epoch++; reader?.cancel(); clearInterval(timer); observer.disconnect(); window.removeEventListener("focus", on_focus); item.remove(); style.remove(); plugin.unload(); }, {once: true});
  void refresh();
  return {refresh: () => void refresh(), set_graph_visible: visible => { graph.hidden = !visible; }};
}
