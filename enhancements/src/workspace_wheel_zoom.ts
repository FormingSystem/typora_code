/** 只接管用户要求的Ctrl滚轮；其他修饰组合保持各领域原语义。 */
export function wheel_zoom_direction(event:WheelEvent):number {
  return event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&Number.isFinite(event.deltaY)&&event.deltaY!==0
    ? event.deltaY<0?1:-1:0;
}

/** 按指针命中编辑内容（含代码编辑器）；媒体和独立预览保留自己的手势。 */
export function reading_wheel_root(event:WheelEvent):HTMLElement|undefined {
  if(event.defaultPrevented||!wheel_zoom_direction(event))return;
  // closest不能跨越Shadow边界；必须在全局捕获执行之前识别外层所有者。
  const path=event.composedPath();
  if(path.some(node=>node instanceof Element&&node.matches('.workspace-link-preview,.workspace-lookup-preview')))return;
  const target=path[0];if(!(target instanceof Element))return;
  if(target.closest('.md-diagram,.md-math,.md-inline-math,.md-image,.md-video,.md-audio,svg,canvas,img,video,audio,iframe,webview,button,input,select,[role="button"]'))return;
  // 正文两侧留白也属于编辑区；仅命中原生容器自身时回查，避免抢走子面板手势。
  const padding_root=target.matches('content')?target.querySelector<HTMLElement>(':scope > #write'):target.matches('#typora-source')?target.querySelector<HTMLElement>('.CodeMirror'):undefined;
  const root=target.closest<HTMLElement>('#write,.typ-markdown-preview,.monaco-editor,#typora-source .CodeMirror')||(padding_root?.getClientRects().length?padding_root:undefined);
  if(!root)return;
  if([...document.querySelectorAll<HTMLElement>('.reading-media-viewer,[role="dialog"][aria-modal="true"],.modal.in')].some(node=>!node.hidden&&node.getClientRects().length&&getComputedStyle(node).visibility!=="hidden"))return;
  return root;
}
