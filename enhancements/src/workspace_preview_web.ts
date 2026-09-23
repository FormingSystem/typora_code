import {workspace_element as el} from './workspace_widgets';

/** 网页使用宿主Chromium沙箱；跨域load不能作为页面成功显示的证明。 */
export function create_preview_web(url:string){
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
  return {frame,status,dispose(){if(disposed)return;disposed=true;clearTimeout(timer);frame.onload=null;frame.onerror=null;frame.remove();status.remove();}};
}
