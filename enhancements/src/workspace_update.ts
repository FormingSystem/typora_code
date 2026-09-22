import {workspace_dialog,workspace_button,workspace_element as el} from "./workspace_widgets";
import {get_workspace_app} from "./workspace_bootstrap";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {create_workspace_progress_view} from "./workspace_progress_view";
import bundled_release from "../release.json";

/** UI只负责公告和进度；磁盘与多窗口状态属于Node更新服务。 */
export function bind_workspace_update(){
 const lifetime=create_workspace_lifetime(),app=get_workspace_app();
 const runtime=window as any;
 if(!app||!runtime.reqnode||!runtime._options?.userDataPath)return lifetime;
 const fs=runtime.reqnode("fs"),path=runtime.reqnode("path"),process=runtime.reqnode("process");
 const user_data=runtime._options.userDataPath,installed_root=path.join(user_data,"typora_code");
 let service:any,loaded_identity:string|undefined;
 try{service=runtime.reqnode(path.join(installed_root,"assets/update/workspace_update_service.cjs"));loaded_identity=service.installed_identity(user_data)?.commit;}
 catch(error){console.error("Typora Code更新模块加载失败",error);return lifetime;}
 const state_root=service.update_paths(user_data).state_root;
 let current:any,disposed=false,dialog:ReturnType<typeof workspace_dialog>|undefined,poll:ReturnType<typeof setInterval>|undefined;
 type check_request={controller:AbortController;manual:boolean;dialog?:ReturnType<typeof workspace_dialog>};
 let active_check:check_request|undefined;
 const write_log=(error:unknown)=>{try{fs.mkdirSync(state_root,{recursive:true});fs.appendFileSync(path.join(state_root,"checks.log"),new Date().toISOString()+" "+String(error)+"\n","utf8");}catch{};};
 const message=(title:string,text:string,can_retry=false)=>{
  dialog?.close();const target=dialog=workspace_dialog(title,"关闭",()=>{if(dialog===target)dialog=undefined;});target.content.append(el("p","",text));
  if(can_retry){const retry=workspace_button("重试",()=>{
   if(disposed||dialog!==target||retry.disabled)return;
   retry.disabled=true;target.close();void check(true);
  });target.footer.append(retry);}
 };
 function load(){
  // 每个窗口保留启动时的内存版本；安装成功不能冒充本窗口已经加载新版。
  current ||= service.release_info(bundled_release);
 }
 function show_progress(job:string){
  dialog?.close();
  const progress=create_workspace_progress_view();
  dialog=workspace_dialog("Typora Code 更新进度","关闭",()=>{clearInterval(poll);poll=undefined;progress.dispose();dialog=undefined;});
  let cancelling=false;const started=Date.now();
  const target=dialog,status=el("p","","正在启动更新…"),detail=el("p"),log=el("p","","日志："+path.join(state_root,job));
  log.style.overflowWrap="anywhere";
  const cancel=workspace_button("取消下载",()=>{
   try{service.cancel_update(state_root,job);cancelling=true;cancel.disabled=true;status.textContent="正在取消更新，请稍候…";}
   catch(error){status.textContent="取消请求失败："+String(error);write_log(error);}
  });
  status.setAttribute("role","status");target.content.append(progress.root,status,detail,log,el("p","","关闭此窗口不会中断更新；可从“检查 Typora Code 更新”再次查看进度。"));target.footer.append(cancel);
  const bytes_text=(bytes:number)=>(bytes/1048576).toFixed(1)+" MB";
  const refresh=()=>{try{
   const value=service.status_of(state_root,job),finished=['succeeded','failed','cancelled'].includes(value.phase);
   const can_cancel=['starting','downloading','verifying'].includes(value.phase);
   status.textContent=cancelling&&can_cancel?"正在取消更新，请稍候…":value.message;
   cancel.disabled=cancelling||!can_cancel;
   const bytes=Number.isSafeInteger(value.bytes)&&value.bytes>=0?value.bytes:undefined;
   const total=Number.isSafeInteger(value.total_bytes)&&value.total_bytes>0&&bytes!==undefined&&bytes<=value.total_bytes?value.total_bytes:undefined;
   const percentage=value.phase==='downloading'&&total!==undefined?Math.floor(bytes!/total*100):undefined;
   detail.textContent=finished?"":value.phase==='downloading'&&bytes!==undefined
    ?"已下载 "+bytes_text(bytes)+(total!==undefined?" / "+bytes_text(total)+"（"+percentage+"%）":"；服务器未提供总大小")
    :"已等待 "+Math.floor((Date.now()-started)/1000)+" 秒";
   target.content.setAttribute("aria-busy",String(!finished));
   if(finished){clearInterval(poll);poll=undefined;cancel.remove();if(value.phase==='succeeded')progress.update("更新安装完成",100);else progress.hide();}
   else progress.update(status.textContent||"正在更新",percentage);
  }catch(error){status.textContent="暂时无法读取更新状态："+String(error);progress.hide();target.content.setAttribute("aria-busy","false");cancel.disabled=true;}};
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
  const target=dialog=workspace_dialog("检查 Typora Code 更新","取消检查",()=>{
   progress.dispose();
   if(request.dialog!==target)return;
   request.dialog=undefined;if(dialog===target)dialog=undefined;
   if(active_check===request)active_check=undefined;
   request.controller.abort();
  });
  request.dialog=target;
  const status=el("p","","正在检查更新…");status.setAttribute("role","status");
  progress.update("正在检查 Typora Code 更新");
  target.content.setAttribute("aria-busy","true");
  target.content.append(progress.root,status,el("p","","正在连接更新服务并核对版本，请稍候。此时不会下载或安装更新，可取消后重试。"));
 }
 async function check(manual=false){
  if(disposed)return;
  if(active_check){if(manual)show_checking(active_check);return;}
  if(dialog){if(manual)dialog.footer.querySelector<HTMLButtonElement>("button")?.focus();return;}
  const request:check_request={controller:new AbortController(),manual};active_check=request;
  const is_current=()=>!disposed&&active_check===request&&!request.controller.signal.aborted;
  if(manual)show_checking(request);
  try{
   if(process.platform!=="win32"){if(request.manual){close_checking(request);message("Typora Code 更新","当前平台暂未支持自动安装，请从项目仓库下载完整ZIP后按安装指南更新。");}return;}
   load();
   const installed=service.release_info(JSON.parse(fs.readFileSync(path.join(installed_root,"assets/update/release.json"),"utf8")));
   const identity=service.installed_identity(user_data);
   if(installed.releases[0].sequence>current.releases[0].sequence||(identity?.basis==="installed-archive"&&identity.commit!==loaded_identity)){if(request.manual){close_checking(request);message("Typora Code 更新","磁盘上的 "+installed.releases[0].version+" 已安装；请保存文档后手动重启以加载新提交。");}return;}
   if(manual){try{const active=JSON.parse(fs.readFileSync(path.join(state_root,"active_job.json"),"utf8"));const state=service.status_of(state_root,active.job);if(!['succeeded','failed','cancelled'].includes(state.phase)){close_checking(request);show_progress(active.job);return;}}catch{}}
   else {
    const session=await service.session_identity(process.ppid,process.execPath);if(!is_current())return;
    if(!service.claim_startup(state_root,session)&&!request.manual)return;
   }
   const plan=await service.check_update(installed,{signal:request.controller.signal,user_data});if(!is_current())return;
   close_checking(request);
   if(!plan){if(request.manual){message("Typora Code 更新","当前安装已是最新发布版本（"+current.releases[0].version+"）。");}return;}
   const target=dialog=workspace_dialog("Typora Code 有新版本","稍后",()=>{dialog=undefined;});
   target.content.append(el("p","","当前版本 "+current.releases[0].version+" → "+plan.release.releases[0].version));
   target.content.append(el("p","","目标提交 "+plan.commit.slice(0,12)));
   if(plan.commit_message)target.content.append(el("p","",plan.commit_message));
   target.content.append(el("p","","更新将立即下载并安装。请保存文档后手动重启 Typora；不会自动关闭窗口。"));
   for(const release of plan.release.releases.filter((item:any)=>item.sequence>current.releases[0].sequence)){
    target.content.append(el("h4","",release.version+" · "+release.date));const list=el("ul");for(const note of release.notes)list.append(el("li","",note));target.content.append(list);
   }
   const update=workspace_button("立即更新",()=>{
    update.disabled=true;
    try{
     const config=JSON.parse(fs.readFileSync(path.join(installed_root,"assets/update/runtime.json"),"utf8"));
     const node_path=path.join(user_data,"linux_note_enhancements/terminal_runtime/node",config.node_version,"node.exe");
     const job=service.start_update({state_root,installed_root,user_data,host_root:path.dirname(process.execPath),node_path,plan});show_progress(job);
    }catch(error){update.disabled=false;target.content.append(el("p","",String(error)));write_log(error);}
   });target.footer.append(update);
  }catch(error){if(is_current()){write_log(error);if(request.manual){close_checking(request);message("检查更新失败",String(error)+"\n请检查网络连接后重试。",true);}}}
  finally{close_checking(request);if(active_check===request)active_check=undefined;}
 }
 const command=app.commands.register({id:"typora_code:check_update",title:"检查 Typora Code 更新",scope:"global",callback:()=>{void check(true);}});
 if(typeof command==="function")lifetime.add(command as ()=>void);
 const timer=setTimeout(()=>{void check();},2000);
 lifetime.add(()=>{disposed=true;active_check?.controller.abort();clearTimeout(timer);clearInterval(poll);dialog?.close(false);});
 return lifetime;
}
