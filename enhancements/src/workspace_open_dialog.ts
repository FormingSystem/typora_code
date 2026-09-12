import type {workspace_file_host} from "./workspace_files";

type open_dialog_runtime = {
  JSBridge?: {invoke(name:string, ...args:unknown[]):Promise<{canceled?:boolean;filePaths?:string[]}>};
  File?: {setMountFolder?(path:string):void};
};

/** Typora 1.14.9 ClientCommand.open/openFolder 使用的同一系统选择窗口。 */
export function bind_workspace_open_dialog(files:workspace_file_host, changed:()=>void) {
  const runtime=window as unknown as open_dialog_runtime;
  let disposed=false, pending:Promise<void>|undefined,revision=0;
  const set_folder=async(selected:string)=>{
    if(disposed)return;const current=++revision;
    if(!files.path_api.isAbsolute(selected))throw new Error("文件夹路径无效。");
    const target=files.path_api.normalize(selected),stat=await files.fs.promises.stat(target);
    if(disposed||current!==revision)return;
    if(!stat.isDirectory())throw new Error("所选项目不是文件夹。");
    if(!runtime.File?.setMountFolder)throw new Error("Typora 文件夹接口不可用。");
    // 宿主会去掉一个末尾分隔符，盘符根须保留自己的分隔符。
    runtime.File.setMountFolder(target.endsWith(files.path_api.sep)?target+files.path_api.sep:target);changed();
  };
  const choose=(directory:boolean):Promise<void>=>{
    if(disposed)return Promise.resolve();
    if(pending)return pending;
    const current=revision;
    pending=(async()=>{
      if(!runtime.JSBridge?.invoke)throw new Error("系统文件选择窗口不可用。");
      const root=files.context_root();
      const result=await runtime.JSBridge.invoke("dialog.showOpenDialog",{
        title:directory?"打开文件夹":"打开文件",
        properties:directory?["openDirectory"]:["openFile"],
        ...(root&&files.path_api.isAbsolute(root)?{defaultPath:root}:{}),
        // 工作台支持代码与普通文本，默认不将它们过滤为不可选择。
        ...(!directory?{filters:[{name:"所有文件",extensions:["*"]}]}:{}),
      });
      if(disposed||current!==revision||result?.canceled||!result?.filePaths?.length)return;
      const selected=result.filePaths[0];
      if(typeof selected!=="string"||!files.path_api.isAbsolute(selected))throw new Error("系统返回的文件路径无效。");
      if(directory){
        // 只切换文件树根，不通过 openWithPath 替换正在编辑的文档。
        await set_folder(selected);
      }else{
        const target=files.path_api.normalize(selected),stat=await files.fs.promises.stat(target);
        if(disposed||current!==revision)return;
        if(!stat.isFile())throw new Error("所选项目不是文件。");
        await files.open_file(target);
      }
    })().finally(()=>{pending=undefined;});
    return pending;
  };
  return {open_file:()=>choose(false),open_folder:()=>choose(true),set_folder,
    close_folder(){if(disposed)return;if(!runtime.File?.setMountFolder)throw new Error("Typora 文件夹接口不可用。");revision++;runtime.File.setMountFolder("");changed();},
    dispose(){disposed=true;revision++;}};
}
