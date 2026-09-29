/** Only take over the user's requested Ctrl wheel; other modifier combinations keep the original semantics of each domain. */
export function wheel_zoom_direction(event:WheelEvent):number {
  return event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&Number.isFinite(event.deltaY)&&event.deltaY!==0
    ? event.deltaY<0?1:-1:0;
}

/** Edit content by pointer hit (including code editors); media and independent previews retain their own gestures. */
export function reading_wheel_root(event:WheelEvent):HTMLElement|undefined {
  if(event.defaultPrevented||!wheel_zoom_direction(event))return;
  // closest cannot cross Shadow boundary; must identify the outer owner before global capture execution.
  const path=event.composedPath();
  if(path.some(node=>node instanceof Element&&node.matches('.workspace-link-preview,.workspace-lookup-preview')))return;
  const target=path[0];if(!(target instanceof Element))return;
  if(target.closest('.md-diagram,.md-math,.md-inline-math,.md-image,.md-video,.md-audio,svg,canvas,img,video,audio,iframe,webview,button,input,select,[role="button"]'))return;
  // Whitespace on both sides of the document content is part of the editing area; when the native container itself is targeted, it checks back, avoiding taking away the gesture of child panels.
  const padding_root=target.matches('content')?target.querySelector<HTMLElement>(':scope > #write'):target.matches('#typora-source')?target.querySelector<HTMLElement>('.CodeMirror'):undefined;
  const root=target.closest<HTMLElement>('#write,.typ-markdown-preview,.monaco-editor,#typora-source .CodeMirror')||(padding_root?.getClientRects().length?padding_root:undefined);
  if(!root)return;
  if([...document.querySelectorAll<HTMLElement>('.reading-media-viewer,[role="dialog"][aria-modal="true"],.modal.in')].some(node=>!node.hidden&&node.getClientRects().length&&getComputedStyle(node).visibility!=="hidden"))return;
  return root;
}
