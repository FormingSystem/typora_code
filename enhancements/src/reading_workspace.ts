import { apply_position, capture_position, create_position_store, type reading_position } from "./reading_positions";
import { file_key } from "./workspace_file_uri";
import { get_workspace_app, type workspace_leaf, type workspace_view } from "./workspace_bootstrap";

export type reading_context = { view_id: number; file_path: string; leaf?: workspace_leaf };
export const reading_delay = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (signal?.aborted) { resolve(); return; }
  const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", finish); resolve(); };
  const timer = window.setTimeout(finish, milliseconds);
  signal?.addEventListener("abort", finish, { once: true });
});

/** Maintains position for each bar; allows reading its scroll state only when the native editor actually loads the file. */
export function create_reading_workspace(native_path: () => string, is_busy: () => boolean) {
  const app = get_workspace_app();
  let disposed = false;
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  const collect = (value: unknown) => { if (typeof value === "function") cleanups.push(value as () => void); };
  const contexts = new WeakMap<workspace_view, reading_context>();
  const native_contexts = new Map<string, reading_context>();
  const saved = new Map<number, reading_position>();
  const restoring = new Map<number, object>();
  const held_paths = new Set<string>();
  const dirty = new Map<string, reading_position>();
  let next_id = 1;
  let save_timer = 0;
  let store: ReturnType<typeof create_position_store> | undefined;
  try { store = create_position_store(window.localStorage); } catch { /* Maintain the window state when storage is unavailable. */ }
  const context_for = (leaf: workspace_leaf): reading_context => {
    let context = contexts.get(leaf.view);
    if (!context) { context = { view_id: next_id++, file_path: leaf.state.path, leaf }; contexts.set(leaf.view, context); }
    context.file_path = leaf.state.path;
    return context;
  };
  const all = (): reading_context[] => {
    if (disposed) return [];
    if (!app) {
      const path = native_path();
      const key = file_key(path);
      if (!native_contexts.has(key)) native_contexts.set(key, { view_id: next_id++, file_path: path });
      return [native_contexts.get(key)!];
    }
    const result: reading_context[] = [];
    app.workspace.eachLeaves((leaf) => { if (typeof leaf.view?.isEditor === "function") result.push(context_for(leaf)); });
    return result;
  };
  const active = (): reading_context | undefined => {
    const leaf = app?.workspace.activeLeaf;
    return leaf && typeof leaf.view?.isEditor === "function" ? context_for(leaf) : all().find((context) => file_key(context.file_path) === file_key(native_path()));
  };
  const elements = (context: reading_context): { scroller: HTMLElement; root: HTMLElement } | null => {
    if (disposed) return null;
    const view = context.leaf?.view;
    if (context.leaf && !context.leaf.containerEl.classList.contains("mod-active")) return null;
    if (!view || view.isEditor()) {
      if (is_busy() || file_key(context.file_path) !== file_key(native_path())) return null;
      const scroller = document.querySelector<HTMLElement>("content");
      const root = document.querySelector<HTMLElement>("#write");
      return scroller && root?.children.length && scroller.getBoundingClientRect().height > 0 ? { scroller, root } : null;
    }
    const root = view.containerEl;
    return root.children.length && root.classList.contains("typ-markdown-preview") && root.getBoundingClientRect().height > 0
      ? { scroller: context.leaf!.containerEl, root } : null;
  };
  const flush = () => {
    if (disposed) return;
    window.clearTimeout(save_timer);
    for (const [path, position] of dirty) store?.set(path, position);
    dirty.clear();
  };
  const remember = (context: reading_context, position: reading_position, persist = true) => {
    if (disposed) return;
    saved.set(context.view_id, position);
    if (context.leaf) context.leaf.state.linux_note_position = position;
    const active_context = active();
    if (persist && (!active_context || file_key(active_context.file_path) !== file_key(context.file_path)
        || active_context.view_id === context.view_id)) {
      dirty.set(context.file_path, position);
      window.clearTimeout(save_timer);
      save_timer = window.setTimeout(flush, 300);
    }
  };
  const capture = (context: reading_context): reading_position | null => {
    if (restoring.has(context.view_id)) return saved.get(context.view_id) ?? null;
    const nodes = elements(context);
    return nodes ? capture_position(nodes.scroller, nodes.root) : saved.get(context.view_id) ?? null;
  };
  const checkpoint = () => {
    for (const context of all()) {
      if (!elements(context) || restoring.has(context.view_id)) continue;
      const position = capture(context);
      if (position) remember(context, position);
    }
  };
  const restore = async (context: reading_context, position: reading_position, options: {background?: boolean; signal?: AbortSignal} = {}): Promise<boolean> => {
    if (disposed || options.signal?.aborted) return false;
    const token = {};
    restoring.set(context.view_id, token);
    remember(context, position, false);
    const stop = () => { if (restoring.get(context.view_id) === token) restoring.delete(context.view_id); };
    options.signal?.addEventListener("abort", stop, {once: true});
    let first_applied!: (value: boolean) => void;
    const initial = new Promise<boolean>(resolve => { first_applied = resolve; });
    const settle = async () => {
      let applied = false;
      try {
      let previous_geometry = "";
      let stable_since = Date.now();
      const started = Date.now();
      // Wait for asynchronous preview, code height limit, and layout; immediately stop when the user starts scrolling/editing to avoid pulling back new positions.
      while (!disposed && restoring.get(context.view_id) === token && Date.now() - started < 5000) {
        const nodes = elements(context);
        if (nodes) {
          const geometry = `${nodes.root.getBoundingClientRect().height}:${nodes.scroller.clientHeight}:${nodes.scroller.scrollHeight}`;
          const before_top = nodes.scroller.scrollTop; const before_left = nodes.scroller.scrollLeft;
          // Host's restoration of selection may reset scrolling even if the document height remains unchanged; each round checks actual positions, not just waiting for stable document height.
          // Changes in viewport size and host's repositioning of the scroll bar will restart the stabilization period; real user input still immediately cancels restoration.
          apply_position(nodes.scroller, nodes.root, position);
          if (!applied || geometry !== previous_geometry || Math.abs(before_top - nodes.scroller.scrollTop) > .5 || Math.abs(before_left - nodes.scroller.scrollLeft) > .5) {
            previous_geometry = geometry;
            stable_since = Date.now();
          }
          applied = true;
          first_applied(true);
          if (applied && Date.now() - stable_since >= 250) break;
        }
        await reading_delay(40, controller.signal);
      }
      if (restoring.get(context.view_id) === token) {
        restoring.delete(context.view_id);
        const nodes = elements(context);
        if (applied && nodes) remember(context, capture_position(nodes.scroller, nodes.root));
      }
      return !disposed && !options.signal?.aborted && applied;
      } finally {
        stop();
        options.signal?.removeEventListener("abort", stop);
        first_applied(false);
      }
    };
    const settled = settle();
    // The first positioning can accept the next navigation; late layouts are still corrected by the same cancelable position task.
    return options.background ? Promise.race([initial, settled]) : settled;
  };
  const stop_restoring = (context?: reading_context) => {
    if (context) restoring.delete(context.view_id);
    else restoring.clear();
  };
  // pinned 2.10.15's MarkdownView.setState will use old character offset to restore global selection.
  // Adapt the two reading-state interfaces here; do not modify the distribution or write another file's cursor into the source group.
  const patched = new WeakSet<object>();
  const patch_view = (view: workspace_view): boolean => {
    if (disposed) return false;
    const prototype = Object.getPrototypeOf(view) as workspace_view;
    if (patched.has(prototype)) return false;
    patched.add(prototype);
    const original_on_open = prototype.onOpen;
    const original_get_state = prototype.getState;
    const original_set_state = prototype.setState;
    prototype.onOpen = function () {
      if (disposed) return original_on_open.call(this);
      const context = context_for(this.leaf);
      const position = saved.get(context.view_id) ?? this.leaf.state.linux_note_position as reading_position | undefined ?? store?.get(context.file_path);
      if (!position || held_paths.has(file_key(context.file_path))) return original_on_open.call(this);
      // The core rebuilds the editor before calling native openFile; an intermediate zero scroll offset is not a new reading position.
      // Protect the previous state from the file:will-open checkpoint, then wait for layout restoration.
      restoring.set(context.view_id, {});
      remember(context, position, false);
      try { original_on_open.call(this); }
      catch (error) { restoring.delete(context.view_id); throw error; }
      void restore(context, position);
    };
    prototype.getState = function () {
      if (disposed) return original_get_state.call(this);
      const context = context_for(this.leaf);
      const position = capture(context) ?? this.leaf.state.linux_note_position as reading_position | undefined;
      if (position) remember(context, position);
      return position ? { scrollTop: position.scroll_top, linux_note_position: position } : {};
    };
    prototype.setState = function (state) {
      if (disposed) return original_set_state.call(this, state);
      const context = context_for(this.leaf);
      if (held_paths.has(file_key(context.file_path))) return;
      const position = state.linux_note_position as reading_position | undefined
        ?? saved.get(context.view_id) ?? store?.get(context.file_path)
        ?? (typeof state.scrollTop === "number" ? { scroll_top: state.scrollTop, scroll_left: 0 } : null);
      if (position) void restore(context, position);
    };
    const owned_on_open = prototype.onOpen, owned_get_state = prototype.getState, owned_set_state = prototype.setState;
    cleanups.push(() => {
      if (prototype.onOpen === owned_on_open) prototype.onOpen = original_on_open;
      if (prototype.getState === owned_get_state) prototype.getState = original_get_state;
      if (prototype.setState === owned_set_state) prototype.setState = original_set_state;
    });
    return true;
  };
  for (const context of all()) {
    if (context.leaf) patch_view(context.leaf.view);
    const position = store?.get(context.file_path);
    if (position) void restore(context, position);
  }
  // The blank welcome page has no MarkdownView; attach the same state interfaces when the first document appears.
  collect(app?.workspace.rootSplit.on("leaf:open", (leaf) => {
    if (typeof leaf.view?.isEditor !== "function" || !patch_view(leaf.view)) return;
    const context = context_for(leaf);
    const position = store?.get(context.file_path);
    if (position && !held_paths.has(file_key(context.file_path))) void restore(context, position);
  }));
  document.addEventListener("scroll", (event) => {
    const target=event.target;
    if(!(target instanceof HTMLElement)||!(target.matches('content')||target.querySelector(':scope > .typ-markdown-preview')))return;
    const context = all().find((candidate) => elements(candidate)?.scroller === event.target);
    if (!context || restoring.has(context.view_id) || held_paths.has(file_key(context.file_path))) return;
    const position = capture(context);
    if (position) remember(context, position);
  }, { capture: true, signal: controller.signal });
  for (const name of ["wheel", "touchstart", "pointerdown", "keydown"]) {
    window.addEventListener(name, (event) => {
      if (!event.isTrusted) return;
      if(!restoring.size)return;
      // Cancel restoration only in the group receiving input; switching groups must not cancel restoration of the source preview.
      const target = event.target;
      for (const context of all()) {
        const nodes = elements(context);
        if (nodes && target instanceof Node && nodes.scroller.contains(target)) stop_restoring(context);
      }
    }, { capture: true, signal: controller.signal });
  }
  window.addEventListener("pagehide", flush, { signal: controller.signal });
  window.addEventListener("beforeunload", flush, { signal: controller.signal });
  const dispose = () => {
    if (disposed) return;
    checkpoint(); flush(); disposed = true; controller.abort(); clearTimeout(save_timer); restoring.clear();
    for (const cleanup of cleanups.reverse()) cleanup();
    dirty.clear(); saved.clear(); native_contexts.clear(); held_paths.clear();
  };
  return { all, active, elements, capture, checkpoint, remember, restore, stop_restoring, dispose,
    remap_paths(map: (path: string) => string | undefined) {
      if (disposed) return;
      flush(); store?.remap_paths(map);
      for (const [key, context] of [...native_contexts]) {
        const target = map(context.file_path); if (!target) continue;
        native_contexts.delete(key); context.file_path = target; native_contexts.set(file_key(target), context);
      }
    },
    hold(path: string, value: boolean) {
      if (disposed) return;
      if (value) held_paths.add(file_key(path)); else held_paths.delete(file_key(path));
    },
    resume(context: reading_context) {
      const position = saved.get(context.view_id) ?? store?.get(context.file_path);
      return position ? restore(context, position) : Promise.resolve(true);
    },
  };
}
