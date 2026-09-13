import type {git_graph_panel} from "./git_graph_panel";
import {git_graph_text as text} from "./git_graph_i18n";
import {git_icon} from "./git_icons";
import {workspace_element as el, workspace_button as button} from "./workspace_widgets";
import {capture_workspace_focus, register_workspace_dismissal} from "./workspace_focus";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import css from "./git_scm_ref_picker.css";

type ref_item = {id: string; label: string; description: string; group: string; icon?: "git-branch" | "tag" | "target" | "cloud";};
const ALL = "__all__";
let active_picker: git_scm_ref_picker | undefined;
let picker_sequence = 0;

/** 引用选择是只读范围草稿；确认后一次更新控制器，不执行分支检出或Git写入。 */
export class git_scm_ref_picker {
  private dismiss?: (restore: boolean) => void;
  private available?: () => boolean;
  constructor(private panel: git_graph_panel) {}
  close(restore = true): void { this.dismiss?.(restore); }
  update_state(): void { if (this.available && !this.available()) this.close(false); }
  open(): void {
    active_picker?.close();
    const panel = this.panel, state = panel.state, root_path = panel.root, runner = panel.runner;
    if (!state || state.root !== root_path || panel.pending || panel.writing || panel.disposed) return;
    const previous = capture_workspace_focus(), root = el("div", "git-scm-ref-picker"), header = el("div", "git-scm-ref-header");
    const input_container = el("div", "git-scm-ref-input"), count = el("span", "git-scm-ref-count"), filter = el("input", "git-scm-ref-filter"), list = el("div", "git-scm-ref-list"), status = el("div", "git-scm-ref-status");
    const instance_id = ++picker_sequence;
    root.dataset.linuxNoteGitRefPicker = "ready";
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", text("graph.select_branches_title"));
    filter.type = "text"; filter.placeholder = text("ref_picker.placeholder"); filter.autocomplete = "off";
    filter.setAttribute("aria-label", filter.placeholder); filter.setAttribute("role", "combobox"); filter.setAttribute("aria-autocomplete", "list"); filter.setAttribute("aria-expanded", "true");
    list.id = "git-scm-ref-list-" + instance_id; list.tabIndex = 0; list.setAttribute("role", "listbox"); list.setAttribute("aria-multiselectable", "true"); list.setAttribute("aria-label", text("graph.select_branches_title"));
    filter.setAttribute("aria-controls", list.id); status.setAttribute("role", "status"); count.setAttribute("aria-hidden", "true");
    const selected = new Set(panel.branches.length ? panel.branches : [ALL]);
    if (selected.has("AUTO")) { selected.clear(); selected.add("AUTO"); }
    const original_selected = new Set(selected), items: ref_item[] = [
      {id: ALL, label: text("scm.scope_all"), description: text("ref_picker.all_description"), group: ""},
      {id: "AUTO", label: text("scm.scope_auto"), description: text("ref_picker.auto_description"), group: ""},
      {id: "HEAD", label: text("graph.current_head"), description: "HEAD", group: text("ref_picker.other"), icon: "target"},
    ];
    for (const ref of state.refs) {
      const local = ref.name.startsWith("refs/heads/"), remote = ref.name.startsWith("refs/remotes/"), tag = ref.name.startsWith("refs/tags/");
      items.push({id: ref.name, label: ref.name.replace(/^refs\/(heads|remotes|tags)\//u, ""), description: remote ? text("ref_picker.remote_description", {hash: ref.hash.slice(0, 7)}) : tag ? text("ref_picker.tag_description", {hash: ref.hash.slice(0, 7)}) : ref.hash.slice(0, 7),
        group: text(local ? "ref_picker.local" : remote ? "ref_picker.remote" : tag ? "ref_picker.tags" : "ref_picker.other"), icon: tag ? "tag" : remote ? "cloud" : "git-branch"});
    }
    for (const entry of panel.settings.branch_globs) items.push({id: "glob:" + entry.glob, label: entry.name, description: entry.glob, group: text("ref_picker.globs"), icon: "git-branch"});
    // 已选的具体引用提升一次，搜索和勾选时不在鼠标下重排。
    const by_id = new Map(items.map(item => [item.id, item]));
    for (const id of selected) if (!by_id.has(id)) selected.delete(id);
    const current = items.filter(item => item.id !== ALL && item.id !== "AUTO" && original_selected.has(item.id));
    const grouped = new Map<string, ref_item[]>();
    for (const item of items.slice(2)) if (!original_selected.has(item.id)) { const group = grouped.get(item.group) || []; group.push(item); grouped.set(item.group, group); }
    const ordered: [string, ref_item[]][] = [["", items.slice(0, 2)], ...(current.length ? [[text("ref_picker.selected"), current] as [string, ref_item[]]] : []), ...grouped.entries()];
    let active_id = [...selected][0] || ALL, visible: ref_item[] = [], closed = false;
    const style = acquire_workspace_style("typora-code-style:git-scm-ref-picker", css), interaction = acquire_workspace_interaction(root);
    const valid = () => !closed && root.isConnected && !panel.disposed && !panel.pending && !panel.writing && panel.root === root_path && panel.runner === runner && panel.state === state;
    const close = (restore: boolean) => {
      if (closed) return; closed = true;
      const owned_focus = dismissal.owns_focus(); dismissal.dispose(); root.remove(); interaction.remove(); style.remove();
      this.dismiss = undefined; this.available = undefined; if (active_picker === this) active_picker = undefined;
      if (restore && owned_focus) previous.restore();
    };
    const dismissal = register_workspace_dismissal(() => [root], reason => close(reason === "escape"), {inside: () => [root], window_blur: true});
    this.dismiss = close; this.available = valid; active_picker = this;
    const accept = () => {
      if (!valid()) { close(false); return; }
      const next = [...selected]; close(true);
      // 上游空选择等同取消，不把清空草稿隐式解释成全部。
      if (!next.length) return;
      panel.branches = next.includes(ALL) ? [] : next; void panel.refresh();
    };
    const apply = button(text("graph.apply"), accept, "git-scm-ref-accept"); apply.dataset.gitRefAccept = "";
    input_container.append(filter, count); header.append(input_container, apply); root.append(header, list, status); document.body.append(root);
    const mark = (id: string) => {
      active_id = id;
      for (const row of list.querySelectorAll<HTMLElement>("[data-git-ref]")) row.classList.toggle("is-active", row.dataset.gitRef === id);
      const row = [...list.querySelectorAll<HTMLElement>("[data-git-ref]")].find(node => node.dataset.gitRef === id);
      if (row) { filter.setAttribute("aria-activedescendant", row.id); list.setAttribute("aria-activedescendant", row.id);
        const row_box = row.getBoundingClientRect(), list_box = list.getBoundingClientRect();
        if (row_box.top < list_box.top) list.scrollTop += row_box.top - list_box.top; else if (row_box.bottom > list_box.bottom) list.scrollTop += row_box.bottom - list_box.bottom;
      } else { filter.removeAttribute("aria-activedescendant"); list.removeAttribute("aria-activedescendant"); }
    };
    const toggle = (item: ref_item) => {
      if (!valid()) return close(false);
      if (selected.has(item.id)) selected.delete(item.id);
      else { if (item.id === ALL || item.id === "AUTO") selected.clear(); else { selected.delete(ALL); selected.delete("AUTO"); } selected.add(item.id); }
      for (const row of list.querySelectorAll<HTMLElement>("[data-git-ref]")) row.setAttribute("aria-selected", String(selected.has(row.dataset.gitRef!)));
      count.textContent = status.textContent = text("ref_picker.count", {count: selected.size}); mark(item.id);
    };
    const render = () => {
      if (!valid()) return close(false);
      const query = filter.value.trim().toLocaleLowerCase(); visible = []; list.replaceChildren();
      for (const [group, entries] of ordered) {
        const matching = entries.filter(item => (item.label + " " + item.description + " " + item.id).toLocaleLowerCase().includes(query)); if (!matching.length) continue;
        if (group) { const separator = el("div", "git-scm-ref-separator", group); separator.setAttribute("role", "presentation"); list.append(separator); }
        for (const item of matching) {
          visible.push(item); const row = button("", () => toggle(item), "git-scm-ref-item");
          row.tabIndex = -1; row.id = "git-scm-ref-item-" + instance_id + "-" + visible.length; row.dataset.gitRef = item.id; row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(selected.has(item.id)));
          row.dataset.workspaceInteraction = "row"; row.title = item.id.startsWith("refs/") ? item.id + " · " + item.description : item.description || item.label;
          const checkbox = el("span", "git-scm-ref-check"), label = el("span", "git-scm-ref-label", item.label), description = el("span", "git-scm-ref-description", item.description);
          checkbox.setAttribute("aria-hidden", "true"); checkbox.append(git_icon("check")); row.append(checkbox); if (item.icon) row.append(git_icon(item.icon)); row.append(label, description);
          row.onmousedown = event => event.preventDefault(); row.onmousemove = () => mark(item.id); list.append(row);
        }
      }
      if (!visible.length) list.append(el("div", "git-scm-ref-empty", text("ref_picker.empty")));
      count.textContent = status.textContent = text("ref_picker.count", {count: selected.size}); if (!visible.some(item => item.id === active_id)) active_id = visible[0]?.id || ""; mark(active_id);
    };
    filter.oninput = render;
    root.onkeydown = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (["ArrowUp", "ArrowDown"].includes(event.key) || event.target === list && ["Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); const index = visible.findIndex(item => item.id === active_id);
        const next = event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        if (visible[next]) mark(visible[next].id); return;
      }
      if (event.key === " " && event.target === list) { event.preventDefault(); event.stopPropagation(); const item = by_id.get(active_id); if (item) toggle(item); return; }
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (!event.repeat) accept(); return; }
      if (event.key === "Tab") { event.preventDefault(); event.stopPropagation(); const controls = [filter, apply, list], index = controls.findIndex(control => control === document.activeElement); controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus({preventScroll: true}); }
    };
    render(); filter.focus({preventScroll: true});
  }
}
