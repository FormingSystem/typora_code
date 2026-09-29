/** Content font adjustments and their compensation baseline survive window restarts. */
export type content_zoom_role = "editor" | "terminal";
const STORAGE_KEY="typora-code:content-zoom:v1";
const listeners = new Map<() => void, (()=>void)|undefined>();
let startup_factor=1,window_factor=1,owners=0;
const steps:Record<content_zoom_role,number>={editor:0,terminal:0};
let reset_window:(()=>void)|undefined;
const emit=()=>{for(const listener of listeners.keys())listener();};
const persist=()=>{if(!owners)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify({schema:1,startup_factor,window_factor,...steps}));}catch(error){console.warn("Unable to save content appearance",error);}};
export function prepare_content_zoom(){for(const prepare of listeners.values())prepare?.();}
export function content_font_size(base:number,role:content_zoom_role="editor"){return Math.max(6,base+steps[role])*startup_factor/window_factor;}
export function change_content_font(role:content_zoom_role,direction:number,base=14){const next=Math.max(6,Math.min(role==="terminal"?100:1000,base+steps[role]+direction))-base;if(next!==steps[role]){prepare_content_zoom();steps[role]=next;persist();emit();}}
export function reset_content_font(role:content_zoom_role){if(steps[role]){prepare_content_zoom();steps[role]=0;persist();emit();}}
export function reset_content_appearance(){prepare_content_zoom();reset_window?.();startup_factor=1;steps.editor=steps.terminal=0;persist();emit();}
export function observe_content_zoom(listener:()=>void,prepare?:()=>void){listeners.set(listener,prepare);return()=>{listeners.delete(listener);};}
export function bind_content_zoom(runtime:{reqnode?:(name:string)=>any;ClientCommand?:Record<string,(...args:any[])=>unknown>}){
  const read=()=>{try{const value=runtime.reqnode?.("electron")?.webFrame?.getZoomFactor();return Number.isFinite(value)&&value>0?value:1;}catch{return 1;}};
  if(!owners++){
    startup_factor=window_factor=read();steps.editor=steps.terminal=0;
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
      if(saved?.schema===1&&[saved.startup_factor,saved.window_factor].every(value=>Number.isFinite(value)&&value>=0.1&&value<=10)&&Number.isFinite(saved.editor)&&Math.abs(saved.editor)<=1000&&Number.isFinite(saved.terminal)&&Math.abs(saved.terminal)<=100){
        if(Math.abs(read()-saved.window_factor)>0.000001)runtime.ClientCommand?.setZoomLevel?.(Math.log(saved.window_factor)/Math.log(1.2));
        startup_factor=saved.startup_factor;window_factor=read();steps.editor=saved.editor;steps.terminal=saved.terminal;
      }
    }catch(error){console.warn("Unable to restore content appearance",error);}
    reset_window=()=>{runtime.ClientCommand?.resetZoom?.();window_factor=read();};
  }
  let frame=0,disposed=false;
  const sync=()=>{if(disposed)return;const value=read();if(value!==window_factor){window_factor=value;persist();emit();}};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;sync();});};
  window.addEventListener("resize",schedule);window.addEventListener("focus",schedule);
  const observer=new MutationObserver(schedule),hint=document.querySelector("#zoom-hint-current");
  if(hint)observer.observe(hint,{childList:true,subtree:true,characterData:true});
  return {sync,dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("resize",schedule);window.removeEventListener("focus",schedule);if(!--owners){reset_window=undefined;startup_factor=window_factor=1;steps.editor=steps.terminal=0;emit();}}};
}
