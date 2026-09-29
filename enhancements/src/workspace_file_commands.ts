import {workspace_text} from "./workspace_i18n";
import {bind_workspace_recents} from "./workspace_recent";
import type {workspace_file_host} from "./workspace_files";
import {bind_workspace_open_dialog} from "./workspace_open_dialog";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {bind_workspace_sessions} from "./workspace_sessions";
import {remote_files_for} from './remote_workspace_files';

/** The entry layer only binds commands. File status belongs to the file service, system window and directory switching belongs to the host adapter. */
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
    ["open_recent",workspace_text("file_commands_open_recent"),recents.open],
    ["open_file",workspace_text("file_commands_open_file"),picker.open_file],["open_folder",workspace_text("file_commands_open_folder"),picker.open_folder],
    ["open_local_folder",workspace_text("file_commands_open_local_folder"),picker.open_local_folder],
    ["open_folder_path",workspace_text("file_commands_open_recent_folder"),path=>remote_files_for(path)?picker.set_folder(path):recents.open_item({path,kind:"folder",date:0})],["open_folder_new_window",workspace_text("file_commands_open_folder_in_new_window"),picker.open_folder_new_window],["close_folder",workspace_text("file_commands_close_folder"),picker.close_folder],
    ["save",workspace_text("remote_ssh_directory_save"),files.save_active],["save_all",workspace_text("file_commands_save_all"),files.save_all],
    ["save_as",workspace_text("file_commands_save_as"),files.save_as_active],["reload_file",workspace_text("file_commands_reload_from_disk"),files.reload_active],
    ["close_editor",workspace_text("file_commands_close_editor"),()=>{const leaf=core.app.workspace.activeLeaf;if(leaf)return files.close_leaf(leaf);}],
  ];
  try{for(const[id,title,callback]of commands)lifetime.add(core.app.commands.register({id:"linux_note:"+id,title:workspace_text("file_commands_file")+title,scope:"global",showInCommandPanel:!["open_folder_path","open_folder_new_window"].includes(id),callback:(...args)=>run(()=>callback(...args))}));}
  catch(error){lifetime.dispose();throw error;}
  return {open_folder:()=>run(picker.open_folder),set_folder:picker.set_folder,dispose:lifetime.dispose};
}
