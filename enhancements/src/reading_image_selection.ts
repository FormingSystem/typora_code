/** Keep transient selection outside serialized image markup and native editor state. */
export function bind_reading_image_selection(root:HTMLElement,selector:string){
  const owner=root.getRootNode(),style=document.createElement('style');
  style.dataset.readingImageSelection='';
  (owner instanceof ShadowRoot?owner:document.head).append(style);
  const events=new AbortController(),{signal}=events;
  let selected:HTMLImageElement|undefined,source='';
  const clear=()=>{selected=undefined;source='';style.textContent='';};
  const update=()=>{
    if(!selected)return;
    if(!root.contains(selected)||!selected.isConnected||selected.getAttribute('src')!==source){clear();return;}
    const path:string[]=[];
    for(let node:Element|null=selected;node;node=node.parentElement){
      path.unshift(`${node.localName}:nth-child(${Array.prototype.indexOf.call(node.parentNode!.children,node)+1})`);
      if(node.parentNode===owner)break;
    }
    const rule=`${path.join(' > ')}{outline:2px solid var(--workspace-focus-border,var(--vscode-focusBorder,#0069cc))!important;outline-offset:-2px!important}`;
    if(style.textContent!==rule)style.textContent=rule;
  };
  const is_control=(path:EventTarget[])=>path.some(node=>node instanceof Element&&node.matches('.reading-media-entries,.reading-media-viewer'));
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0||is_control(event.composedPath()))return;
    const image=event.composedPath().find(node=>node instanceof HTMLImageElement&&root.contains(node)&&node.matches(selector)&&!node.closest('.md-diagram-panel-preview,.CodeMirror,.reading-media-viewer')&&!node.matches('.md-emoji,.md-emoji img')) as HTMLImageElement|undefined;
    clear();
    if(image){selected=image;source=image.getAttribute('src')||'';update();}
  },{capture:true,signal});
  document.addEventListener('keydown',event=>{
    if(is_control(event.composedPath()))return;
    if(event.key==='Escape'||(!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key!=='Shift'))clear();
  },{capture:true,signal});
  return {update,dispose(){events.abort();clear();style.remove();}};
}
