import {workspace_element as el} from './workspace_widgets';

/** 网页使用宿主Chromium沙箱；跨域load不能作为页面成功显示的证明。 */
function create_frame_preview(url:string){
  const frame=el('iframe','workspace-link-web'),status=el('div','workspace-link-web-status');
  frame.title='网页只读预览';frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
  status.setAttribute('role','status');status.textContent='正在加载网页；若站点禁止内嵌，可用上方图标在浏览器打开。';
  let disposed=false;
  const report=(state:string,text:string)=>{if(disposed)return;frame.dataset.loadState=state;status.textContent=text;};
  const timer=window.setTimeout(()=>report('waiting','网页仍在等待响应。可在当前预览重新加载，或在默认浏览器打开。'),15000);
  frame.dataset.loadState='loading';
  frame.onload=()=>{clearTimeout(timer);report('loaded','网页已结束加载；若为空白或显示连接错误，可能是网络或站点禁止内嵌，可重新加载或在默认浏览器打开。');};
  frame.onerror=()=>{clearTimeout(timer);report('error','网页加载失败，请在当前预览重试或在默认浏览器打开。');};
  frame.src=url;
  return {frame,status,current_url:()=>url,can_travel:(_direction:number)=>false,travel:(_direction:number)=>{},reload:()=>{frame.src=url;},dispose(){if(disposed)return;disposed=true;clearTimeout(timer);frame.onload=null;frame.onerror=null;frame.remove();status.remove();}};
}

/** 复用宿主已启用的独立Chromium guest；不依赖主进程注入或外部浏览器配置。 */
export function create_preview_web(url:string,on_change:()=>void=()=>{}){
  const frame=document.createElement('webview') as HTMLElement & {loadURL?:unknown;getURL:()=>string;canGoBack:()=>boolean;canGoForward:()=>boolean;goBack:()=>void;goForward:()=>void;reload:()=>void;stop:()=>void};
  if(typeof frame.loadURL!=='function')return create_frame_preview(url);
  frame.className='workspace-link-web';frame.setAttribute('aria-label','网页预览');
  frame.setAttribute('partition','typora-code-web-preview');
  frame.setAttribute('webpreferences','nodeIntegration=no,nodeIntegrationInSubFrames=no,contextIsolation=yes,sandbox=yes,webSecurity=yes');
  const status=el('div','workspace-link-web-status');status.setAttribute('role','status');
  let disposed=false,ready=false,current=url,failed=false,timer:number|undefined;
  const listeners:Array<[string,EventListener]>=[];
  const listen=(name:string,handler:(event:any)=>void)=>{const guarded:EventListener=event=>{if(!disposed)handler(event);};listeners.push([name,guarded]);frame.addEventListener(name,guarded);};
  const report=(state:string,text:string)=>{if(disposed)return;frame.dataset.loadState=state;status.hidden=!text;status.textContent=text;on_change();};
  const start=()=>{failed=false;clearTimeout(timer);report('loading','正在加载网页…');timer=window.setTimeout(()=>report('waiting','网页响应较慢，可重新加载或在默认浏览器打开。'),15000);};
  const update=()=>{if(!ready)return;try{current=frame.getURL()||current;}catch{}on_change();};
  listen('dom-ready',()=>{ready=true;update();});
  listen('did-start-loading',start);listen('did-stop-loading',update);
  listen('did-navigate',event=>{current=event.url||current;if(event.httpResponseCode>=400){failed=true;report('error','网页服务器返回HTTP '+event.httpResponseCode+'，可重新加载或在默认浏览器打开。');}update();});
  listen('did-navigate-in-page',event=>{if(event.isMainFrame!==false){current=event.url||current;update();}});
  listen('did-finish-load',()=>{clearTimeout(timer);if(!failed)report('loaded','');update();});
  listen('did-fail-load',event=>{if(event.isMainFrame===false||event.errorCode===-3)return;clearTimeout(timer);failed=true;report('error','网页加载失败：'+event.errorDescription+'（'+event.errorCode+'）。可重新加载或在默认浏览器打开。');});
  listen('render-process-gone',()=>{clearTimeout(timer);failed=true;report('error','网页进程已退出，请重新加载。');});
  const can_travel=(direction:number)=>{if(disposed||!ready)return false;try{return direction<0?frame.canGoBack():frame.canGoForward();}catch{return false;}};
  start();frame.setAttribute('src',url);
  return {frame,status,current_url:()=>current,can_travel,travel(direction:number){if(can_travel(direction)){if(direction<0)frame.goBack();else frame.goForward();}},reload(){if(!disposed&&ready)frame.reload();},dispose(){if(disposed)return;disposed=true;clearTimeout(timer);for(const [name,handler] of listeners)frame.removeEventListener(name,handler);try{if(ready)frame.stop();}catch{}frame.remove();status.remove();}};
}
