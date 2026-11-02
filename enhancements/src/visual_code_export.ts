import {workspace_text} from './workspace_i18n';
/** Save only the current rendered snapshot using the established native Save As port. */
export async function export_visual_svg(svg:string,current:()=>boolean):Promise<void>{
 const runtime=window as any;
 if(!runtime.JSBridge?.invoke||!runtime.reqnode)throw Error(workspace_text('color_files_the_current_host_does_not_support_exporting_files'));
 const result=await runtime.JSBridge.invoke('dialog.showSaveDialog',{title:workspace_text('visual_code_export'),defaultPath:'diagram.svg',properties:['showOverwriteConfirmation'],filters:[{name:'SVG',extensions:['svg']}]});
 if(!current()||result?.canceled||!result?.filePath)return;
 if(!runtime.reqnode('path').isAbsolute(result.filePath))throw Error(workspace_text('color_files_the_save_path_returned_by_the_system_is_invalid'));
 await runtime.reqnode('fs').promises.writeFile(result.filePath,svg,'utf8');
}
