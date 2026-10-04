import {workspace_text} from './workspace_i18n';
import {load_workspace_service} from './workspace_service_loader';
import {read_network_settings} from './workspace_network_settings';
import {register_language_service_provider,notify_language_services} from './language_service_settings';
import {read_source_outline_settings} from './source_outline_settings';

/** First-party registrations, tasks and settings are independent of the community plugin ABI. */
export function bind_language_support(core:any){
 const runtime=window as any,path=runtime.reqnode('path'),fs=runtime.reqnode('fs'),asset_root=path.join(runtime._options.userDataPath,'typora_code'),root=path.join(asset_root,'language_environments');
 const api=load_workspace_service(runtime.reqnode,path.join(asset_root,'assets/plugins/language_environment_service.cjs'));
 const network=load_workspace_service(runtime.reqnode,path.join(asset_root,'assets/update/workspace_update_service.cjs'));
 const registry_api=load_workspace_service(runtime.reqnode,path.join(asset_root,'assets/plugins/language_support_registry.cjs'));
 const manager=api.create_language_environment_service({root,acquire_lock:()=>network.acquire_update_lock(root),package_environment:()=>api.package_environment(read_network_settings()),request:(url:string,options:any)=>network.download(url,{...options,network:read_network_settings()}),extract_zip:(archive:string,destination:string,signal:AbortSignal)=>api.execute(network.powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(asset_root,'assets/update/workspace_update_archive.ps1'),'-archive',archive,'-destination',destination,'-package_kind','tools'],{signal})});
 const registry=registry_api.create_language_support_registry({root,community_root:path.join(asset_root,'community'),settings_root:path.join(asset_root,'settings'),catalog:manager.catalog(),acquire_lock:(value:string)=>network.acquire_update_lock(value)});
 const releases=new Map<string,()=>void>(),jobs=new Map<string,{abort:AbortController;promise:Promise<unknown>}>(),removals=new Map<string,Promise<void>>(),failures=new Map<string,Error>(),messages=new Map<string,string>(),listeners=new Set<()=>void>();
 let disposed=false,frame=0,watcher:any,analysis_stamp='';
 const analysis_changed=()=>{const stamp=JSON.stringify([registry.list(),manager.catalog().map((entry:any)=>manager.current(entry.id))]);if(stamp!==analysis_stamp){analysis_stamp=stamp;notify_language_services();}};
 const notify=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(()=>{frame=0;if(!disposed)for(const listener of listeners)listener();});};
 const options=(id:string)=>registry.list()[id];
 const profile=(id:string,project:string,language:string,force=false)=>{
  const setting=options(id);if(!setting?.installed||(!force&&(!setting.enabled||!setting.use_environment)))return;
  const record=manager.current(id);if(!record)return;const args=[...record.args];let initialization_options:Record<string,unknown>=language==='cmake'?{semantic_token:true,use_snippets:false}:{};
  if(language==='c'||language==='cpp'){const outline=read_source_outline_settings(project);if(outline.clangd_path&&!force)return;args[0]='--background-index='+String(outline.background_index!==false);if(outline.compile_commands_dir)args.push('--compile-commands-dir='+path.resolve(project,outline.compile_commands_dir));initialization_options={fallbackFlags:outline.fallback_flags};}
  return {provider:'lsp' as const,command:record.command,args,environment:{...record.environment},initialization_options};
 };
 const prepare=(id:string):Promise<unknown>=>{
  if(disposed)return Promise.resolve();const setting=options(id);if(!setting?.enabled||!setting.use_environment)return Promise.resolve();
  const job=jobs.get(id);if(job)return job.promise;if(manager.current(id))return Promise.resolve();if(failures.has(id))return Promise.reject(failures.get(id));
  const abort=new AbortController(),name=api.entry_for(id).name;
  messages.set(id,workspace_text('language_plugin_preparing',{name}));notify();
  const promise=Promise.resolve().then(()=>manager.install(id,{directory:setting.installation_directory||'',signal:abort.signal,reuse:true,on_progress:(message:string)=>{if(messages.get(id)!==message){messages.set(id,message);notify();}}})).then(value=>{messages.set(id,workspace_text('language_plugin_completed'));return value;},error=>{const failure=Object.assign(Error(workspace_text('language_plugin_failed',{name,error:String(error.message||error)})),{name:error.name});failures.set(id,failure);messages.set(id,failure.message);throw failure;}).finally(()=>{jobs.delete(id);analysis_changed();notify();});
  jobs.set(id,{abort,promise});return promise;
 };
 const cancel_task=async(id:string)=>{const job=jobs.get(id);job?.abort.abort();await job?.promise.catch(()=>{});};
 const automatic=(id:string)=>{void prepare(id).catch(error=>{if(!disposed&&error.name!=='AbortError')new core.Notice(error.message);});};
 const reconcile=()=>{
  if(disposed)return;const rows=registry.list();
  for(const [id,release]of releases)if(!rows[id]?.installed||!rows[id]?.enabled){release();releases.delete(id);void cancel_task(id);}
  for(const entry of manager.catalog()){const setting=rows[entry.id];if(setting?.installed&&setting.enabled){if(!releases.has(entry.id))releases.set(entry.id,register_language_service_provider(entry.id,entry.languages,(project,language)=>profile(entry.id,project,language),()=>prepare(entry.id)));if(!setting.use_environment)void cancel_task(entry.id);else if(!jobs.has(entry.id)&&!failures.has(entry.id))automatic(entry.id);}}
  analysis_changed();notify();
 };
 const ready=registry.migrate().then(()=>{if(!disposed){reconcile();watcher=fs.watch(root,{persistent:false},(_event:string,name:string)=>{if(String(name)==='supports.json')reconcile();if(String(name)==='installed.json'){analysis_changed();notify();}});watcher.on('error',()=>{watcher?.close();watcher=undefined;});}});
 const change=async(id:string,value:any,removing=false)=>{await ready;if(!removing&&removals.has(id))throw Error(workspace_text('language_support_removing'));await registry.update(id,value);failures.delete(id);reconcile();};
 const remove=(id:string,uninstall:boolean)=>{const existing=removals.get(id);if(existing)return Promise.reject(Error(workspace_text('language_support_removing')));const promise=Promise.resolve().then(async()=>{await change(id,uninstall?{enabled:false,use_environment:false}:{use_environment:false},true);await cancel_task(id);await new Promise(resolve=>setTimeout(resolve,750));await manager.uninstall(id);if(uninstall)await change(id,null,true);messages.delete(id);}).finally(()=>{removals.delete(id);notify();});removals.set(id,promise);notify();return promise;};
 const service={ready,catalog:()=>manager.catalog(),list:()=>manager.catalog().map((entry:any)=>({...entry,...options(entry.id),record:manager.current(entry.id),busy:jobs.has(entry.id)||removals.has(entry.id),removing:removals.has(entry.id),error:failures.get(entry.id)?.message||'',message:removals.has(entry.id)?workspace_text('language_support_removing'):messages.get(entry.id)||''})),profile,
  subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);},
  install:(id:string)=>change(id,{installed:true,enabled:true,use_environment:true}),
  set_enabled:(id:string,enabled:boolean)=>change(id,{enabled}),
  configure:async(id:string,value:{installation_directory?:string;use_environment?:boolean})=>{const directory=value.installation_directory;if(directory&&!path.isAbsolute(directory))throw Error(workspace_text('language_plugin_absolute_directory'));if(directory!==undefined&&manager.current(id)&&directory!==options(id)?.installation_directory)throw Error(workspace_text('language_support_clear_before_move'));await change(id,value);},
  retry:async(id:string)=>{await change(id,{enabled:true,use_environment:true});return prepare(id);},
  cancel:async(id:string)=>{await change(id,{use_environment:false});await cancel_task(id);},
  clear:(id:string)=>remove(id,false),
  uninstall:(id:string)=>remove(id,true),
  async dispose(){if(disposed)return;disposed=true;watcher?.close();cancelAnimationFrame(frame);for(const release of releases.values())release();releases.clear();for(const id of jobs.keys())await cancel_task(id);await Promise.allSettled(removals.values());listeners.clear();if(core.app.language_support===service)delete core.app.language_support;}
 };
 core.app.language_support=service;void ready.catch(error=>new core.Notice(String(error.message||error)));return service;
}
