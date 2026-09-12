import {acquire_workspace_hover_surface} from "./workspace_hover_surface";

export type workspace_hover_target = {
  anchor:HTMLElement; label:string;
  render(content:HTMLElement,signal:AbortSignal):void;
};
export type workspace_hover_options = {delay_ms?:number;hide_delay_ms?:number};
let hover_sequence=0;

/** 展示层拥有延迟、焦点、屏幕边界与取消信号；内容和异步数据由调用方拥有。 */
export function bind_workspace_hover(container:HTMLElement,resolve:(target:Element)=>workspace_hover_target|undefined,options:workspace_hover_options={}){
  const delay=(value:number|undefined,fallback:number)=>value!==undefined&&Number.isFinite(value)&&value>=0?value:fallback;
  const delay_ms=delay(options.delay_ms,300),hide_delay_ms=delay(options.hide_delay_ms,250);
  const style=acquire_workspace_hover_surface(),events=new AbortController();
  let current:workspace_hover_target|undefined,tip:HTMLDivElement|undefined,session:AbortController|undefined;
  let timer=0,close_timer=0,description:string|null=null,restoring_focus=false;
  const keep=()=>{clearTimeout(close_timer);close_timer=0;};
  const hide=()=>{
    clearTimeout(timer);keep();observer.disconnect();session?.abort();session=undefined;
    if(current&&tip){if(description===null)current.anchor.removeAttribute("aria-describedby");else current.anchor.setAttribute("aria-describedby",description);}
    tip?.remove();tip=undefined;current=undefined;
  };
  const place=()=>{
    if(!tip||!current)return;
    if(!current.anchor.isConnected||!current.anchor.getClientRects().length)return hide();
    const anchor=current.anchor.getBoundingClientRect(),box=tip.getBoundingClientRect();
    const right=anchor.right+6,left=anchor.left-box.width-6;
    tip.style.left=Math.max(8,Math.min(right+box.width<=innerWidth-8?right:left>=8?left:right,innerWidth-box.width-8))+"px";
    tip.style.top=Math.max(8,Math.min(anchor.top,innerHeight-box.height-8))+"px";
  };
  const observer=new ResizeObserver(place);
  const inside=(node:EventTarget|null)=>node instanceof Node&&(Boolean(current?.anchor.contains(node))||Boolean(tip?.contains(node)));
  const leave=()=>{if(!tip)return hide();keep();close_timer=window.setTimeout(hide,hide_delay_ms);};
  const enter=(event:Event)=>{
    if(restoring_focus||!(event.target instanceof Element))return;
    const target=resolve(event.target);if(!target)return;
    if(current?.anchor===target.anchor){keep();return;}
    hide();current=target;
    timer=window.setTimeout(()=>{
      if(current!==target||!target.anchor.isConnected)return hide();
      session=new AbortController();tip=document.createElement("div");tip.className="workspace-hover-surface";
      tip.id="workspace-hover-"+(++hover_sequence);tip.setAttribute("role","tooltip");tip.setAttribute("aria-label",target.label);
      description=target.anchor.getAttribute("aria-describedby");target.anchor.setAttribute("aria-describedby",[description,tip.id].filter(Boolean).join(" "));
      document.body.append(tip);
      try { target.render(tip,session.signal); }
      catch(error) { hide();console.error("[workspace-hover] 内容呈现失败",error);return; }
      place();observer.observe(tip);
      tip.addEventListener("pointerenter",keep,{signal:session.signal});
      tip.addEventListener("pointerleave",event=>{if(!inside(event.relatedTarget))leave();},{signal:session.signal});
      tip.addEventListener("focusin",keep,{signal:session.signal});
      tip.addEventListener("focusout",event=>{if(!inside(event.relatedTarget))leave();},{signal:session.signal});
    },delay_ms);
  };
  container.addEventListener("pointerover",enter,{signal:events.signal});container.addEventListener("focusin",enter,{signal:events.signal});
  container.addEventListener("pointerout",event=>{if(!inside(event.relatedTarget))leave();},{signal:events.signal});
  container.addEventListener("focusout",event=>{if(!inside(event.relatedTarget))leave();},{signal:events.signal});
  document.addEventListener("pointerdown",event=>{if(!(event.target instanceof Node&&tip?.contains(event.target)))hide();},{capture:true,signal:events.signal});
  document.addEventListener("scroll",event=>{if(!(event.target instanceof Node&&tip?.contains(event.target)))hide();},{capture:true,signal:events.signal});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&current){const anchor=current.anchor,restore=tip?.contains(document.activeElement);hide();if(restore){restoring_focus=true;anchor.focus({preventScroll:true});restoring_focus=false;}}},{capture:true,signal:events.signal});
  window.addEventListener("resize",hide,{signal:events.signal});window.addEventListener("blur",hide,{signal:events.signal});
  const nodes=new MutationObserver(()=>{if(current&&!current.anchor.isConnected)hide();});nodes.observe(container,{childList:true,subtree:true});
  return {hide,dispose(){hide();events.abort();nodes.disconnect();style.remove();}};
}
