import {workspace_text} from "./workspace_i18n";
import {workspace_element as el} from './workspace_widgets';
import type {preview_find_target,preview_find_result} from './workspace_preview_find';

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
  const find_target:preview_find_target={search(_query,_direction,_repeat,report){report({current:0,total:0,error:workspace_text('preview_find_unavailable')});},clear(){},focus(){frame.focus();}};
  return {frame,status,find_target,current_url:()=>url,can_travel:(_direction:number)=>false,travel:(_direction:number)=>{},reload:()=>{frame.src=url;},dispose(){if(disposed)return;disposed=true;clearTimeout(timer);frame.onload=null;frame.onerror=null;frame.remove();status.remove();}};
}

/** Reuse the host's already enabled independent Chromium guest; do not rely on main process injection or external browser configuration. */
export function create_preview_web(url:string,on_change:()=>void=()=>{},on_find:(action:string)=>void=()=>{}){
  const frame=document.createElement('webview') as HTMLElement & {loadURL?:unknown;getURL:()=>string;canGoBack:()=>boolean;canGoForward:()=>boolean;goBack:()=>void;goForward:()=>void;reload:()=>void;stop:()=>void;findInPage(query:string,options:object):number;stopFindInPage(action:string):void;send(channel:string,value:boolean):Promise<void>};
  if(typeof frame.loadURL!=='function')return create_frame_preview(url);
  frame.className='workspace-link-web';frame.setAttribute('aria-label',workspace_text("preview_web_web_page_preview"));
  frame.setAttribute('partition','typora-code-web-preview');
  frame.setAttribute('webpreferences','nodeIntegration=no,nodeIntegrationInSubFrames=no,contextIsolation=yes,sandbox=yes,webSecurity=yes');
  const runtime=window as any;
  if(runtime.reqnode&&runtime._options?.userDataPath){const path=runtime.reqnode('path'),url_api=runtime.reqnode('url');frame.setAttribute('preload',url_api.pathToFileURL(path.join(runtime._options.userDataPath,'typora_code/assets/preview/workspace_preview_preload.cjs')).href);}
  const status=el('div','workspace-link-web-status');status.setAttribute('role','status');
  let disposed=false,ready=false,current=url,failed=false,timer:number|undefined;
  const listeners:Array<[string,EventListener]>=[];
  const listen=(name:string,handler:(event:any)=>void)=>{const guarded:EventListener=event=>{if(!disposed)handler(event);};listeners.push([name,guarded]);frame.addEventListener(name,guarded);};
  let find_id=0,find_current=0,find_total=0,find_report:((result:preview_find_result)=>void)|undefined;
  const find_state=(value:boolean)=>{if(ready)void frame.send('typora-code-preview-find-state',value).catch(()=>{});};
  const find_target:preview_find_target={
    search(query,direction,repeat,report){
      find_report=report;
      if(!ready||failed){report({current:0,total:0,error:workspace_text('preview_find_wait')});return;}
      find_state(true);
      if(!query){find_id=0;frame.stopFindInPage('clearSelection');report({current:0,total:0});return;}
      try{
        const restart=!repeat||!find_total||(direction>=0?find_current>=find_total:find_current<=1);
        // This host's guest can stall when a follow-up crosses the document boundary.
        // Restart the native session at that boundary and retain native result evidence.
        if(restart){find_id=0;frame.stopFindInPage('clearSelection');}
        find_id=frame.findInPage(query,{forward:direction>=0,findNext:restart,matchCase:false});
      }catch(error){report({current:0,total:0,error:workspace_text('preview_find_failed')+String(error)});}
    },
    clear(){find_id=find_current=find_total=0;find_report=undefined;if(ready){try{frame.stopFindInPage('clearSelection');}catch{}find_state(false);}},
    focus(){frame.focus();}
  };
  listen('found-in-page',event=>{if(event.result?.requestId===find_id&&find_id){find_current=event.result.activeMatchOrdinal;find_total=event.result.matches;find_report?.({current:find_current,total:find_total});}});
  listen('ipc-message',event=>{if(event.channel==='typora-code-preview-find'&&event.args?.length===1&&['open','next','previous','close'].includes(event.args[0]))on_find(event.args[0]);});
  const report=(state:string,text:string)=>{if(disposed)return;frame.dataset.loadState=state;status.hidden=!text;status.textContent=text;on_change();};
  const start=()=>{find_target.clear();failed=false;clearTimeout(timer);report('loading',workspace_text("preview_web_loading_web_page"));timer=window.setTimeout(()=>report('waiting',workspace_text("preview_web_the_web_page_response_is_slow_you_can_reload_it_or_open_it_i")),15000);};
  const update=()=>{if(!ready)return;try{current=frame.getURL()||current;}catch{}on_change();};
  listen('dom-ready',()=>{ready=true;update();});
  listen('did-start-navigation',event=>{if(event.isMainFrame!==false&&!event.isInPlace){find_target.clear();ready=false;}});
  listen('did-start-loading',start);listen('did-stop-loading',update);
  listen('did-navigate',event=>{current=event.url||current;if(event.httpResponseCode>=400){failed=true;report('error',workspace_text("preview_web_web_server_returned_http")+event.httpResponseCode+workspace_text("preview_web_you_can_reload_it_or_open_it_in_the_default_browser"));}update();});
  listen('did-navigate-in-page',event=>{if(event.isMainFrame!==false){current=event.url||current;update();}});
  listen('did-finish-load',()=>{clearTimeout(timer);if(!failed)report('loaded','');update();});
  listen('did-fail-load',event=>{if(event.isMainFrame===false||event.errorCode===-3)return;clearTimeout(timer);failed=true;report('error',workspace_text("preview_web_web_page_loading_failed")+event.errorDescription+'（'+event.errorCode+workspace_text("preview_web_you_can_reload_it_or_open_it_in_the_default_browser_33173455"));});
  listen('render-process-gone',()=>{clearTimeout(timer);failed=true;report('error',workspace_text("preview_web_the_web_page_process_has_exited_please_reload"));});
  const can_travel=(direction:number)=>{if(disposed||!ready)return false;try{return direction<0?frame.canGoBack():frame.canGoForward();}catch{return false;}};
  start();frame.setAttribute('src',url);
  return {frame,status,find_target,current_url:()=>current,can_travel,travel(direction:number){if(can_travel(direction)){if(direction<0)frame.goBack();else frame.goForward();}},reload(){if(!disposed&&ready)frame.reload();},dispose(){if(disposed)return;find_target.clear();disposed=true;clearTimeout(timer);for(const [name,handler] of listeners)frame.removeEventListener(name,handler);try{if(ready)frame.stop();}catch{}frame.remove();status.remove();}};
}
