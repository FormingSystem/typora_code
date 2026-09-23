/** 系统目录选择只返回选择结果，工作区切换归共同目录事务。 */
export async function choose_local_directory(default_path=''):Promise<string|undefined>{
  const runtime=window as unknown as {JSBridge?:{invoke(name:string,...args:unknown[]):Promise<any>}};
  if(!runtime.JSBridge?.invoke)throw Error('系统文件选择窗口不可用。');
  const result=await runtime.JSBridge.invoke('dialog.showOpenDialog',{title:'打开本地文件夹',properties:['openDirectory'],...(default_path?{defaultPath:default_path}:{})});
  return result?.canceled?undefined:result?.filePaths?.[0];
}
