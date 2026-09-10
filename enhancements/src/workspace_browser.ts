import {bind_workspace_preferences} from "./workspace_preferences";
import { create_workspace_quick_open, get_workspace_quick_open } from "./workspace_quick_open";
import { bind_workspace_tab_controls } from "./workspace_tab_controls";
import {bind_workspace_file_tab_icons} from "./workspace_file_icons";
import { create_workspace_lifetime } from "./workspace_lifetime";
import type { graph_core } from "./git_graph_host";
import { bind_workspace_files } from "./workspace_files";
import { bind_workspace_explorer, type workspace_explorer_core } from "./workspace_explorer";
import { bind_workspace_search } from "./workspace_search";
import { install_workspace_activity } from "./workspace_activity";
import { install_workspace_outline } from "./workspace_outline";
import { install_workspace_footer } from "./workspace_footer";
import { install_workspace_titlebar } from "./workspace_titlebar";
import { install_workspace_sidebar_sash } from "./workspace_sidebar_sash";
import { workspace_dialog, workspace_element as el, workspace_button as button } from "./workspace_widgets";

export function bind_workspace_browser() {
  const core=(window as unknown as Record<symbol,graph_core>)[Symbol.for("typora-code:workspace")];if(!core?.app)return;
  const lifetime=create_workspace_lifetime();
  try {
  lifetime.own(bind_workspace_file_tab_icons(core));
  const files=lifetime.own(bind_workspace_files(core));let chosen_root="";
  const context_root=files.context_root;const chosen_context=files.context_root=()=>chosen_root||context_root();
  lifetime.add(()=>{if(files.context_root===chosen_context)files.context_root=context_root;});
  lifetime.own(create_workspace_quick_open(files));
  lifetime.own(bind_workspace_tab_controls(core));
  lifetime.own(install_workspace_titlebar(files,()=>get_workspace_quick_open()?.open()));
  lifetime.own(bind_workspace_preferences(core));
  const open_folder=()=>new Promise<void>(resolve=>{
    const dialog=workspace_dialog("打开文件夹");lifetime.add(()=>dialog.close());const path=el("input");path.setAttribute("aria-label","文件夹路径");path.value=files.context_root();const error=el("p");dialog.content.append(el("p","","输入要在资源管理器中打开的文件夹路径。"),path,error);
    const cleanup=new MutationObserver(()=>{if(!dialog.root.isConnected){cleanup.disconnect();resolve();}});cleanup.observe(document.body,{childList:true});lifetime.add(()=>{cleanup.disconnect();resolve();});
    const open=()=>{try{const target=files.path_api.resolve(path.value);if(!files.fs.statSync(target).isDirectory())throw new Error("所选路径不是文件夹。");chosen_root=target;dialog.close();resolve();}catch(problem){error.textContent=String(problem);}};
    path.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();open();}};dialog.footer.prepend(button("打开",open));
  });
  lifetime.add(core.app.commands.register({id:"linux_note:open_folder",title:"文件：打开文件夹",scope:"global",callback:()=>{void open_folder();}}));
  const explorer=bind_workspace_explorer(core as unknown as workspace_explorer_core,{open_file:files.open_file,context_root:files.context_root,active_file:files.current_file,open_folder,copy:files.copy,rename:files.rename_file,
    extra_menu:(path,is_directory)=>[
      {title:"Git：查看仓库提交图",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-git",{detail:{path}}))},
      {title:"在仓库根目录打开终端",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-terminal",{detail:{path}}))},
      {title:"以管理员身份打开仓库终端（UAC）",disabled:(window as unknown as {reqnode(name:string):any}).reqnode("process").platform!=="win32",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-terminal",{detail:{path,admin:true}}))}
    ]});
  lifetime.own(explorer);
  const outline_binding=lifetime.own(install_workspace_outline({document_active:()=>Boolean(core.app.workspace.activeLeaf)&&!String(core.app.workspace.activeLeaf?.state.path||"").startsWith("typ://"),outline:(window as unknown as {File?:{editor?:{library?:{outline?:any}}}}).File?.editor?.library?.outline}));
  lifetime.add(core.app.workspace.on("active-leaf:change",()=>outline_binding?.refresh()));
  const reveal_outline=()=>{
    const sidebar=core.app.workspace.sidebar as unknown as {panels:{ribbonButton?:{id:string};constructor:Function}[];activePanel?:unknown;switch(type:Function):void;show():void};
    const panel=sidebar.panels.find(item=>item.ribbonButton?.id==="core.outline");
    if(!panel)return;
    if(sidebar.activePanel!==panel)sidebar.switch(panel.constructor);
    sidebar.show();outline_binding?.refresh();
  };
  lifetime.add(core.app.commands.register({id:"linux_note:outline",title:"视图：聚焦大纲",scope:"global",callback:reveal_outline}));

  const search=lifetime.own(bind_workspace_search(core,files));
  const focus_explorer=()=>{explorer.show();requestAnimationFrame(()=>explorer.container.querySelector<HTMLElement>(".workspace-explorer-tree")?.focus({preventScroll:true}));};
  lifetime.add(core.app.commands.register({id:"linux_note:file_explorer",title:"视图：资源管理器",scope:"global",callback:focus_explorer}));
  const explorer_shortcut=(event:KeyboardEvent)=>{
    if(!(event.ctrlKey||event.metaKey)||!event.shiftKey||event.altKey||event.code!=="KeyE"||event.isComposing||document.querySelector('[role="dialog"][aria-modal="true"]'))return;
    event.preventDefault();event.stopImmediatePropagation();focus_explorer();
  };
  lifetime.listen(window,"keydown",explorer_shortcut as EventListener,true);
  lifetime.own(install_workspace_footer());
  lifetime.own(install_workspace_sidebar_sash({sidebar:core.app.workspace.sidebar,save_width:width=>(window as unknown as {JSBridge:{putSetting(key:string,value:number):void}}).JSBridge.putSetting("sidebar-width",width)}));
  const sidebar=core.app.workspace.sidebar as unknown as {isShown:boolean;activePanel?:{ribbonButton?:{id:string};containerEl?:HTMLElement}};
  const ribbon=document.querySelector<HTMLElement>(".typ-ribbon");
  if(ribbon)lifetime.own(install_workspace_activity({ribbon,item_ids:["core.search","core.file-explorer","core.outline","linux_note:source_control"],read_state:()=>{
    let active_id=sidebar.activePanel?.ribbonButton?.id||null;
    if(active_id==="linux_note:file_explorer")active_id="core.file-explorer";
    if(active_id==="linux_note:search")active_id="core.search";
    const native=document.querySelector("#typora-sidebar");
    if(!sidebar.activePanel?.containerEl?.isConnected){if(native?.classList.contains("active-tab-outline"))active_id="core.outline";else if(native?.classList.contains("active-tab-files"))active_id="core.file-explorer";}
    return{active_id,sidebar_visible:sidebar.isShown};
  }}));
  document.documentElement.setAttribute("data-linux-note-workspace-browser","ready");
  lifetime.add(()=>document.documentElement.removeAttribute("data-linux-note-workspace-browser"));
  return{files,explorer,search,dispose(){files.assert_can_dispose();lifetime.dispose();}};
  } catch(error) {lifetime.dispose();throw error;}
}
