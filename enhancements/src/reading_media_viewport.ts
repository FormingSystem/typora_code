import {wheel_zoom_direction} from "./workspace_wheel_zoom";
import {workspace_text} from "./workspace_i18n";
import {workspace_element as el} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import {git_icon} from "./git_icons";
import css from "./reading_media_viewer.css";

export type reading_media = {content:HTMLElement|SVGSVGElement;width:number;height:number;label:string;origin?:HTMLElement;source?:Element;initial_fit?:boolean};

export const media_button=(action:string,label:string,icon?:Parameters<typeof git_icon>[0])=>{
  const node=el("button","",icon?"":label);
  node.type="button";
  node.dataset.action=action;
  node.title=label;
  node.setAttribute("aria-label",label);
  if(icon)node.append(git_icon(icon));
  return node;
};

function scroll_image_axis(offset:number,delta:number,scaled_size:number,visible:number):number {
  if(!delta)return offset;
  const limit=Math.max(0,(scaled_size-visible)/2);
  if(!limit)return offset;
  return Math.max(-limit,Math.min(limit,offset-delta));
}

/** Each mounted viewport owns its scale and pan, including each side of a comparison. */
export function mount_reading_media_viewport(viewer:HTMLElement, media:reading_media, inline:boolean) {
  const toolbar=el("div","reading-media-toolbar");
  toolbar.setAttribute("aria-label",workspace_text("reading_media_viewer_zoom_control"));
  const output=el("output"),canvas=el("div","reading-media-canvas"),positioner=el("div","reading-media-positioner"),content=el("div","reading-media-content");
  toolbar.append(
    media_button("zoom-out",workspace_text("reading_media_viewer_zoom_out"),"remove"),output,
    media_button("zoom-in",workspace_text("reading_media_viewer_zoom_in"),"add"),
    media_button("fit-width",workspace_text("reading_media_viewer_fit_width")),
    media_button("fit",workspace_text("reading_media_viewer_fit_screen")),
    media_button("reset","100%"));
  content.append(media.content);
  positioner.append(content);
  canvas.append(positioner);
  const style=acquire_workspace_style("typora-code-style:reading_media_viewer",css);
  const interaction=acquire_workspace_interaction(viewer);
  const controller=new AbortController(),signal=controller.signal;
  let failed=false,fit_initial=true,mode:"fit"|"fit-width"|"manual"="fit";
  const MAXIMUM_ZOOM=6, ZOOM_FACTOR=1.25;
  const view={scale:1,x:0,y:0};let drag:{pointer_id:number;x:number;y:number;origin_x:number;origin_y:number}|undefined;
  const apply=()=>{
    viewer.style.setProperty("--reading-media-scale",String(view.scale));viewer.style.setProperty("--reading-media-pan-x",`${view.x}px`);viewer.style.setProperty("--reading-media-pan-y",`${view.y}px`);
    output.value=`${Number((view.scale*100).toFixed(view.scale<0.1?2:0))}%`;output.textContent=output.value;
  };
  const fit_scale=()=>Math.min(canvas.clientWidth/media.width,canvas.clientHeight/media.height)*(inline?1:0.88);
  const zoom=(scale:number,x=0,y=0)=>{
    if(failed)return;mode="manual";
    const next=Math.max(Math.min(0.2,fit_scale()),Math.min(MAXIMUM_ZOOM,scale)),ratio=next/view.scale;
    view.x=x-(x-view.x)*ratio;view.y=y-(y-view.y)*ratio;view.scale=next;apply();
  };
  const fit=(width=false,initial=false)=>{
    if(failed||!canvas.clientWidth||!canvas.clientHeight)return;
    fit_initial=initial;
    mode=width?"fit-width":"fit";
    const limit=initial||(inline&&!width)?1:MAXIMUM_ZOOM;
    const scale=width?canvas.clientWidth/media.width*(inline?1:0.92):fit_scale();
    view.scale=Math.min(limit,scale);
    view.x=view.y=0;
    apply();
  };
  const reset=()=>{if(failed)return;mode="manual";view.scale=1;view.x=view.y=0;apply();};
  const resize=new ResizeObserver(()=>{if(mode!=="manual")fit(mode==="fit-width",fit_initial);});resize.observe(canvas);
  canvas.addEventListener("wheel",event=>{
    if(failed || event.defaultPrevented)return;
    const unit=event.deltaMode===WheelEvent.DOM_DELTA_LINE?16:event.deltaMode===WheelEvent.DOM_DELTA_PAGE?canvas.clientHeight:1;
    if(wheel_zoom_direction(event)){
      event.preventDefault();
      event.stopPropagation();
      const bounds=canvas.getBoundingClientRect();
      zoom(view.scale*Math.exp(-event.deltaY*unit*0.002),event.clientX-bounds.left-bounds.width/2,event.clientY-bounds.top-bounds.height/2);
      return;
    }
    if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    const x=scroll_image_axis(view.x,event.deltaX*unit,media.width*view.scale,canvas.clientWidth);
    const y=scroll_image_axis(view.y,event.deltaY*unit,media.height*view.scale,canvas.clientHeight);
    if(x===view.x && y===view.y)return;
    event.preventDefault();
    event.stopPropagation();
    view.x=x;
    view.y=y;
    apply();
  },{passive:false,signal});
  canvas.addEventListener("pointerdown",event=>{
    if(event.button!==0||failed)return;event.preventDefault();drag={pointer_id:event.pointerId,x:event.clientX,y:event.clientY,origin_x:view.x,origin_y:view.y};canvas.setPointerCapture(event.pointerId);viewer.classList.add("is-dragging");
  },{signal});
  canvas.addEventListener("pointermove",event=>{
    if(!drag||event.pointerId!==drag.pointer_id)return;mode="manual";view.x=drag.origin_x+event.clientX-drag.x;view.y=drag.origin_y+event.clientY-drag.y;apply();
  },{signal});
  const end_drag=(event:PointerEvent)=>{if(drag?.pointer_id!==event.pointerId)return;drag=undefined;viewer.classList.remove("is-dragging");if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
  canvas.addEventListener("pointerup",end_drag,{signal});canvas.addEventListener("pointercancel",end_drag,{signal});canvas.addEventListener("lostpointercapture",end_drag,{signal});

  const act=(action:string)=>{
    switch(action){
      case "zoom-in": zoom(view.scale*ZOOM_FACTOR); break;
      case "zoom-out": zoom(view.scale/ZOOM_FACTOR); break;
      case "fit": fit(); break;
      case "fit-width": fit(true); break;
      case "reset": reset(); break;
    }
  };
  toolbar.addEventListener("click",event=>{
    const action=(event.target as Element).closest<HTMLButtonElement>("button[data-action]")?.dataset.action;
    if(action){event.preventDefault();event.stopPropagation();act(action);}
  },{signal});
  const disable=()=>{
    failed=true;content.replaceChildren(el("p","reading-media-error",workspace_text("reading_media_viewer_image_cannot_be_loaded_please_close_and_reopen")));content.style.transform="none";
    for(const node of toolbar.querySelectorAll("button"))node.disabled=true;
    output.value="";output.textContent="";drag=undefined;viewer.classList.remove("is-dragging");
  };
  return {canvas,toolbar,act,disable,initialize:()=>media.initial_fit?fit(false,true):reset(),
    dispose(){controller.abort();resize.disconnect();interaction.remove();style.remove();}
  };
}
