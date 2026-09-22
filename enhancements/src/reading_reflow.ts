import {stop_native_reading_scroll} from "./reading_native_scroll";
/** 活着的文档使用字符锚点；不写磁盘，不持有已关闭文档。 */
type text_anchor={node:Text;offset:number;top:number};
const active_bindings=new WeakMap<HTMLElement,ReturnType<typeof bind_reading_reflow>>();
function character_rect(node:Text,offset:number){
  const range=document.createRange();range.setStart(node,Math.min(offset,node.length));range.setEnd(node,Math.min(offset+1,node.length));return range.getBoundingClientRect();
}
export function capture_reflow_anchor(scroller:HTMLElement,root:HTMLElement):text_anchor|undefined {
  if(!root.isConnected||!scroller.clientHeight)return;
  const viewport=scroller.getBoundingClientRect(),target=viewport.top+viewport.height/3;
  // 先剪掉离屏子树，避免大文档每次滚动遍历全部字符。
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
  return find(root);
}
export function restore_reflow_anchor(scroller:HTMLElement,root:HTMLElement,anchor:text_anchor|undefined){
  if(!anchor||!root.contains(anchor.node)||!root.getClientRects().length)return;
  const rect=character_rect(anchor.node,anchor.offset),viewport=scroller.getBoundingClientRect();
  // CSS zoom/DPI 影响视觉坐标，scrollTop 仍是容器的 CSS 坐标。
  // offsetHeight 会舍入整数；长文档的大位移不能用它推导比例。
  let ratio=1,node:HTMLElement|null=scroller;
  while(node){ratio*=Number.parseFloat(getComputedStyle(node).zoom)||1;node=node.parentElement;}
  scroller.scrollTop+=(rect.top-viewport.top-anchor.top)/ratio;
}
export function change_reading_geometry(scroller:HTMLElement,root:HTMLElement,action:()=>void){
  const binding=active_bindings.get(root);
  if(binding){binding.change(action);return;}
  stop_native_reading_scroll(scroller);
  const anchor=capture_reflow_anchor(scroller,root);action();restore_reflow_anchor(scroller,root,anchor);
}
export function bind_reading_reflow(scroller:HTMLElement,root:HTMLElement){
  let disposed=false,frame=0,anchor:text_anchor|undefined;
  let geometry="";
  const size=()=>`${scroller.clientWidth}:${scroller.clientHeight}:${root.getBoundingClientRect().width}:${getComputedStyle(root).fontSize}:${getComputedStyle(root).zoom}`;
  const capture=()=>{if(disposed)return;geometry=size();anchor=capture_reflow_anchor(scroller,root);};
  const restore=()=>{if(disposed)return;stop_native_reading_scroll(scroller);restore_reflow_anchor(scroller,root,anchor);capture();};
  const resize=new ResizeObserver(()=>{if(size()!==geometry)restore();});resize.observe(scroller);resize.observe(root);
  const scroll=()=>{if(size()!==geometry)return;capture();};
  scroller.addEventListener("scroll",scroll,{passive:true});capture();
  const binding={capture,change(action:()=>void){stop_native_reading_scroll(scroller);capture();action();restore_reflow_anchor(scroller,root,anchor);cancelAnimationFrame(frame);frame=requestAnimationFrame(restore);},dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();scroller.removeEventListener("scroll",scroll);anchor=undefined;if(active_bindings.get(root)===binding)active_bindings.delete(root);}};
  active_bindings.set(root,binding);return binding;
}

/** 原生正文和非活动组的 Markdown 均保留各自的滚动所有者。 */
export function bind_workspace_reading_reflow(){
  const bindings=new Map<HTMLElement,{scroller:HTMLElement;binding:ReturnType<typeof bind_reading_reflow>}>();
  let frame=0,disposed=false;
  const refresh=()=>{
    frame=0;if(disposed)return;
    for(const [root,entry]of bindings)if(!root.isConnected){entry.binding.dispose();bindings.delete(root);}
    for(const root of document.querySelectorAll<HTMLElement>('#write,.typ-markdown-preview')){
      if(root.closest('.workspace-link-preview,.workspace-lookup-preview'))continue;
      let scroller=root.parentElement;
      while(scroller&&scroller!==document.body&&!/auto|scroll/.test(getComputedStyle(scroller).overflowY))scroller=scroller.parentElement;
      if(!scroller||scroller===document.body)continue;
      const old=bindings.get(root);if(old?.scroller===scroller)continue;old?.binding.dispose();bindings.set(root,{scroller,binding:bind_reading_reflow(scroller,root)});
    }
  };
  const observer=new MutationObserver(()=>{if(!frame&&!disposed)frame=requestAnimationFrame(refresh);});observer.observe(document.body,{childList:true,subtree:true});refresh();
  return {dispose(){disposed=true;observer.disconnect();cancelAnimationFrame(frame);for(const {binding}of bindings.values())binding.dispose();bindings.clear();}};
}
