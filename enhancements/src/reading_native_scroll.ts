import {reading_viewport_bounds} from "./reading_viewport";

/** 重排接管当前视口时取消宿主尚在运行的滚动动画，不能跳到动画旧终点。 */
export function stop_native_reading_scroll(scroller:HTMLElement):void {
  if(scroller.tagName!=="CONTENT")return;
  const runtime=window as any;
  runtime.$?.(scroller).stop?.(true,false);
}

/** Typora 1.14.10 scrollAdjust 的显式距离以窗口顶边为原点，工作台须传入阅读区域偏移。 */
export function bind_reading_native_scroll(editor: any, runtime: any): () => void {
  const selection = editor?.selection, original = selection?.scrollAdjust;
  if (typeof original !== "function") return () => {};
  const descriptor = Object.getOwnPropertyDescriptor(selection, "scrollAdjust");
  const adjusted = function(this: unknown, target: unknown, margin?: number, duration?: unknown, force?: unknown) {
    const content = document.querySelector<HTMLElement>("content.typ-workspace-binding");
    const file = runtime.File;
    if (content && typeof margin === "number" && Number.isFinite(margin) && !editor.sourceView?.inSourceMode
      && (!file?.isTypeWriterMode || force) && !file?.inBusyMode && !file?._onInitParse) {
      // 与宿主同一chrome偏移；这里只增加工作台比宿主多出的可见区域。
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
