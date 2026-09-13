import type {graph_core, graph_leaf} from "./git_graph_host";
import {get_workspace_app} from "./workspace_bootstrap";
import {file_key, source_file_path} from "./workspace_file_uri";
import {workspace_dialog, workspace_element as el, workspace_button} from "./workspace_widgets";

export const WORKSPACE_EDITOR_DEFAULTS = Object.freeze({enable_preview: true});
const KEY = "workspace_editor";
const listeners = new Set<() => void>();
const locked_groups = new WeakSet<object>();
type editor_group = graph_leaf["parent"] & {children?: graph_leaf[]; activeLeaf?: graph_leaf; containerEl?: HTMLElement};
type routing_core = graph_core & {split_workspace_group?(leaf: graph_leaf, side: "right"): editor_group};
let settings_dialog: ReturnType<typeof workspace_dialog> | undefined;

/** 编辑器预览设置只从既有用户设置存储解析，关闭后也不改变当前文档的正文状态。 */
export function read_workspace_editor_settings(): {enable_preview: boolean} {
  const value = get_workspace_app()?.settings.get(KEY) as {enable_preview?: unknown} | undefined;
  return {enable_preview: typeof value?.enable_preview === "boolean" ? value.enable_preview : WORKSPACE_EDITOR_DEFAULTS.enable_preview};
}
export function set_workspace_editor_preview(enabled: boolean | undefined): void {
  if (enabled !== undefined && typeof enabled !== "boolean") throw new Error("编辑器预览设置无效。");
  const settings = get_workspace_app()?.settings;
  if (!settings) throw new Error("工作台设置尚未就绪。");
  settings.set_and_save(KEY, enabled === undefined ? {} : {enable_preview: enabled});
  for (const listener of listeners) listener();
}
export function observe_workspace_editor_settings(listener: () => void): () => void {listeners.add(listener); return () => {listeners.delete(listener);};}
export function workspace_editor_group_locked(group: graph_leaf["parent"]): boolean {return locked_groups.has(group);}
export function set_workspace_editor_group_locked(group: graph_leaf["parent"], locked: boolean): void {
  if (locked) locked_groups.add(group); else locked_groups.delete(group);
  const container = group.containerEl;
  if (container) {if (locked) container.dataset.workspaceEditorLocked = "true"; else delete container.dataset.workspaceEditorLocked;}
}
const editor_identity = (target: string) => target.startsWith("typ://") && !source_file_path(target) ? target : file_key(source_file_path(target) || target);
/** 文件、差异与工具标签共用目标组选择；锁定组只接收已在该组存在的文档。返回值不主动切换焦点。 */
export function select_workspace_editor_group(core: graph_core, target_path: string, preferred_group = core.app.workspace.activeLeaf?.parent): editor_group {
  const workspace = core.app.workspace as graph_core["app"]["workspace"] & {rootSplit?: {eachLeaves(callback: (leaf: graph_leaf) => void): void}};
  const groups = new Map<editor_group, graph_leaf[]>();
  const collect = (leaf: graph_leaf) => {const group = leaf.parent as editor_group; groups.set(group, [...groups.get(group) || [], leaf]);};
  if (workspace.rootSplit) workspace.rootSplit.eachLeaves(collect); else workspace.eachLeaves(collect);
  const key = editor_identity(target_path);
  const contains = (group: editor_group) => (groups.get(group) || group.children || []).some(leaf => editor_identity(leaf.state.path) === key);
  const preferred = preferred_group as editor_group | undefined;
  if (preferred && (!workspace_editor_group_locked(preferred) || contains(preferred))) return preferred;
  const existing = [...groups].find(([group]) => contains(group))?.[0]; if (existing) return existing;
  const unlocked = [...groups.keys()].find(group => !workspace_editor_group_locked(group)); if (unlocked) return unlocked;
  const source = workspace.activeLeaf || [...groups.values()][0]?.[0];
  const split = (core as routing_core).split_workspace_group;
  if (!source || typeof split !== "function") throw new Error("没有可用的未锁定编辑器组。");
  return split.call(core, source, "right");
}
export function open_workspace_editor_settings(): void {
  settings_dialog?.close(false);
  const dialog = settings_dialog = workspace_dialog("编辑器设置", "关闭设置", () => {if (settings_dialog === dialog) settings_dialog = undefined;});
  dialog.root.dataset.workspaceEditorSettings = "ready";
  const row = el("label"), control = el("input"), label = el("span", "", "启用预览编辑器");
  row.style.display = "flex"; row.style.alignItems = "center"; row.style.gap = "8px";
  control.type = "checkbox"; control.dataset.workspaceEditorPreview = "true"; control.checked = read_workspace_editor_settings().enable_preview;
  const status = el("p"); status.setAttribute("role", "status");
  const change = (enabled: boolean | undefined) => {
    try {set_workspace_editor_preview(enabled); status.textContent = "设置已保存并生效。";}
    catch (error) {status.textContent = error instanceof Error ? error.message : String(error);}
    control.checked = read_workspace_editor_settings().enable_preview;
  };
  control.onchange = () => change(control.checked); row.append(control, label);
  dialog.content.append(row, el("p", "", "启用后可用临时标签预览文件。关闭后，现有临时标签保持打开，新文件也使用普通标签。"), status);
  const reset = workspace_button("恢复默认", () => change(undefined)); reset.dataset.workspaceEditorReset = "true"; dialog.footer.prepend(reset);
}
export function close_workspace_editor_settings(): void {settings_dialog?.close(false); settings_dialog = undefined;}
