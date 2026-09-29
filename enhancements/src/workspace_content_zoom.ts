/** The font size of the current window's content is independent of the host window's ratio and persistent font settings. */
export type content_zoom_role = "editor" | "terminal";
const listeners = new Map<() => void, (()=>void)|undefined>();
let startup_factor=1,window_factor=1,owners=0;
const steps:Record<content_zoom_role,number>={editor:0,terminal:0};
const emit=()=>{for(const listener of listeners.keys())listener();};
export function prepare_content_zoom(){for(const prepare of listeners.values())prepare?.();}
export function content_font_size(base:number,role:content_zoom_role="editor"){return Math.max(6,base+steps[role])*startup_factor/window_factor;}
export function change_content_font(role:content_zoom_role,direction:number,base=14){const next=Math.max(6,Math.min(role==="terminal"?100:1000,base+steps[role]+direction))-base;if(next!==steps[role]){prepare_content_zoom();steps[role]=next;emit();}}
export function reset_content_font(role:content_zoom_role){if(steps[role]){steps[role]=0;emit();}}
export function observe_content_zoom(listener:()=>void,prepare?:()=>void){listeners.set(listener,prepare);return()=>{listeners.delete(listener);};}
export function bind_content_zoom(runtime:{reqnode?:(name:string)=>any}){
  const read=()=>{try{const value=runtime.reqnode?.("electron")?.webFrame?.getZoomFactor();return Number.isFinite(value)&&value>0?value:1;}catch{return 1;}};
  if(!owners++){startup_factor=window_factor=read();steps.editor=steps.terminal=0;}
  let frame=0,disposed=false;
  const sync=()=>{if(disposed)return;const value=read();if(value!==window_factor){window_factor=value;emit();}};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;sync();});};
  window.addEventListener("resize",schedule);window.addEventListener("focus",schedule);
  const observer=new MutationObserver(schedule),hint=document.querySelector("#zoom-hint-current");
  if(hint)observer.observe(hint,{childList:true,subtree:true,characterData:true});
  return {sync,dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("resize",schedule);window.removeEventListener("focus",schedule);if(!--owners){startup_factor=window_factor=1;steps.editor=steps.terminal=0;emit();}}};
}
