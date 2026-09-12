import type {workspace_file_host} from "./workspace_files";

/** 菜单与活动栏读取同一侧栏所有者，原生启动阶段以实际侧栏面板补齐。 */
export function read_workspace_sidebar_state(sidebar:{isShown:boolean;activePanel?:{ribbonButton?:{id:string};containerEl?:HTMLElement}}) {
  let active_id=sidebar.activePanel?.ribbonButton?.id||null;
  if(active_id==="linux_note:file_explorer")active_id="core.file-explorer";
  if(active_id==="linux_note:search")active_id="core.search";
  const native=document.querySelector("#typora-sidebar");
  if(!sidebar.activePanel?.containerEl?.isConnected){
    if(native?.classList.contains("active-tab-outline"))active_id="core.outline";
    else if(native?.classList.contains("active-tab-files"))active_id="core.file-explorer";
  }
  return {active_id,sidebar_visible:sidebar.isShown};
}

export function native_document_active(files:workspace_file_host,runtime:{File?:any}) {
  const leaf=files.core.app.workspace.activeLeaf;
  const path_key=(value:unknown)=>String(value||"").replace(/\\/g,"/");
  return Boolean(leaf)&&!files.source_editor_active()&&!String(leaf?.state.path||"").startsWith("typ://")
    &&path_key(leaf?.state.path)===path_key(runtime.File?.bundle?.filePath)
    &&(!(leaf?.view as any)?.isEditor||(leaf!.view as any).isEditor());
}
