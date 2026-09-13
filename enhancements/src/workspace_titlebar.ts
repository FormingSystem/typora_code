import {git_icon, type git_icon_name} from "./git_icons";
import {acquire_workspace_style} from "./workspace_styles";
import {create_workspace_titlebar_menu} from "./workspace_titlebar_menu";
import {create_workspace_titlebar_definitions, type titlebar_runtime} from "./workspace_titlebar_entries";
import type {workspace_file_host} from "./workspace_files";
import {acquire_workspace_interaction} from "./workspace_interaction";
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
  search.addEventListener("mousedown",event=>event.preventDefault(),{signal:events.signal});
  search.addEventListener("click",open_files,{signal:events.signal});
  const refresh_label=()=>{const folder=files.context_root();search_label.textContent=folder?(files.path_api.basename(folder)||folder):"搜索文件";};
  refresh_label();
  window.addEventListener("linux-note-workspace-context-changed",refresh_label,{signal:events.signal});
  const title=document.querySelector("title"),observer=new MutationObserver(refresh_label);if(title)observer.observe(title,{childList:true,characterData:true,subtree:true});cleanup.push(()=>observer.disconnect());
  const release=files.core.app.workspace.on("active-leaf:change",refresh_label);if(typeof release==="function")cleanup.push(release);
  // 原生文件加载仍直接访问 #title-text 等节点，必须保持连接，仅隐藏原来的呈现。
  const native_state=document.createElement("div");native_state.hidden=true;native_state.style.setProperty("display","none","important");
  right.append(traffic);native_state.append(...original_nodes.filter(node=>node!==traffic));
  bar.replaceChildren(left,center,right,native_state);bar.dataset.workspaceTitlebar="ready";root.dataset.linuxNoteTitlebar="ready";
  menu.refresh();
  cleanup.push(()=>{bar.replaceChildren(...original_nodes);if(traffic_parent&&traffic_parent!==bar)traffic_parent.insertBefore(traffic,traffic_next);if(previous_state===null)bar.removeAttribute("data-workspace-titlebar");else bar.setAttribute("data-workspace-titlebar",previous_state);});
  return binding;
}
