import {file_key} from "./workspace_file_uri";

type native_document_runtime = {File?: any};
/** 回收前捕获身份；仅对成功回收且正文未再修改的本窗口缓存释放宿主占用。 */
export function prepare_deleted_native_document(runtime:native_document_runtime,includes:(path:string)=>boolean,read_text:()=>string):undefined|(()=>Promise<void>){
  const file=runtime.File,path=String(file?.bundle?.filePath||"");
  if(!path||!includes(path))return;
  if(typeof file.changeCounter?.isDocumentEdited!=="function")throw new Error("宿主无法确认未保存状态，文件已保留。");
  if(file.changeCounter.isDocumentEdited()||file.isFileLoading?.()||file._onFileSwitching||file._onInitParse||file.inSavingProcess)throw new Error("Markdown正在编辑、读取或保存，请完成后再删除。");
  if(typeof file.loadFile!=="function"||typeof file.updateChangeCount!=="function"||file.ChangeType?.NSChangeCleared===undefined)throw new Error("宿主未提供已核对的文档释放接口，文件已保留。");
  const text=read_text();
  return async()=>{
    const current=String(file.bundle?.filePath||"");
    // 监视器可能先将已删除文件改为未命名；若已切到其他文档，不触碰它。
    if(current&&file_key(current)!==file_key(path))return;
    if(read_text()!==text)throw new Error("文件已移到回收站，但删除期间正文发生修改；已保留编辑器，请将草稿另存为。");
    await file.loadFile("",true);
    if(file.bundle?.filePath||read_text()!=="")throw new Error("文件已移到回收站，但宿主未能释放原文档；请保留当前内容并重试。");
    file.updateChangeCount(file.ChangeType.NSChangeCleared);
  };
}
