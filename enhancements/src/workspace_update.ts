import {workspace_dialog,workspace_button,workspace_element as el} from "./workspace_widgets";
import {get_workspace_app} from "./workspace_bootstrap";
import {create_workspace_lifetime} from "./workspace_lifetime";
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
 let current:any,busy=false,disposed=false,dialog:ReturnType<typeof workspace_dialog>|undefined,poll:ReturnType<typeof setInterval>|undefined;
 const controller=new AbortController();
 const write_log=(error:unknown)=>{try{fs.mkdirSync(state_root,{recursive:true});fs.appendFileSync(path.join(state_root,"checks.log"),new Date().toISOString()+" "+String(error)+"\n","utf8");}catch{};};
 const message=(title:string,text:string)=>{dialog?.close();dialog=workspace_dialog(title,"关闭",()=>{dialog=undefined;});dialog.content.append(el("p","",text));};
 function load(){
  // 每个窗口保留启动时的内存版本；安装成功不能冒充本窗口已经加载新版。
  current ||= service.release_info(bundled_release);
 }
 function show_progress(job:string){
  dialog?.close();dialog=workspace_dialog("Typora Code 更新进度","关闭",()=>{clearInterval(poll);poll=undefined;dialog=undefined;});
  const target=dialog,status=el("p","","正在启动更新…"),log=el("p","","日志："+path.join(state_root,job)),cancel=workspace_button("取消下载",()=>service.cancel_update(state_root,job));
  status.setAttribute("role","status");target.content.append(status,log);target.footer.append(cancel);
  const refresh=()=>{try{const value=service.status_of(state_root,job);status.textContent=value.message;cancel.disabled=!['starting','downloading','verifying'].includes(value.phase);if(['succeeded','failed','cancelled'].includes(value.phase)){clearInterval(poll);poll=undefined;cancel.remove();}}catch(error){status.textContent=String(error);}};
  poll=setInterval(refresh,350);refresh();
 }
 async function check(manual=false){
  if(busy||disposed||dialog)return;busy=true;
  try{
   if(process.platform!=="win32"){if(manual)message("Typora Code 更新","当前平台暂未支持自动安装，请从项目仓库下载完整ZIP后按安装指南更新。");return;}
   load();
   const installed=service.release_info(JSON.parse(fs.readFileSync(path.join(installed_root,"assets/update/release.json"),"utf8")));
   const identity=service.installed_identity(user_data);
   if(installed.releases[0].sequence>current.releases[0].sequence||(identity?.basis==="installed-archive"&&identity.commit!==loaded_identity)){if(manual)message("Typora Code 更新","磁盘上的 "+installed.releases[0].version+" 已安装；请保存文档后手动重启以加载新提交。");return;}
   if(manual){try{const active=JSON.parse(fs.readFileSync(path.join(state_root,"active_job.json"),"utf8"));const state=service.status_of(state_root,active.job);if(!['succeeded','failed','cancelled'].includes(state.phase)){show_progress(active.job);return;}}catch{}}
   else if(!service.claim_startup(state_root,await service.session_identity(process.ppid,process.execPath)))return;
   const plan=await service.check_update(installed,{signal:controller.signal,user_data});if(disposed)return;
   if(!plan){if(manual)message("Typora Code 更新","当前安装已是最新发布版本（"+current.releases[0].version+"）。");return;}
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
  }catch(error){if(!disposed){write_log(error);if(manual)message("检查更新失败",String(error));}}
  finally{busy=false;}
 }
 const command=app.commands.register({id:"typora_code:check_update",title:"检查 Typora Code 更新",scope:"global",callback:()=>{void check(true);}});
 if(typeof command==="function")lifetime.add(command as ()=>void);
 const timer=setTimeout(()=>{void check();},2000);
 lifetime.add(()=>{disposed=true;controller.abort();clearTimeout(timer);clearInterval(poll);dialog?.close(false);});
 return lifetime;
}
