import {workspace_text} from "./workspace_i18n";
import type {workspace_file_host} from "./workspace_files";
import {create_workspace_session_store,type workspace_session_file} from "./workspace_session_store";
import {window_transfer_token} from "./workspace_window_intent";
import {file_key} from "./workspace_file_uri";
import {workspace_context_epoch,workspace_context_switching} from "./workspace_context";

/** File sessions are independent of the recently opened file; directory switching transactions explicitly pause sampling, avoiding writing the clear process as a target session. */
export function bind_workspace_sessions(files:workspace_file_host){
  const runtime=window as any,workspace=files.core.app.workspace;
  const store=create_workspace_session_store(files.fs,files.path_api,runtime.reqnode("crypto"),files.path_api.join(runtime._options.userDataPath,"typora_code","state","workspace_sessions"));
  let disposed=false,paused=true,timer:ReturnType<typeof setTimeout>|undefined,reported=false;
  // Synchronize reading of startup intent before transferring the controller to clean the security anchor; do not re-read during asynchronous recovery phase.
  let owns_session = !window_transfer_token(runtime._options?.initFilePath, runtime._options?.initAnchor ?? runtime.File?.option?.initAnchor ?? "");
  let restore_controller=new AbortController(),activation_controller=new AbortController(),intent_revision=0;
  const interrupt=()=>{intent_revision++;activation_controller.abort();};
  const input_events=["pointerdown","keydown","wheel","beforeinput","workspace-file-open-intent"];
  for(const event of input_events)window.addEventListener(event,interrupt,{capture:true,passive:true});
  const notice=(error:unknown)=>{if(!disposed)new files.core.Notice(workspace_text("sessions_workspace_file_recovery")+String(error instanceof Error?error.message:error),6000);};
  const snapshot=()=>{
    const entries:workspace_session_file[]=[],identities=new Map<string,number>();let active=-1;
    const leaves:NonNullable<typeof workspace.activeLeaf>[]=[];
    workspace.eachLeaves(leaf=>{leaves.push(leaf);});
    // Core traversal proceeds in reverse order of removal of security; persistence should use the order of tags as perceived by the user.
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
    // Native preferences page uses getExtraOption; loadAll only returns editor options, without startup recovery configuration.
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
      // Existing host document and user input take precedence; only register background identity, never page-by-page borrow native editor.
      await files.restore_files(saved.files,operation.signal);
      if(!may_activate()||initial_state?.file_path)return;
      let dirty=false;workspace.eachLeaves(leaf=>{if(files.editor_state(leaf).dirty)dirty=true;});
      const preferred=saved.files[saved.active];
      if(dirty||!preferred)return;
      await files.open_file(preferred.path,{source:preferred.source,preview:false,signal:activation.signal,reason:"restore"});
      const active=workspace.activeLeaf,started=Date.now();
      while(current()&&!activation.signal.aborted&&workspace.activeLeaf===active&&active&&files.editor_state(active).busy){
        if(Date.now()-started>10000)throw new Error(workspace_text("sessions_timeout_waiting_for_active_file_loading"));
        await new Promise(resolve=>setTimeout(resolve,16));
      }
    }catch(error){if(current()&&!activation.signal.aborted&&intent===intent_revision)notice(error);}
  };
  // Wait for constant modules such as reading navigation to complete assembly, do not save the first empty layout ahead to disk.
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
