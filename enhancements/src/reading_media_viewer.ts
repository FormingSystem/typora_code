import {capture_workspace_focus,register_workspace_escape} from "./workspace_focus";
import {workspace_element as el} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import {observe_workspace_theme,workspace_surface_background} from "./workspace_theme";
import {git_icon} from "./git_icons";
import css from "./reading_media_viewer.css";

type reading_media = {content:HTMLElement|SVGSVGElement;width:number;height:number;label:string;origin?:HTMLElement;source?:Element;initial_fit?:boolean};
const MAXIMUM_ZOOM=6, ZOOM_FACTOR=1.25;
let active_close:((restore?:boolean)=>void)|undefined;

export function close_reading_media():void {active_close?.(false);}

/** 只持有阅读副本，图片与图表共用缩放、焦点和生命周期。 */
export function open_reading_media(media:reading_media):(restore?:boolean)=>void {
  active_close?.(false);
  const previous=capture_workspace_focus(media.origin);
  const viewer=el("section","reading-media-viewer"),header=el("div","reading-media-header"),toolbar=el("div","reading-media-toolbar");
  viewer.setAttribute("role","dialog");viewer.setAttribute("aria-modal","true");viewer.setAttribute("aria-label",media.label);
  toolbar.setAttribute("aria-label","缩放控制");
  const output=el("output"),canvas=el("div","reading-media-canvas"),positioner=el("div","reading-media-positioner"),content=el("div","reading-media-content");
  const hint=el("div","reading-media-hint","Ctrl + 滚轮缩放 · 按住左键拖动 · Esc 退出");
  const button=(action:string,label:string,icon?:Parameters<typeof git_icon>[0])=>{
    const node=el("button","",icon?"":label);node.type="button";node.dataset.action=action;node.title=label;node.setAttribute("aria-label",label);if(icon)node.append(git_icon(icon));return node;
  };
  const close_button=button("close","退出全屏");close_button.prepend(git_icon("close"));
  toolbar.append(button("zoom-out","缩小","remove"),output,button("zoom-in","放大","add"),button("fit-width","适应宽度"),button("fit","适应屏幕"),button("reset","100%"));
  header.append(toolbar,close_button);content.append(media.content);positioner.append(content);canvas.append(positioner);viewer.append(header,canvas,hint);
  const style=acquire_workspace_style("typora-code-style:reading_media_viewer",css),interaction=acquire_workspace_interaction(viewer);
  document.body.append(viewer);document.body.classList.add("reading-media-viewer-open");
  let closed=false,ready_frame=0,failed=false,fit_initial=false,mode:"fit"|"fit-width"|"manual"="manual";
  const controller=new AbortController(),signal=controller.signal;
  const view={scale:1,x:0,y:0};let drag:{pointer_id:number;x:number;y:number;origin_x:number;origin_y:number}|undefined;
  const controls=()=>[...viewer.querySelectorAll<HTMLButtonElement>("button")].filter(node=>!node.disabled);
  const apply=()=>{
    viewer.style.setProperty("--reading-media-scale",String(view.scale));viewer.style.setProperty("--reading-media-pan-x",`${view.x}px`);viewer.style.setProperty("--reading-media-pan-y",`${view.y}px`);
    output.value=`${Number((view.scale*100).toFixed(view.scale<0.1?2:0))}%`;output.textContent=output.value;
  };
  const fit_scale=()=>Math.min(canvas.clientWidth/media.width,canvas.clientHeight/media.height)*0.88;
  const zoom=(scale:number,x=0,y=0)=>{
    if(failed)return;mode="manual";
    const next=Math.max(Math.min(0.2,fit_scale()),Math.min(MAXIMUM_ZOOM,scale)),ratio=next/view.scale;
    view.x=x-(x-view.x)*ratio;view.y=y-(y-view.y)*ratio;view.scale=next;apply();
  };
  const fit=(width=false,initial=false)=>{
    if(failed||!canvas.clientWidth||!canvas.clientHeight)return;
    fit_initial=initial;mode=width?"fit-width":"fit";view.scale=Math.min(initial?1:MAXIMUM_ZOOM,width?canvas.clientWidth/media.width*0.92:fit_scale());view.x=view.y=0;apply();
  };
  const reset=()=>{if(failed)return;mode="manual";view.scale=1;view.x=view.y=0;apply();};
  const dispose_theme=observe_workspace_theme(()=>{
    const background=workspace_surface_background(document.querySelector("content > #write")||document.body);
    const dark=background[0]*0.2126+background[1]*0.7152+background[2]*0.0722<128;
    viewer.style.setProperty("--reading-media-background",`rgb(${background.join(",")})`);viewer.dataset.theme=dark?"dark":"light";
  });
  const resize=new ResizeObserver(()=>{if(mode!=="manual")fit(mode==="fit-width",fit_initial);});resize.observe(canvas);
  const close=(restore=true)=>{
    if(closed)return;const owns_focus=escape_layer.owns_focus();closed=true;if(active_close===close)active_close=undefined;escape_layer.dispose();
    controller.abort();source_observer.disconnect();cancelAnimationFrame(ready_frame);resize.disconnect();dispose_theme();viewer.remove();interaction.remove();style.remove();document.body.classList.remove("reading-media-viewer-open");
    if(restore&&owns_focus)previous.restore();
  };
  const escape_layer=register_workspace_escape(()=>[viewer],()=>close());
  const source_observer=new MutationObserver(()=>{
    if(media.source&&(!media.source.isConnected||!media.source.getClientRects().length||getComputedStyle(media.source).visibility!=="visible"))close(false);
  });
  if(media.source){source_observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","class","style"]});const root=media.source.getRootNode();if(root instanceof ShadowRoot)source_observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","class","style"]});}
  active_close=close;
  const error=()=>{
    if(closed)return;failed=true;content.replaceChildren(el("p","reading-media-error","图片无法加载，请关闭后重新打开。"));content.style.transform="none";
    for(const node of toolbar.querySelectorAll("button"))node.disabled=true;output.value="";output.textContent="";drag=undefined;viewer.classList.remove("is-dragging");
  };
  if(media.content instanceof HTMLImageElement)media.content.addEventListener("error",error,{signal});
  viewer.addEventListener("click",event=>{
    const action=(event.target as Element).closest<HTMLButtonElement>("button[data-action]")?.dataset.action;
    if(!action)return;event.preventDefault();event.stopPropagation();
    if(action==="close")close();else if(action==="zoom-in")zoom(view.scale*ZOOM_FACTOR);else if(action==="zoom-out")zoom(view.scale/ZOOM_FACTOR);else if(action==="fit")fit();else if(action==="fit-width")fit(true);else if(action==="reset")reset();
  },{signal});
  window.addEventListener("keydown",event=>{
    if(closed||!escape_layer.is_top())return;
    const primary=(event.ctrlKey||event.metaKey)&&!event.altKey;
    if(event.key==="Tab"){
      const nodes=controls(),index=nodes.indexOf(document.activeElement as HTMLButtonElement);
      const target=event.shiftKey?(index<=0?nodes.at(-1):nodes[index-1]):nodes[(index+1)%nodes.length];
      event.preventDefault();event.stopImmediatePropagation();target?.focus({preventScroll:true});return;
    }
    if(primary&&["+","=","-","0"].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();if(event.key==="0")reset();else zoom(view.scale*(event.key==="-"?1/ZOOM_FACTOR:ZOOM_FACTOR));return;
    }
    // 查看时不把保存、打印、编辑等快捷键交给背景正文。
    if(primary){event.preventDefault();event.stopImmediatePropagation();}
  },{capture:true,signal});
  canvas.addEventListener("wheel",event=>{
    event.preventDefault();event.stopPropagation();if(!(event.ctrlKey||event.metaKey))return;
    const bounds=canvas.getBoundingClientRect();zoom(view.scale*Math.exp(-event.deltaY*0.002),event.clientX-bounds.left-bounds.width/2,event.clientY-bounds.top-bounds.height/2);
  },{passive:false,signal});
  canvas.addEventListener("pointerdown",event=>{
    if(event.button!==0||failed)return;event.preventDefault();drag={pointer_id:event.pointerId,x:event.clientX,y:event.clientY,origin_x:view.x,origin_y:view.y};canvas.setPointerCapture(event.pointerId);viewer.classList.add("is-dragging");
  },{signal});
  canvas.addEventListener("pointermove",event=>{
    if(!drag||event.pointerId!==drag.pointer_id)return;mode="manual";view.x=drag.origin_x+event.clientX-drag.x;view.y=drag.origin_y+event.clientY-drag.y;apply();
  },{signal});
  const end_drag=(event:PointerEvent)=>{if(drag?.pointer_id!==event.pointerId)return;drag=undefined;viewer.classList.remove("is-dragging");if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
  canvas.addEventListener("pointerup",end_drag,{signal});canvas.addEventListener("pointercancel",end_drag,{signal});canvas.addEventListener("lostpointercapture",end_drag,{signal});
  canvas.addEventListener("dblclick",()=>fit(),{signal});
  ready_frame=requestAnimationFrame(()=>{if(closed)return;media.initial_fit?fit(false,true):reset();close_button.focus({preventScroll:true});});
  return close;
}
