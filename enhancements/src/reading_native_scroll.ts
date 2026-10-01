import {reading_viewport_bounds} from "./reading_viewport";

/** When reflow takes over the current viewport, the host's ongoing scroll animation is canceled, and it cannot jump to the old end point of the animation. */
export function stop_native_reading_scroll(scroller:HTMLElement):void {
  if(scroller.tagName!=="CONTENT")return;
  const runtime=window as any;
  runtime.$?.(scroller).stop?.(true,false);
}

/** The explicit distance of Typora 1.14.10 scrollAdjust is taken as the origin at the top edge of the window, and the workbench must pass in the offset of the reading area. */
export function bind_reading_native_scroll(editor: any, runtime: any): () => void {
  const restore_busy = bind_native_reading_layout(editor, runtime);
  const restore_source = bind_native_source_layout(editor, runtime);
  const selection = editor?.selection, original = selection?.scrollAdjust;
  if (typeof original !== "function") return () => {restore_busy();restore_source();};
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
    restore_busy();
    restore_source();
    if (selection.scrollAdjust !== adjusted) return;
    if (descriptor) Object.defineProperty(selection, "scrollAdjust", descriptor);
    else delete selection.scrollAdjust;
  };
}

/** Reapplying an unchanged native mode is layout work, not a request to reveal the cursor. */
function bind_native_source_layout(editor: any, runtime: any): () => void {
  const original = editor?.setTypeWriterMode;
  if (typeof original !== 'function') return () => {};
  const descriptor = Object.getOwnPropertyDescriptor(editor, 'setTypeWriterMode');
  const guarded = function(this: unknown, enabled: boolean, refresh?: boolean, notice?: boolean) {
    const source = editor.sourceView, cm = source?.cm;
    const preserve = refresh && enabled === runtime.File?.isTypeWriterMode && source?.inSourceMode && cm;
    const info = preserve && cm.getScrollInfo();
    const anchor = info && cm.coordsChar({left: info.left, top: info.top}, 'local');
    const offset = anchor && info.top - cm.charCoords(anchor, 'local').top;
    try { return original.call(this, enabled, refresh, notice); }
    finally {
      if (anchor && source.inSourceMode && source.cm === cm) cm.scrollTo(info.left, cm.charCoords(anchor, 'local').top + offset);
    }
  };
  editor.setTypeWriterMode = guarded;
  return () => {
    if (editor.setTypeWriterMode !== guarded) return;
    if (descriptor) Object.defineProperty(editor, 'setTypeWriterMode', descriptor);
    else delete editor.setTypeWriterMode;
  };
}

/** Typora's passive performance-mode transition refocuses the retained paragraph.
 * Preserve the viewport synchronously, without cancelling editing or later explicit reveals. */
function bind_native_reading_layout(editor: any, runtime: any): () => void {
  const original = editor?.tryEnterBusyMode;
  if (typeof original !== 'function') return () => {};
  const descriptor = Object.getOwnPropertyDescriptor(editor, 'tryEnterBusyMode');
  const guarded = function(this: unknown, ...args: unknown[]) {
    const file = runtime.File, path = file?.bundle?.filePath;
    const scroller = document.querySelector<HTMLElement>('content.typ-workspace-binding');
    const root = editor.writingArea as HTMLElement | undefined;
    const preserve = scroller && root?.isConnected && scroller.contains(root)
      && !editor.sourceView?.inSourceMode && !file?._onInitParse && !file?._onFileSwitching;
    const top = scroller?.scrollTop, left = scroller?.scrollLeft;
    try { return original.apply(this, args); }
    finally {
      if (preserve && scroller.isConnected && root === editor.writingArea && path === file?.bundle?.filePath) {
        if (scroller.scrollTop !== top) scroller.scrollTop = top!;
        if (scroller.scrollLeft !== left) scroller.scrollLeft = left!;
      }
    }
  };
  editor.tryEnterBusyMode = guarded;
  return () => {
    if (editor.tryEnterBusyMode !== guarded) return;
    if (descriptor) Object.defineProperty(editor, 'tryEnterBusyMode', descriptor);
    else delete editor.tryEnterBusyMode;
  };
}
