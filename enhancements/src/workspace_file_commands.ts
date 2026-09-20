import {bind_workspace_recents} from "./workspace_recent";
import type {workspace_file_host} from "./workspace_files";
import {bind_workspace_open_dialog} from "./workspace_open_dialog";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {bind_workspace_sessions} from "./workspace_sessions";

/** 入口层只绑定命令。文件状态归文件服务，系统窗口和目录切换归宿主适配器。 */
export function bind_workspace_file_commands(files:workspace_file_host,changed:()=>void){
  const lifetime=create_workspace_lifetime(),core=files.core;
  const sessions=lifetime.own(bind_workspace_sessions(files));
  const picker=lifetime.own(bind_workspace_open_dialog(files,changed,sessions,path=>recents.open_item({path,kind:"folder",date:0})));
  const recents=lifetime.own(bind_workspace_recents(files,picker.set_folder));
  const run=(action:()=>unknown)=>{
    if(lifetime.disposed)return;
    return Promise.resolve().then(()=>{if(!lifetime.disposed)return action();}).catch(error=>{
      if(!lifetime.disposed)new core.Notice(String(error instanceof Error?error.message:error),5000);
    });
  };
  const commands:[string,string,(...args:any[])=>unknown][]=[
    ["open_recent","打开最近",recents.open],
    ["open_file","打开文件",picker.open_file],["open_folder","打开文件夹",picker.open_folder],
    ["open_folder_path","打开最近文件夹",path=>recents.open_item({path,kind:"folder",date:0})],["open_folder_new_window","在新窗口打开文件夹",picker.open_folder_new_window],["close_folder","关闭文件夹",picker.close_folder],
    ["save","保存",files.save_active],["save_all","保存全部",files.save_all],
    ["save_as","另存为",files.save_as_active],["reload_file","从磁盘重新加载",files.reload_active],
    ["close_editor","关闭编辑器",()=>{const leaf=core.app.workspace.activeLeaf;if(leaf)return files.close_leaf(leaf);}],
  ];
  try{for(const[id,title,callback]of commands)lifetime.add(core.app.commands.register({id:"linux_note:"+id,title:"文件："+title,scope:"global",showInCommandPanel:!["open_folder_path","open_folder_new_window"].includes(id),callback:(...args)=>run(()=>callback(...args))}));}
  catch(error){lifetime.dispose();throw error;}
  return {open_folder:()=>run(picker.open_folder),set_folder:picker.set_folder,dispose:lifetime.dispose};
}
