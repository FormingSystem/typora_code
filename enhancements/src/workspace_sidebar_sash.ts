import {acquire_workspace_style} from "./workspace_styles";
import sidebar_sash_css from "./workspace_sidebar_sash.css";

// VS Code SidebarPart.minimumWidth=170、snap=true；SplitView 用最小宽度的一半作为收起阈值。
// EditorPane 的 DEFAULT_EDITOR_MIN_DIMENSIONS.width=220。宽度均为 CSS 像素，不含活动栏。
// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/parts/sidebar/sidebarPart.ts
// https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/splitview/splitview.ts
// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/parts/editor/editor.ts
export const SIDEBAR_MIN_WIDTH = 170;
export const SIDEBAR_SNAP_WIDTH = Math.floor(SIDEBAR_MIN_WIDTH / 2);
export const EDITOR_MIN_WIDTH = 220;

type sidebar_host = { isShown: boolean; show(): void; hide(): void };
type sidebar_sash_options = { sidebar: sidebar_host; save_width(width: number): void };
type sidebar_sash_binding = { element: HTMLElement; refresh(): void; dispose(): void };
const bindings = new WeakMap<HTMLElement, sidebar_sash_binding>();

/** 替换原生分界线的拖影行为；继续通过社区核心开关面板，保持所有面板的生命周期一致。 */
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
  const read_width = () => Number.parseFloat(getComputedStyle(root).getPropertyValue("--sidebar-width")) || sidebar_element.getBoundingClientRect().width || SIDEBAR_MIN_WIDTH;
  let preferred_width = Math.max(SIDEBAR_MIN_WIDTH, Math.round(read_width()));
  let disposed = false, notifying = false, frame = 0;
  let drag: { pointer_id: number; start_x: number; start_width: number; saved_width: number } | undefined;
  const activity_width = () => ribbon.getBoundingClientRect().width;
  const available_width = () => Math.max(0, root.clientWidth - activity_width() - (Number.parseFloat(getComputedStyle(document.body).getPropertyValue("--typ-sidedock-width")) || 0) - EDITOR_MIN_WIDTH);
  const clamp_width = (width: number) => Math.round(Math.max(SIDEBAR_MIN_WIDTH, Math.min(available_width(), width)));
  const notify_layout = () => {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0; notifying = true;
      window.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("optimizedResize"));
      notifying = false;
    });
  };
  const sync_sash = () => {
    const width = options.sidebar.isShown ? read_width() : 0;
    root.style.setProperty("--linux-note-sidebar-sash-left", `${activity_width() + width}px`);
    sash.setAttribute("aria-valuenow", String(Math.round(width)));
    sash.setAttribute("aria-valuemax", String(Math.max(SIDEBAR_MIN_WIDTH, Math.floor(available_width()))));
    sash.setAttribute("aria-valuetext", width ? `侧栏宽度 ${Math.round(width)} 像素` : "侧栏已收起；按 Enter 或向右键展开");
  };
  const apply_width = (width: number) => {
    const value = `${Math.round(width)}px`;
    if (root.style.getPropertyValue("--sidebar-width") !== value) {
      window.dispatchEvent(new Event("beforeResize")); root.style.setProperty("--sidebar-width", value); notify_layout();
    }
    sync_sash();
  };
  const set_visible = (visible: boolean) => {
    if (options.sidebar.isShown === visible) return;
    if (visible) options.sidebar.show(); else options.sidebar.hide();
    // 原生 show/hide 注册一次性 transitionend 清理；即时拖动关闭动画时也要结束该等待。
    if (drag) sidebar_element.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "left" }));
    notify_layout(); sync_sash();
  };
  const persist = () => { try { options.save_width(preferred_width); } catch (error) { console.warn("保存侧栏宽度失败", error); } };
  const refresh = () => {
    if (disposed || notifying) return;
    if (options.sidebar.isShown) {
      if (available_width() < SIDEBAR_MIN_WIDTH) { set_visible(false); apply_width(preferred_width); }
      else if (!drag) apply_width(clamp_width(preferred_width));
    }
    sync_sash();
  };
  const finish = () => {
    if (!drag) return;
    const previous = drag; drag = undefined;
    if (options.sidebar.isShown) { preferred_width = clamp_width(read_width()); persist(); }
    else { preferred_width = previous.saved_width; apply_width(preferred_width); }
    document.body.classList.remove("linux-note-sidebar-dragging");
    if (sash.hasPointerCapture(previous.pointer_id)) sash.releasePointerCapture(previous.pointer_id);
    sync_sash(); notify_layout();
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
    const width = drag.start_width + event.clientX - drag.start_x;
    if (width < SIDEBAR_SNAP_WIDTH || available_width() < SIDEBAR_MIN_WIDTH) { set_visible(false); apply_width(drag.saved_width); }
    else { apply_width(clamp_width(width)); set_visible(true); }
  };
  const pointer_finish = (event: PointerEvent) => { if (drag?.pointer_id === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); finish(); } };
  const suppress_native_mouse = (event: MouseEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const keydown = (event: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === "Enter" && options.sidebar.isShown) { set_visible(false); apply_width(preferred_width); return; }
    if (available_width() < SIDEBAR_MIN_WIDTH) return;
    if (!options.sidebar.isShown) { apply_width(clamp_width(preferred_width)); set_visible(true); return; }
    const width = event.key === "Home" ? SIDEBAR_MIN_WIDTH : event.key === "End" ? available_width() : read_width() + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0) * (event.shiftKey ? 50 : 10);
    preferred_width = clamp_width(width); apply_width(preferred_width); persist();
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
  const resize_observer = new ResizeObserver(refresh); resize_observer.observe(root); resize_observer.observe(ribbon);
  sash.dataset.workspaceSidebarSash = "ready"; sash.tabIndex = 0;
  sash.removeAttribute("aria-hidden"); sash.setAttribute("role", "separator"); sash.setAttribute("aria-orientation", "vertical"); sash.setAttribute("aria-valuemin", "0");
  sash.title = "调整主侧栏宽度；拖到 85 像素以下收起，向外拖动或按 Enter 展开"; sash.setAttribute("aria-label", "调整主侧栏宽度");
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
    delete sash.dataset.workspaceSidebarSash; root.style.removeProperty("--linux-note-sidebar-sash-left"); style.remove(); bindings.delete(sash);
  };
  const binding = { element: sash, refresh, dispose }; bindings.set(sash, binding); window.addEventListener("pagehide", dispose, { once: true }); refresh(); return binding;
}
