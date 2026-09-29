import {workspace_text} from "./workspace_i18n";
import {file_key} from "./workspace_file_uri";

type native_document_runtime = {File?: any};
/** Capture identity before recycling; only release the host occupation for cached documents that have been successfully recycled and whose main window content has not been modified again. */
export function prepare_deleted_native_document(runtime:native_document_runtime,includes:(path:string)=>boolean,read_text:()=>string):undefined|(()=>Promise<void>){
  const file=runtime.File,path=String(file?.bundle?.filePath||"");
  if(!path||!includes(path))return;
  if(typeof file.changeCounter?.isDocumentEdited!=="function")throw new Error(workspace_text("native_document_host_cannot_confirm_unsaved_state_file_is_retained"));
  if(file.changeCounter.isDocumentEdited()||file.isFileLoading?.()||file._onFileSwitching||file._onInitParse||file.inSavingProcess)throw new Error(workspace_text("native_document_markdown_is_currently_editing_reading_or_saving_please_compl"));
  if(typeof file.loadFile!=="function"||typeof file.updateChangeCount!=="function"||file.ChangeType?.NSChangeCleared===undefined)throw new Error(workspace_text("native_document_the_host_did_not_provide_a_verified_document_release_interfa"));
  const text=read_text();
  return async()=>{
    const current=String(file.bundle?.filePath||"");
    // The monitor may first rename deleted files to unnamed; if the user has switched to other documents, it does not touch it.
    if(current&&file_key(current)!==file_key(path))return;
    if(read_text()!==text)throw new Error(workspace_text("native_document_the_file_has_been_moved_to_the_recycle_bin_but_changes_were"));
    await file.loadFile("",true);
    if(file.bundle?.filePath||read_text()!=="")throw new Error(workspace_text("native_document_the_file_has_been_moved_to_the_recycle_bin_but_the_host_fail"));
    file.updateChangeCount(file.ChangeType.NSChangeCleared);
  };
}
