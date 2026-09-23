import {git_icon, type git_icon_name} from "./git_icons";
import {current_remote_workspace} from './remote_workspace_context';
import {acquire_workspace_style} from "./workspace_styles";
import {create_workspace_titlebar_menu} from "./workspace_titlebar_menu";
import {create_workspace_titlebar_definitions, type titlebar_runtime} from "./workspace_titlebar_entries";
import type {workspace_file_host} from "./workspace_files";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {workspace_menu,workspace_dialog,type workspace_menu_entry} from "./workspace_widgets";
import {TITLEBAR_SETTINGS_KEY,read_titlebar_settings,toggle_titlebar_setting,type titlebar_settings,type titlebar_settings_store} from "./workspace_titlebar_settings";
import css from "./workspace_titlebar.css";

type titlebar_binding={dispose():void};
let active_binding:titlebar_binding|undefined;
let setting_request:Promise<unknown>|undefined;

/** 单行窗口复用宿主窗控节点和阅读历史；设置只对下一次正常启动生效。 */
export function install_workspace_titlebar(files:workspace_file_host,open_files:()=>void):titlebar_binding|undefined{
  if(active_binding)return active_binding;
  const runtime=window as unknown as titlebar_runtime;
  if(!runtime.File?.isNode||runtime.File.isMac)return;
  const platform=runtime.reqnode?.("process").platform;
  if(platform&&!["win32","linux"].includes(platform))return;
  const root=document.documentElement,bar=document.querySelector<HTMLElement>("#top-titlebar");
  if(!bar)return;
  const previous=root.getAttribute("data-linux-note-titlebar");
  let disposed=false;const cleanup:(()=>void)[]=[];
  const binding:titlebar_binding={dispose(){
    if(disposed)return;disposed=true;
    for(const dispose of cleanup.reverse())dispose();
    if(active_binding===binding)active_binding=undefined;
    if(previous===null)root.removeAttribute("data-linux-note-titlebar");else root.setAttribute("data-linux-note-titlebar",previous);
  }};
  active_binding=binding;
  if(runtime.File.option?.framelessWindow!==true){
    root.dataset.linuxNoteTitlebar="next-window";
    if(!setting_request){
      setting_request=Promise.resolve().then(()=>runtime.reqnode!("electron").ipcRenderer.invoke("setting.put","framelessWindow",true));
      void setting_request.catch(()=>{setting_request=undefined;});
    }
    void setting_request.catch(error=>{if(!disposed){root.dataset.linuxNoteTitlebar="setting-failed";console.error("Typora Code titlebar setting:",error);}});
    return binding;
  }
  const traffic=bar.querySelector<HTMLElement>("#w-traffic-lights");
  if(!traffic){binding.dispose();return;}
  const original_nodes=[...bar.childNodes],previous_state=bar.getAttribute("data-workspace-titlebar");
  const traffic_parent=traffic.parentNode,traffic_next=traffic.nextSibling;
  const style=acquire_workspace_style("workspace-titlebar-style",css);
  const interaction=acquire_workspace_interaction();
  cleanup.push(()=>{style.remove();interaction.remove();});
  const controls:[string,git_icon_name][]=[["w-min","chrome-minimize"],["w-max","chrome-maximize"],["w-restore","chrome-restore"],["w-close","chrome-close"]];
  for(const [id,name] of controls){
    const node=traffic.querySelector<HTMLElement>("#"+id);if(!node)continue;
    const children=[...node.childNodes];node.replaceChildren(git_icon(name));cleanup.push(()=>node.replaceChildren(...children));
  }
  const left=document.createElement("div"),center=document.createElement("div"),right=document.createElement("div");
  left.className="workspace-titlebar-left";center.className="workspace-titlebar-center";right.className="workspace-titlebar-right";
  const logo=document.createElement("img");logo.className="workspace-titlebar-logo";logo.alt="Typora";logo.width=24;logo.height=24;
  logo.src=new URL("./assets/icon/icon_32x32@2x.png",document.baseURI).href;left.append(logo);
  const menu=create_workspace_titlebar_menu(bar,create_workspace_titlebar_definitions(files,runtime,open_files));left.append(menu.element);cleanup.push(()=>menu.dispose());
  const events=new AbortController();cleanup.push(()=>events.abort());
  const history_button=(name:git_icon_name,label:string,direction:number)=>{
    const button=document.createElement("button");button.type="button";button.dataset.workspaceInteraction="action";button.className="workspace-titlebar-history";
    button.title=label;button.setAttribute("aria-label",label);button.append(git_icon(name));
    button.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("linux-note-reading-history-travel",{detail:{direction}})),{signal:events.signal});
    center.append(button);return button;
  };
  const back=history_button("arrow-left","后退 (Alt+←)",-1),forward=history_button("arrow-right","前进 (Alt+→)",1);
  const history_state=(state:{back?:boolean;forward?:boolean})=>{back.disabled=!state.back;forward.disabled=!state.forward;};
  history_state({back:root.dataset.linuxNoteHistoryBack==="true",forward:root.dataset.linuxNoteHistoryForward==="true"});
  window.addEventListener("linux-note-reading-history-state",event=>history_state((event as CustomEvent).detail||{}),{signal:events.signal});
  const search=document.createElement("button");search.type="button";search.dataset.workspaceInteraction="action";search.className="workspace-titlebar-search";search.title="搜索文件 (Ctrl+P)";search.setAttribute("aria-label","搜索文件 (Ctrl+P)");
  const search_label=document.createElement("span");search.append(git_icon("search"),search_label);center.append(search);
  const plain_title=document.createElement("span");plain_title.className="workspace-titlebar-window-title";plain_title.hidden=true;center.append(plain_title);
  search.addEventListener("mousedown",event=>event.preventDefault(),{signal:events.signal});
  search.addEventListener("click",open_files,{signal:events.signal});
  const title=document.querySelector("title");
  const refresh_label=()=>{const folder=files.context_root(),remote=current_remote_workspace();search_label.textContent=remote?'SSH: '+(remote.username||remote.target.split('@')[0]):folder?(files.path_api.basename(folder)||folder):"搜索文件";search.title=remote?(remote.name||remote.target)+' · '+remote.target+(remote.port?':'+remote.port:'')+(remote.state==='connected'?'':' · 未连接'):'搜索文件 (Ctrl+P)';plain_title.textContent=remote?search_label.textContent:title?.textContent?.trim()||search_label.textContent;};
  refresh_label();
  window.addEventListener("linux-note-workspace-context-changed",refresh_label,{signal:events.signal});
  window.addEventListener('typora-code-remote-state-changed',refresh_label,{signal:events.signal});
  const observer=new MutationObserver(refresh_label);if(title)observer.observe(title,{childList:true,characterData:true,subtree:true});cleanup.push(()=>observer.disconnect());
  const release=files.core.app.workspace.on("active-leaf:change",refresh_label);if(typeof release==="function")cleanup.push(release);
  // 原生文件加载仍直接访问 #title-text 等节点，必须保持连接，仅隐藏原来的呈现。
  const native_state=document.createElement("div");native_state.hidden=true;native_state.style.setProperty("display","none","important");
  right.append(traffic);native_state.append(...original_nodes.filter(node=>node!==traffic));
  bar.replaceChildren(left,center,right,native_state);bar.dataset.workspaceTitlebar="ready";root.dataset.linuxNoteTitlebar="ready";
  const settings=files.core.app.settings as titlebar_settings_store|undefined;
  let close_context:(()=>void)|undefined,setting_error:ReturnType<typeof workspace_dialog>|undefined;
  const apply_settings=()=>{
    if(disposed)return;close_context?.();
    const value=read_titlebar_settings(settings);menu.set_compact(!value.menu_bar);
    search.hidden=!value.command_center;plain_title.hidden=value.command_center;
    back.hidden=forward.hidden=!value.command_center||!value.navigation_controls;
  };
  const release_settings=settings?.addChangeListener?.(TITLEBAR_SETTINGS_KEY,apply_settings);
  if(release_settings)cleanup.push(release_settings);
  const open_context=(event:MouseEvent)=>{
    event.preventDefault();event.stopImmediatePropagation();menu.close(true);
    const value=read_titlebar_settings(settings);
    const toggle=(key:keyof titlebar_settings,label:string):workspace_menu_entry=>({id:key,title:label,checked:value[key],disabled:!settings,action:()=>{
      if(disposed)return;
      try{toggle_titlebar_setting(settings,key);apply_settings();}
      catch(error){setting_error?.close(false);setting_error=workspace_dialog("顶栏设置保存失败");setting_error.content.textContent=String(error instanceof Error?error.message:error);}
    }});
    const entries=[toggle("menu_bar","菜单栏"),toggle("command_center","命令中心")];
    if(value.command_center)entries.push(toggle("navigation_controls","导航控件"));
    close_context=workspace_menu(event,entries,"workspace-menu-compact workspace-titlebar-context",()=>{close_context=undefined;});
  };
  const owns_target=(target:EventTarget|null)=>target instanceof Node&&bar.contains(target)&&!traffic.contains(target)&&!native_state.contains(target);
  // 先于宿主 root-menu 处理右键；窗控、正文和文件标签继续由各自所有者处理。
  window.addEventListener("mousedown",event=>{if(event.button===2&&owns_target(event.target)){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal:events.signal});
  window.addEventListener("contextmenu",event=>{if(owns_target(event.target))open_context(event);},{capture:true,signal:events.signal});
  window.addEventListener("keydown",event=>{
    if(owns_target(event.target)&&(event.key==="ContextMenu"||(event.shiftKey&&event.key==="F10"))&&!event.isComposing){
      event.preventDefault();event.stopImmediatePropagation();const rect=(event.target as HTMLElement).getBoundingClientRect();
      open_context(new MouseEvent("contextmenu",{clientX:rect.left,clientY:rect.bottom}));
    }
  },{capture:true,signal:events.signal});
  cleanup.push(()=>{close_context?.();setting_error?.close(false);});
  apply_settings();
  menu.refresh();
  cleanup.push(()=>{bar.replaceChildren(...original_nodes);if(traffic_parent&&traffic_parent!==bar)traffic_parent.insertBefore(traffic,traffic_next);if(previous_state===null)bar.removeAttribute("data-workspace-titlebar");else bar.setAttribute("data-workspace-titlebar",previous_state);});
  return binding;
}
