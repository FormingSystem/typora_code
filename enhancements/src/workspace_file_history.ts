import {workspace_text} from './workspace_i18n';
import {prepare_workspace_move} from './workspace_rename';
import type {workspace_file_modules, workspace_move_callback} from './workspace_file_operations';

type relocation = {source: string; target: string};
/** Window-local file transactions; editor content retains its own undo owner. */
export function create_workspace_file_history(modules: workspace_file_modules, current_root: () => string, relocate: workspace_move_callback) {
  let root = '', busy = false;
  const undo_stack: relocation[][] = [], redo_stack: relocation[][] = [];
  const same = (left: string, right: string) => modules.path_api.relative(left, right) === '';
  const clear = () => { undo_stack.length = redo_stack.length = 0; root = ''; };
  const sync = () => { if (root && !same(root, current_root())) clear(); };
  const guard = (value: string) => {
    sync();
    if (busy || !same(value, current_root())) throw Error(workspace_text('file_history_busy'));
    root = value;
  };
  const apply = async (value: string, entry: relocation, completed: relocation[]) => {
    try { await relocate(value, entry.source, entry.target); }
    catch (error) {
      if ((error as {renamed_path?: string}).renamed_path === entry.target) completed.push(entry);
      throw error;
    }
    if (entry.source !== entry.target) completed.push(entry);
    return entry.target;
  };
  async function record<T>(value: string, action: (move: workspace_move_callback) => Promise<T>): Promise<T> {
    guard(value); busy = true;
    const completed: relocation[] = [];
    try {
      return await action(async (_root, source, target) => {
        if (!same(value, _root)) throw Error(workspace_text('file_history_busy'));
        const before = completed.length;
        try { return await apply(value, {source, target}, completed); }
        finally {
          // The transfer engine may roll back an earlier step in the same batch.
          const last = completed.at(-1), previous = completed.at(-2);
          if (completed.length > before && previous && last!.source === previous.target && last!.target === previous.source) completed.splice(-2);
        }
      });
    } finally {
      if (completed.length) { undo_stack.push(completed); if (undo_stack.length > 100) undo_stack.shift(); redo_stack.length = 0; }
      busy = false;
    }
  }
  async function replay(value: string, redo = false): Promise<string[]> {
    guard(value); busy = true;
    const from = redo ? redo_stack : undo_stack, to = redo ? undo_stack : redo_stack, entry = from.at(-1);
    try {
      if (!entry) return [];
      const plans = redo ? entry : [...entry].reverse().map(item => ({source: item.target, target: item.source}));
      // Preflight the entire batch before changing any path. Never overwrite a collision.
      for (const plan of plans) await prepare_workspace_move(modules, value, plan.source, plan.target);
      const completed: relocation[] = [];
      try { for (const plan of plans) await apply(value, plan, completed); }
      catch (error) {
        const failed: string[] = [];
        for (const plan of [...completed].reverse()) {
          try { await relocate(value, plan.target, plan.source); } catch { failed.push(plan.target); }
        }
        if (failed.length) { clear(); throw Error(workspace_text('file_history_rollback_failed') + failed.join('\n')); }
        throw error;
      }
      from.pop(); to.push(entry);
      return plans.map(plan => plan.target);
    } finally { busy = false; }
  }
  return {record, replay, clear, can(redo = false) { sync(); return !busy && Boolean((redo ? redo_stack : undo_stack).length); }};
}
