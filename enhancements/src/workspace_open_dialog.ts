import {workspace_text} from "./workspace_i18n";
import type {workspace_file_host} from "./workspace_files";
import {active_remote_files,remote_files_for,select_remote_files} from './remote_workspace_files';
import {choose_remote_resource} from './remote_workspace_picker';
import {choose_local_directory} from './workspace_native_picker';
import type {bind_workspace_sessions} from "./workspace_sessions";
import {assert_workspace_context_ready,begin_workspace_context_switch,finish_workspace_context_switch,cancel_workspace_context_switch} from "./workspace_context";

type open_dialog_runtime = {
  JSBridge?: {invoke(name:string, ...args:unknown[]):Promise<any>};
  File?: {setMountFolder?(path:string):void;editor?:{library?:{onRootChanged?:(path?:string,skip_recent?:boolean)=>unknown}}};
};

/** The folder opening and tag transfer share the native main process entry; the editor app.openFile only handles tag navigation. */
export async function open_workspace_window(root:string,anchor="#"):Promise<unknown>{
  const runtime=window as unknown as open_dialog_runtime;
  if(!runtime.JSBridge?.invoke)throw new Error(workspace_text("open_dialog_the_current_host_does_not_provide_a_new_window_entry"));
  if(!anchor.startsWith("#")||/[\u0000-\u0020]/u.test(anchor))throw new Error(workspace_text("open_dialog_the_new_window_anchor_must_be_a_safe_in_page_fragment"));
  return runtime.JSBridge.invoke("app.openFile",null,{mountFolder:root,anchor});
}

