import {load_workspace_service} from "./workspace_service_loader";
import {workspace_text} from "./workspace_i18n";
import {resolve_workspace_locale} from './workspace_locale';
import {read_network_settings} from './workspace_network_settings';
import {workspace_dialog,workspace_button,workspace_element as el} from "./workspace_widgets";
import {get_workspace_app} from "./workspace_bootstrap";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {create_workspace_progress_view} from "./workspace_progress_view";
import bundled_release from "../release.json";

/** UI is only responsible for announcements and progress; disk and multi-window status belong to Node update service. */
export function bind_workspace_update(){
 const lifetime=create_workspace_lifetime(),app=get_workspace_app();
 const runtime=window as any;
 if(!app||!runtime.reqnode||!runtime._options?.userDataPath)return lifetime;
 const fs=runtime.reqnode("fs"),path=runtime.reqnode("path"),process=runtime.reqnode("process");
 const user_data=runtime._options.userDataPath,installed_root=path.join(user_data,"typora_code");
 let service:any,loaded_identity:string|undefined;
 try{service=load_workspace_service(runtime.reqnode, path.join(installed_root,"assets/update/workspace_update_service.cjs"));loaded_identity=service.installed_identity(user_data)?.commit;}
 catch(error){console.error(workspace_text("update_typora_code_update_module_loading_failed"),error);return lifetime;}
 const state_root=service.update_paths(user_data).state_root;
 let current:any,disposed=false,dialog:ReturnType<typeof workspace_dialog>|undefined,poll:ReturnType<typeof setInterval>|undefined;
 type check_request={controller:AbortController;manual:boolean;dialog?:ReturnType<typeof workspace_dialog>};
 let active_check:check_request|undefined;
 const write_log=(error:unknown)=>{try{fs.mkdirSync(state_root,{recursive:true});fs.appendFileSync(path.join(state_root,"checks.log"),new Date().toISOString()+" "+String(error)+"\n","utf8");}catch{};};
 const show_version=(target:ReturnType<typeof workspace_dialog>)=>{
  load();
  let version=target.content.querySelector<HTMLElement>(".workspace-update-version");
  if(!version){version=el("div","workspace-update-version");target.content.prepend(version);}
  version.replaceChildren(el("p","",workspace_text("update_current_running_version")+current.releases[0].version));
  try{
   const installed=service.release_info(JSON.parse(fs.readFileSync(path.join(installed_root,"assets/update/release.json"),"utf8"))).releases[0];
   const identity=service.installed_identity(user_data);
   if(installed.sequence!==current.releases[0].sequence||installed.version!==current.releases[0].version
      ||identity?.basis==="installed-archive"&&identity.commit!==loaded_identity){
    version.append(el("p","",workspace_text("update_installed_version")+installed.version+workspace_text("update_will_take_effect_after_restart")));
   }
  }catch{version.append(el("p","",workspace_text("update_installed_version_cannot_be_read_at_the_moment")));}
 };
 const message=(title:string,text:string,can_retry=false)=>{
  dialog?.close();const target=dialog=workspace_dialog(title,workspace_text("community_plugin_settings_close"),()=>{if(dialog===target)dialog=undefined;});target.content.append(el("p","",text));
  show_version(target);
  if(can_retry){const retry=workspace_button(workspace_text("git_source_control_retry"),()=>{
   if(disposed||dialog!==target||retry.disabled)return;
   retry.disabled=true;target.close();void check(true);
  });target.footer.append(retry);}
 };
 function load(){
  // Each window retains the memory version at startup; installation success cannot impersonate this window as already loaded the new version.
  current ||= service.release_info(bundled_release);
 }
 function show_progress(job:string){
  dialog?.close();
  const progress=create_workspace_progress_view();
  dialog=workspace_dialog(workspace_text("update_typora_code_update_progress"),workspace_text("community_plugin_settings_close"),()=>{clearInterval(poll);poll=undefined;progress.dispose();dialog=undefined;});
  let cancelling=false;const started=Date.now();
  const target=dialog,status=el("p","",workspace_text("update_starting_update")),detail=el("p"),log=el("p","",workspace_text("update_log")+path.join(state_root,job));
  show_version(target);
  log.style.overflowWrap="anywhere";
  const cancel=workspace_button(workspace_text("update_cancel_download"),()=>{
   try{service.cancel_update(state_root,job);cancelling=true;cancel.disabled=true;status.textContent=workspace_text("update_canceling_update_please_wait");}
   catch(error){status.textContent=workspace_text("update_cancel_request_failed")+String(error);write_log(error);}
  });
  status.setAttribute("role","status");target.content.append(progress.root,status,detail,log,el("p","",workspace_text("update_closing_this_window_will_not_interrupt_the_update_you_can_ch")));target.footer.append(cancel);
  const bytes_text=(bytes:number)=>(bytes/1048576).toFixed(1)+" MB";
  const refresh=()=>{try{
   const value=service.status_of(state_root,job),finished=['succeeded','failed','cancelled'].includes(value.phase);
   const can_cancel=['starting','downloading','verifying'].includes(value.phase);
   status.textContent=cancelling&&can_cancel?workspace_text("update_canceling_update_please_wait"):value.message;
   cancel.disabled=cancelling||!can_cancel;
   const bytes=Number.isSafeInteger(value.bytes)&&value.bytes>=0?value.bytes:undefined;
   const total=Number.isSafeInteger(value.total_bytes)&&value.total_bytes>0&&bytes!==undefined&&bytes<=value.total_bytes?value.total_bytes:undefined;
   const percentage=value.phase==='downloading'&&total!==undefined?Math.floor(bytes!/total*100):undefined;
   detail.textContent=finished?"":value.phase==='downloading'&&bytes!==undefined
    ?total!==undefined?workspace_text("update_download_fraction",{downloaded:bytes_text(bytes),total:bytes_text(total),percentage:percentage!}):workspace_text("update_already_downloaded")+bytes_text(bytes)+workspace_text("update_server_does_not_provide_total_size")
    :workspace_text("update_has_waited")+Math.floor((Date.now()-started)/1000)+workspace_text("update_seconds");
   target.content.setAttribute("aria-busy",String(!finished));
   if(finished){clearInterval(poll);poll=undefined;cancel.remove();if(value.phase==='succeeded'){show_version(target);progress.update(workspace_text("update_update_installation_is_complete"),100);}else progress.hide();}
   else progress.update(status.textContent||workspace_text("update_updating"),percentage);
  }catch(error){status.textContent=workspace_text("update_cannot_read_update_status_temporarily")+String(error);progress.hide();target.content.setAttribute("aria-busy","false");cancel.disabled=true;}};
  poll=setInterval(refresh,350);refresh();
 }
 function close_checking(request:check_request){
  const target=request.dialog;request.dialog=undefined;
  if(dialog===target)dialog=undefined;
  target?.close();
 }
 function show_checking(request:check_request){
  request.manual=true;
  if(request.dialog)return;
  const progress=create_workspace_progress_view();
  const target=dialog=workspace_dialog(workspace_text("update_check_typora_code_update"),workspace_text("update_cancel_check"),()=>{
   progress.dispose();
   if(request.dialog!==target)return;
   request.dialog=undefined;if(dialog===target)dialog=undefined;
   if(active_check===request)active_check=undefined;
   request.controller.abort();
  });
  request.dialog=target;
  show_version(target);
  const status=el("p","",workspace_text("update_checking_for_updates"));status.setAttribute("role","status");
  progress.update(workspace_text("update_checking_typora_code_update"));
  target.content.setAttribute("aria-busy","true");
  target.content.append(progress.root,status,el("p","",workspace_text("update_connecting_to_update_service_and_verifying_version_please_wa")));
 }
 async function check(manual=false){
  if(disposed)return;
  if(active_check){if(manual)show_checking(active_check);return;}
  if(dialog){if(manual)dialog.footer.querySelector<HTMLButtonElement>("button")?.focus();return;}
  const request:check_request={controller:new AbortController(),manual};active_check=request;
  const is_current=()=>!disposed&&active_check===request&&!request.controller.signal.aborted;
  if(manual)show_checking(request);
  try{
   if(process.platform!=="win32"){if(request.manual){close_checking(request);message(workspace_text("update_typora_code_update"),workspace_text("update_automatic_installation_is_not_supported_on_the_current_platf"));}return;}
   load();
   const installed=service.release_info(JSON.parse(fs.readFileSync(path.join(installed_root,"assets/update/release.json"),"utf8")));
   const identity=service.installed_identity(user_data);
   if(installed.releases[0].sequence>current.releases[0].sequence||(identity?.basis==="installed-archive"&&identity.commit!==loaded_identity)){if(request.manual){close_checking(request);message(workspace_text("update_typora_code_update"),workspace_text("update_on_the_disk")+installed.releases[0].version+workspace_text("update_is_installed_please_save_the_document_and_manually_restart_t"));}return;}
   if(manual){try{const active=JSON.parse(fs.readFileSync(path.join(state_root,"active_job.json"),"utf8"));const state=service.status_of(state_root,active.job);if(!['succeeded','failed','cancelled'].includes(state.phase)){close_checking(request);show_progress(active.job);return;}}catch{}}
   else {
    const session=await service.session_identity(process.ppid,process.execPath);if(!is_current())return;
    if(!service.claim_startup(state_root,session)&&!request.manual)return;
   }
   const plan=await service.check_update(installed,{signal:request.controller.signal,user_data,network:read_network_settings()});if(!is_current())return;
   close_checking(request);
   if(!plan){if(request.manual){message(workspace_text("update_typora_code_update"),workspace_text("update_the_current_installation_is_the_latest_released_version")+current.releases[0].version+").");}return;}
   const target=dialog=workspace_dialog(workspace_text("update_typora_code_has_a_new_version"),workspace_text("update_later"),()=>{dialog=undefined;});
   show_version(target);
   target.content.append(el("p","",workspace_text("update_upgradable_version")+plan.release.releases[0].version));
   target.content.append(el("p","",workspace_text("update_target_submission")+plan.commit.slice(0,12)));
   if(plan.commit_message)target.content.append(el("p","",plan.commit_message));
   target.content.append(el("p","",workspace_text("update_the_update_will_be_downloaded_and_installed_immediately_plea")));
   for(const release of plan.release.releases.filter((item:any)=>item.sequence>current.releases[0].sequence)){
    target.content.append(el("h4","",release.version+" · "+release.date));const list=el("ul");const notes=resolve_workspace_locale()==='zh-cn'?release.notes:release.notes_en??[workspace_text('release_notes_unavailable')];for(const note of notes)list.append(el("li","",note));target.content.append(list);
   }
   const update=workspace_button(workspace_text("update_update_immediately"),()=>{
    update.disabled=true;
    try{
     const config=JSON.parse(fs.readFileSync(path.join(installed_root,"assets/update/runtime.json"),"utf8"));
     const node_path=path.join(user_data,"linux_note_enhancements/terminal_runtime/node",config.node_version,"node.exe");
     const job=service.start_update({state_root,installed_root,user_data,host_root:path.dirname(process.execPath),node_path,plan,network:read_network_settings()});show_progress(job);
    }catch(error){update.disabled=false;target.content.append(el("p","",String(error)));write_log(error);}
   });target.footer.append(update);
  }catch(error){if(is_current()){write_log(error);if(request.manual){close_checking(request);message(workspace_text("update_check_update_failed"),String(error)+workspace_text("update_please_check_your_network_connection_and_retry"),true);}}}
  finally{close_checking(request);if(active_check===request)active_check=undefined;}
 }
 const command=app.commands.register({id:"typora_code:check_update",title:workspace_text("update_check_typora_code_update"),scope:"global",callback:()=>{void check(true);}});
 if(typeof command==="function")lifetime.add(command as ()=>void);
 const timer=setTimeout(()=>{void check();},2000);
 lifetime.add(()=>{disposed=true;active_check?.controller.abort();clearTimeout(timer);clearInterval(poll);dialog?.close(false);});
 return lifetime;
}
