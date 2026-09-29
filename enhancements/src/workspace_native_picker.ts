import {workspace_text} from "./workspace_i18n";
/** The system directory selection only returns the selection result, and the workspace switch is shared directory transaction. */
export async function choose_local_directory(default_path=''):Promise<string|undefined>{
  const runtime=window as unknown as {JSBridge?:{invoke(name:string,...args:unknown[]):Promise<any>}};
  if(!runtime.JSBridge?.invoke)throw Error(workspace_text("native_picker_the_system_file_selection_window_is_unavailable"));
  const result=await runtime.JSBridge.invoke('dialog.showOpenDialog',{title:workspace_text("file_commands_open_local_folder"),properties:['openDirectory'],...(default_path?{defaultPath:default_path}:{})});
  return result?.canceled?undefined:result?.filePaths?.[0];
}