/** The Typora 1.14.9 ClientCommand.open/openFolder use the same system selection window. */
export function bind_workspace_open_dialog(files:workspace_file_host, changed:()=>void, sessions:Pick<ReturnType<typeof bind_workspace_sessions>,"ready"|"suspend"|"resume">,open_recent_folder?:(path:string)=>Promise<unknown>) {
  const runtime=window as unknown as open_dialog_runtime;
  let disposed=false, pending:Promise<void>|undefined,revision=0,changing=false;
  const library=runtime.File?.editor?.library,native_root_changed=library?.onRootChanged;
  const same_root=(left:string,right:string)=>files.path_api.sep==="\\"?left.toLowerCase()===right.toLowerCase():left===right;
  const switch_folder=async(target:string,prepared_close?:()=>void)=>{
    if(changing)throw new Error(workspace_text("open_dialog_the_workspace_is_switching_please_retry_after_completing_the"));
    if(!runtime.File?.setMountFolder)throw new Error(workspace_text("open_dialog_typora_folder_interface_is_unavailable"));
    changing=true;
    try{
      await sessions.ready;if(disposed)return;
      assert_workspace_context_ready();
      const previous=files.context_root();
      if(same_root(previous,target)){changed();window.dispatchEvent(new Event("linux-note-workspace-context-refreshed"));return;}
      const close=prepared_close||await files.prepare_workspace_switch();if(disposed||!close)return;
      if(target&&!(await files.fs.promises.stat(target)).isDirectory())throw new Error(workspace_text("open_dialog_the_target_directory_no_longer_exists"));
      if(disposed)return;
      const remote_target=remote_files_for(target);if(remote_target)await remote_target.mount(remote_target.remote_path(target));
      sessions.suspend();
      let committed=false;
      try{
        begin_workspace_context_switch();
        close();const remote=remote_target;if(remote)remote.root=target;select_remote_files(remote);
        const mounted=target.endsWith(files.path_api.sep)?target+files.path_api.sep:target;
        runtime.File.setMountFolder(mounted);committed=true;
        native_root_changed?.call(library,mounted,true);
      }finally{
        // If the native cache refresh fails, it also cannot leave the root directory in the old Git/ search state after switching.
        if(committed)finish_workspace_context_switch();else cancel_workspace_context_switch();
        await sessions.resume(committed);
      }
      if(committed&&remote_target)files.core.app.commands.run('linux_note:file_explorer');
    }finally{changing=false;}
  };
  const set_folder=async(selected:string,prepared_close?:()=>void)=>{
    if(disposed)return;const current=++revision;
    if(!files.path_api.isAbsolute(selected))throw new Error(workspace_text("open_dialog_invalid_folder_path"));
    const target=files.path_api.resolve(selected),stat=await files.fs.promises.stat(target);
    if(disposed||current!==revision)return;
    if(!stat.isDirectory())throw new Error(workspace_text("remote_workspace_picker_the_selected_item_is_not_a_folder"));
    if(!runtime.File?.setMountFolder)throw new Error(workspace_text("open_dialog_typora_folder_interface_is_unavailable"));
    await switch_folder(target,prepared_close);
    if(remote_files_for(target))return;
    if(disposed||!same_root(files.context_root(),target))return;
    if(!runtime.JSBridge?.invoke)throw new Error(workspace_text("open_dialog_the_folder_is_open_but_the_host_s_recent_directory_interface"));
    try { await runtime.JSBridge.invoke("setting.addRecentFolder",target); }
    catch(error) { throw new Error(workspace_text("open_dialog_the_folder_is_open_but_the_recent_directory_update_failed")+String(error)); }
  };
  const open_folder_new_window=async(selected:string)=>{
    if(disposed)return;
    if(!files.path_api.isAbsolute(selected))throw new Error(workspace_text("open_dialog_invalid_folder_path"));
    const target=files.path_api.normalize(selected),stat=await files.fs.promises.stat(target);
    if(disposed)return;if(!stat.isDirectory())throw new Error(workspace_text("remote_workspace_picker_the_selected_item_is_not_a_folder"));
    // Verified Typora new window interface, only using secure inline fragments, no external protocols or data transfer.
    await open_workspace_window(target);
  };
  const choose=(directory:boolean,local=false):Promise<void>=>{
    if(disposed)return Promise.resolve();
    if(pending)return pending;
    const current=revision;
    pending=(async()=>{
      if(active_remote_files()&&!local){
        const selected=await choose_remote_resource(directory,undefined,{choose_local_folder:()=>choose_local_directory()});if(!selected||disposed||current!==revision)return;
        if(directory)await set_folder(selected);else await files.open_file(selected);return;
      }
      if(directory&&local){const selected=await choose_local_directory(active_remote_files()?'':files.context_root());if(selected&&!disposed&&current===revision)await set_folder(selected);return;}
      if(!runtime.JSBridge?.invoke)throw new Error(workspace_text("native_picker_the_system_file_selection_window_is_unavailable"));
      const root=files.context_root();
      const result=await runtime.JSBridge.invoke("dialog.showOpenDialog",{
        title:directory?workspace_text("file_commands_open_folder"):workspace_text("file_commands_open_file"),
        properties:directory?["openDirectory"]:["openFile"],
        ...(root&&files.path_api.isAbsolute(root)?{defaultPath:root}:{}),
        // Workbench supports code and regular text; by default, they are not filtered as non-selectable.
        ...(!directory?{filters:[{name:workspace_text("files_all_files"),extensions:["*"]}]}:{}),
      });
      if(disposed||current!==revision||result?.canceled||!result?.filePaths?.length)return;
      const selected=result.filePaths[0];
      if(typeof selected!=="string"||!files.path_api.isAbsolute(selected))throw new Error(workspace_text("open_dialog_the_file_path_returned_by_the_system_is_invalid"));
      if(directory){
        // System selection and recent directory use the same workspace switch transaction.
        await set_folder(selected);
      }else{
        const target=files.path_api.normalize(selected),stat=await files.fs.promises.stat(target);
        if(disposed||current!==revision)return;
        if(!stat.isFile())throw new Error(workspace_text("remote_workspace_picker_the_selected_item_is_not_a_file"));
        await files.open_file(target);
      }
    })().finally(()=>{pending=undefined;});
    return pending;
  };
  const routed_root_changed=(path?:string,skip_recent?:boolean)=>{
    if(typeof path!=="string"||!path)return native_root_changed?.call(library,path,skip_recent);
    return (open_recent_folder?open_recent_folder(path):set_folder(path)).catch(error=>{if(!disposed)new files.core.Notice(String(error instanceof Error?error.message:error),5000);});
  };
  if(library&&native_root_changed)library.onRootChanged=routed_root_changed;
  return {open_file:()=>choose(false),open_folder:()=>choose(true),open_local_folder:()=>choose(true,true),set_folder,open_folder_new_window,
    close_folder(){if(disposed)return;revision++;return switch_folder("");},
    dispose(){disposed=true;revision++;if(library?.onRootChanged===routed_root_changed)library.onRootChanged=native_root_changed;}};
}
