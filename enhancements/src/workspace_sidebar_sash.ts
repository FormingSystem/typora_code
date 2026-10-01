import {workspace_text} from "./workspace_i18n";
import {acquire_workspace_style} from "./workspace_styles";
import sidebar_sash_css from "./workspace_sidebar_sash.css";

// VS Code SidebarPart.minimumWidth=170、snap=true；SplitView uses half the width of the narrowest as the collapse threshold.
// The EditorPane's DEFAULT_EDITOR_MIN_DIMENSIONS.width=220. The width is both CSS pixels, excluding the active bar.
// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/parts/sidebar/sidebarPart.ts
// https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/splitview/splitview.ts
// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/parts/editor/editor.ts
export const SIDEBAR_MIN_WIDTH = 170;
export const SIDEBAR_SNAP_WIDTH = Math.floor(SIDEBAR_MIN_WIDTH / 2);
export const EDITOR_MIN_WIDTH = 220;

type sidebar_host = { isShown: boolean; show(): void; hide(): void };
type sidebar_sash_options = { sidebar: sidebar_host; save_width(width: number): void };
type sidebar_sash_binding = { element: HTMLElement; set_width(width:number):void; refresh(): void; dispose(): void };
const bindings = new WeakMap<HTMLElement, sidebar_sash_binding>();

