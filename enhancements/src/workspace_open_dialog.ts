import type {workspace_file_host} from "./workspace_files";
import type {bind_workspace_sessions} from "./workspace_sessions";
import {assert_workspace_context_ready,begin_workspace_context_switch,finish_workspace_context_switch,cancel_workspace_context_switch} from "./workspace_context";

type open_dialog_runtime = {
  JSBridge?: {invoke(name:string, ...args:unknown[]):Promise<any>};
  File?: {setMountFolder?(path:string):void;editor?:{library?:{onRootChanged?:(path?:string,skip_recent?:boolean)=>unknown}}};
};

/** 文件夹开窗和标签移交共用原生主进程入口；编辑器 app.openFile 只处理标签导航。 */
export async function open_workspace_window(root:string,anchor="#"):Promise<unknown>{
  const runtime=window as unknown as open_dialog_runtime;
  if(!runtime.JSBridge?.invoke)throw new Error("当前宿主未提供新窗口入口。");
  if(!anchor.startsWith("#")||/[\u0000-\u0020]/u.test(anchor))throw new Error("新窗口锚点必须是安全的文内片段。");
  return runtime.JSBridge.invoke("app.openFile",null,{mountFolder:root,anchor});
}

/** Typora 1.14.9 ClientCommand.open/openFolder 使用的同一系统选择窗口。 */
export function bind_workspace_open_dialog(files:workspace_file_host, changed:()=>void, sessions:Pick<ReturnType<typeof bind_workspace_sessions>,"ready"|"suspend"|"resume">) {
  const runtime=window as unknown as open_dialog_runtime;
  let disposed=false, pending:Promise<void>|undefined,revision=0,changing=false;
  const library=runtime.File?.editor?.library,native_root_changed=library?.onRootChanged;
  const same_root=(left:string,right:string)=>files.path_api.sep==="\\"?left.toLowerCase()===right.toLowerCase():left===right;
  const switch_folder=async(target:string)=>{
    if(changing)throw new Error("工作区正在切换，请完成当前操作后重试。");
    if(!runtime.File?.setMountFolder)throw new Error("Typora 文件夹接口不可用。");
    changing=true;
    try{
      await sessions.ready;if(disposed)return;
      assert_workspace_context_ready();
      const previous=files.context_root();
      if(same_root(previous,target)){changed();window.dispatchEvent(new Event("linux-note-workspace-context-refreshed"));return;}
      const close=await files.prepare_workspace_switch();if(disposed||!close)return;
      if(target&&!(await files.fs.promises.stat(target)).isDirectory())throw new Error("目标目录已不存在。");
      if(disposed)return;
      sessions.suspend();
      let committed=false;
      try{
        begin_workspace_context_switch();
        close();const mounted=target.endsWith(files.path_api.sep)?target+files.path_api.sep:target;
        runtime.File.setMountFolder(mounted);committed=true;
        native_root_changed?.call(library,mounted,true);
      }finally{
        // 原生缓存刷新失败也不能把已切换的根目录留在旧Git/搜索状态。
        if(committed)finish_workspace_context_switch();else cancel_workspace_context_switch();
        await sessions.resume(committed);
      }
    }finally{changing=false;}
  };
  const set_folder=async(selected:string)=>{
    if(disposed)return;const current=++revision;
    if(!files.path_api.isAbsolute(selected))throw new Error("文件夹路径无效。");
    const target=files.path_api.resolve(selected),stat=await files.fs.promises.stat(target);
    if(disposed||current!==revision)return;
    if(!stat.isDirectory())throw new Error("所选项目不是文件夹。");
    if(!runtime.File?.setMountFolder)throw new Error("Typora 文件夹接口不可用。");
    await switch_folder(target);
    if(disposed||!same_root(files.context_root(),target))return;
    if(!runtime.JSBridge?.invoke)throw new Error("文件夹已打开，但宿主最近目录接口不可用。");
    try { await runtime.JSBridge.invoke("setting.addRecentFolder",target); }
    catch(error) { throw new Error("文件夹已打开，但最近目录更新失败："+String(error)); }
  };
  const open_folder_new_window=async(selected:string)=>{
    if(disposed)return;
    if(!files.path_api.isAbsolute(selected))throw new Error("文件夹路径无效。");
    const target=files.path_api.normalize(selected),stat=await files.fs.promises.stat(target);
    if(disposed)return;if(!stat.isDirectory())throw new Error("所选项目不是文件夹。");
    // 已核对的 Typora 新窗口接口，仅使用安全的文内片段，不传外部协议或移交数据。
    await open_workspace_window(target);
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
        // 系统选择和最近目录采用同一个工作区切换事务。
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
  const routed_root_changed=(path?:string,skip_recent?:boolean)=>{
    if(typeof path!=="string"||!path)return native_root_changed?.call(library,path,skip_recent);
    return set_folder(path).catch(error=>{if(!disposed)new files.core.Notice(String(error instanceof Error?error.message:error),5000);});
  };
  if(library&&native_root_changed)library.onRootChanged=routed_root_changed;
  return {open_file:()=>choose(false),open_folder:()=>choose(true),set_folder,open_folder_new_window,
    close_folder(){if(disposed)return;revision++;return switch_folder("");},
    dispose(){disposed=true;revision++;if(library?.onRootChanged===routed_root_changed)library.onRootChanged=native_root_changed;}};
}
