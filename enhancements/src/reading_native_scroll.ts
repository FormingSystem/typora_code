import {reading_viewport_bounds} from "./reading_viewport";

/** When reflow takes over the current viewport, the host's ongoing scroll animation is canceled, and it cannot jump to the old end point of the animation. */
export function stop_native_reading_scroll(scroller:HTMLElement):void {
  if(scroller.tagName!=="CONTENT")return;
  const runtime=window as any;
  runtime.$?.(scroller).stop?.(true,false);
}

/** The explicit distance of Typora 1.14.10 scrollAdjust is taken as the origin at the top edge of the window, and the workbench must pass in the offset of the reading area. */
export function bind_reading_native_scroll(editor: any, runtime: any): () => void {
  const selection = editor?.selection, original = selection?.scrollAdjust;
  if (typeof original !== "function") return () => {};
  const descriptor = Object.getOwnPropertyDescriptor(selection, "scrollAdjust");
  const adjusted = function(this: unknown, target: unknown, margin?: number, duration?: unknown, force?: unknown) {
    const content = document.querySelector<HTMLElement>("content.typ-workspace-binding");
    const file = runtime.File;
    if (content && typeof margin === "number" && Number.isFinite(margin) && !editor.sourceView?.inSourceMode
      && (!file?.isTypeWriterMode || force) && !file?.inBusyMode && !file?._onInitParse) {
      // Same chrome offset with the host; here, only the visible area that the workbench has more than the host is added.
      const title = file?.isNodeHtml ? (runtime.$?.("#top-titlebar").height() || 0)
        : document.body.classList.contains("mac-seamless-mode") ? 30 : 0;
      const search = runtime.$?.(".on-search-panel-open #md-searchpanel").height() || 0;
      margin += Math.max(0, reading_viewport_bounds(content).top - title - search);
    }
    return original.call(this, target, margin, duration, force);
  };
  selection.scrollAdjust = adjusted;
  return () => {
    if (selection.scrollAdjust !== adjusted) return;
    if (descriptor) Object.defineProperty(selection, "scrollAdjust", descriptor);
    else delete selection.scrollAdjust;
  };
}
