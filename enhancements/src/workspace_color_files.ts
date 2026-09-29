import {workspace_text} from "./workspace_i18n";
/** JSON export uses the verified host to save as an entry, without changing the document or workspace. */
export async function export_color_file(text:string,is_active:()=>boolean):Promise<boolean>{
  const runtime=window as any;
  if(!runtime.JSBridge?.invoke||!runtime.reqnode)throw Error(workspace_text("color_files_the_current_host_does_not_support_exporting_files"));
  const result=await runtime.JSBridge.invoke('dialog.showSaveDialog',{title:workspace_text("color_files_export_color_configuration"),defaultPath:'typora-code-colors.json',properties:['showOverwriteConfirmation'],filters:[{name:workspace_text("color_files_json_color_configuration"),extensions:['json']}]});
  if(!is_active()||result?.canceled||!result?.filePath)return false;
  const path=runtime.reqnode('path');if(!path.isAbsolute(result.filePath))throw Error(workspace_text("color_files_the_save_path_returned_by_the_system_is_invalid"));
  await runtime.reqnode('fs').promises.writeFile(result.filePath,text,'utf8');return true;
}
