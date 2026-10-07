type drag_entry = {path: string; directory: boolean; link: boolean};
type drag_options = {
  tree: HTMLElement; root_label: HTMLElement; path_api: any;
  root(): string; enabled(): boolean; entry(path: string): drag_entry | undefined;
  selection(): string[]; select(path: string): void;
  expand(path: string): Promise<void>;
  transfer(root: string, paths: string[], target: string, copy: boolean): Promise<void>;
  error(error: unknown): void;
};
const DRAG_TYPE = 'application/x-typora-code-explorer';

/** Own only the in-tree gesture; the file service owns all disk mutations. */
export function bind_workspace_file_drag(options: drag_options) {
  const {tree, root_label, path_api} = options;
  let session: {root: string; paths: string[]; token: string} | undefined;
  let target_path = '', expand_timer = 0, scroll_frame = 0, pointer_y = 0;
  let serial = 0, disposed = false;
  let source_row: HTMLElement | undefined;
  const within = (parent: string, child: string) => {
    const relative = path_api.relative(parent, child);
    return !path_api.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path_api.sep);
  };
  const same = (left: string, right: string) => path_api.relative(left, right) === '';
  const row_at = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('.workspace-explorer-row') : null;
  const current = () => !disposed && options.enabled() && session && same(session.root, options.root());
  function clear_feedback() {
    if (expand_timer) window.clearTimeout(expand_timer);
    if (scroll_frame) cancelAnimationFrame(scroll_frame);
    expand_timer = scroll_frame = 0; target_path = '';
    tree.removeAttribute('data-drop-target'); root_label.classList.remove('is-drop-target');
    for (const row of tree.querySelectorAll('.is-drop-target')) row.classList.remove('is-drop-target');
  }
  function reset() { session = undefined; source_row = undefined; clear_feedback(); }
  function start(event: DragEvent) {
    const row = row_at(event.target), path = row?.dataset.path;
    if (!path || !tree.contains(row) || !options.enabled() || !event.dataTransfer || (event.target instanceof Element && event.target.closest('input,button'))) { event.preventDefault(); return; }
    const entry = options.entry(path);
    if (!entry || entry.link) { event.preventDefault(); return; }
    reset();
    let paths = options.selection();
    if (!paths.includes(path)) { options.select(path); paths = [path]; }
    paths = paths.filter(candidate => !paths.some(parent => parent !== candidate && within(parent, candidate)));
    if (!paths.length || paths.some(candidate => !options.entry(candidate) || options.entry(candidate)!.link)) { event.preventDefault(); return; }
    session = {root: options.root(), paths, token: String(++serial)};
    source_row = row!;
    event.dataTransfer.setData(DRAG_TYPE, session.token); event.dataTransfer.effectAllowed = 'copyMove';
    event.stopPropagation();
  }
  function destination(event: DragEvent) {
    if (!current() || !event.dataTransfer?.types.includes(DRAG_TYPE)) return '';
    const row = row_at(event.target), entry = row && tree.contains(row) ? options.entry(row.dataset.path || '') : undefined;
    if (entry?.link) return '';
    const target = entry ? entry.directory ? entry.path : path_api.dirname(entry.path) : session!.root;
    if (!within(session!.root, target)) return '';
    if (session!.paths.some(path => !options.entry(path) || within(path, target) || same(path_api.dirname(path), target))) return '';
    return target;
  }
  function scroll() {
    scroll_frame = 0;
    if (!current()) { reset(); return; }
    const bounds = tree.getBoundingClientRect(), diff = pointer_y - bounds.top;
    // VS Code listView.ts: 35px edge zone, at most 14px per animation frame.
    const delta = diff < 35 ? Math.max(-14, Math.floor(.3 * (diff - 35))) : diff > bounds.height - 35 ? Math.min(14, Math.floor(.3 * (diff - bounds.height + 35))) : 0;
    if (!delta || diff < 0 || diff > bounds.height) return;
    const before = tree.scrollTop; tree.scrollTop += delta;
    if (tree.scrollTop !== before) scroll_frame = requestAnimationFrame(scroll);
  }
  function over(event: DragEvent) {
    if (!session) return;
    event.preventDefault(); event.stopPropagation();
    const target = destination(event);
    if (event.dataTransfer) event.dataTransfer.dropEffect = target ? event.ctrlKey ? 'copy' : 'move' : 'none';
    if (!target) { clear_feedback(); return; }
    if (target !== target_path) {
      clear_feedback(); target_path = target;
      tree.dataset.dropTarget = target;
      root_label.classList.toggle('is-drop-target', same(target, session.root));
      for (const row of tree.querySelectorAll<HTMLElement>('.workspace-explorer-row')) row.classList.toggle('is-drop-target', row.dataset.path === target);
      const captured = session;
      expand_timer = window.setTimeout(() => {
        expand_timer = 0;
        if (current() && session === captured && target_path === target) void options.expand(target).catch(options.error);
      }, 500);
    }
    pointer_y = event.clientY;
    if (!scroll_frame) scroll_frame = requestAnimationFrame(scroll);
  }
  function drop(event: DragEvent) {
    if (!session) return;
    event.preventDefault(); event.stopPropagation();
    const target = destination(event), captured = session;
    const valid = event.dataTransfer?.getData(DRAG_TYPE) === captured.token;
    reset();
    if (target && valid) void options.transfer(captured.root, captured.paths, target, event.ctrlKey).catch(options.error);
  }
  function leave(event: DragEvent) {
    if (!(event.relatedTarget instanceof Node) || !tree.contains(event.relatedTarget) && !root_label.contains(event.relatedTarget)) clear_feedback();
  }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') reset(); };
  tree.addEventListener('dragstart', start);
  for (const surface of [tree, root_label]) {
    surface.addEventListener('dragover', over); surface.addEventListener('drop', drop); surface.addEventListener('dragleave', leave);
  }
  document.addEventListener('dragend', reset, true); document.addEventListener('keydown', key, true);
  return {reset, retains: (row: HTMLElement) => row === source_row, dispose() {
    disposed = true; reset(); tree.removeEventListener('dragstart', start);
    for (const surface of [tree, root_label]) {
      surface.removeEventListener('dragover', over); surface.removeEventListener('drop', drop); surface.removeEventListener('dragleave', leave);
    }
    document.removeEventListener('dragend', reset, true); document.removeEventListener('keydown', key, true);
  }};
}
