import type { graph_core, graph_leaf } from "./git_graph_host";
import { graph_button as button, graph_dialog, graph_element as el } from "./git_graph_widgets";

export type source_lifecycle_view = {
  leaf: graph_leaf; file_path: string; disposed: boolean;
  dirty(): boolean; save(): Promise<boolean>; release_source(): void;
};
type source_leaf = graph_leaf & {detach(): void; view: graph_leaf["view"] & {close?(): void}};
type source_group = graph_leaf["parent"] & {
  containerEl: HTMLElement; children: graph_leaf[];
  removeTab(path: string, tab?: HTMLElement): unknown;
  replaceChild(previous: graph_leaf, next: graph_leaf): void;
};

/** 核心 2.10.15 的关闭、切换和 detach 是不同生命周期：仅真正移除叶子才释放源码模型。 */
export function bind_source_lifecycle(core: graph_core, all_views: () => Iterable<source_lifecycle_view>) {
  const guarded_groups = new WeakSet<object>();
  const guarded_leaves = new WeakSet<object>();
  const moving_leaves = new WeakSet<object>();
  const pending = new Map<source_lifecycle_view, ReturnType<typeof graph_dialog>>();
  let menu_view: source_lifecycle_view | undefined;
  let allow_close_once = false;
  let window_dialog: ReturnType<typeof graph_dialog> | undefined;
  const native_before_unload = window.onbeforeunload;
  const present = (leaf: graph_leaf) => {
    let found = false; core.app.workspace.eachLeaves(item => { if (item === leaf) found = true; }); return found;
  };
  const release_removed = (view: source_lifecycle_view) => {
    if (view.disposed || present(view.leaf)) return;
    pending.get(view)?.close(); pending.delete(view); view.release_source();
  };
  const schedule_release = (view: source_lifecycle_view) => {
    // detach 后原生拖动立即 insertChild；微任务检查时才能区分移动和真正关闭。
    queueMicrotask(() => release_removed(view));
  };
  const confirm_close = (view: source_lifecycle_view, close: () => void) => {
    if (pending.get(view)?.root.isConnected) return;
    const dialog = graph_dialog("保存文件修改"); pending.set(view, dialog);
    dialog.content.append(el("p", "", `${view.file_path.split(/[\\/]/u).at(-1)} 有未保存的修改。`));
    let saving = false;
    const discard_button = button("不保存并关闭", () => { dialog.close(); pending.delete(view); close(); });
    const save_button = button("保存并关闭", () => {
      if (saving) return; saving = true; save_button.disabled = true; discard_button.disabled = true;
      void view.save().then(saved => {
        if (dialog.root.isConnected && saved && !view.dirty()) { dialog.close(); pending.delete(view); close(); }
      }).finally(() => { saving = false; save_button.disabled = false; discard_button.disabled = false; });
    });
    dialog.footer.prepend(save_button, discard_button);
  };
  const guard = (view: source_lifecycle_view) => {
    const leaf = view.leaf as source_leaf;
    if (typeof leaf.detach === "function" && !guarded_leaves.has(leaf)) {
      guarded_leaves.add(leaf); const detach = leaf.detach;
      leaf.detach = function () {
        moving_leaves.add(leaf);
        try { detach.call(leaf); } finally { moving_leaves.delete(leaf); schedule_release(view); }
      };
    }
    const group = leaf.parent as source_group;
    if (!group?.removeTab || guarded_groups.has(group)) return;
    guarded_groups.add(group); const remove = group.removeTab;
    group.removeTab = (path, tab) => {
      const target = [...all_views()].find(item => item.leaf.state.path === path && item.leaf.parent === group);
      const close = () => {
        // 对话框打开后标签可能已被其他动作移动；不能用旧组再移除新组的 DOM。
        if (target && (target.disposed || target.leaf.parent !== group || !present(target.leaf))) return;
        const result = remove.call(group, path, tab);
        if (target) schedule_release(target);
        return result;
      };
      if (target?.dirty() && !moving_leaves.has(target.leaf)) { confirm_close(target, close); return; }
      return close();
    };
  };
  const move_to_split = (view: source_lifecycle_view, down: boolean) => {
    if (view.disposed || !present(view.leaf)) return;
    const leaf = view.leaf as source_leaf;
    const old_group = leaf.parent as source_group;
    // 复用核心的分栏结构创建。新组的同路径临时叶子马上换为原叶子，草稿、撤销栈与选区随原模型移动。
    core.app.workspace.activeLeaf = old_group.toggleTab(leaf.state.path);
    core.app.commands.run(down ? "core.workspace:split-down" : "core.workspace:split-right", [leaf.state.path]);
    const temporary = core.app.workspace.activeLeaf as source_leaf | null;
    if (!temporary || temporary === leaf || temporary.state.path !== leaf.state.path || temporary.parent === old_group) return;
    const target_group = temporary.parent as source_group;
    if (typeof leaf.detach !== "function" || typeof target_group.replaceChild !== "function") return;
    leaf.detach(); temporary.view.close?.(); target_group.replaceChild(temporary, leaf);
    core.app.workspace.activeLeaf = target_group.toggleTab(leaf.state.path);
    guard(view);
    const temporary_view = [...all_views()].find(item => item.leaf === temporary);
    if (temporary_view) release_removed(temporary_view);
  };
  const context = (event: MouseEvent) => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>(".typ-tab[data-id]") : null;
    const group = tab?.closest(".typ-workspace-tabs");
    menu_view = tab ? [...all_views()].find(view => view.leaf.state.path === tab.dataset.id
      && (view.leaf.parent as source_group)?.containerEl === group) : undefined;
  };
  const menu_click = (event: MouseEvent) => {
    const item = event.target instanceof Element ? event.target.closest<HTMLElement>(".context-menu .typ-menuitem[data-key]") : null;
    const key = item?.dataset.key;
    if (!menu_view || !item || !["splitRight", "splitDown"].includes(key || "")) return;
    const view = menu_view; menu_view = undefined; event.preventDefault(); event.stopImmediatePropagation();
    // 在菜单容器上触发上游关闭处理；不触发原条目的 removeTab + 延迟重新开盘逻辑。
    item.closest(".context-menu")?.dispatchEvent(new MouseEvent("click", {bubbles: true}));
    move_to_split(view, key === "splitDown");
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
    const dialog = window_dialog = graph_dialog("保存文件修改"); dialog.root.setAttribute("data-workspace-save-close", "true");
    dialog.content.append(el("p", "", `${dirty.length} 个源码文件有未保存修改。`));
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
  document.addEventListener("contextmenu", context, true);
  document.addEventListener("click", menu_click, true);
  // Electron 对 window 目标的 beforeunload 不保证后注册的 capture 先于既有属性处理器。
  // 保留原生关闭函数及返回值，只在用户处理完源码草稿后交还给它。
  window.onbeforeunload = function (event) {
    if (before_unload(event)) return false;
    return native_before_unload?.call(this, event);
  };
  Object.defineProperty(window.onbeforeunload, "linux_note_source_guard", {value: true});
  return {guard, confirm_close, schedule_release, move_to_split};
}
