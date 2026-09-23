import {acquire_workspace_hover_surface} from "./workspace_hover_surface";
import {create_workspace_popup_refresh} from "./workspace_popup_refresh";

export type workspace_hover_target = {
  anchor:HTMLElement; label:string;
  /** 触发目标与需要避开的完整操作区域独立；未声明时避开目标自身。 */
  layout_anchor?:HTMLElement; compact?:boolean; show_pointer?:boolean; preferred_side?:"above";
  render(content:HTMLElement,signal:AbortSignal):void;
};
export type workspace_hover_options = {delay_ms?:number;hide_delay_ms?:number;grouped?:boolean;interactive?:boolean};
let hover_sequence=0;

/** 展示层拥有延迟、焦点、屏幕边界与取消信号；内容和异步数据由调用方拥有。 */
export function bind_workspace_hover(container:HTMLElement,resolve:(target:Element)=>workspace_hover_target|undefined,options:workspace_hover_options={}){
  const delay=(value:number|undefined,fallback:number)=>value!==undefined&&Number.isFinite(value)&&value>=0?value:fallback;
  const delay_ms=delay(options.delay_ms,500),hide_delay_ms=delay(options.hide_delay_ms,250);
  const style=acquire_workspace_hover_surface(),events=new AbortController();
  let current:workspace_hover_target|undefined,tip:HTMLDivElement|undefined,pointer:HTMLDivElement|undefined,session:AbortController|undefined;
  let timer=0,close_timer=0,description:string|null=null,restoring_focus=false;
  const keep=()=>{clearTimeout(close_timer);close_timer=0;};
  const hide=()=>{
    clearTimeout(timer);keep();refresh.reset();session?.abort();session=undefined;
    if(current&&tip){if(description===null)current.anchor.removeAttribute("aria-describedby");else current.anchor.setAttribute("aria-describedby",description);}
    tip?.remove();pointer?.remove();tip=undefined;pointer=undefined;current=undefined;
  };
  // 恢复入口焦点时禁止focusin再启动悬停，覆盖Esc与调用方取消。
  const hide_with_focus=(restore?:()=>void)=>{hide();if(!restore)return;restoring_focus=true;try{restore();}finally{restoring_focus=false;}};
  const place=()=>{
    if(!tip||!current)return;
    const layout_anchor=current.layout_anchor||current.anchor;
    if(!current.anchor.isConnected||!layout_anchor.isConnected||!current.anchor.getClientRects().length||!layout_anchor.getClientRects().length)return hide();
    const anchor=current.anchor.getBoundingClientRect(),layout=layout_anchor.getBoundingClientRect();
    const edge=8,gap=6,right=innerWidth-edge,bottom=innerHeight-edge;
    if(anchor.bottom<=edge||anchor.top>=bottom||anchor.right<=edge||anchor.left>=right)return hide();
    const avoid={left:Math.min(layout.left,anchor.left),right:Math.max(layout.right,anchor.right),top:Math.min(layout.top,anchor.top),bottom:Math.max(layout.bottom,anchor.bottom)};
    // 每次从CSS自然尺寸重新测量，异步长内容或侧栏变宽后不保留旧约束。
    const scroll_top=tip.scrollTop,scroll_left=tip.scrollLeft;
    tip.style.maxWidth="";tip.style.maxHeight="";
    const natural=tip.getBoundingClientRect(),style=getComputedStyle(tip);
    const pixels=(key:string)=>parseFloat(style.getPropertyValue(key))||0;
    const min_width=pixels("padding-left")+pixels("padding-right")+pixels("border-left-width")+pixels("border-right-width")+pixels("font-size");
    const min_height=pixels("padding-top")+pixels("padding-bottom")+pixels("border-top-width")+pixels("border-bottom-width")+pixels("line-height");
    const areas=[
      {side:"right",left:Math.max(edge,avoid.right+gap),top:edge,right,bottom},
      {side:"left",left:edge,top:edge,right:Math.min(right,avoid.left-gap),bottom},
      {side:"below",left:edge,top:Math.max(edge,avoid.bottom+gap),right,bottom},
      {side:"above",left:edge,top:edge,right,bottom:Math.min(bottom,avoid.top-gap)},
    ].sort((left,right)=>Number(right.side===current!.preferred_side)-Number(left.side===current!.preferred_side)).map(area=>({...area,width:area.right-area.left,height:area.bottom-area.top}))
      .filter(area=>area.width>=min_width&&area.height>=min_height);
    if(!areas.length)return hide();
    const score=(area:typeof areas[number])=>Math.min(area.width,natural.width)*Math.min(area.height,natural.height);
    const area=areas.find(area=>area.width>=natural.width&&area.height>=natural.height)||areas.reduce((best,area)=>score(area)>score(best)?area:best);
    tip.style.maxWidth=Math.min(area.width,natural.width)+"px";tip.style.maxHeight=area.height+"px";
    const box=tip.getBoundingClientRect(),center_x=(anchor.left+anchor.right)/2,center_y=(anchor.top+anchor.bottom)/2;
    const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,max));
    const left=area.side==="right"?area.left:area.side==="left"?area.right-box.width:clamp(center_x-box.width/2,area.left,area.right-box.width);
    const top=area.side==="below"?area.top:area.side==="above"?area.bottom-box.height:clamp(current.show_pointer?center_y-box.height/2:anchor.top,area.top,area.bottom-box.height);
    tip.style.left=left+"px";tip.style.top=top+"px";tip.dataset.hoverSide=area.side;
    tip.scrollTop=scroll_top;tip.scrollLeft=scroll_left;
    if(pointer){
      const horizontal=area.side==="left"||area.side==="right";
      pointer.dataset.hoverSide=area.side;
      pointer.style.left=(horizontal?(area.side==="right"?left-3:left+box.width-3):clamp(center_x-3,left+6,left+box.width-12))+"px";
      pointer.style.top=(horizontal?clamp(center_y-3,top+6,top+box.height-12):(area.side==="below"?top-3:top+box.height-3))+"px";
    }
  };
  const refresh=create_workspace_popup_refresh(place);
  const inside=(node:EventTarget|null)=>node instanceof Node&&(Boolean(current?.anchor.contains(node))||Boolean(tip?.contains(node)));
  const leave=()=>{if(!tip)return hide();if(options.interactive&&tip.contains(document.activeElement))return;keep();close_timer=window.setTimeout(hide,hide_delay_ms);};
  const show_target=(target:workspace_hover_target,immediate=false)=>{
    if(current?.anchor===target.anchor&&(!immediate||tip)){keep();return tip;}
    // 同一绑定可声明为一个悬停组；点击入口则立即显示同一浮层。
    immediate=immediate||Boolean(options.grouped&&tip);
    hide();current=target;
    const show=()=>{
      if(current!==target||!target.anchor.isConnected)return hide();
      session=new AbortController();tip=document.createElement("div");tip.className="workspace-hover-surface";
      tip.id="workspace-hover-"+(++hover_sequence);tip.setAttribute("role",options.interactive?"dialog":"tooltip");tip.setAttribute("aria-label",target.label);
      description=target.anchor.getAttribute("aria-describedby");target.anchor.setAttribute("aria-describedby",[description,tip.id].filter(Boolean).join(" "));
      tip.classList.toggle("workspace-hover-compact",target.compact===true);
      document.body.append(tip);
      if(target.show_pointer){pointer=document.createElement("div");pointer.className="workspace-hover-pointer";pointer.setAttribute("aria-hidden","true");document.body.append(pointer);}
      try { target.render(tip,session.signal); }
      catch(error) { hide();console.error("[workspace-hover] 内容呈现失败",error);return; }
      refresh.refresh();if(!tip||!session)return;
      refresh.observe_size(tip);refresh.observe_size(target.anchor);
      refresh.observe_mutations(tip,{childList:true,characterData:true,subtree:true});
      if(target.layout_anchor)refresh.observe_size(target.layout_anchor);
      tip.addEventListener("pointerenter",keep,{signal:session.signal});
      tip.addEventListener("pointerleave",event=>{if(!inside(event.relatedTarget))leave();},{signal:session.signal});
      tip.addEventListener("focusin",keep,{signal:session.signal});
      tip.addEventListener("focusout",event=>{if(!inside(event.relatedTarget))leave();},{signal:session.signal});
    };
    if(immediate)show();else timer=window.setTimeout(show,delay_ms);
    return tip;
  };
  const enter=(event:Event)=>{
    if(restoring_focus||!(event.target instanceof Element))return;
    const target=resolve(event.target);if(target)show_target(target);
  };
  container.addEventListener("pointerover",enter,{signal:events.signal});container.addEventListener("focusin",enter,{signal:events.signal});
  container.addEventListener("pointerout",event=>{if(!inside(event.relatedTarget))leave();},{signal:events.signal});
  container.addEventListener("focusout",event=>{if(!inside(event.relatedTarget))leave();},{signal:events.signal});
  document.addEventListener("pointerdown",event=>{if(options.interactive&&tip)return;if(!(event.target instanceof Node&&tip?.contains(event.target)))hide();},{capture:true,signal:events.signal});
  document.addEventListener("scroll",event=>{if(!(event.target instanceof Node&&tip?.contains(event.target)))hide();},{capture:true,signal:events.signal});
  document.addEventListener("keydown",event=>{if((!options.interactive||!tip)&&event.key==="Escape"&&current){const anchor=current.anchor,restore=tip?.contains(document.activeElement);hide_with_focus(restore?()=>anchor.focus({preventScroll:true}):undefined);}},{capture:true,signal:events.signal});
  window.addEventListener("resize",options.interactive?refresh.schedule:hide,{signal:events.signal});window.addEventListener("blur",hide,{signal:events.signal});
  const nodes=new MutationObserver(()=>{if(current&&(!current.anchor.isConnected||current.layout_anchor&&!current.layout_anchor.isConnected))hide();});nodes.observe(container,{childList:true,subtree:true});
  return {hide:hide_with_focus,show:(target:workspace_hover_target)=>show_target(target,true),reposition:refresh.schedule,dispose(){hide();refresh.dispose();events.abort();nodes.disconnect();style.remove();}};
}
