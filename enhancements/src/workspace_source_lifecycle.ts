import type { graph_core, graph_leaf } from "./git_graph_host";
import { workspace_button as button, workspace_dialog, workspace_element as el } from "./workspace_widgets";

export type source_lifecycle_view = {
  leaf: graph_leaf; file_path: string; disposed: boolean;
  dirty(): boolean; close_requires_save?(): boolean; save(): Promise<boolean>; release_source(): void;
};
type source_leaf = graph_leaf & {detach(): void; view: graph_leaf["view"] & {close?(): void}};
type source_group = graph_leaf["parent"] & {
  containerEl: HTMLElement; children: graph_leaf[];
  removeTab(path: string, tab?: HTMLElement): unknown;
};

/** 核心 2.10.15 的关闭、切换和 detach 是不同生命周期：仅真正移除叶子才释放源码模型。 */
export function bind_source_lifecycle(core: graph_core, all_views: () => Iterable<source_lifecycle_view>) {
  const guarded_groups = new WeakSet<object>();
  const guarded_leaves = new WeakSet<object>();
  const restore_patches: (() => void)[] = [];
  let disposed = false;
  const moving_leaves = new WeakSet<object>();
  const pending = new Map<source_lifecycle_view, {dialog: ReturnType<typeof workspace_dialog>; result: Promise<boolean>}>();
  let allow_close_once = false;
  let window_dialog: ReturnType<typeof workspace_dialog> | undefined;
  const native_before_unload = window.onbeforeunload;
  const present = (leaf: graph_leaf) => {
    let found = false; core.app.workspace.eachLeaves(item => { if (item === leaf) found = true; }); return found;
  };
  const release_removed = (view: source_lifecycle_view) => {
    if (disposed || view.disposed || present(view.leaf)) return;
    pending.get(view)?.dialog.close(); pending.delete(view); view.release_source();
  };
  const schedule_release = (view: source_lifecycle_view) => {
    // detach 后原生拖动立即 insertChild；微任务检查时才能区分移动和真正关闭。
    queueMicrotask(() => release_removed(view));
  };
  const confirm_close = (view: source_lifecycle_view, close: () => void): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    const previous = pending.get(view); if (previous) return previous.result;
    let resolve_result!: (value: boolean) => void, completed = false;
    const result = new Promise<boolean>(resolve => { resolve_result = resolve; });
    const dialog = workspace_dialog("保存文件修改", "取消", () => { pending.delete(view); resolve_result(completed); });
    pending.set(view, {dialog, result});
    dialog.root.setAttribute("data-workspace-tab-close", view.leaf.state.path);
    dialog.content.append(el("p", "", `${view.file_path.split(/[\\/]/u).at(-1)} 有未保存的修改。`));
    let saving = false;
    const finish = () => { if (!dialog.root.isConnected || view.disposed) return; close(); completed = !present(view.leaf); dialog.close(); };
    const discard_button = button("不保存并关闭", finish);
    const save_button = button("保存并关闭", () => {
      if (saving) return; saving = true; save_button.disabled = true; discard_button.disabled = true;
      void view.save().then(saved => { if (saved && !view.dirty()) finish(); })
        .catch(error => { if(dialog.root.isConnected)new core.Notice(String(error),5000); })
        .finally(() => { saving = false; save_button.disabled = false; discard_button.disabled = false; });
    });
    dialog.footer.prepend(save_button, discard_button);
    return result;
  };
  const guard = (view: source_lifecycle_view) => {
    const leaf = view.leaf as source_leaf;
    if (typeof leaf.detach === "function" && !guarded_leaves.has(leaf)) {
      guarded_leaves.add(leaf); const detach = leaf.detach;
      const guarded_detach = leaf.detach = function () {
        moving_leaves.add(leaf);
        try { detach.call(leaf); } finally { moving_leaves.delete(leaf); schedule_release(view); }
      };
      restore_patches.push(() => { if (leaf.detach === guarded_detach) leaf.detach = detach; });
    }
    const group = leaf.parent as source_group;
    if (!group?.removeTab || guarded_groups.has(group)) return;
    guarded_groups.add(group); const remove = group.removeTab;
    const guarded_remove = group.removeTab = (path, tab) => {
      const target = [...all_views()].find(item => item.leaf.state.path === path && item.leaf.parent === group);
      const close = () => {
        // 对话框打开后标签可能已被其他动作移动；不能用旧组再移除新组的 DOM。
        if (target && (target.disposed || target.leaf.parent !== group || !present(target.leaf))) return;
        const result = remove.call(group, path, tab);
        if (target) schedule_release(target);
        return result;
      };
      if (target?.dirty() && (target.close_requires_save?.() ?? true) && !moving_leaves.has(target.leaf)) return confirm_close(target, close);
      return close();
    };
    restore_patches.push(() => { if (group.removeTab === guarded_remove) group.removeTab = remove; });
  };
  // Electron 的 close 请求可以异步派发 beforeunload；由下一次事件消费许可，不能在 close 返回时清除。
  const request_window_close = () => { allow_close_once = true; window.close(); };
  const before_unload = (event: BeforeUnloadEvent): boolean => {
    if (allow_close_once) { allow_close_once = false; return false; }
    const dirty = [...all_views()].filter(view => !view.disposed && view.dirty());
    if (!dirty.length) return false;
    // Typora 的 onbeforeunload 自己调用 silentQuit；在原生函数执行前检查源码草稿。
    event.preventDefault(); event.stopImmediatePropagation(); event.returnValue = "";
    if (window_dialog?.root.isConnected) return true;
    const dialog = window_dialog = workspace_dialog("保存文件修改"); dialog.root.setAttribute("data-workspace-save-close", "true");
    dialog.content.append(el("p", "", `${dirty.length} 个文档有未保存修改。`));
    let saving = false;
    const discard_button = button("不保存并关闭", () => { dialog.close(); request_window_close(); });
    const save_button = button("全部保存并关闭", () => {
      if (saving) return; saving = true; save_button.disabled = true; discard_button.disabled = true;
      void (async () => {
        for (const view of dirty) {
          if (!dialog.root.isConnected) return;
          if (!view.disposed && (!await view.save() || view.dirty())) return;
        }
        if (!dialog.root.isConnected || [...all_views()].some(view => !view.disposed && view.dirty())) return;
        dialog.close(); request_window_close();
      })().finally(() => { saving = false; save_button.disabled = false; discard_button.disabled = false; });
    });
    dialog.footer.prepend(save_button, discard_button);
    return true;
  };
  // Electron 对 window 目标的 beforeunload 不保证后注册的 capture 先于既有属性处理器。
  // 保留原生关闭函数及返回值，只在用户处理完源码草稿后交还给它。
  const guarded_before_unload = window.onbeforeunload = function (event) {
    if (before_unload(event)) return false;
    return native_before_unload?.call(this, event);
  };
  Object.defineProperty(window.onbeforeunload, "linux_note_source_guard", {value: true});
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (window.onbeforeunload === guarded_before_unload) window.onbeforeunload = native_before_unload;
    for (const restore of restore_patches.splice(0).reverse()) restore();
    for (const {dialog} of pending.values()) dialog.close();
    pending.clear(); window_dialog?.close();
  };
  return {guard, confirm_close, schedule_release, dispose};
}
