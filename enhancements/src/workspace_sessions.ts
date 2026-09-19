import type {workspace_file_host} from "./workspace_files";
import {create_workspace_session_store,type workspace_session_file} from "./workspace_session_store";
import {file_key} from "./workspace_file_uri";
import {workspace_context_epoch,workspace_context_switching} from "./workspace_context";

/** 文件会话独立于最近文件；目录切换事务显式暂停采样，避免将清空过程写成目标会话。 */
export function bind_workspace_sessions(files:workspace_file_host){
  const runtime=window as any,workspace=files.core.app.workspace;
  const store=create_workspace_session_store(files.fs,files.path_api,runtime.reqnode("crypto"),files.path_api.join(runtime._options.userDataPath,"typora_code","state","workspace_sessions"));
  let disposed=false,paused=true,timer:ReturnType<typeof setTimeout>|undefined,reported=false;
  const controller=new AbortController();
  const notice=(error:unknown)=>{if(!disposed)new files.core.Notice("工作区文件恢复："+String(error instanceof Error?error.message:error),6000);};
  const snapshot=()=>{
    const entries:workspace_session_file[]=[],identities=new Map<string,number>();let active=-1;
    const leaves:NonNullable<typeof workspace.activeLeaf>[]=[];
    workspace.eachLeaves(leaf=>{leaves.push(leaf);});
    // 核心遍历按移除安全的逆序进行；持久化应采用用户所见标签顺序。
    leaves.sort((left,right)=>{
      const a=left.parent.tabHeader?.getTabById(left.state.path)||left.containerEl;
      const b=right.parent.tabHeader?.getTabById(right.state.path)||right.containerEl;
      const relation=a.compareDocumentPosition(b);return relation&1?0:relation&4?-1:relation&2?1:0;
    });
    leaves.forEach(leaf=>{
      const state=files.editor_state(leaf);if(!state.file_path||state.kind==="other"||!files.path_api.isAbsolute(state.file_path))return;
      const identity=file_key(state.file_path)+":"+state.kind;
      let index=identities.get(identity);if(index===undefined){index=entries.length;identities.set(identity,index);entries.push({path:state.file_path,source:state.kind==="source",pinned:!!leaf.state.workspace_pinned});}
      if(leaf===workspace.activeLeaf)active=index;
    });
    return {entries,active};
  };
  const save=()=>{const {entries,active}=snapshot();store.write(files.context_root(),entries,active);};
  const flush=()=>{clearTimeout(timer);if(disposed||paused||workspace_context_switching())return;try{save();reported=false;}catch(error){if(!reported)notice(error);reported=true;}};
  const schedule=()=>{if(disposed||paused)return;clearTimeout(timer);timer=setTimeout(flush,150);};
  const stops=[workspace.on("layout-changed",schedule),workspace.on("active-leaf:change",schedule),workspace.on("file:open",schedule)];
  window.addEventListener("beforeunload",flush);
  const enabled=async()=>{
    // 原生偏好页使用getExtraOption；loadAll仅返回编辑器选项，不含启动恢复配置。
    const raw=await runtime.JSBridge?.invoke?.("setting.getExtraOption");
    const options=typeof raw==="string"?JSON.parse(raw):raw||runtime.File?.option;
    return String(options?.restoreWhenLaunch)==="2";
  };
  const restore=async(initial=false)=>{
    const root=files.context_root(),epoch=workspace_context_epoch();
    const current=()=>!disposed&&!controller.signal.aborted&&epoch===workspace_context_epoch()&&root===files.context_root();
    try{
      if(!root||!await enabled()||!current())return;
      let dirty=false;workspace.eachLeaves(leaf=>{if(files.editor_state(leaf).dirty)dirty=true;});
      if(dirty)return;
      const saved=store.read(root);if(!saved)return;
      const initial_state=initial&&workspace.activeLeaf?files.editor_state(workspace.activeLeaf):undefined;
      const preferred=initial_state?.file_path?{path:initial_state.file_path,source:initial_state.kind==="source"}:saved.files[saved.active];
      const errors:string[]=[];
      for(const entry of saved.files){
        if(!current())return;
        try{
          await files.open_file(entry.path,{source:entry.source,preview:false,signal:controller.signal});
          if(!current())return;
          const leaf=workspace.activeLeaf;
          const started=Date.now();
          while(leaf&&files.editor_state(leaf).busy&&current()){
            if(Date.now()-started>10000)throw new Error("等待文件加载超时。");
            await new Promise(resolve=>setTimeout(resolve,30));
          }
          if(!current())return;
          if(leaf&&file_key(files.editor_state(leaf).file_path)===file_key(entry.path)){leaf.state.workspace_pinned=entry.pinned;files.keep_open(leaf);}
        }catch(error){if(!current())return;errors.push(entry.path+"："+String((error as Error).message||error));}
      }
      if(preferred&&current()){
        let found=false;workspace.eachLeaves(leaf=>{const state=files.editor_state(leaf);if(file_key(state.file_path)===file_key(preferred.path)&& (state.kind==="source")===preferred.source)found=true;});
        if(found)await files.open_file(preferred.path,{source:preferred.source,preview:false,signal:controller.signal});
      }
      if(errors.length)notice("部分文件未能打开：\n"+errors.join("\n"));
    }catch(error){notice(error);}
  };
  // 等待阅读导航等常驻模块完成装配，不将首次空布局抢先保存到磁盘。
  const ready=(async()=>{
    while(!disposed&&document.documentElement.dataset.linuxNoteTyporaEnhancements==="loading")await new Promise(resolve=>setTimeout(resolve,30));
    if(disposed)return;await restore(true);paused=false;
  })();
  return {ready,
    suspend(){clearTimeout(timer);save();paused=true;},
    async resume(restore_files:boolean){try{if(restore_files)await restore();}finally{paused=false;}},
    dispose(){flush();disposed=true;controller.abort();clearTimeout(timer);for(const stop of stops)stop();window.removeEventListener("beforeunload",flush);},
  };
}
