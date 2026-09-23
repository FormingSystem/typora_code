/** 只接管用户要求的Ctrl滚轮；其他修饰组合保持各领域原语义。 */
export function wheel_zoom_direction(event:WheelEvent):number {
  return event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&Number.isFinite(event.deltaY)&&event.deltaY!==0
    ? event.deltaY<0?1:-1:0;
}

/** 命中正文而非焦点；嵌入式编辑器、媒体和独立预览拥有自己的手势。 */
export function reading_wheel_root(event:WheelEvent):HTMLElement|undefined {
  if(event.defaultPrevented||!wheel_zoom_direction(event))return;
  // closest不能跨越Shadow边界；必须在全局捕获执行之前识别外层所有者。
  const path=event.composedPath();
  if(path.some(node=>node instanceof Element&&node.matches('.workspace-link-preview,.workspace-lookup-preview')))return;
  const target=path[0];if(!(target instanceof Element))return;
  if(target.closest('pre,code,.md-fences,.md-diagram,.md-math,.md-inline-math,.md-htmlblock,.md-image,.md-video,.md-audio,.md-rawblock,.CodeMirror,.monaco-editor,.mermaid,svg,canvas,img,picture,video,audio,iframe,webview,a,button,input,textarea,select,[role="button"],.workspace-link-preview,.workspace-lookup-preview'))return;
  const root=target.closest<HTMLElement>('#write,.typ-markdown-preview');
  if(!root||!target.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th'))return;
  if([...document.querySelectorAll<HTMLElement>('.reading-media-viewer,[role="dialog"][aria-modal="true"],.modal.in')].some(node=>!node.hidden&&node.getClientRects().length&&getComputedStyle(node).visibility!=="hidden"))return;
  return root;
}
