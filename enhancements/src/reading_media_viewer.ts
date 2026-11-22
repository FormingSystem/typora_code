import {workspace_text} from "./workspace_i18n";
import {capture_workspace_focus,register_workspace_dismissal} from "./workspace_focus";
import {workspace_element as el} from "./workspace_widgets";
import {observe_workspace_theme,workspace_surface_background} from "./workspace_theme";
import {git_icon} from "./git_icons";
import {media_button,mount_reading_media_viewport,type reading_media} from "./reading_media_viewport";

let active_close:((restore?:boolean)=>void)|undefined;
const media_sources=new WeakMap<Element,Element>();

/** A body-mounted viewer retains the interaction owner of its source image. */
export function reading_media_source_for_event(event:Event):Element|undefined {
  for(const node of event.composedPath())if(node instanceof Element){const source=media_sources.get(node);if(source)return source;}
}

export function close_reading_media():void {active_close?.(false);}

/** Only hold reading copies, images and charts share zoom, focus, and lifecycle. */
export function open_reading_media(media:reading_media):(restore?:boolean)=>void {
  active_close?.(false);
  const previous=capture_workspace_focus(media.origin);
  const viewer=el("section","reading-media-viewer"),header=el("div","reading-media-header");
  if(media.source)media_sources.set(viewer,media.source);
  viewer.setAttribute("role","dialog");viewer.setAttribute("aria-modal","true");viewer.setAttribute("aria-label",media.label);
  const viewport=mount_reading_media_viewport(viewer,media,false);
  const {toolbar,canvas}=viewport;
  const hint=el("div","reading-media-hint",workspace_text("reading_media_viewer_ctrl_wheel_zoom_left_click_and_drag_esc_exit"));
  const close_button=media_button("close",workspace_text("reading_media_viewer_exit_full_screen"));close_button.prepend(git_icon("close"));
  header.append(toolbar,close_button);viewer.append(header,canvas,hint);
  document.body.append(viewer);document.body.classList.add("reading-media-viewer-open");
  let closed=false,ready_frame=0;
  const controller=new AbortController(),signal=controller.signal;
  const controls=()=>[...viewer.querySelectorAll<HTMLButtonElement>("button")].filter(node=>!node.disabled);
  const dispose_theme=observe_workspace_theme(()=>{
    const background=workspace_surface_background(document.querySelector("content > #write")||document.body);
    const dark=background[0]*0.2126+background[1]*0.7152+background[2]*0.0722<128;
    viewer.style.setProperty("--reading-media-background",`rgb(${background.join(",")})`);viewer.dataset.theme=dark?"dark":"light";
  });
  const close=(restore=true)=>{
    if(closed)return;const owns_focus=escape_layer.owns_focus();closed=true;if(active_close===close)active_close=undefined;escape_layer.dispose();
    controller.abort();source_observer.disconnect();cancelAnimationFrame(ready_frame);viewport.dispose();dispose_theme();media_sources.delete(viewer);viewer.remove();document.body.classList.remove("reading-media-viewer-open");
    if(restore&&owns_focus)previous.restore();
  };
  const escape_layer=register_workspace_dismissal(()=>[viewer],()=>close(),{outside:false,focus_out:false});
  const source_observer=new MutationObserver(()=>{
    if(media.source&&(!media.source.isConnected||!media.source.getClientRects().length||getComputedStyle(media.source).visibility!=="visible"))close(false);
  });
  if(media.source){source_observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","class","style"]});const root=media.source.getRootNode();if(root instanceof ShadowRoot)source_observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","class","style"]});}
  active_close=close;
  if(media.content instanceof HTMLImageElement)media.content.addEventListener("error",viewport.disable,{signal});
  close_button.addEventListener("click",()=>close(),{signal});
  window.addEventListener("keydown",event=>{
    if(closed||!escape_layer.is_top())return;
    const primary=(event.ctrlKey||event.metaKey)&&!event.altKey;
    if(event.key==="Tab"){
      const nodes=controls(),index=nodes.indexOf(document.activeElement as HTMLButtonElement);
      const target=event.shiftKey?(index<=0?nodes.at(-1):nodes[index-1]):nodes[(index+1)%nodes.length];
      event.preventDefault();event.stopImmediatePropagation();target?.focus({preventScroll:true});return;
    }
    if(primary&&["+","=","-","0"].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();viewport.act(event.key==="0"?"reset":event.key==="-"?"zoom-out":"zoom-in");return;
    }
    // When viewing, do not hand over save, print, edit, and other shortcut keys to the background document.
    if(primary){event.preventDefault();event.stopImmediatePropagation();}
  },{capture:true,signal});
  canvas.addEventListener("dblclick",()=>viewport.act("fit"),{signal});
  ready_frame=requestAnimationFrame(()=>{if(closed)return;viewport.initialize();close_button.focus({preventScroll:true});});
  return close;
}
