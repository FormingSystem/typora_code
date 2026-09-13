import {bind_workspace_breadcrumbs} from "./workspace_breadcrumbs";
import {bind_workspace_editor_actions} from "./workspace_editor_actions";
import {read_workspace_sidebar_state} from "./workspace_view_state";
import {bind_workspace_native_toolbar} from "./workspace_native_toolbar";
import {bind_workspace_preferences} from "./workspace_preferences";
import { create_workspace_quick_open, get_workspace_quick_open } from "./workspace_quick_open";
import { bind_workspace_tab_controls } from "./workspace_tab_controls";
import { bind_workspace_detached_window } from "./workspace_detached_window";
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
import {bind_workspace_file_commands} from "./workspace_file_commands";

export function bind_workspace_browser() {
  const core=(window as unknown as Record<symbol,graph_core>)[Symbol.for("typora-code:workspace")];if(!core?.app)return;
  const lifetime=create_workspace_lifetime();
  try {
  lifetime.own(bind_workspace_file_tab_icons(core));
  const files=lifetime.own(bind_workspace_files(core));
  lifetime.own(create_workspace_quick_open(files));
  lifetime.own(bind_workspace_tab_controls(core,files));
  lifetime.own(bind_workspace_native_toolbar(files,window as any));
  lifetime.own(install_workspace_titlebar(files,()=>get_workspace_quick_open()?.open()));
  lifetime.own(bind_workspace_preferences(core));
  const file_commands=lifetime.own(bind_workspace_file_commands(files,()=>context_changed()));
  const open_folder=file_commands.open_folder;
  const explorer=bind_workspace_explorer(core as unknown as workspace_explorer_core,{open_file:files.open_file,context_root:files.context_root,active_file:files.current_file,open_folder,copy:files.copy,rename:files.rename_file,create:files.create_entry,file_clipboard:files.file_clipboard,trash:files.trash_entries,
    reveal_system:path=>(window as unknown as {reqnode(name:string):any}).reqnode("electron").shell.showItemInFolder(path),
    find_in_folder:path=>search.find_in_folder(path),
    terminal:cwd=>window.dispatchEvent(new CustomEvent("linux-note-open-terminal",{detail:{cwd}})),
    compare:async(left,right)=>core.app.commands.run("linux_note:compare_files",[left,right]),
    extra_menu:(path,is_directory)=>[
      {title:"Git：查看仓库提交图",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-git",{detail:{path}}))},
      {title:"在仓库根目录打开终端",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-terminal",{detail:{path}}))},
      {title:"以管理员身份打开仓库终端（UAC）",disabled:(window as unknown as {reqnode(name:string):any}).reqnode("process").platform!=="win32",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-terminal",{detail:{path,admin:true}}))}
    ]});
  lifetime.own(explorer);
  const outline_binding=lifetime.own(install_workspace_outline({context_root:files.context_root,document_active:()=>Boolean(core.app.workspace.activeLeaf)&&!String(core.app.workspace.activeLeaf?.state.path||"").startsWith("typ://"),outline:(window as unknown as {File?:{editor?:{library?:{outline?:any}}}}).File?.editor?.library?.outline}));
  lifetime.own(bind_workspace_breadcrumbs(core,files,outline_binding));
  lifetime.add(core.app.commands.register({id:"linux_note:source_outline_settings",title:"代码大纲：解析环境设置",scope:"global",callback:()=>outline_binding?.configure()}));
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
  let known_context=files.context_root();
  const context_changed=()=>{
    if(lifetime.disposed)return;
    const current=files.context_root();if(current===known_context)return;known_context=current;
    window.dispatchEvent(new Event("linux-note-workspace-context-changed"));
    void explorer.refresh().catch(error=>console.error("Typora Code folder refresh:",error));
    search.refresh_context();outline_binding?.refresh();
  };
  lifetime.add(core.app.vault?.on("mounted",context_changed));
  const focus_explorer=()=>{explorer.show();requestAnimationFrame(()=>explorer.container.querySelector<HTMLElement>(".workspace-explorer-tree")?.focus({preventScroll:true}));};
  lifetime.add(core.app.commands.register({id:"linux_note:file_explorer",title:"视图：资源管理器",scope:"global",callback:focus_explorer}));
  let reveal_epoch=0;
  lifetime.add(core.app.commands.register({id:"linux_note:reveal_in_explorer",title:"视图：在资源管理器中定位",scope:"global",showInCommandPanel:false,callback:(path:string,root:string)=>{
    const epoch=++reveal_epoch;
    void(async()=>{try{
      if(!files.path_api.isAbsolute(path)||!files.path_api.isAbsolute(root))throw new Error("定位路径无效。");
      const relative=files.path_api.relative(root,path);if(files.path_api.isAbsolute(relative)||relative===".."||relative.startsWith(".."+files.path_api.sep))throw new Error("定位路径不在仓库内。");
      await files.fs.promises.stat(path);if(lifetime.disposed||epoch!==reveal_epoch)return;
      const mounted=files.context_root(),inside=mounted?files.path_api.relative(mounted,path):"..";
      if(!mounted||files.path_api.isAbsolute(inside)||inside===".."||inside.startsWith(".."+files.path_api.sep))await file_commands.set_folder(root);
      if(lifetime.disposed||epoch!==reveal_epoch)return;
      explorer.show();await explorer.reveal(path);
    }catch(error){if(!lifetime.disposed&&epoch===reveal_epoch)new core.Notice(String(error instanceof Error?error.message:error),5000);}})();
  }}));
  const explorer_shortcut=(event:KeyboardEvent)=>{
    if(!(event.ctrlKey||event.metaKey)||!event.shiftKey||event.altKey||event.code!=="KeyE"||event.isComposing||document.querySelector('[role="dialog"][aria-modal="true"]'))return;
    event.preventDefault();event.stopImmediatePropagation();focus_explorer();
  };
  lifetime.listen(window,"keydown",explorer_shortcut as EventListener,true);
  lifetime.own(install_workspace_footer());
  lifetime.own(install_workspace_sidebar_sash({sidebar:core.app.workspace.sidebar,save_width:width=>(window as unknown as {JSBridge:{putSetting(key:string,value:number):void}}).JSBridge.putSetting("sidebar-width",width)}));
  const sidebar=core.app.workspace.sidebar as unknown as {isShown:boolean;activePanel?:{ribbonButton?:{id:string};containerEl?:HTMLElement}};
  const ribbon=document.querySelector<HTMLElement>(".typ-ribbon");
  if(ribbon)lifetime.own(install_workspace_activity({ribbon,item_ids:["core.search","core.file-explorer","core.outline","linux_note:source_control"],read_state:()=>read_workspace_sidebar_state(sidebar)}));
  const detached=lifetime.own(bind_workspace_detached_window(files));
  lifetime.own(bind_workspace_editor_actions(files,detached));
  document.documentElement.setAttribute("data-linux-note-workspace-browser","ready");
  lifetime.add(()=>document.documentElement.removeAttribute("data-linux-note-workspace-browser"));
  return{files,explorer,search,dispose(){files.assert_can_dispose();lifetime.dispose();}};
  } catch(error) {lifetime.dispose();throw error;}
}
