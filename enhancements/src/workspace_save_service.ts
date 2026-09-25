import type {graph_leaf} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";
import {file_key} from "./workspace_file_uri";
import {create_local_history_store} from "./workspace_local_history";
import {create_auto_save} from "./workspace_auto_save";
import {bind_native_save} from "./workspace_native_save";
import {observe_workspace_file_changed,observe_workspace_file_saved,publish_workspace_file_changed,publish_workspace_file_saved} from "./workspace_file_events";
import {read_workspace_save_settings,observe_workspace_save_settings,open_workspace_save_settings,close_workspace_save_settings,set_workspace_save_settings} from "./workspace_save_settings";
import {create_workspace_lifetime} from "./workspace_lifetime";

/** 原生和源码保存共同接入一个历史库；自动保存只调用既有文件事务。 */
export function bind_workspace_save_service(files:workspace_file_host,runtime:any=window){
  const lifetime=create_workspace_lifetime(),workspace=files.core.app.workspace;
  const listeners=new Set<()=>void>(),history_listeners=new Set<()=>void>(),notify=()=>{if(!lifetime.disposed)for(const listener of listeners)listener();};
  const notify_history=()=>{notify();if(!lifetime.disposed)for(const listener of history_listeners)listener();};
  const report=(error:unknown)=>{if(!lifetime.disposed)new files.core.Notice(String(error instanceof Error?error.message:error),6000);};
  const user_data=runtime._options?.userDataPath;
  if(typeof user_data!=="string"||!files.path_api.isAbsolute(user_data))throw new Error("无法确定本地历史的应用存储目录。");
  const history=create_local_history_store({fs:files.fs,path_api:files.path_api,crypto:runtime.reqnode("crypto")},files.path_api.join(user_data,"typora_code","History"),()=>{
    const value=read_workspace_save_settings();return{enabled:value["workbench.localHistory.enabled"],max_entries:value["workbench.localHistory.maxFileEntries"],merge_window:value["workbench.localHistory.mergeWindow"],exclude:value["workbench.localHistory.exclude"],workspace_root:files.context_root()};
  });
  const leaves=()=>{const result:graph_leaf[]=[];workspace.eachLeaves(leaf=>{result.push(leaf);});return result;};
  const native=lifetime.own(bind_native_save(runtime,{
    save_as:files.save_as_active,
    changed:publish_workspace_file_changed,
    saved:path=>publish_workspace_file_saved({file_path:path}),
    auto_save_changed:enabled=>set_workspace_save_settings({"files.autoSave":enabled?"afterDelay":"off"}),
  }));
  let composing=false;const tracked=new Set<graph_leaf>();
  const auto=create_auto_save<graph_leaf>({policy:()=>{const value=read_workspace_save_settings();return{mode:value["files.autoSave"],delay:value["files.autoSaveDelay"]};},
    state:leaf=>{
      const state=files.editor_state(leaf),root=files.context_root(),relative=root?files.path_api.relative(root,state.file_path):"..";
      const in_workspace=Boolean(root)&&!files.path_api.isAbsolute(relative)&&relative!==".."&&!relative.startsWith(".."+files.path_api.sep);
      const native_ready=state.kind!=="markdown"||file_key(runtime.File?.bundle?.filePath||"")===file_key(state.file_path)&&!runtime.File?.isReadonlyMode&&!runtime.File?.isLocked;
      const settings=read_workspace_save_settings();
      return{...state,busy:state.busy||composing,eligible:leaves().includes(leaf)&&Boolean(state.file_path)&&state.kind!=="other"&&native_ready&&(!settings["files.autoSaveWorkspaceFilesOnly"]||in_workspace)&&(!settings["files.autoSaveWhenNoErrors"]||!files.has_editor_errors(leaf))};
    },save:leaf=>native.save(()=>files.auto_save_leaf(leaf)),report:(_leaf,error)=>report(error)});
  lifetime.add(auto.dispose);
  lifetime.add(observe_workspace_file_changed(path=>{if(lifetime.disposed)return;const active=workspace.activeLeaf,leaf=active&&file_key(files.editor_state(active).file_path)===file_key(path)?active:leaves().find(item=>file_key(files.editor_state(item).file_path)===file_key(path));if(leaf){tracked.add(leaf);auto.changed(leaf);}notify();}));
  lifetime.add(observe_workspace_file_saved(file=>{
    const recorded=file.bytes===undefined?history.capture(file.file_path,file.source):history.record(file.file_path,file.bytes,file.source);
    void recorded.then(notify_history).catch(error=>report("文件已保存，但本地历史写入失败："+String(error)));
  }));
  lifetime.add(observe_workspace_save_settings(()=>{auto.configure(leaves());notify();}));
  lifetime.listen(document,"focusout",((event:FocusEvent)=>{
    const leaf=workspace.activeLeaf;if(!leaf)return;
    const target=event.target,next=event.relatedTarget,root=leaf.view.containerEl;
    const inside=(node:EventTarget|null)=>node instanceof Node&&(root.contains(node)||files.editor_state(leaf).kind==="markdown"&&Boolean(document.querySelector("#write")?.contains(node)));
    if(inside(target)&&!inside(next))auto.focus_lost(leaf);
  }) as EventListener,true);
  lifetime.listen(window,"blur",()=>auto.window_lost(leaves()));
  lifetime.listen(document,"compositionstart",()=>{composing=true;},true);
  lifetime.listen(document,"compositionend",()=>{composing=false;},true);
  lifetime.listen(window,"linux-note-workspace-renamed",((event:CustomEvent)=>{const detail=event.detail;if(detail?.old_path&&detail?.new_path)void history.move(detail.old_path,detail.new_path,detail.directory===true).then(notify_history).catch(report);}) as EventListener);
  let previous_leaf=workspace.activeLeaf;
  lifetime.add(workspace.on("active-leaf:change",()=>{if(previous_leaf&&previous_leaf!==workspace.activeLeaf)auto.focus_lost(previous_leaf);previous_leaf=workspace.activeLeaf;native.sync_options();notify();}));
  lifetime.add(workspace.on("file:will-open",(path:string)=>{const current=runtime.File?.bundle?.filePath;if(typeof path!=="string"||!current||file_key(current)===file_key(path))return;for(const leaf of leaves())if(files.editor_state(leaf).kind==="markdown"&&file_key(files.editor_state(leaf).file_path)===file_key(current))auto.focus_lost(leaf);}));
  lifetime.add(workspace.on("layout-changed",()=>{const present=leaves();for(const leaf of tracked)if(!present.includes(leaf)){auto.forget(leaf);tracked.delete(leaf);}notify();}));lifetime.add(workspace.on("file:open",()=>{native.sync_options();notify();}));
  lifetime.add(files.core.app.commands.register({id:"linux_note:save_settings",title:"文件：自动保存与本地历史设置",scope:"global",callback:open_workspace_save_settings}));
  lifetime.add(files.core.app.commands.register({id:"linux_note:auto_save",title:"文件：切换自动保存",scope:"global",callback:()=>set_workspace_save_settings({"files.autoSave":read_workspace_save_settings()["files.autoSave"]==="off"?"afterDelay":"off"})}));
  lifetime.add(close_workspace_save_settings);
  return{history,report,notify:notify_history,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},subscribe_history(listener:()=>void){history_listeners.add(listener);return()=>{history_listeners.delete(listener);};},dispose(){lifetime.dispose();listeners.clear();history_listeners.clear();tracked.clear();}};
}
export type workspace_save_service=ReturnType<typeof bind_workspace_save_service>;
