import {workspace_text} from "./workspace_i18n";
import {remote_files_for,assert_remote_owner} from './remote_workspace_files';
import {bind_reading_native_scroll} from "./reading_native_scroll";
import { create_reading_history, type reading_location } from "./reading_history";
import { file_key, parse_markdown_file_target, resolve_host_open_file_target, resolve_workspace_file } from "./workspace_file_uri";
import { create_reading_workspace, reading_delay, type reading_context } from "./reading_workspace";
import { get_workspace_app } from "./workspace_bootstrap";
import { capture_markdown_location, reveal_markdown_location } from "./workspace_markdown_location";
import type { file_location } from "./workspace_files";
import {navigation_editor, observe_navigation_selection} from "./reading_navigation_ports";

// Typora 1.14.9 appsrc/window/frame.js: modules 5e ClientCommand and 66 megaMenu, editor.stylize, and searchPanel; window.html data-insert defines block types. Reuse only verified call behavior. The native Menu tree was not obtained; this does not claim complete parity with its entries or state.
type typora_editor = {
  tryOpenUrl(url: string, ...args: unknown[]): unknown;
  tryOpenUrl_?(url: string, ...args: unknown[]): unknown;
  library: { openFile(path: string, callback?: () => void): unknown };
  selection: { buildUndo(): Record<string, unknown> | null };
  undo: { exeCommand(cursor: Record<string, unknown>): void };
  sourceView?: { inSourceMode: boolean };
};
type typora_file_state = {
  bundle?: { filePath?: string; unsupported?: unknown };
  editor?: typora_editor;
  _onInitParse?: boolean;
  _onFileSwitching?: boolean;
  changeCounter?: {isDocumentEdited(): boolean};
  reloadFromDisk?(): Promise<unknown>;
};

let active_dispose: (() => void) | undefined;
type reading_target_options = { locate?: (signal?: AbortSignal) => Promise<void>; group?: string; hash?: string; signal?: AbortSignal };
let navigate_target: ((path: string, options: reading_target_options) => Promise<boolean>) | undefined;
let remap_paths: ((map: (path: string) => string | undefined) => void) | undefined;
export function rename_reading_paths(map: (path: string) => string | undefined): void { remap_paths?.(map); }

/** The positioning must be included in the same transaction as opening, position protection, and reading history. */
export async function navigate_reading_target(path: string, options: reading_target_options = {}): Promise<void> {
  if (options.signal?.aborted) throw new Error(workspace_text("reading_navigation_file_jump_has_been_canceled"));
  if (!navigate_target || !await navigate_target(path, options)) throw new Error(options.signal?.aborted ? workspace_text("reading_navigation_file_jump_has_been_canceled") : workspace_text("reading_navigation_cannot_switch_to_target_markdown_please_process_file_open_or"));
}

