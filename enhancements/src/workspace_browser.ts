import type { graph_core } from "./git_graph_host";
import { bind_workspace_files } from "./workspace_files";
import { bind_workspace_explorer, type workspace_explorer_core } from "./workspace_explorer";
import { bind_workspace_search } from "./workspace_search";
import { install_workspace_activity } from "./workspace_activity";
import { graph_dialog, graph_element as el, graph_button as button } from "./git_graph_widgets";

export function bind_workspace_browser() {
  const core=(window as unknown as Record<symbol,graph_core>)[Symbol.for("typora-plugin-core@v2")];if(!core?.app)return;
  const files=bind_workspace_files(core);let chosen_root="";
  const context_root=files.context_root;files.context_root=()=>chosen_root||context_root();
  const open_folder=()=>new Promise<void>(resolve=>{
    const dialog=graph_dialog("打开文件夹");const path=el("input");path.setAttribute("aria-label","文件夹路径");path.value=files.context_root();const error=el("p");dialog.content.append(el("p","","输入要在资源管理器中打开的文件夹路径。"),path,error);
    const cleanup=new MutationObserver(()=>{if(!dialog.root.isConnected){cleanup.disconnect();resolve();}});cleanup.observe(document.body,{childList:true});
    const open=()=>{try{const target=files.path_api.resolve(path.value);if(!files.fs.statSync(target).isDirectory())throw new Error("所选路径不是文件夹。");chosen_root=target;dialog.close();resolve();}catch(problem){error.textContent=String(problem);}};
    path.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();open();}};dialog.footer.prepend(button("打开",open));
  });
  const explorer=bind_workspace_explorer(core as unknown as workspace_explorer_core,{open_file:files.open_file,context_root:files.context_root,active_file:files.current_file,open_folder,copy:files.copy,
    extra_menu:(path,is_directory)=>[
      {title:"Git：查看仓库提交图",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-git",{detail:{path}}))},
      {title:"在仓库根目录打开终端",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-terminal",{detail:{path}}))},
      {title:"以管理员身份打开仓库终端（UAC）",disabled:(window as unknown as {reqnode(name:string):any}).reqnode("process").platform!=="win32",action:()=>window.dispatchEvent(new CustomEvent("linux-note-open-terminal",{detail:{path,admin:true}}))}
    ]});
  const search=bind_workspace_search(core,files);
  const sidebar=core.app.workspace.sidebar as unknown as {isShown:boolean;activePanel?:{ribbonButton?:{id:string};containerEl?:HTMLElement}};
  const ribbon=document.querySelector<HTMLElement>(".typ-ribbon");
  if(ribbon)install_workspace_activity({ribbon,item_ids:["core.search","core.file-explorer","core.outline","linux_note:source_control"],read_state:()=>{
    let active_id=sidebar.activePanel?.ribbonButton?.id||null;
    if(active_id==="linux_note:file_explorer")active_id="core.file-explorer";
    if(active_id==="linux_note:search")active_id="core.search";
    const native=document.querySelector("#typora-sidebar");
    if(!sidebar.activePanel?.containerEl?.isConnected){if(native?.classList.contains("active-tab-outline"))active_id="core.outline";else if(native?.classList.contains("active-tab-files"))active_id="core.file-explorer";}
    return{active_id,sidebar_visible:sidebar.isShown};
  }});
  document.documentElement.setAttribute("data-linux-note-workspace-browser","ready");
  return{files,explorer,search};
}
