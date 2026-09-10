type titlebar_binding={dispose():void};
let active_binding:titlebar_binding|undefined;
let setting_request:Promise<unknown>|undefined;

/** 只恢复宿主标准窗口设置；现有窗口由用户正常重启，不自造菜单或窗控。 */
export function install_workspace_titlebar():titlebar_binding|undefined{
  if(active_binding)return active_binding;
  const runtime=window as any;
  if(!runtime.File?.isNode||runtime.File.isMac)return;
  const platform=runtime.reqnode?.("process").platform;
  if(platform&&!["win32","linux"].includes(platform))return;
  const root=document.documentElement,previous=root.getAttribute("data-linux-note-titlebar");let disposed=false;
  const binding:titlebar_binding={dispose(){if(disposed)return;disposed=true;if(active_binding===binding)active_binding=undefined;if(previous===null)root.removeAttribute("data-linux-note-titlebar");else root.setAttribute("data-linux-note-titlebar",previous);}};
  active_binding=binding;
  if(runtime.File.option?.framelessWindow!==true){root.dataset.linuxNoteTitlebar="native";return binding;}
  root.dataset.linuxNoteTitlebar="restoring-native";
  if(!setting_request){
    setting_request=Promise.resolve().then(()=>runtime.reqnode("electron").ipcRenderer.invoke("setting.put","framelessWindow",false));
    // 失败后允许下一次显式生命周期重试；同一次绑定不会重复写设置。
    void setting_request.catch(()=>{setting_request=undefined;});
  }
  void setting_request.then(()=>{if(!disposed)root.dataset.linuxNoteTitlebar="next-window";},error=>{if(!disposed){root.dataset.linuxNoteTitlebar="setting-failed";console.error("Typora Code restore native window:",error);}});
  return binding;
}
