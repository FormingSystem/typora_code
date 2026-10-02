import {workspace_text} from "./workspace_i18n";
import {workspace_element as el} from "./workspace_widgets";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {reading_viewport_bounds} from "./reading_viewport";
import {git_icon,type git_icon_name} from "./git_icons";
import css from "./reading_media_entry.css";

type entry_options={source:HTMLElement|SVGSVGElement;host:Element;label:string;button_class:string;open:()=>void;icon?:git_icon_name;compact?:boolean;controls?:HTMLElement[]};
export type reading_media_entry={button:HTMLButtonElement;source:Element;set_enabled(value:boolean):void;dispose():void};
const parent_element=(node:Element):Element|null=>node.parentElement||(node.getRootNode() instanceof ShadowRoot?(node.getRootNode() as ShadowRoot).host:null);

/** Images and charts share the hover entry outside of the document content, do not insert placeholders, and do not change the document layout. */
export function bind_reading_media_entries(root:HTMLElement=document.body){
  const layer=el("div","reading-media-entries"),style=acquire_workspace_style("typora-code-style:reading_media_entry",css),interaction=acquire_workspace_interaction(layer);
  layer.contentEditable="false";document.body.append(layer);
  const controller=new AbortController(),{signal}=controller;
  const entries=new Map<HTMLButtonElement,{options:entry_options;toolbar:HTMLElement;enabled:boolean;events:AbortController}>();
  let disposed=false,frame=0;
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(update);};
  const resize=new ResizeObserver(schedule);
  function update(){
    frame=0;if(disposed)return;
    for(const [button,entry]of entries){
      const {source}=entry.options,rect=source.getBoundingClientRect(),width=rect.width;
      const enabled=entry.enabled&&source.isConnected&&width>=(entry.options.controls?1:48)&&rect.height>0;
      button.classList.toggle("is-small",!!entry.options.controls||width<160);
      let left=0,right=innerWidth,top=0,bottom=innerHeight,shown=enabled;
      for(let node:Element|null=source;shown&&node;node=parent_element(node)){
        const computed=getComputedStyle(node);
        if(computed.display==="none"||computed.visibility!=="visible"||Number(computed.opacity)===0||node.hasAttribute("hidden")||node.hasAttribute("inert")){shown=false;break;}
        if(node!==source&&node!==document.body&&node!==document.documentElement){
          const bounds=node.getBoundingClientRect();
          if(/auto|scroll|hidden|clip/.test(computed.overflowX)){left=Math.max(left,bounds.left+node.clientLeft);right=Math.min(right,bounds.left+node.clientLeft+node.clientWidth);}
          if(/auto|scroll|hidden|clip/.test(computed.overflowY)){
            const clip_top=bounds.top+node.clientTop,clip_bottom=clip_top+node.clientHeight;
            // Reading scroll container constrains the entire entry; the media's own clipping shell only constrains whether the source is visible.
            // Outer floating layer can cross over the unrolled clipping shell, without relying on adding empty lines to the chart to accommodate the button.
            if(/auto|scroll/.test(computed.overflowY)||node===root||node.scrollTop!==0){top=Math.max(top,clip_top);bottom=Math.min(bottom,clip_bottom);}
            else shown=rect.top>=clip_top&&rect.top<clip_bottom;
          }
        }
        if(node instanceof HTMLElement&&node.tagName==="CONTENT"){const bounds=reading_viewport_bounds(node);left=Math.max(left,bounds.left);right=Math.min(right,bounds.right);top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom);}
      }
      const x=Math.max(left,rect.left),end=Math.min(right,rect.right);
      const controls=entry.options.controls;
      const preferred=controls?Math.ceil(16+button.getBoundingClientRect().width+controls.reduce((sum,node)=>sum+node.getBoundingClientRect().width+4,0)):button.offsetWidth+16;
      const entry_width=Math.min(Math.max(0,controls?right-left:end-x),preferred);
      entry.toolbar.style.width=`${entry_width}px`;
      const height=entry.toolbar.offsetHeight;
      const entry_top=entry.options.compact?rect.top+4:Math.max(controls?top:-Infinity,rect.top-height);
      // Image controls stay reachable at the viewport edge while their source remains visible.
      shown=shown&&rect.bottom>top&&rect.top<bottom&&entry_top>=top&&entry_top+height<=bottom&&end-x>=(controls?1:48);
      button.hidden=!shown;
      if(controls)for(const node of controls)node.hidden=!shown;
      // Hit bridge only follows the button width, does not turn the entire image and text gap into an unselectable operational area.
      entry.toolbar.style.left=`${Math.max(left,end-entry_width)}px`;entry.toolbar.style.top=`${entry_top}px`;
    }
  }
  const observer=new MutationObserver(changes=>{
    if(changes.some(change=>!(change.target instanceof Element&&change.target.closest(".reading-media-entries,.reading-media-viewer"))))schedule();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","hidden"]});
  if(root.getRootNode() instanceof ShadowRoot)observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","hidden"]});
  document.addEventListener("scroll",schedule,{capture:true,passive:true,signal});
  if(root!==document.body)root.addEventListener("scroll",schedule,{capture:true,passive:true,signal});
  window.addEventListener("resize",schedule,{passive:true,signal});
  // Capture entry only manages its own button, avoids the host's first click rebuilding the document; image single click does not go here.
  const activate=(event:Event)=>{
    const control=event.composedPath().find(node=>node instanceof HTMLElement&&node.closest('.reading-media-extra')) as HTMLElement|undefined;
    if(control&&layer.contains(control))return;
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
      const toolbar=el("div","reading-media-entry"+(options.compact?" is-compact":"")),button=el("button",`reading-media-open ${options.button_class}`);
      button.type="button";button.hidden=true;button.title=options.label;button.setAttribute("aria-label",options.label);button.append(git_icon(options.icon||"screen-full"));if(!options.compact)button.append(el("span","",workspace_text("reading_media_entry_view_in_full_screen")));toolbar.append(button);layer.append(toolbar);
      if(options.controls){toolbar.classList.add('has-controls');for(const control of options.controls){control.classList.add('reading-media-extra');toolbar.insertBefore(control,button);}}
      const entry_events=new AbortController();
      if(options.controls)for(const name of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','keydown','keyup'])toolbar.addEventListener(name,event=>{event.stopPropagation();if(name==='mousedown'&&(event.target as Element).closest('button'))event.preventDefault();},{signal:entry_events.signal});
      const reveal=(event:PointerEvent)=>{const target=event.relatedTarget;const inside=target instanceof Node&&(options.host.contains(target)||toolbar.contains(target));if(event.type==='pointerenter'||!inside)toolbar.classList.toggle('is-revealed',event.type==='pointerenter');};
      for(const node of [options.host,toolbar])for(const name of ['pointerenter','pointerleave'])node.addEventListener(name,reveal as EventListener,{signal:entry_events.signal});
      if(options.host.matches(':hover'))toolbar.classList.add('is-revealed');
      const state={options,toolbar,enabled:true,events:entry_events};entries.set(button,state);resize.observe(options.source);resize.observe(toolbar);schedule();
      let removed=false;
      return {button,source:options.source,set_enabled(value){if(state.enabled!==value){state.enabled=value;schedule();}},dispose(){if(removed)return;removed=true;entry_events.abort();entries.delete(button);resize.unobserve(options.source);resize.unobserve(toolbar);toolbar.remove();}};
    },
    dispose(){if(disposed)return;disposed=true;controller.abort();cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();for(const entry of entries.values()){entry.events.abort();}entries.clear();layer.remove();interaction.remove();style.remove();}
  };
}
