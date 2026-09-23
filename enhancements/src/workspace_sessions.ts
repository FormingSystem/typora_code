import type {workspace_file_host} from "./workspace_files";
import {create_workspace_session_store,type workspace_session_file} from "./workspace_session_store";
import {window_transfer_token} from "./workspace_window_intent";
import {file_key} from "./workspace_file_uri";
import {workspace_context_epoch,workspace_context_switching} from "./workspace_context";

/** 文件会话独立于最近文件；目录切换事务显式暂停采样，避免将清空过程写成目标会话。 */
export function bind_workspace_sessions(files:workspace_file_host){
  const runtime=window as any,workspace=files.core.app.workspace;
  const store=create_workspace_session_store(files.fs,files.path_api,runtime.reqnode("crypto"),files.path_api.join(runtime._options.userDataPath,"typora_code","state","workspace_sessions"));
  let disposed=false,paused=true,timer:ReturnType<typeof setTimeout>|undefined,reported=false;
  // 在移交控制器清理安全锚点之前同步读取启动意图；不在异步恢复阶段重读。
  let owns_session = !window_transfer_token(runtime._options?.initFilePath, runtime._options?.initAnchor ?? runtime.File?.option?.initAnchor ?? "");
  let restore_controller=new AbortController(),activation_controller=new AbortController(),intent_revision=0;
  const interrupt=()=>{intent_revision++;activation_controller.abort();};
  const input_events=["pointerdown","keydown","wheel","beforeinput","workspace-file-open-intent"];
  for(const event of input_events)window.addEventListener(event,interrupt,{capture:true,passive:true});
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
  const save=()=>{if(!owns_session)return;const {entries,active}=snapshot();store.write(files.context_root(),entries,active);};
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
    if(initial&&!owns_session)return;
    restore_controller.abort();restore_controller=new AbortController();
    activation_controller.abort();activation_controller=new AbortController();
    const operation=restore_controller,activation=activation_controller;
    const root=files.context_root(),epoch=workspace_context_epoch(),intent=initial?0:intent_revision;
    const initial_leaf=workspace.activeLeaf;
    const initial_state=initial_leaf?files.editor_state(initial_leaf):undefined;
    const current=()=>!disposed&&!operation.signal.aborted&&epoch===workspace_context_epoch()&&root===files.context_root();
    const may_activate=()=>current()&&!activation.signal.aborted&&intent===intent_revision&&workspace.activeLeaf===initial_leaf;
    try{
      if(!root||!await enabled()||!current())return;
      const saved=store.read(root);if(!saved)return;
      // 已有宿主文档和用户输入优先；只登记后台身份，绝不逐页借用原生编辑器。
      await files.restore_files(saved.files,operation.signal);
      if(!may_activate()||initial_state?.file_path)return;
      let dirty=false;workspace.eachLeaves(leaf=>{if(files.editor_state(leaf).dirty)dirty=true;});
      const preferred=saved.files[saved.active];
      if(dirty||!preferred)return;
      await files.open_file(preferred.path,{source:preferred.source,preview:false,signal:activation.signal,reason:"restore"});
      const active=workspace.activeLeaf,started=Date.now();
      while(current()&&!activation.signal.aborted&&workspace.activeLeaf===active&&active&&files.editor_state(active).busy){
        if(Date.now()-started>10000)throw new Error("等待活动文件加载超时。");
        await new Promise(resolve=>setTimeout(resolve,16));
      }
    }catch(error){if(current()&&!activation.signal.aborted&&intent===intent_revision)notice(error);}
  };
  // 等待阅读导航等常驻模块完成装配，不将首次空布局抢先保存到磁盘。
  const ready=(async()=>{
    while(!disposed&&document.documentElement.dataset.linuxNoteTyporaEnhancements==="loading")await new Promise(resolve=>setTimeout(resolve,30));
    if(disposed)return;await restore(true);paused=false;
  })();
  return {ready,
    suspend(){restore_controller.abort();activation_controller.abort();clearTimeout(timer);save();paused=true;},
    async resume(restore_files:boolean){try{if(restore_files){owns_session=true;await restore();}}finally{paused=false;}},
    dispose(){flush();disposed=true;restore_controller.abort();activation_controller.abort();for(const event of input_events)window.removeEventListener(event,interrupt,true);clearTimeout(timer);for(const stop of stops)stop();window.removeEventListener("beforeunload",flush);},
  };
}
