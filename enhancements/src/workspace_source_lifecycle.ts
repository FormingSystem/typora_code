import {workspace_text} from "./workspace_i18n";
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

/** The core 2.10.15's close, switch, and detach are different lifecycles: only the true removal of the leaf node releases the source code model. */
export function bind_source_lifecycle(core: graph_core, all_views: () => Iterable<source_lifecycle_view>) {
  const guarded_groups = new WeakSet<object>();
  const guarded_leaves = new WeakSet<object>();
  const restore_patches: (() => void)[] = [];
  const leaf_patches = new Map<source_lifecycle_view, () => void>();
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
    pending.get(view)?.dialog.close(); pending.delete(view);
    // True closure releases the patch closure, and cannot retain the already recycled view until the entire workbench exits.
    leaf_patches.get(view)?.();leaf_patches.delete(view);view.release_source();
  };
  const schedule_release = (view: source_lifecycle_view) => {
    // After detach, the native drag immediately insertChild; only during microtask checks can the distinction between movement and true closure be made.
    queueMicrotask(() => release_removed(view));
  };
  const confirm_close = (view: source_lifecycle_view, close: () => void): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    const previous = pending.get(view); if (previous) return previous.result;
    let resolve_result!: (value: boolean) => void, completed = false;
    const result = new Promise<boolean>(resolve => { resolve_result = resolve; });
    const dialog = workspace_dialog(workspace_text("files_save_file_changes"), workspace_text("language_service_settings_view_cancel"), () => { pending.delete(view); resolve_result(completed); });
    pending.set(view, {dialog, result});
    dialog.root.setAttribute("data-workspace-tab-close", view.leaf.state.path);
    dialog.content.append(el("p", "", workspace_text("files_has_unsaved_changes", {value_0: String(view.file_path.split(/[\\/]/u).at(-1))})));
    let saving = false;
    const finish = () => { if (!dialog.root.isConnected || view.disposed) return; close(); completed = !present(view.leaf); dialog.close(); };
    const discard_button = button(workspace_text("files_do_not_save_and_close"), finish);
    const save_button = button(workspace_text("files_save_and_close"), () => {
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
      leaf_patches.set(view, () => { if (leaf.detach === guarded_detach) leaf.detach = detach; });
    }
    const group = leaf.parent as source_group;
    if (!group?.removeTab || guarded_groups.has(group)) return;
    guarded_groups.add(group); const remove = group.removeTab;
    const guarded_remove = group.removeTab = (path, tab) => {
      const target = [...all_views()].find(item => item.leaf.state.path === path && item.leaf.parent === group);
      const close = () => {
        // After a dialog is opened, the tag may have been moved by other actions; it is not possible to remove the new group's DOM using the old group.
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
  // The Electron's close request can be asynchronously dispatched beforeunload; it is consumed by the next event permission, and cannot be cleared when close returns.
  const request_window_close = () => { allow_close_once = true; window.close(); };
  const before_unload = (event: BeforeUnloadEvent): boolean => {
    if (allow_close_once) { allow_close_once = false; return false; }
    const dirty = [...all_views()].filter(view => !view.disposed && view.dirty());
    if (!dirty.length) return false;
    // Typora calls silentQuit from onbeforeunload; check source drafts before the native function runs.
    event.preventDefault(); event.stopImmediatePropagation(); event.returnValue = "";
    if (window_dialog?.root.isConnected) return true;
    const dialog = window_dialog = workspace_dialog(workspace_text("files_save_file_changes")); dialog.root.setAttribute("data-workspace-save-close", "true");
    dialog.content.append(el("p", "", workspace_text("source_lifecycle_documents_have_unsaved_changes", {value_0: String(dirty.length)})));
    let saving = false;
    const discard_button = button(workspace_text("files_do_not_save_and_close"), () => { dialog.close(); request_window_close(); });
    const save_button = button(workspace_text("source_lifecycle_save_all_and_close"), () => {
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
  // For beforeunload on window, Electron does not guarantee that a later capture listener runs before an existing property handler.
  // Preserve the native close function and its return value; return control only after the user handles source drafts.
  const guarded_before_unload = window.onbeforeunload = function (event) {
    if (before_unload(event)) return false;
    return native_before_unload?.call(this, event);
  };
  Object.defineProperty(window.onbeforeunload, "linux_note_source_guard", {value: true});
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (window.onbeforeunload === guarded_before_unload) window.onbeforeunload = native_before_unload;
    for (const restore of leaf_patches.values()) restore();leaf_patches.clear();
    for (const restore of restore_patches.splice(0).reverse()) restore();
    for (const {dialog} of pending.values()) dialog.close();
    pending.clear(); window_dialog?.close();
  };
  return {guard, confirm_close, schedule_release, dispose};
}
