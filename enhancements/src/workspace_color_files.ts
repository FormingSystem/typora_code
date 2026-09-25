/** JSON导出使用已核对的宿主另存为入口，不改变文档或工作区。 */
export async function export_color_file(text:string,is_active:()=>boolean):Promise<boolean>{
  const runtime=window as any;
  if(!runtime.JSBridge?.invoke||!runtime.reqnode)throw Error('当前宿主不支持导出文件。');
  const result=await runtime.JSBridge.invoke('dialog.showSaveDialog',{title:'导出颜色配置',defaultPath:'typora-code-colors.json',properties:['showOverwriteConfirmation'],filters:[{name:'JSON颜色配置',extensions:['json']}]});
  if(!is_active()||result?.canceled||!result?.filePath)return false;
  const path=runtime.reqnode('path');if(!path.isAbsolute(result.filePath))throw Error('系统返回的保存路径无效。');
  await runtime.reqnode('fs').promises.writeFile(result.filePath,text,'utf8');return true;
}
