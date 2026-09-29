import {create_workspace_lifetime} from "./workspace_lifetime";
import {create_scrollbar_visibility} from "./scrollbar_visibility";

const OPACITY_PROPERTY = "--workspace-scrollbar-opacity";
const EXCLUDED = ".monaco-editor,.monaco-scrollable-element,.xterm,.CodeMirror,#write,[data-workspace-scrollbar-visibility='native']";

/** Native scroll area registers on demand, dynamically inserts without scanning or observing DOM. */
export function bind_workspace_scrollbars() {
  const lifetime = create_workspace_lifetime();
  const root = document.documentElement;
  // Retain the original visible scroll bar when custom property animations are unavailable.
  if (!CSS.supports("background", "color-mix(in srgb, black 50%, transparent)") || !CSS.registerProperty || !Element.prototype.animate) return lifetime;
  const previous_mode = root.getAttribute("data-workspace-scrollbars");
  root.setAttribute("data-workspace-scrollbars", "auto");
  const entries = new Map<HTMLElement, ReturnType<typeof create_scrollbar_visibility>>();
  const releases = new Map<HTMLElement, () => void>();
  let hovered = new Set<HTMLElement>(), dragged = new Set<HTMLElement>();
  const is_native_scroll = (node: HTMLElement) => {
    if (node.closest(EXCLUDED)) return false;
    if (node.scrollHeight <= node.clientHeight && node.scrollWidth <= node.clientWidth) return false;
    const style = getComputedStyle(node);
    return style.scrollbarWidth !== "none" && (/^(auto|scroll|overlay)$/.test(style.overflowY) || /^(auto|scroll|overlay)$/.test(style.overflowX));
  };
  const scroll_ancestors = (target: EventTarget | null) => {
    const result = new Set<HTMLElement>();
    for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
      if (node instanceof HTMLElement && is_native_scroll(node)) result.add(node);
    }
    return result;
  };
  const obtain = (node: HTMLElement) => {
    const existing = entries.get(node);
    if (existing) return existing;
    const previous = node.style.getPropertyValue(OPACITY_PROPERTY), priority = node.style.getPropertyPriority(OPACITY_PROPERTY);
    let animation: Animation | undefined;
    const release = () => {
      controller.dispose(); animation?.cancel();
      previous ? node.style.setProperty(OPACITY_PROPERTY, previous, priority) : node.style.removeProperty(OPACITY_PROPERTY);
      entries.delete(node);
      releases.delete(node);
    };
    const controller = create_scrollbar_visibility({
      schedule(callback, delay) { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
      animate(visible, duration, finished) {
        // Resume from actual transparency when interrupted, without jumping back to 1; do not override the element's own opacity or animation.
        const from = getComputedStyle(node).getPropertyValue(OPACITY_PROPERTY).trim() || "0";
        animation?.cancel();
        node.style.setProperty(OPACITY_PROPERTY, visible ? "1" : "0");
        animation = node.animate([{[OPACITY_PROPERTY]: from}, {[OPACITY_PROPERTY]: visible ? "1" : "0"}], {
          // User explicitly specified fade; equivalent upstream reduceMotion=off, limited to this scrollbar drawing layer.
          duration,
          easing: "linear",
        });
        animation.onfinish = finished;
        // Value is sampled by current animation; it cannot be canceled before creating a new animation.
        return () => { if (animation) animation.onfinish = null; };
      },
      hidden: release,
    });
    entries.set(node, controller);
    releases.set(node, release);
    return controller;
  };
  const move_hover = (target: EventTarget | null) => {
    const next = scroll_ancestors(target);
    for (const node of hovered) if (!next.has(node)) entries.get(node)?.hover(false);
    for (const node of next) if (!hovered.has(node)) obtain(node).hover(true);
    hovered = next;
  };
  lifetime.listen(document, "pointerover", event => move_hover(event.target), {capture: true, passive: true});
  lifetime.listen(document, "pointerout", event => move_hover((event as PointerEvent).relatedTarget), {capture: true, passive: true});
  lifetime.listen(document, "scroll", event => {
    const node = event.target === document ? document.scrollingElement : event.target;
    if (node instanceof HTMLElement && is_native_scroll(node)) obtain(node).pulse();
  }, {capture: true, passive: true});
  lifetime.listen(document, "pointerdown", event => {
    dragged = scroll_ancestors(event.target);
    for (const node of dragged) obtain(node).drag(true);
  }, {capture: true, passive: true});
  const end_drag = () => { for (const node of dragged) entries.get(node)?.drag(false); dragged.clear(); };
  lifetime.listen(window, "pointerup", end_drag, true);
  lifetime.listen(window, "pointercancel", end_drag, true);
  // The native scrollbar Chromium may only report mouse events when released.
  lifetime.listen(window, "mouseup", end_drag, true);
  lifetime.listen(window, "blur", () => { move_hover(null); end_drag(); });
  // The mouse may already be in the area when activated; only sample one hover path, do not scan all scroll nodes.
  const initial_hover = document.querySelectorAll(":hover");
  move_hover(initial_hover.item(initial_hover.length - 1));
  lifetime.add(() => {
    for (const release of releases.values()) release();
    entries.clear(); hovered.clear(); dragged.clear();
    previous_mode === null ? root.removeAttribute("data-workspace-scrollbars") : root.setAttribute("data-workspace-scrollbars", previous_mode);
  });
  return lifetime;
}
