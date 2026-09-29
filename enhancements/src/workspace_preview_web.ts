import {workspace_text} from "./workspace_i18n";
import {workspace_element as el} from './workspace_widgets';

/** Web pages use the host's Chromium sandbox; cross-origin load cannot be proof of successful page display. */
function create_frame_preview(url:string){
  const frame=el('iframe','workspace-link-web'),status=el('div','workspace-link-web-status');
  frame.title=workspace_text("preview_web_web_page_read_only_preview");frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
  status.setAttribute('role','status');status.textContent=workspace_text("preview_web_loading_web_page_if_the_site_prohibits_embedding_you_can_use");
  let disposed=false;
  const report=(state:string,text:string)=>{if(disposed)return;frame.dataset.loadState=state;status.textContent=text;};
  const timer=window.setTimeout(()=>report('waiting',workspace_text("preview_web_the_web_page_is_still_waiting_for_a_response_you_can_reload")),15000);
  frame.dataset.loadState='loading';
  frame.onload=()=>{clearTimeout(timer);report('loaded',workspace_text("preview_web_the_web_page_has_finished_loading_if_it_is_blank_or_displays"));};
  frame.onerror=()=>{clearTimeout(timer);report('error',workspace_text("preview_web_web_page_loading_failed_please_try_reloading_it_in_the_curre"));};
  frame.src=url;
  return {frame,status,current_url:()=>url,can_travel:(_direction:number)=>false,travel:(_direction:number)=>{},reload:()=>{frame.src=url;},dispose(){if(disposed)return;disposed=true;clearTimeout(timer);frame.onload=null;frame.onerror=null;frame.remove();status.remove();}};
}

/** Reuse the host's already enabled independent Chromium guest; do not rely on main process injection or external browser configuration. */
export function create_preview_web(url:string,on_change:()=>void=()=>{}){
  const frame=document.createElement('webview') as HTMLElement & {loadURL?:unknown;getURL:()=>string;canGoBack:()=>boolean;canGoForward:()=>boolean;goBack:()=>void;goForward:()=>void;reload:()=>void;stop:()=>void};
  if(typeof frame.loadURL!=='function')return create_frame_preview(url);
  frame.className='workspace-link-web';frame.setAttribute('aria-label',workspace_text("preview_web_web_page_preview"));
  frame.setAttribute('partition','typora-code-web-preview');
  frame.setAttribute('webpreferences','nodeIntegration=no,nodeIntegrationInSubFrames=no,contextIsolation=yes,sandbox=yes,webSecurity=yes');
  const status=el('div','workspace-link-web-status');status.setAttribute('role','status');
  let disposed=false,ready=false,current=url,failed=false,timer:number|undefined;
  const listeners:Array<[string,EventListener]>=[];
  const listen=(name:string,handler:(event:any)=>void)=>{const guarded:EventListener=event=>{if(!disposed)handler(event);};listeners.push([name,guarded]);frame.addEventListener(name,guarded);};
  const report=(state:string,text:string)=>{if(disposed)return;frame.dataset.loadState=state;status.hidden=!text;status.textContent=text;on_change();};
  const start=()=>{failed=false;clearTimeout(timer);report('loading',workspace_text("preview_web_loading_web_page"));timer=window.setTimeout(()=>report('waiting',workspace_text("preview_web_the_web_page_response_is_slow_you_can_reload_it_or_open_it_i")),15000);};
  const update=()=>{if(!ready)return;try{current=frame.getURL()||current;}catch{}on_change();};
  listen('dom-ready',()=>{ready=true;update();});
  listen('did-start-loading',start);listen('did-stop-loading',update);
  listen('did-navigate',event=>{current=event.url||current;if(event.httpResponseCode>=400){failed=true;report('error',workspace_text("preview_web_web_server_returned_http")+event.httpResponseCode+workspace_text("preview_web_you_can_reload_it_or_open_it_in_the_default_browser"));}update();});
  listen('did-navigate-in-page',event=>{if(event.isMainFrame!==false){current=event.url||current;update();}});
  listen('did-finish-load',()=>{clearTimeout(timer);if(!failed)report('loaded','');update();});
  listen('did-fail-load',event=>{if(event.isMainFrame===false||event.errorCode===-3)return;clearTimeout(timer);failed=true;report('error',workspace_text("preview_web_web_page_loading_failed")+event.errorDescription+'（'+event.errorCode+workspace_text("preview_web_you_can_reload_it_or_open_it_in_the_default_browser_33173455"));});
  listen('render-process-gone',()=>{clearTimeout(timer);failed=true;report('error',workspace_text("preview_web_the_web_page_process_has_exited_please_reload"));});
  const can_travel=(direction:number)=>{if(disposed||!ready)return false;try{return direction<0?frame.canGoBack():frame.canGoForward();}catch{return false;}};
  start();frame.setAttribute('src',url);
  return {frame,status,current_url:()=>current,can_travel,travel(direction:number){if(can_travel(direction)){if(direction<0)frame.goBack();else frame.goForward();}},reload(){if(!disposed&&ready)frame.reload();},dispose(){if(disposed)return;disposed=true;clearTimeout(timer);for(const [name,handler] of listeners)frame.removeEventListener(name,handler);try{if(ready)frame.stop();}catch{}frame.remove();status.remove();}};
}