export function bind_reading_navigation(): () => void {
  if (active_dispose) return active_dispose;
  const file = (window as unknown as { File?: typora_file_state }).File;
  const editor = file?.editor;
  if (!file || !editor || typeof editor.tryOpenUrl !== "function"
      || typeof editor.library?.openFile !== "function" || typeof editor.selection?.buildUndo !== "function") return () => {};
  let disposed = false;
  const controller = new AbortController();
  let context_controller=new AbortController();
  const cleanups: (() => void)[] = [];
  const collect = (value: unknown) => { if (typeof value === "function") cleanups.push(value as () => void); };
  const attrs = ["data-linux-note-reading-navigation", "data-linux-note-reading-positions", "data-linux-note-history-back", "data-linux-note-history-forward"];
  const previous_attrs = attrs.map(name => document.documentElement.getAttribute(name));
  const app = get_workspace_app();
  const stop_native_scroll = bind_reading_native_scroll(editor,window);
  const runtime = window as unknown as { reqnode(name: string): {
    isAbsolute(path: string): boolean; resolve(...parts: string[]): string; dirname(path: string): string; normalize(path: string): string;
  } };
  const path_api = app ? runtime.reqnode("path") : undefined;
  const history = create_reading_history();
  type travel_request = {direction: -1 | 1; resolve(result: boolean): void};
  let travel_queue: travel_request[] = [];
  const cancel_travel_queue = () => {
    const previous = travel_queue; travel_queue = [];
    for (const request of previous) request.resolve(false);
  };
  const publish_history_state = () => {
    if (disposed) return;
    const offset = travel_queue.reduce((sum, request) => sum + request.direction, 0);
    const detail = { back: history.can_travel(-1, offset), forward: history.can_travel(1, offset) };
    document.documentElement.dataset.linuxNoteHistoryBack = String(detail.back);
    document.documentElement.dataset.linuxNoteHistoryForward = String(detail.forward);
    window.dispatchEvent(new CustomEvent("linux-note-reading-history-state", { detail }));
  };
  // Continue to use the entry selection already verified by the core; when there are internal methods, clicking may bypass the outer layer.
  const url_method = typeof editor.tryOpenUrl_ === "function" ? "tryOpenUrl_" : "tryOpenUrl";
  const original_open_url = editor[url_method]!;
  const original_open_file = editor.library.openFile;
  const native_path = () => file.bundle?.filePath ?? "";
  const is_busy = () => Boolean(file._onInitParse || file._onFileSwitching);
  const workspace = create_reading_workspace(native_path, is_busy);
  let navigating = false;
  let pending_from: reading_location | null = null;
  let pending_timer = 0;
  let selection_timer = 0;
  let restoring_focus = false;
  let document_interaction = true;
  let last_location: reading_location | null = null;
  const owned_remap_paths = remap_paths = map => {
    if (disposed) return;
    history.remap_paths(map); workspace.remap_paths(map);
    if (pending_from) pending_from.file_path = map(pending_from.file_path) ?? pending_from.file_path;
    if (last_location) last_location.file_path = map(last_location.file_path) ?? last_location.file_path;
  };
  const capture = (context = workspace.active()): reading_location | null => {
    const source = navigation_editor()?.capture();
    if (source) return source;
    if (app?.workspace.activeLeaf && typeof app.workspace.activeLeaf.view?.isEditor !== "function") return null;
    if (disposed || !context?.file_path || file.bundle?.unsupported || editor.sourceView?.inSourceMode) return null;
    const position = workspace.capture(context);
    if (!position) return null;
    let cursor = null;
    if ((!context.leaf || context.leaf.view.isEditor()) && file_key(context.file_path) === file_key(native_path())) {
      try {
        const candidate = editor.selection.buildUndo();
        if (candidate?.type === "cursor") {
          cursor = JSON.parse(JSON.stringify(candidate));
          const source_location = capture_markdown_location();
          if (source_location) cursor.linux_note_source_location = source_location;
        }
      } catch { /* Even when there is no selected text in the document, the reading position is still saved. */ }
    }
    return { file_path: context.file_path, ...position, position, cursor, view_id: context.view_id };
  };
  // The function bar can change the host's cache selection area; when leaving the document, it only uses the last confirmed position by the document event.
  const capture_departure = () => {
    const current = capture();
    return !document_interaction && current && last_location && current.file_path === last_location.file_path
      && current.kind === last_location.kind && current.view_id === last_location.view_id ? last_location : current;
  };
  const finish_pending = () => {
    window.clearTimeout(pending_timer);
    if (disposed) return;
    const current = capture();
    if (pending_from && current && !is_busy() && !navigating) { history.record_jump(pending_from, current); last_location = current; publish_history_state(); }
    pending_from = null;
  };
  const wait_for = async (ready: () => boolean, signal = controller.signal): Promise<boolean> => {
    const started = Date.now();
    if (disposed || signal.aborted) return false;
    while (!ready()) {
      if (disposed || signal.aborted || Date.now() - started > 15000) return false;
      await reading_delay(40, signal);
    }
    return !disposed && !signal.aborted;
  };
  const activate = async (context: reading_context, signal = controller.signal): Promise<boolean> => {
    if (disposed || signal.aborted) return false;
    const leaf = context.leaf;
    if (app && leaf) {
      if (leaf.parent.activeLeaf !== leaf) leaf.parent.toggleTab(leaf.state.path);
      app.workspace.activeLeaf = leaf;
      if (!await wait_for(() => Boolean(workspace.elements(context)), signal)) return false;
      if (disposed || signal.aborted) return false;
      if (!leaf.view.isEditor()) {
        // Reuse the community core's editor swap and native unsaved confirmation; after the target takes over, the directory also belongs to the target file.
        leaf.view.containerEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }
    }
    return wait_for(() => !is_busy() && file_key(native_path()) === file_key(context.file_path)
      && (!leaf || leaf.view.isEditor()) && Boolean(workspace.elements(context)), signal);
  };
  const open_target = async (path: string, view_id?: number, signal = controller.signal): Promise<reading_context | undefined> => {
    if (disposed || signal.aborted) return;
    const existing = workspace.all().find((context) => (view_id == null || context.view_id === view_id)
      && file_key(context.file_path) === file_key(path));
    if (existing) return await activate(existing, signal) ? existing : undefined;
    const current = workspace.active();
    if (current && file_key(current.file_path) === file_key(path)) return await activate(current, signal) ? current : undefined;
    // Keep the host's failed opening and unsaved confirmation; never switch through reading the document content, reloadContent, or automatic saving.
    if (disposed || signal.aborted) return;
    // The last closed document may still be cached by the host; the same openFile path will skip disk reading.
    // Only refresh the cache without leaves and without drafts, and cannot overwrite documents still open in other editing groups.
    if (app && file_key(native_path()) === file_key(path)) {
      if (file.changeCounter?.isDocumentEdited()) throw new Error(workspace_text("reading_navigation_the_host_has_unsaved_modifications_please_process_the_draft"));
      if (typeof file.reloadFromDisk !== "function") throw new Error(workspace_text("reading_navigation_the_host_does_not_provide_a_document_reload_interface_so_it"));
      await file.reloadFromDisk();
      if (disposed || signal.aborted || file_key(native_path()) !== file_key(path)) return;
    }
    original_open_file.call(editor.library, path);
    let target: reading_context | undefined;
    if (!await wait_for(() => {
      target = workspace.active();
      return Boolean(target && file_key(target.file_path) === file_key(path) && workspace.elements(target));
    }, signal)) return;
    return target && await activate(target, signal) ? target : undefined;
  };
  const report = (error: unknown) => { if (!disposed) console.error("[linux-note reading navigation]", error); };
  const navigate = async (path: string, hash?: string, location?: reading_location, options: reading_target_options = {}): Promise<boolean> => {
    const signal = options.signal ?? controller.signal;
    if (disposed || navigating || signal.aborted) return false;
    // Pre-check remote materialized await, must occupy the navigation transaction before the first wait, to avoid continuous clicks entering the host at the same time.
    finish_pending();navigating=true;
    let held_path:string|undefined;
    try {
    const source = workspace.active()?.file_path || native_path();
    if (path_api) {
      const target = resolve_host_open_file_target(path_api, source, path);
      const resolved = resolve_workspace_file(path_api, source ? path_api.dirname(source) : "", target);
      if (!resolved) throw new Error(workspace_text("reading_navigation_cannot_parse_the_target_markdown_path"));
      path = resolved;
      // Remote target is materialized first; network failure cannot clear the native editing area first.
      assert_remote_owner(path);await remote_files_for(path)?.prepare(path,false,()=>!disposed&&!signal.aborted);
      // When the host receives a non-existent file, it will first clear the editing area, so it must reject before any state switch.
      const fs = (runtime as unknown as {reqnode(name: string): {statSync(path: string): {isFile(): boolean}}}).reqnode("fs");
      if (!fs.statSync(path).isFile()) throw new Error(workspace_text("reading_navigation_the_target_is_not_a_regular_file"));
    }
    if (disposed || signal.aborted) return false;
    const from = capture_departure() ?? last_location;
    workspace.checkpoint();
    workspace.stop_restoring();
    active_native_markdown_editor()?.show_rendered_for_navigation();
    workspace.hold(path, true);
    held_path=path;
      let target: reading_context | undefined;
      if (app && options.group && options.group !== "active") {
        if (disposed || signal.aborted) return false;
        app.commands.run(options.group === "down" ? "core.workspace:split-down" : "core.workspace:split-right", [path]);
        const opened = await wait_for(() => {
          target = workspace.active();
          return Boolean(target && file_key(target.file_path) === file_key(path) && workspace.elements(target));
        }, signal);
        if (!opened || !target || !await activate(target, signal)) target = undefined;
      } else target = await open_target(path, location?.view_id, signal);
      if (disposed || signal.aborted || !target) return false;
      // The historical target is ready, immediately position; the late layout is continued to be corrected by the position service. Normal opening retains the original completion contract.
      if (!location) await reading_delay(100, signal);
      if (disposed || signal.aborted) return false;
      workspace.stop_restoring(target);
      const restore_position = async (position?: reading_location["position"]) => {
        if (location && position) { await workspace.restore(target!, position, {background: true, signal}); return; }
        const stop = () => workspace.stop_restoring(target);
        signal.addEventListener("abort", stop, {once: true});
        try { if (!signal.aborted) await (position ? workspace.restore(target!, position) : workspace.resume(target!)); }
        finally { signal.removeEventListener("abort", stop); }
      };
      if (options.locate) {
        await options.locate(signal);
        if (disposed || signal.aborted) return false;
      } else if (hash) {
        original_open_url.call(editor, hash);
        await reading_delay(100, signal);
        if (disposed || signal.aborted) return false;
        const heading = window.getSelection()?.focusNode?.parentElement?.closest("h1,h2,h3,h4,h5,h6");
        const cid = heading?.getAttribute("cid");
        // The native directory has been updated according to the target file; only scroll the container of the directory itself, not the source document.
        if (cid) {
          const item = Array.from(document.querySelectorAll<HTMLElement>("#outline-content .outline-label"))
            .find((node) => node.getAttribute("data-ref") === cid);
          if (item) {
            for (let parent = item.parentElement; parent?.closest("#outline-content"); parent = parent.parentElement) {
              if (parent.classList.contains("outline-item-wrapper")) parent.classList.add("outline-item-open");
            }
            item.scrollIntoView({ block: "nearest" });
          }
        }
      } else if (location) {
        // The cid is only used for the native history of the current window; persistent position does not save it; the last recovery of scrolling avoids pulling the viewport.
        try {
          if (location.cursor?.linux_note_source_location) await reveal_markdown_location(location.cursor.linux_note_source_location as file_location, signal);
          else if (location.cursor) editor.undo?.exeCommand(location.cursor);
        } catch { /* Changes or failure of the document do not prevent the recovery of the reading position. */ }
        if (disposed || signal.aborted) return false;
        await restore_position(location.position ?? location);
      } else await restore_position();
      if (disposed || signal.aborted) return false;
      const to = capture(target);
      if (to) {
        workspace.remember(target, to.position!);
        if (from && !location) { history.record_jump(from, to); publish_history_state(); }
        last_location = to;
      }
      return true;
    } finally {
      if(held_path)workspace.hold(held_path, false);
      navigating = false;
    }
  };
  const owned_navigate_target = navigate_target = async (path, options) => {
    // Accept both single-time transfer cancellation and reading module unloading at the same time; queue items cannot be opened again after the previous navigation ends.
    const operation = new AbortController();
    const abort = () => operation.abort();
    const signals = [controller.signal, context_controller.signal, options.signal].filter((signal): signal is AbortSignal => Boolean(signal));
    for (const signal of signals) { if (signal.aborted) abort(); else signal.addEventListener("abort", abort, {once: true}); }
    try {
      if (disposed || operation.signal.aborted) return false;
      // The cursor is first in position while the historical scrolling is still stable; the next explicit opening should wait for the transaction to end, and cannot lose the user's double-click.
      const started = Date.now();
      while (navigating || history.is_navigating() || travel_queue.length) {
        if (disposed || operation.signal.aborted || Date.now() - started > 15000) return false;
        await reading_delay(40, operation.signal);
      }
      if (disposed || operation.signal.aborted) return false;
      return await navigate(path, options.hash, undefined, {...options, signal: operation.signal});
    } finally {
      for (const signal of signals) signal.removeEventListener("abort", abort);
    }
  };
  const drain_travel_queue = async (queue: travel_request[], signal: AbortSignal) => {
    try {
      while (queue === travel_queue && queue.length && !disposed && !signal.aborted) {
        if (!await wait_for(() => !navigating && !history.is_navigating() && !is_busy(), signal)) break;
        finish_pending();
        workspace.stop_restoring();
        const result = await history.travel(queue[0].direction, capture_departure(), async location => {
          const restored = location.kind != null
            ? await navigation_editor().restore(location, signal)
            : await navigate(location.file_path, undefined, location, {signal});
          return restored && !disposed && !signal.aborted ? capture() ?? false : false;
        });
        if (queue !== travel_queue || disposed || signal.aborted) break;
        queue.shift()!.resolve(result);
        if (!result) break;
        last_location = capture();
        publish_history_state();
      }
    } catch (error) { report(error); }
    finally {
      // After failure or switching database, do not replay the remaining directions, and the old transaction cannot clear the new project's queue.
      if (queue === travel_queue) cancel_travel_queue();
      publish_history_state();
    }
  };
  const travel_history = (direction: -1 | 1): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    if (!navigating && !history.is_navigating() && !is_busy()) finish_pending();
    const offset = travel_queue.reduce((sum, request) => sum + request.direction, 0);
    if ((travel_queue.length || (!navigating && !is_busy())) && !history.can_travel(direction, offset)) return Promise.resolve(false);
    const first = travel_queue.length === 0;
    const result = new Promise<boolean>(resolve => travel_queue.push({direction, resolve}));
    publish_history_state();
    if (first) void drain_travel_queue(travel_queue, context_controller.signal);
    return result;
  };

  const owned_open_url = editor[url_method] = function (url: string, ...args: unknown[]) {
    if (disposed) return original_open_url.call(this, url, ...args);
    const local_url = url.trim().replace(/^<|>$/gu, "");
    if (navigating) return;
    if (editor.sourceView?.inSourceMode || (!/^[a-z]:[\\/]/iu.test(local_url) && /^(?!file:)[a-z][a-z0-9+.-]*:/iu.test(local_url))) {
      // External program round trips may clear and rebuild the native selection area; it is not a new positioning within the document content.
      restoring_focus = true; document_interaction = false; clearTimeout(selection_timer);
      return original_open_url.call(this, url, ...args);
    }
    if (local_url.startsWith("#")) {
      const context = workspace.active();
      if (context) void owned_navigate_target(context.file_path, {hash: local_url}).catch(report);
      return;
    }
    const markdown_target = parse_markdown_file_target(local_url);
    if (!app && markdown_target) {
      let path = markdown_target.file_path;
      // DOM link encoding is decoded only once at URL boundary; file: continues to be decoded by the common URI parser.
      if (!/^file:/iu.test(path)) { try { path = decodeURIComponent(path); } catch { /* Retain the native valid literal percent signs. */ } }
      void owned_navigate_target(path, {hash: markdown_target.hash}).catch(report);
      return;
    }
    return original_open_url.call(this, url, ...args);
  };
  const owned_open_file = editor.library.openFile = function (path, callback) {
    if (disposed) return original_open_file.call(this, path, callback);
    if (navigating || callback || editor.sourceView?.inSourceMode) return original_open_file.call(this, path, callback);
    const parsed = parse_markdown_file_target(path);
    if (!parsed?.hash) { void owned_navigate_target(path, {}).catch(report); return; }
    const source = workspace.active()?.file_path;
    const target = path_api && source ? resolve_workspace_file(path_api, path_api.dirname(source), parsed.file_path) : parsed.file_path;
    void owned_navigate_target(target ?? parsed.file_path, {hash: parsed.hash}).catch(report);
  };
  if (app) {
    // Replace the fixed openFile ms global anchor timer for the core 500: file, panel, title as a single operation is fulfilled.
    const original_workspace_open_file = app.workspace.activeEditor.openFile;
    const owned_workspace_open_file = app.workspace.activeEditor.openFile = (target) => {
      if (disposed) return original_workspace_open_file.call(app.workspace.activeEditor, target);
      if (editor.sourceView?.inSourceMode) return original_workspace_open_file.call(app.workspace.activeEditor, target);
      const url = typeof target === "string" ? { pathname: target } : target;
      void owned_navigate_target(url.pathname, {hash: url.hash}).catch(report);
    };
    const original_app_open_file = app.openFile;
    const owned_app_open_file = app.openFile = function (path) {
      if (disposed) return original_app_open_file.call(this, path);
      const source = workspace.active()?.file_path;
      return original_app_open_file.call(this, resolve_host_open_file_target(path_api!, source ?? "", path));
    };
    cleanups.push(() => {
      if (app.openFile === owned_app_open_file) app.openFile = original_app_open_file;
      if (app.workspace.activeEditor.openFile === owned_workspace_open_file) app.workspace.activeEditor.openFile = original_workspace_open_file;
    });
    // Tag switching through the core saved openFile$original, events are used to complete this path.
    collect(app.workspace.on("file:will-open", () => {
      if (disposed) return;
      workspace.checkpoint();
      if (navigating || history.is_navigating() || pending_from) return;
      pending_from = capture_departure() ?? last_location;
    }));
    collect(app.workspace.on("file:open", () => {
      if (disposed) return;
      if (navigating || history.is_navigating()) return;
      window.clearTimeout(pending_timer);
      pending_timer = window.setTimeout(finish_pending, 500);
    }));
  }
  const record_selection = (explicit = false, editor_change_only = false) => {
    if (disposed || navigating || history.is_navigating() || is_busy() || pending_from) return;
    const current = capture();
    if (!current) return;
    // Focus/layout notifications for the same editor are not equal to the new document selection; explicit localization is still submitted by the domain entry.
    if ((editor_change_only || (!explicit && !document_interaction)) && history.is_current_editor(current)) return;
    if (!(restoring_focus && !explicit && history.checkpoint(current))) history.record_selection(current, explicit);
    last_location = current; publish_history_state();
  };
  collect(observe_navigation_selection(record_selection));
  const schedule_selection = (editor_change_only = false) => {
    clearTimeout(selection_timer);
    selection_timer = window.setTimeout(() => record_selection(false, editor_change_only), 100);
  };
  const is_document_event = (event: Event) => {
    const path = event.composedPath().filter((node): node is Element => node instanceof Element);
    return !path.some(node => node.matches('.workspace-link-preview, button, input, select, [role="toolbar"], .find-widget'))
      && path.some(node => node.matches('#write, #typora-source, .linux-note-source-file, .git-graph-document'));
  };
  const leave_document = (capture_before_blur = false) => {
    // Only cache the real document position before losing focus, do not submit history; when leaving actually later, you can keep the reading position just rolled to.
    if (capture_before_blur && document_interaction && !navigating && !history.is_navigating() && !is_busy() && !pending_from) {
      const current = capture();
      if (current && history.is_current_editor(current)) last_location = current;
    }
    document_interaction = false; clearTimeout(selection_timer);
  };
  // Update the source's scroll position before clicking; localization is submitted by the corresponding entry, the wheel itself does not add new records.
  document.addEventListener("pointerdown", event => {
    if (!is_document_event(event)) { leave_document(true); return; }
    document_interaction = true;
    if (disposed || navigating || history.is_navigating() || is_busy() || pending_from) return;
    const current = capture();
    if (current) { history.checkpoint(current); last_location = current; }
    if (event.target instanceof Element && event.target.closest("#write, #typora-source, .linux-note-source-file, .git-graph-document") && !((event.ctrlKey || event.metaKey) && event.target.closest("a"))) restoring_focus = false;
  }, {capture: true, signal: controller.signal});
  document.addEventListener("selectionchange", () => {
    if (window.getSelection()?.anchorNode?.getRootNode()===document && window.getSelection()?.anchorNode?.parentElement?.closest("#write")) schedule_selection();
  }, {signal: controller.signal});
  if (app) collect(app.workspace.on("active-leaf:change", () => record_selection(false, true)));
  schedule_selection();
  document.addEventListener("focusin", event => { if (!is_document_event(event)) leave_document(); }, {capture: true, signal: controller.signal});
  document.addEventListener("beforeinput", event => { if (is_document_event(event)) { document_interaction = true; restoring_focus = false; } }, {capture: true, signal: controller.signal});
  window.addEventListener("blur", () => { restoring_focus = true; leave_document(); }, {signal: controller.signal});
  window.addEventListener("keydown", (event) => {
    if (!event.altKey && !["Control", "Shift", "Meta", "Tab"].includes(event.key) && is_document_event(event)) { document_interaction = true; restoring_focus = false; }
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing
        || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const active = document.activeElement;
    if(event.composedPath().some(node=>node instanceof Element&&node.matches(".workspace-link-preview")))return;
    if (document.querySelector('.reading-media-viewer, .modal.in, [role="dialog"][aria-modal="true"]')
        || (active instanceof Element && active.matches("input, textarea, [contenteditable='true']") && !active.closest("#write, #typora-source, .linux-note-source-file, .git-graph-document"))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void travel_history(event.key === "ArrowLeft" ? -1 : 1).catch(report);
  }, { capture: true, signal: controller.signal });
  window.addEventListener("linux-note-reading-history-travel", event => {
    const direction = (event as CustomEvent<{ direction?: number }>).detail?.direction;
    if (direction === -1 || direction === 1) void travel_history(direction).catch(report);
  }, { signal: controller.signal });
  publish_history_state();
  document.documentElement.setAttribute("data-linux-note-reading-navigation", "ready");
  document.documentElement.setAttribute("data-linux-note-reading-positions", "ready");
  const dispose = () => {
    if (disposed) return;
    disposed = true; controller.abort(); context_controller.abort(); cancel_travel_queue(); clearTimeout(pending_timer); clearTimeout(selection_timer); pending_from = null; last_location = null;
    workspace.dispose(); stop_native_scroll();
    for (const cleanup of cleanups.reverse()) cleanup();
    if (editor[url_method] === owned_open_url) editor[url_method] = original_open_url;
    if (editor.library.openFile === owned_open_file) editor.library.openFile = original_open_file;
    if (navigate_target === owned_navigate_target) navigate_target = undefined;
    if (remap_paths === owned_remap_paths) remap_paths = undefined;
    attrs.forEach((name, index) => { const previous = previous_attrs[index]; if (previous === null) document.documentElement.removeAttribute(name); else document.documentElement.setAttribute(name, previous); });
    if (active_dispose === dispose) active_dispose = undefined;
  };
  active_dispose = dispose;
  window.addEventListener("linux-note-workspace-context-changed",()=>{
    context_controller.abort();context_controller=new AbortController();cancel_travel_queue();clearTimeout(pending_timer);clearTimeout(selection_timer);pending_from=null;last_location=null;restoring_focus=false;history.clear();publish_history_state();
  },{signal:controller.signal});
  return dispose;
}
import {active_native_markdown_editor} from './native_markdown_editor';
