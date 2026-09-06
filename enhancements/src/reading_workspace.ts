import { apply_position, capture_position, create_position_store, file_key, type reading_position } from "./reading_positions";
import { get_workspace_app, type workspace_leaf, type workspace_view } from "./workspace_bootstrap";

export type reading_context = { view_id: number; file_path: string; leaf?: workspace_leaf };
export const reading_delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/** 为每个栏维护位置；仅当原生编辑器确实装载该文件时，才允许读取它的滚动状态。 */
export function create_reading_workspace(native_path: () => string, is_busy: () => boolean) {
  const app = get_workspace_app();
  const contexts = new WeakMap<workspace_view, reading_context>();
  const native_contexts = new Map<string, reading_context>();
  const saved = new Map<number, reading_position>();
  const restoring = new Map<number, object>();
  const held_paths = new Set<string>();
  const dirty = new Map<string, reading_position>();
  let next_id = 1;
  let save_timer = 0;
  let store: ReturnType<typeof create_position_store> | undefined;
  try { store = create_position_store(window.localStorage); } catch { /* 存储不可用时保持窗口内状态。 */ }
  const context_for = (leaf: workspace_leaf): reading_context => {
    let context = contexts.get(leaf.view);
    if (!context) { context = { view_id: next_id++, file_path: leaf.state.path, leaf }; contexts.set(leaf.view, context); }
    context.file_path = leaf.state.path;
    return context;
  };
  const all = (): reading_context[] => {
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
    window.clearTimeout(save_timer);
    for (const [path, position] of dirty) store?.set(path, position);
    dirty.clear();
  };
  const remember = (context: reading_context, position: reading_position, persist = true) => {
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
  const restore = async (context: reading_context, position: reading_position): Promise<boolean> => {
    const token = {};
    restoring.set(context.view_id, token);
    remember(context, position, false);
    let applied = false;
    let previous_geometry = "";
    let stable_since = Date.now();
    const started = Date.now();
    // 等待异步预览、代码限高与排版；用户开始滚动/编辑时立即停止，避免把新位置拉回去。
    while (restoring.get(context.view_id) === token && Date.now() - started < 5000) {
      const nodes = elements(context);
      if (nodes) {
        const geometry = `${nodes.root.getBoundingClientRect().height}:${nodes.scroller.clientHeight}:${nodes.scroller.scrollHeight}`;
        const before_top = nodes.scroller.scrollTop; const before_left = nodes.scroller.scrollLeft;
        // 宿主恢复选区可能在正文高度不变时重置滚动；每轮核对实际位置，而非只等正文高度稳定。
        // 视口尺寸变化和宿主再次挪动滚动条都会重新开始稳定期；真实用户输入仍立即取消恢复。
        apply_position(nodes.scroller, nodes.root, position);
        if (!applied || geometry !== previous_geometry || Math.abs(before_top - nodes.scroller.scrollTop) > .5 || Math.abs(before_left - nodes.scroller.scrollLeft) > .5) {
          previous_geometry = geometry;
          stable_since = Date.now();
        }
        applied = true;
        if (applied && Date.now() - stable_since >= 250) break;
      }
      await reading_delay(40);
    }
    if (restoring.get(context.view_id) === token) {
      restoring.delete(context.view_id);
      const nodes = elements(context);
      if (applied && nodes) remember(context, capture_position(nodes.scroller, nodes.root));
    }
    return applied;
  };
  const stop_restoring = (context?: reading_context) => {
    if (context) restoring.delete(context.view_id);
    else restoring.clear();
  };
  // pinned 2.10.15 的 MarkdownView.setState 会用旧字符偏移恢复全局选区。
  // 此处接管阅读状态的两个接口；不修改发行包，也不把别的文件的光标写回来源栏。
  const patched = new WeakSet<object>();
  const patch_view = (view: workspace_view): boolean => {
    const prototype = Object.getPrototypeOf(view) as workspace_view;
    if (patched.has(prototype)) return false;
    patched.add(prototype);
    const original_on_open = prototype.onOpen;
    prototype.onOpen = function () {
      const context = context_for(this.leaf);
      const position = saved.get(context.view_id) ?? this.leaf.state.linux_note_position as reading_position | undefined ?? store?.get(context.file_path);
      if (!position || held_paths.has(file_key(context.file_path))) return original_on_open.call(this);
      // 核心先重建编辑器，再调用原生 openFile；中间产生的 0 滚动量不是新的阅读位置。
      // 先保护旧状态，避免 file:will-open 的 checkpoint 覆盖它，再等待布局恢复。
      restoring.set(context.view_id, {});
      remember(context, position, false);
      try { original_on_open.call(this); }
      catch (error) { restoring.delete(context.view_id); throw error; }
      void restore(context, position);
    };
    prototype.getState = function () {
      const context = context_for(this.leaf);
      const position = capture(context) ?? this.leaf.state.linux_note_position as reading_position | undefined;
      if (position) remember(context, position);
      return position ? { scrollTop: position.scroll_top, linux_note_position: position } : {};
    };
    prototype.setState = function (state) {
      const context = context_for(this.leaf);
      if (held_paths.has(file_key(context.file_path))) return;
      const position = state.linux_note_position as reading_position | undefined
        ?? saved.get(context.view_id) ?? store?.get(context.file_path)
        ?? (typeof state.scrollTop === "number" ? { scroll_top: state.scrollTop, scroll_left: 0 } : null);
      if (position) void restore(context, position);
    };
    return true;
  };
  for (const context of all()) {
    if (context.leaf) patch_view(context.leaf.view);
    const position = store?.get(context.file_path);
    if (position) void restore(context, position);
  }
  // 从空白欢迎页启动时尚无 MarkdownView，首个文档出现后再接入同一套状态接口。
  app?.workspace.rootSplit.on("leaf:open", (leaf) => {
    if (typeof leaf.view?.isEditor !== "function" || !patch_view(leaf.view)) return;
    const context = context_for(leaf);
    const position = store?.get(context.file_path);
    if (position && !held_paths.has(file_key(context.file_path))) void restore(context, position);
  });
  document.addEventListener("scroll", (event) => {
    const context = all().find((candidate) => elements(candidate)?.scroller === event.target);
    if (!context || restoring.has(context.view_id) || held_paths.has(file_key(context.file_path))) return;
    const position = capture(context);
    if (position) remember(context, position);
  }, true);
  for (const name of ["wheel", "touchstart", "pointerdown", "keydown"]) {
    window.addEventListener(name, (event) => {
      if (!event.isTrusted) return;
      // 只取消发生输入的栏；切换到另一栏不能取消来源预览的恢复。
      const target = event.target;
      for (const context of all()) {
        const nodes = elements(context);
        if (nodes && target instanceof Node && nodes.scroller.contains(target)) stop_restoring(context);
      }
    }, true);
  }
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  return { all, active, elements, capture, checkpoint, remember, restore, stop_restoring,
    remap_paths(map: (path: string) => string | undefined) {
      flush(); store?.remap_paths(map);
      for (const [key, context] of [...native_contexts]) {
        const target = map(context.file_path); if (!target) continue;
        native_contexts.delete(key); context.file_path = target; native_contexts.set(file_key(target), context);
      }
    },
    hold(path: string, value: boolean) {
      if (value) held_paths.add(file_key(path)); else held_paths.delete(file_key(path));
    },
    resume(context: reading_context) {
      const position = saved.get(context.view_id) ?? store?.get(context.file_path);
      return position ? restore(context, position) : Promise.resolve(true);
    },
  };
}