/** Replace the native separator line's drag shadow behavior; continue through the community core switch panel, maintaining consistent lifecycle for all panels. */
export function install_workspace_sidebar_sash(options: sidebar_sash_options): sidebar_sash_binding | undefined {
  const sash = document.querySelector<HTMLElement>("#typora-sidebar-resizer");
  const sidebar_element = document.querySelector<HTMLElement>("#typora-sidebar");
  const ribbon = document.querySelector<HTMLElement>(".typ-ribbon");
  if (!sash || !sidebar_element || !ribbon) return;
  const existing = bindings.get(sash); if (existing) return existing;
  const root = document.documentElement;
  const style = acquire_workspace_style("typora-code-style:workspace_sidebar_sash", sidebar_sash_css, {});
  const attributes = ["role", "aria-hidden", "aria-label", "aria-orientation", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext", "tabindex", "title"];
  const original_attributes = new Map(attributes.map(name => [name, sash.getAttribute(name)]));
  const original_left = sash.style.getPropertyValue("--linux-note-sidebar-sash-left");
  const original_left_priority = sash.style.getPropertyPriority("--linux-note-sidebar-sash-left");
  const read_width = () => Number.parseFloat(getComputedStyle(root).getPropertyValue("--sidebar-width")) || sidebar_element.getBoundingClientRect().width || SIDEBAR_MIN_WIDTH;
  let preferred_width = Math.max(SIDEBAR_MIN_WIDTH, Math.round(read_width()));
  let disposed = false, frame = 0;
  let pending_x: number | undefined;
  let current_width = preferred_width;
  let drag: { pointer_id: number; start_x: number; start_width: number; saved_width: number } | undefined;
  const activity_width = () => ribbon.getBoundingClientRect().width;
  const available_width = () => Math.max(0, root.clientWidth - activity_width() - (Number.parseFloat(getComputedStyle(document.body).getPropertyValue("--typ-sidedock-width")) || 0) - EDITOR_MIN_WIDTH);
  const clamp_width = (width: number, available = available_width()) => Math.round(Math.max(SIDEBAR_MIN_WIDTH, Math.min(available, width)));
  const sync_sash = (activity = activity_width(), available = available_width()) => {
    const width = options.sidebar.isShown ? current_width : 0;
    const left = `${activity + width}px`;
    if (sash.style.getPropertyValue("--linux-note-sidebar-sash-left") !== left) sash.style.setProperty("--linux-note-sidebar-sash-left", left);
    const values = {"aria-valuenow": String(Math.round(width)), "aria-valuemax": String(Math.max(SIDEBAR_MIN_WIDTH, Math.floor(available))),
      "aria-valuetext": width ? workspace_text("sidebar_sash_sidebar_width_pixels", {value_0: String(Math.round(width))}) : workspace_text("sidebar_sash_sidebar_is_collapsed_press_enter_or_click_the_right_arrow_to")};
    for (const [name, value] of Object.entries(values)) if (sash.getAttribute(name) !== value) sash.setAttribute(name, value);
  };
  const apply_width = (width: number) => {
    current_width = Math.round(width);
    const value = `${current_width}px`;
    // Container observers own editor layout. A pane resize is not a window resize.
    if (root.style.getPropertyValue("--sidebar-width") !== value) root.style.setProperty("--sidebar-width", value);
  };
  const set_visible = (visible: boolean) => {
    if (options.sidebar.isShown === visible) return;
    if (visible) options.sidebar.show(); else options.sidebar.hide();
    // Native show/hide registers a one-time transitionend cleanup; the waiting period must also end when the drag is closed immediately.
    if (drag) sidebar_element.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "left" }));

  };
  const persist = () => { try { options.save_width(preferred_width); } catch (error) { console.warn(workspace_text("sidebar_sash_failed_to_save_sidebar_width"), error); } };
  const refresh = () => {
    if (disposed) return;
    const activity = activity_width(), available = available_width();
    if (options.sidebar.isShown) {
      if (available < SIDEBAR_MIN_WIDTH) { set_visible(false); apply_width(preferred_width); }
      else if (!drag) apply_width(clamp_width(preferred_width, available));
    }
    sync_sash(activity, available);
  };
  const finish = () => {
    if (!drag) return;
    flush_drag();
    const previous = drag; drag = undefined;
    if (options.sidebar.isShown) { preferred_width = current_width; persist(); }
    else { preferred_width = previous.saved_width; apply_width(preferred_width); }
    document.body.classList.remove("linux-note-sidebar-dragging");
    if (sash.hasPointerCapture(previous.pointer_id)) sash.releasePointerCapture(previous.pointer_id);
    sync_sash();
  };
  const pointer_down = (event: PointerEvent) => {
    if (event.button !== 0 || drag) return;
    event.preventDefault(); event.stopImmediatePropagation();
    sash.focus({ preventScroll: true });
    drag = { pointer_id: event.pointerId, start_x: event.clientX, start_width: options.sidebar.isShown ? read_width() : 0, saved_width: preferred_width };
    sash.setPointerCapture(event.pointerId); document.body.classList.add("linux-note-sidebar-dragging");
  };
  const pointer_move = (event: PointerEvent) => {
    if (!drag || drag.pointer_id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    pending_x = event.clientX;
    if (!frame) frame = requestAnimationFrame(flush_drag);
  };
  const flush_drag = () => {
    cancelAnimationFrame(frame); frame = 0;
    if (!drag || pending_x === undefined) return;
    const activity = activity_width(), available = available_width();
    const width = drag.start_width + pending_x - drag.start_x; pending_x = undefined;
    if (width < SIDEBAR_SNAP_WIDTH || available < SIDEBAR_MIN_WIDTH) { set_visible(false); apply_width(drag.saved_width); }
    else { apply_width(clamp_width(width, available)); set_visible(true); }
    sync_sash(activity, available);
  };
  const pointer_finish = (event: PointerEvent) => { if (drag?.pointer_id === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); finish(); } };
  const suppress_native_mouse = (event: MouseEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const keydown = (event: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === "Enter" && options.sidebar.isShown) { set_visible(false); apply_width(preferred_width); sync_sash(); return; }
    if (available_width() < SIDEBAR_MIN_WIDTH) return;
    if (!options.sidebar.isShown) { apply_width(clamp_width(preferred_width)); set_visible(true); sync_sash(); return; }
    const width = event.key === "Home" ? SIDEBAR_MIN_WIDTH : event.key === "End" ? available_width() : read_width() + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0) * (event.shiftKey ? 50 : 10);
    preferred_width = clamp_width(width); apply_width(preferred_width); sync_sash(); persist();
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
  const resize_observer = new ResizeObserver(refresh); resize_observer.observe(root); resize_observer.observe(ribbon);
  sash.dataset.workspaceSidebarSash = "ready"; sash.tabIndex = 0;
  sash.removeAttribute("aria-hidden"); sash.setAttribute("role", "separator"); sash.setAttribute("aria-orientation", "vertical"); sash.setAttribute("aria-valuemin", "0");
  sash.title = workspace_text("sidebar_sash_adjust_the_main_sidebar_width_drag_it_to_85_pixels_or_less_t"); sash.setAttribute("aria-label", workspace_text("sidebar_sash_adjust_main_sidebar_width"));
  sash.addEventListener("pointerdown", pointer_down, true); document.addEventListener("pointermove", pointer_move, true);
  for (const name of ["pointerup", "pointercancel"]) document.addEventListener(name, pointer_finish as EventListener, true);
  sash.addEventListener("lostpointercapture", pointer_finish, true);
  for (const name of ["mousedown", "mousemove", "mouseup"]) sash.addEventListener(name, suppress_native_mouse as EventListener, true);
  sash.addEventListener("keydown", keydown, true); window.addEventListener("resize", refresh); window.addEventListener("blur", finish);
  const dispose = () => {
    if (disposed) return; finish(); disposed = true; observer.disconnect(); resize_observer.disconnect(); cancelAnimationFrame(frame);
    sash.removeEventListener("pointerdown", pointer_down, true); document.removeEventListener("pointermove", pointer_move, true);
    for (const name of ["pointerup", "pointercancel"]) document.removeEventListener(name, pointer_finish as EventListener, true);
    sash.removeEventListener("lostpointercapture", pointer_finish, true);
    for (const name of ["mousedown", "mousemove", "mouseup"]) sash.removeEventListener(name, suppress_native_mouse as EventListener, true);
    sash.removeEventListener("keydown", keydown, true); window.removeEventListener("resize", refresh); window.removeEventListener("blur", finish); window.removeEventListener("pagehide", dispose);
    for (const [name, value] of original_attributes) { if (value === null) sash.removeAttribute(name); else sash.setAttribute(name, value); }
    delete sash.dataset.workspaceSidebarSash;
    if (original_left) sash.style.setProperty("--linux-note-sidebar-sash-left", original_left, original_left_priority); else sash.style.removeProperty("--linux-note-sidebar-sash-left");
    style.remove(); bindings.delete(sash);
  };
  const binding = { element: sash, set_width(width:number){preferred_width=clamp_width(width);apply_width(preferred_width);sync_sash();persist();}, refresh, dispose }; bindings.set(sash, binding); window.addEventListener("pagehide", dispose, { once: true }); refresh(); return binding;
}

/** The preview drag within the same column reuses the side bar width owner, avoiding the next resize from restoring the old width. */
export function resize_workspace_sidebar(width:number){const sash=document.getElementById("typora-sidebar-resizer");const binding=sash&&bindings.get(sash);if(binding){binding.set_width(width);return true;}return false;}
