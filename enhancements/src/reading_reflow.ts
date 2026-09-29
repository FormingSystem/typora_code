import {bind_reading_font_zoom} from './reading_font_zoom';
import {bind_native_source_font_zoom} from './native_source_font_zoom';
import {stop_native_reading_scroll} from "./reading_native_scroll";
import {acquire_reading_blocks,reading_block_at} from "./reading_blocks";
/** Living documents use character anchors; they are not written to disk and do not hold closed documents. */
type text_anchor={node:Text;offset:number;top:number};
const active_bindings=new WeakMap<HTMLElement,ReturnType<typeof bind_reading_reflow>>();
function character_rect(node:Text,offset:number){
  const range=document.createRange();range.setStart(node,Math.min(offset,node.length));range.setEnd(node,Math.min(offset+1,node.length));return range.getBoundingClientRect();
}
export function capture_reflow_anchor(scroller:HTMLElement,root:HTMLElement):text_anchor|undefined {
  if(!root.isConnected||!scroller.clientHeight)return;
  const viewport=scroller.getBoundingClientRect(),target=viewport.top+viewport.height/3;
  // First prune the off-screen subtrees to avoid large documents traversing all characters every time they scroll.
  const find=(element:Element):text_anchor|undefined=>{
    const rect=element.getBoundingClientRect();if(rect.bottom<=target||rect.top>=viewport.bottom||!rect.width||!rect.height)return;
    for(const child of element.childNodes){
      if(child instanceof Element){if(child.matches('script,style,button,[aria-hidden="true"]'))continue;const anchor=find(child);if(anchor)return anchor;}
      else if(child instanceof Text&&child.textContent?.trim()){
        const range=document.createRange();range.selectNodeContents(child);const box=range.getBoundingClientRect();if(box.bottom<=target||box.top>=viewport.bottom)continue;
        let low=0,high=child.length-1;
        while(low<high){const mid=(low+high)>>>1;if(character_rect(child,mid).bottom<=target)low=mid+1;else high=mid;}
        const point=character_rect(child,low);if(point.height)return {node:child,offset:low,top:point.top-viewport.top};
      }
    }
  };
  const block=reading_block_at(root,target);
  // GeneralMarkdown only traverses text within the target block; the originalHTML/ root text remains reverted according to its actual structure.
  if(!block)return find(root);
  for(let node:Element|null=block.node;node;node=node.nextElementSibling){
    if(node.getBoundingClientRect().top>=viewport.bottom)break;
    const anchor=find(node);if(anchor)return anchor;
  }
}
export function restore_reflow_anchor(scroller:HTMLElement,root:HTMLElement,anchor:text_anchor|undefined){
  if(!anchor||!root.contains(anchor.node)||!root.getClientRects().length)return;
  const rect=character_rect(anchor.node,anchor.offset),viewport=scroller.getBoundingClientRect();
  // CSS zoom/DPI affects visual coordinates, scrollTop remains the container's CSS coordinate.
  // offsetHeight rounds integers; large displacements in long documents cannot be used to derive proportions.
  let ratio=1,node:HTMLElement|null=scroller;
  while(node){ratio*=Number.parseFloat(getComputedStyle(node).zoom)||1;node=node.parentElement;}
  scroller.scrollTop+=(rect.top-viewport.top-anchor.top)/ratio;
}
export function change_reading_geometry(scroller:HTMLElement,root:HTMLElement,action:()=>void,retained?:text_anchor){
  const binding=active_bindings.get(root);
  if(binding){binding.change(action,retained);return;}
  stop_native_reading_scroll(scroller);
  const anchor=retained||capture_reflow_anchor(scroller,root);action();restore_reflow_anchor(scroller,root,anchor);
}
export function bind_reading_reflow(scroller:HTMLElement,root:HTMLElement){
  const blocks=acquire_reading_blocks(root);
  let disposed=false,frame=0,anchor:text_anchor|undefined;
  let geometry="";
  const size=()=>`${scroller.clientWidth}:${scroller.clientHeight}:${root.getBoundingClientRect().width}:${getComputedStyle(root).fontSize}:${getComputedStyle(root).zoom}`;
  const capture=()=>{if(disposed)return;geometry=size();anchor=capture_reflow_anchor(scroller,root);};
  const restore=()=>{if(disposed)return;stop_native_reading_scroll(scroller);restore_reflow_anchor(scroller,root,anchor);capture();};
  const resize=new ResizeObserver(()=>{if(size()!==geometry)restore();});resize.observe(scroller);resize.observe(root);
  const scroll=()=>{const next=size();if(next!==geometry)return;anchor=capture_reflow_anchor(scroller,root);};
  scroller.addEventListener("scroll",scroll,{passive:true});capture();
  const binding={capture,change(action:()=>void,retained?:text_anchor){stop_native_reading_scroll(scroller);capture();if(retained)anchor=retained;action();blocks.invalidate();restore_reflow_anchor(scroller,root,anchor);cancelAnimationFrame(frame);frame=requestAnimationFrame(restore);},dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();blocks.dispose();scroller.removeEventListener("scroll",scroll);anchor=undefined;if(active_bindings.get(root)===binding)active_bindings.delete(root);}};
  active_bindings.set(root,binding);return binding;
}

/** Native document content and non-active group's Markdown are both retained with their own scroll owners. */
export function bind_workspace_reading_reflow(){
  const sources=new Map<HTMLElement,{dispose():void}>();
  const bindings=new Map<HTMLElement,{scroller:HTMLElement;binding:ReturnType<typeof bind_reading_reflow>;font:ReturnType<typeof bind_reading_font_zoom>}>();
  let frame=0,disposed=false;
  const refresh=()=>{
    frame=0;if(disposed)return;
    for(const [root,binding]of sources)if(!root.isConnected){binding.dispose();sources.delete(root);}
    for(const root of document.querySelectorAll<HTMLElement>('#typora-source .CodeMirror'))if(!sources.has(root)){const binding=bind_native_source_font_zoom(root);if(binding)sources.set(root,binding);}
    for(const [root,entry]of bindings)if(!root.isConnected){entry.font.dispose();entry.binding.dispose();bindings.delete(root);}
    for(const root of document.querySelectorAll<HTMLElement>('#write,.typ-markdown-preview')){
      if(root.closest('.workspace-link-preview,.workspace-lookup-preview'))continue;
      let scroller=root.parentElement;
      while(scroller&&scroller!==document.body&&!/auto|scroll/.test(getComputedStyle(scroller).overflowY))scroller=scroller.parentElement;
      if(!scroller||scroller===document.body)continue;
      const old=bindings.get(root);if(old?.scroller===scroller)continue;old?.font.dispose();old?.binding.dispose();bindings.set(root,{scroller,binding:bind_reading_reflow(scroller,root),font:bind_reading_font_zoom(scroller,root)});
    }
  };
  const observer=new MutationObserver(()=>{if(!frame&&!disposed)frame=requestAnimationFrame(refresh);});observer.observe(document.body,{childList:true,subtree:true});refresh();
  return {dispose(){disposed=true;observer.disconnect();cancelAnimationFrame(frame);for(const {binding,font}of bindings.values()){font.dispose();binding.dispose();}bindings.clear();for(const binding of sources.values())binding.dispose();sources.clear();}};
}
