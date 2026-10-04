import {workspace_text} from './workspace_i18n';
import {load_workspace_service} from './workspace_service_loader';
import {read_network_settings} from './workspace_network_settings';
import {register_language_service_provider,notify_language_services} from './language_service_settings';
import {open_language_service_settings} from './language_service_settings_view';
import {get_workspace_files} from './workspace_files';
import {read_source_outline_settings,open_source_outline_settings} from './source_outline_settings';
import {choose_local_directory} from './workspace_native_picker';

/** First-party language plugins use the community lifecycle and the existing analysis owner. */
export function create_language_environment_plugins(core:any,asset_root:string){
 const runtime=window as any,path=runtime.reqnode('path'),jobs=new Map<string,{abort:AbortController;promise:Promise<unknown>;cancellable:boolean}>();
 let backend:any,api:any,watcher:any;
 const service=()=>{
  if(backend)return backend;
  api=load_workspace_service(runtime.reqnode,path.join(asset_root,'assets/plugins/language_environment_service.cjs'));
  const network=load_workspace_service(runtime.reqnode,path.join(asset_root,'assets/update/workspace_update_service.cjs'));
  const root=path.join(asset_root,'language_environments');
  backend=api.create_language_environment_service({root,acquire_lock:()=>network.acquire_update_lock(root),package_environment:()=>api.package_environment(read_network_settings()),request:(address:string,options:any)=>network.download(address,{...options,network:read_network_settings()}),extract_zip:(archive:string,destination:string,signal:AbortSignal)=>api.execute(network.powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(asset_root,'assets/update/workspace_update_archive.ps1'),'-archive',archive,'-destination',destination,'-package_kind','tools'],{signal})});
  watcher=runtime.reqnode('fs').watch(root,{persistent:false},(_event:string,name:string)=>{if(String(name)==='installed.json')notify_language_services();});
  watcher.on('error',()=>{watcher?.close();watcher=undefined;});
  return backend;
 };
 const cancel=async(id:string)=>{const job=jobs.get(id);job?.abort.abort();await job?.promise.catch(()=>{});};
 const register=(plugin:any)=>{
  const manager=service(),info=api.entry_for(plugin.manifest.id),id=info.id;
  let alive=true,status='',render_status=()=>{},progress_frame=0;
  const progress=(value:string)=>{status=value;if(alive&&!progress_frame)progress_frame=requestAnimationFrame(()=>{progress_frame=0;if(alive)render_status();});};
  plugin.registerSettings(new core.PluginSettings(core.app,plugin.manifest,{version:1}));
  plugin.settings.setDefault({installation_directory:'',use_environment:true});
  const profile=(root:string,language:string,force=false)=>{
   if(!alive||(!force&&plugin.settings.get('use_environment')===false))return;
   const record=manager.current(id);if(!record)return;
   const args=[...record.args],environment={...record.environment};let initialization_options={};
   if(language==='c'||language==='cpp'){
    const settings=read_source_outline_settings(root);if(settings.clangd_path&&!force)return;args[0]='--background-index='+String(settings.background_index!==false);
    if(settings.compile_commands_dir)args.push('--compile-commands-dir='+path.resolve(root,settings.compile_commands_dir));
    initialization_options={fallbackFlags:settings.fallback_flags};
   }
   return {provider:'lsp' as const,command:record.command,args,environment,initialization_options};
  };
  const release=register_language_service_provider(id,info.languages,profile);
  const run=(action:(signal:AbortSignal)=>Promise<unknown>,cancellable=true)=>{
   if(jobs.has(id)||!alive)return;const abort=new AbortController();
   const promise=Promise.resolve().then(()=>action(abort.signal)).then(()=>{status=workspace_text('language_plugin_completed');},error=>{status=String(error.message||error);}).finally(()=>{jobs.delete(id);notify_language_services();if(alive)render_status();});
   jobs.set(id,{abort,promise,cancellable});status=workspace_text('language_plugin_working');render_status();
  };
  class language_setting_tab extends core.SettingTab {
   get name(){return info.name;}
   onshow(){
    this.containerEl.replaceChildren();
    this.addSetting((item:any)=>{item.addName(info.name);item.addDescription(workspace_text('language_plugin_description'));});
    let location:HTMLInputElement,browse:HTMLButtonElement;
    this.addSetting((item:any)=>{
     item.addName(workspace_text('language_plugin_directory'));item.addDescription(workspace_text('language_plugin_directory_help'));
     item.addText((input:HTMLInputElement)=>{location=input;input.value=plugin.settings.get('installation_directory')||'';input.placeholder=path.join(asset_root,'language_environments/tools');input.setAttribute('aria-label',workspace_text('language_plugin_directory'));});
     item.addButton((button:HTMLButtonElement)=>{browse=button;button.textContent=workspace_text('language_plugin_browse');button.onclick=()=>{void choose_local_directory(location.value).then((value:string|undefined)=>{if(alive&&location.isConnected&&value)location.value=value;}).catch((error:Error)=>{status=error.message;render_status();});};});
    });
    const controls:HTMLButtonElement[]=[];
    const action=(label:any,callback:()=>void)=>this.addSetting((item:any)=>item.addButton((button:HTMLButtonElement)=>{button.textContent=workspace_text(label);button.onclick=callback;controls.push(button);}));
    action('language_plugin_install',()=>run(async signal=>{
     const directory=location.value.trim();if(directory&&!path.isAbsolute(directory))throw Error(workspace_text('language_plugin_absolute_directory'));
     plugin.settings.set_and_save('installation_directory',directory);
     await manager.install(id,{directory,signal,on_progress:progress});
    }));
    action('language_plugin_clear',()=>run(async()=>{plugin.settings.set_and_save('use_environment',false);notify_language_services();await new Promise(resolve=>setTimeout(resolve,750));await manager.uninstall(id);},false));
    let use:HTMLInputElement;
    this.addSetting((item:any)=>{item.addName(workspace_text('language_plugin_use'));item.addCheckbox((input:HTMLInputElement)=>{use=input;input.checked=plugin.settings.get('use_environment')!==false;input.onchange=()=>{try{plugin.settings.set_and_save('use_environment',input.checked);notify_language_services();}catch(error){status=String(error);input.checked=!input.checked;render_status();}};});});
    action('language_plugin_configure',()=>{const current_root=()=>get_workspace_files()?.context_root()||'';open_language_service_settings(current_root(),current_root,info.languages[0],(language:string)=>info.languages.includes(language)?profile(current_root(),language,true):undefined);});
    if(info.languages.includes('cpp'))action('language_plugin_compiler',()=>{const root=get_workspace_files()?.context_root()||'';open_source_outline_settings(root);});
    let message:HTMLElement,cancel_button:HTMLButtonElement;
    this.addSetting((item:any)=>{item.addDescription((element:HTMLElement)=>{message=element;element.setAttribute('role','status');});item.addButton((button:HTMLButtonElement)=>{cancel_button=button;button.textContent=workspace_text('language_plugin_cancel');button.onclick=()=>{void cancel(id);};});});
    render_status=()=>{
     if(!alive||!message.isConnected)return;const busy=jobs.has(id),record=manager.current(id);
     location.disabled=busy||!!record;browse.disabled=location.disabled;use.checked=plugin.settings.get('use_environment')!==false;for(const button of controls)button.disabled=busy;use.disabled=busy;
     controls[0].disabled=busy||!!record;controls[1].disabled=busy||!record;cancel_button.disabled=!busy||!jobs.get(id)?.cancellable;
     message.textContent=(record?workspace_text('language_plugin_installed',{directory:record.directory}):workspace_text('language_plugin_not_installed'))+(status?'\n'+status:'');
    };render_status();
   }
   onhide(){render_status=()=>{};}
  }
  plugin.registerSettingTab(new language_setting_tab());
  plugin.register(()=>{alive=false;cancelAnimationFrame(progress_frame);render_status=()=>{};release();void cancel(id);});
 };
 return {register,async uninstall(id:string){if(!id.startsWith('typora_code.language_')||!service().catalog().some((entry:any)=>entry.id===id))return;await cancel(id);await service().uninstall(id);notify_language_services();},async dispose(){watcher?.close();watcher=undefined;for(const id of jobs.keys())await cancel(id);}};
}
