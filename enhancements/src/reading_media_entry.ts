import {workspace_element as el} from "./workspace_widgets";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {reading_viewport_bounds} from "./reading_viewport";
import {git_icon} from "./git_icons";
import css from "./reading_media_entry.css";

type entry_options={source:HTMLElement|SVGSVGElement;host:Element;before?:Element|null;label:string;button_class:string;slot_class?:string;open:()=>void};
export type reading_media_entry={button:HTMLButtonElement;slot:HTMLSpanElement;set_enabled(value:boolean):void;dispose():void};
const parent_element=(node:Element):Element|null=>node.parentElement||(node.getRootNode() instanceof ShadowRoot?(node.getRootNode() as ShadowRoot).host:null);

/** 图片和图表共用流内工具行；按钮在阅读层投影到该行，绝不吸附到图像可见边缘。 */
export function bind_reading_media_entries(root:HTMLElement=document.body){
  const layer=el("div","reading-media-entries"),style=acquire_workspace_style("typora-code-style:reading_media_entry",css),interaction=acquire_workspace_interaction(layer);
  layer.contentEditable="false";document.body.append(layer);
  const controller=new AbortController(),{signal}=controller;
  const entries=new Map<HTMLButtonElement,{options:entry_options;toolbar:HTMLElement;slot:HTMLSpanElement;enabled:boolean;events:AbortController}>();
  let disposed=false,frame=0;
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(update);};
  const resize=new ResizeObserver(schedule);
  function update(){
    frame=0;if(disposed)return;
    for(const [button,entry]of entries){
      const {source}=entry.options,rect=source.getBoundingClientRect(),width=rect.width;
      const enabled=entry.enabled&&source.isConnected&&width>=48&&rect.height>0;
      const height=enabled?entry.toolbar.offsetHeight:0;
      // 占位尺寸来自同一个工具行盒，缩放和样式改变后不依赖另一套数值。
      if(entry.slot.style.height!==`${height}px`)entry.slot.style.height=`${height}px`;
      if(entry.slot.style.display!==(enabled?"block":"none"))entry.slot.style.display=enabled?"block":"none";
      button.classList.toggle("is-small",width<160);
      const slot=entry.slot.getBoundingClientRect();
      let left=0,right=innerWidth,top=0,bottom=innerHeight,shown=enabled;
      for(let node:Element|null=source;shown&&node;node=parent_element(node)){
        const computed=getComputedStyle(node);
        if(computed.display==="none"||computed.visibility!=="visible"||Number(computed.opacity)===0||node.hasAttribute("hidden")||node.hasAttribute("inert")){shown=false;break;}
        if(node!==source&&node!==document.body&&node!==document.documentElement){
          const bounds=node.getBoundingClientRect();
          if(/auto|scroll|hidden|clip/.test(computed.overflowX)){left=Math.max(left,bounds.left+node.clientLeft);right=Math.min(right,bounds.left+node.clientLeft+node.clientWidth);}
          if(/auto|scroll|hidden|clip/.test(computed.overflowY)){top=Math.max(top,bounds.top+node.clientTop);bottom=Math.min(bottom,bounds.top+node.clientTop+node.clientHeight);}
        }
        if(node instanceof HTMLElement&&node.tagName==="CONTENT"){const bounds=reading_viewport_bounds(node);left=Math.max(left,bounds.left);right=Math.min(right,bounds.right);top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom);}
      }
      const x=Math.max(left,rect.left),end=Math.min(right,rect.right);
      // 工具行完整可见才显示；滚过工具行后不把按钮压回正在阅读的图片上。
      shown=shown&&slot.top>=top&&slot.top+height<=bottom&&end-x>=48;
      button.hidden=!shown;entry.toolbar.style.left=`${x}px`;entry.toolbar.style.top=`${slot.top}px`;entry.toolbar.style.width=`${Math.max(0,end-x)}px`;
    }
  }
  const observer=new MutationObserver(changes=>{
    if(changes.some(change=>!(change.target instanceof Element&&change.target.closest(".reading-media-entries,.reading-media-entry-slot,.reading-media-viewer"))))schedule();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","hidden"]});
  if(root.getRootNode() instanceof ShadowRoot)observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","hidden"]});
  document.addEventListener("scroll",schedule,{capture:true,passive:true,signal});
  if(root!==document.body)root.addEventListener("scroll",schedule,{capture:true,passive:true,signal});
  window.addEventListener("resize",schedule,{passive:true,signal});
  // 捕获入口只管理自有按钮，避免宿主第一次点击先重建正文；图片单击不走这里。
  const activate=(event:Event)=>{
    const button=event.composedPath().find(node=>node instanceof HTMLButtonElement&&entries.has(node)) as HTMLButtonElement|undefined;
    if(!button||button.hidden)return;const entry=entries.get(button)!;
    if(event instanceof KeyboardEvent){
      if(event.key!=="Enter"&&event.key!==" ")return;
      event.preventDefault();event.stopPropagation();
      if(!event.repeat&&((event.key==="Enter"&&event.type==="keydown")||(event.key===" "&&event.type==="keyup")))entry.options.open();return;
    }
    event.stopPropagation();if(event.type==="mousedown"||event.type==="click")event.preventDefault();
    if(event.type==="click")entry.options.open();
  };
  for(const name of ["pointerdown","pointerup","mousedown","mouseup","click","dblclick","keydown","keypress","keyup"])document.addEventListener(name,activate,{capture:true,signal});
  return {
    add(options:entry_options):reading_media_entry{
      const slot=el("span",`reading-media-entry-slot ${options.slot_class||""}`.trim()),toolbar=el("div","reading-media-entry"),button=el("button",`reading-media-open ${options.button_class}`);
      slot.contentEditable="false";slot.setAttribute("aria-hidden","true");
      // 空占位跨 Shadow DOM 使用相同的最小盒模型，不引入正文文字或编辑控件。
      slot.style.cssText="display:block;box-sizing:border-box;height:0;width:100%;margin:0;padding:0;border:0;line-height:0;pointer-events:none;user-select:none";
      button.type="button";button.hidden=true;button.title=options.label;button.setAttribute("aria-label",options.label);button.append(git_icon("screen-full"),el("span","","全屏查看"));toolbar.append(button);layer.append(toolbar);options.host.insertBefore(slot,options.before??null);
      const entry_events=new AbortController();
      const reveal=(event:PointerEvent)=>{const target=event.relatedTarget;const inside=target instanceof Node&&(options.host.contains(target)||toolbar.contains(target));if(event.type==='pointerenter'||!inside)toolbar.classList.toggle('is-revealed',event.type==='pointerenter');};
      for(const node of [options.host,toolbar])for(const name of ['pointerenter','pointerleave'])node.addEventListener(name,reveal as EventListener,{signal:entry_events.signal});
      if(options.host.matches(':hover'))toolbar.classList.add('is-revealed');
      const state={options,toolbar,slot,enabled:true,events:entry_events};entries.set(button,state);resize.observe(options.source);resize.observe(slot);resize.observe(toolbar);schedule();
      let removed=false;
      return {button,slot,set_enabled(value){if(state.enabled!==value){state.enabled=value;schedule();}},dispose(){if(removed)return;removed=true;entry_events.abort();entries.delete(button);resize.unobserve(options.source);resize.unobserve(slot);resize.unobserve(toolbar);slot.remove();toolbar.remove();}};
    },
    dispose(){if(disposed)return;disposed=true;controller.abort();cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();for(const entry of entries.values()){entry.events.abort();entry.slot.remove();}entries.clear();layer.remove();interaction.remove();style.remove();}
  };
}
