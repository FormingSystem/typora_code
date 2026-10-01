import {get_workspace_app} from './workspace_bootstrap';
import {register_navigation_editor, notify_navigation_selection} from './reading_navigation_ports';
import {file_key} from './workspace_file_uri';

let current_editor: ReturnType<typeof create_native_markdown_editor> | undefined;
export function active_native_markdown_editor() { return current_editor?.active() ? current_editor : undefined; }

/** Adapt the existing CodeMirror model to shared outline/navigation consumers, without a second text model. */
export function create_native_markdown_editor(runtime: any, cancel_transition: () => void) {
  let cm: any, version = 0, disposed = false;
  const listeners = new Set<() => void>(), ids = new WeakMap<object, number>();
  let next_id = 1;
  const file = runtime.File, source = file.editor.sourceView;
  const active = () => {
    const leaf = get_workspace_app()?.workspace.activeLeaf;
    return !disposed && source.inSourceMode && leaf?.view?.isEditor?.() && file_key(leaf.state.path) === file_key(file.bundle?.filePath || '');
  };
  const changed = () => {version++; for (const listener of listeners) listener();};
  const selected = () => {if (active()) notify_navigation_selection();};
  const synchronize = () => {
    if (cm === source.cm) return;
    cm?.off('changes', changed); cm?.off('cursorActivity', selected);
    cm = source.cm; version++;
    cm?.on('changes', changed); cm?.on('cursorActivity', selected);
  };
  const model = {
    getValue: () => cm.getValue(), getVersionId: () => version, isDisposed: () => disposed,
    getPositionAt: (offset: number) => {const p = cm.posFromIndex(offset); return {lineNumber: p.line + 1, column: p.ch + 1};},
    onDidChangeContent: (listener: () => void) => {listeners.add(listener); return {dispose: () => listeners.delete(listener)};}
  };
  const editor = {
    native_markdown: true, active, synchronize,
    show_rendered_for_navigation: () => {if(source.inSourceMode)source.hide();cancel_transition();},
    getModel: () => {synchronize(); return model;},
    setSelection: (range: any) => {cancel_transition(); cm.setSelection({line: range.startLineNumber - 1, ch: range.startColumn - 1}, {line: range.endLineNumber - 1, ch: range.endColumn - 1});},
    revealRangeInCenter: (range: any) => {
      cm.scrollTo(null, cm.charCoords({line: range.startLineNumber - 1, ch: 0}, 'local').top - cm.getScrollInfo().clientHeight / 2);
      notify_navigation_selection(true);
    },
    focus: () => cm.focus(),
    dispose: () => {disposed = true; release_navigation();cm?.off('changes', changed);cm?.off('cursorActivity', selected);listeners.clear();if(current_editor === editor)current_editor = undefined;}
  };
  const release_navigation = register_navigation_editor({
    capture() {
      if (!active()) return null;
      synchronize();
      const leaf = get_workspace_app()!.workspace.activeLeaf!;
      if (!ids.has(leaf)) ids.set(leaf, next_id++);
      const info = cm.getScrollInfo(), anchor = cm.coordsChar({left: info.left, top: info.top}, 'local');
      return {kind: 'native_markdown', file_path: file.bundle.filePath, view_id: ids.get(leaf), scroll_top: info.top, scroll_left: info.left,
        cursor: {...cm.getCursor()}, line: cm.getCursor().line + 1, editor_state: {selections: cm.listSelections(), anchor, offset: info.top - cm.charCoords(anchor, 'local').top}};
    },
    async restore(location, signal) {
      if (disposed || signal.aborted) return false;
      const app = get_workspace_app() as any, files = app?.[Symbol.for('linux-note.workspace-files@v1')]?.host;
      if (!files) return false;
      let target: any;
      app.workspace.eachLeaves((leaf: any) => {if(ids.get(leaf) === location.view_id && file_key(leaf.state.path) === file_key(location.file_path))target = leaf;});
      if (target) app.workspace.activeLeaf = target;
      else await files.open_file(location.file_path);
      if (disposed || signal.aborted || file_key(file.bundle?.filePath || '') !== file_key(location.file_path)) return false;
      if (!source.inSourceMode) source.show();
      cancel_transition(); synchronize();
      const state = location.editor_state as any;
      if (state?.selections) cm.setSelections(state.selections);
      cm.focus();
      cm.scrollTo(location.scroll_left, state?.anchor ? cm.charCoords(state.anchor, 'local').top + state.offset : location.scroll_top);
      return true;
    }
  }, 'native_markdown');
  current_editor = editor;
  return editor;
}
