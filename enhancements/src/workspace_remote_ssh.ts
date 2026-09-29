import {load_workspace_service} from "./workspace_service_loader";
import {workspace_text} from "./workspace_i18n";
import {create_ssh_authentication} from './remote_ssh_authentication';
import {create_ssh_directory} from './remote_ssh_directory';
import type {ssh_connection_record} from './remote_ssh_auth_context';
import type {graph_core} from './git_graph_host';
import type {workspace_file_host} from './workspace_files';
import {workspace_element as el,workspace_button as button,workspace_dialog} from './workspace_widgets';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import {git_icon} from './git_icons';
import {workspace_file_icon} from './workspace_file_icons';
import node_release from '../node_runtime.json';
import css from './workspace_remote_ssh.css';
import {read_remote_ssh_settings} from './remote_ssh_settings';
import {register_remote_workspace_context} from './remote_workspace_context';
import {active_remote_files,remote_file_provider,register_remote_files,select_remote_files} from './remote_workspace_files';

type remote_entry={name:string;directory:boolean;link:boolean};

/** One connection per window; remote files, Git and native Markdown adaptation share the same resource service. */
export function bind_workspace_remote_ssh(core:graph_core,files:workspace_file_host,set_folder:(path:string,prepared_close?:()=>void)=>Promise<void>,runtime:any=window){
  const path_api=runtime.reqnode('path'),buffer_api=runtime.reqnode('buffer').Buffer;
  const asset_root=path_api.join(runtime._options.userDataPath,'typora_code','assets','remote');
  const api=load_workspace_service(runtime.reqnode, path_api.join(asset_root,'remote_ssh_service.cjs'));
  const node_path=path_api.join(runtime._options.userDataPath,'linux_note_enhancements','terminal_runtime','node',node_release.version,'node.exe');
  const auth=create_ssh_authentication(runtime,asset_root,node_path);
  let auth_attempt:Awaited<ReturnType<typeof auth.attempt>>|undefined;
  let port=0,active_record:ssh_connection_record|undefined,owner_key='',username='';
  const style=acquire_workspace_style('typora-code-style:workspace_remote_ssh',css);
  let connect_epoch=0;
  let disposed=false,target='',folder='',browse_epoch=0,connecting=false,mutating=false,list_signature='';
  let provider:remote_file_provider|undefined;
  const host_providers=new Map<string,remote_file_provider>();
  const provider_releases:Array<()=>void>=[];
  const notice=(error:unknown)=>{if(!disposed)new core.Notice(String(error instanceof Error?error.message:error),7000);};
  const service=api.create_remote_ssh({asset_root,node_path,authenticate:(message:string,stale:()=>boolean)=>auth_attempt?.authenticate(message,stale),connection_options:()=>({...read_remote_ssh_settings(),port}),on_state:(value:{state:string;detail:string})=>{
    if(disposed)return;
    status.textContent=value.detail||workspace_text("remote_ssh_not_connected_ssh");panel.containerEl.dataset.connection=value.state;
    panel.containerEl.setAttribute('aria-busy',String(value.state==='connecting'));
    directory?.set_active(active_record?.id||'',value.state);window.dispatchEvent(new Event('typora-code-remote-state-changed'));
    if(value.state==='disconnected'){++browse_epoch;list_signature='';list.removeAttribute('aria-busy');list.replaceChildren();}
    connect_button.disabled=connecting||value.state==='connecting';disconnect_button.disabled=value.state==='disconnected';
    for(const control of [up_button,refresh_button,new_file,new_folder,terminal_button,git_button])control.disabled=value.state!=='connected';
  }});
  const connected=()=>service.state()==='connected';
  const release_context=register_remote_workspace_context(()=>{
    const owner=active_remote_files();if(!owner)return;
    return {target:owner.connection.target,port:owner.connection.port,name:owner.connection.name,username:owner.connection.username,remote_path:owner.root?owner.remote_path(owner.root):'/',state:owner.connection.connected()?'connected':'disconnected'};
  });
  const local_context_changed=()=>{if(!active_remote_files()){++connect_epoch;auth_attempt?.clear();service.disconnect();}};
  window.addEventListener('linux-note-workspace-context-changed',local_context_changed);
  const require_connection=(owner=owner_key)=>{if(!connected()||owner_key!==owner)throw Error(workspace_text("remote_ssh_the_ssh_host_for_this_document_is_not_connected_draft_is_pre"));};
  const prompt_name=(title:string)=>new Promise<string|undefined>(resolve=>{
    let result:string|undefined;const dialog=workspace_dialog(title,workspace_text("language_service_settings_view_cancel"),()=>resolve(result));const input=el('input');input.setAttribute('aria-label',title);dialog.content.append(input);
    const accept=()=>{if(!input.value||input.value==='.'||input.value==='..'||/[\/\0]/u.test(input.value)){input.setCustomValidity(workspace_text("remote_ssh_please_enter_a_single_valid_name_without_slashes"));input.reportValidity();return;}result=input.value;dialog.close();};
    dialog.footer.prepend(button(workspace_text("remote_ssh_confirm"),accept));input.oninput=()=>input.setCustomValidity('');input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();accept();}};input.focus();
  });
  const browse=async(next:string)=>{
    require_connection();const epoch=++browse_epoch;status.textContent=workspace_text("remote_ssh_reading_remote_directory");list.setAttribute('aria-busy','true');
    try{
      const result=await service.request('list',{path:next}) as {path:string;entries:remote_entry[]};
      if(disposed||epoch!==browse_epoch)return;folder=result.path;location.textContent=folder;location.title=folder;
      const signature=JSON.stringify(result);if(signature===list_signature){status.textContent=workspace_text("remote_ssh_ssh_items", {value_0: String(target), value_1: String(result.entries.length)});return;}list_signature=signature;list.replaceChildren();
      let shown=0;const more=button(workspace_text("remote_ssh_show_more"),()=>append_batch());
      const append_batch=()=>{more.remove();const end=Math.min(shown+200,result.entries.length);for(;shown<end;shown++){
        const entry=result.entries[shown],entry_path=path_api.posix.join(folder,entry.name);
        const row=button('',()=>void (entry.directory?browse(entry_path):open_file(entry_path)).catch(notice),'workspace-ssh-row');row.title=entry_path+(entry.link?workspace_text("remote_ssh_symbol_link"):'');
        row.append(entry.directory?git_icon('chevron-right'):workspace_file_icon(entry.name),el('span','',entry.name));list.append(row);
      }if(shown<result.entries.length)list.append(more);};append_batch();
      if(!result.entries.length)list.append(el('p','',workspace_text("preview_directory_this_directory_is_empty")));
      status.textContent=workspace_text("remote_ssh_ssh_items", {value_0: String(target), value_1: String(result.entries.length)});
    }catch(error){if(epoch===browse_epoch&&!disposed){status.textContent=String((error as Error).message);throw error;}}
    finally{if(epoch===browse_epoch)list.removeAttribute('aria-busy');}
  };
  const create=async(directory:boolean)=>{
    if(mutating)return;require_connection();const owner=owner_key,parent=folder;
    const name=await prompt_name(directory?workspace_text("remote_ssh_new_remote_folder"):workspace_text("remote_ssh_new_remote_file"));if(!name||disposed)return;require_connection(owner);if(folder!==parent)throw Error(workspace_text("remote_ssh_directory_has_been_switched_please_retry"));
    mutating=true;status.textContent=workspace_text("remote_ssh_creating");try{const path=path_api.posix.join(parent,name);await service.request(directory?'mkdir':'create',{path,data:''});await browse(parent);if(!directory)await open_file(path);}finally{mutating=false;}
  };
  const open_file=async(path:string)=>{
    require_connection();if(!provider)throw Error(workspace_text("remote_ssh_remote_file_service_is_not_ready"));await files.open_file(provider.local_path(path));
  };
  const input=el('input'),status=el('p','workspace-ssh-status',workspace_text("remote_ssh_enter_ssh_configuration_alias_or_user_hostname")),location=el('div','workspace-ssh-location'),list=el('div','workspace-ssh-list');
  input.placeholder=workspace_text("remote_ssh_user_hostname_or_ssh_configuration_alias");input.setAttribute('aria-label',workspace_text("remote_ssh_ssh_host"));input.autocomplete='off';status.setAttribute('role','status');
  const restore_provider=(owner:string,display=target)=>{
    const existing=host_providers.get(owner);if(existing)return existing;
    const host_key=runtime.reqnode('crypto').createHash('sha256').update(owner).digest('hex');
    const value=new remote_file_provider({target:display,port,username,name:active_record?active_record.host_name+' / '+active_record.name:display,connected:()=>connected()&&owner_key===owner,poll_interval:()=>read_remote_ssh_settings().refresh_interval*1000,request:(operation,values)=>service.request(operation,values)},runtime.reqnode('fs'),path_api,path_api.join(runtime._options.userDataPath,'typora_code','remote_cache',host_key),buffer_api);
    host_providers.set(owner,value);provider_releases.push(register_remote_files(value));return value;
  };
  const connect=async(record?:ssh_connection_record)=>{
    if(connecting)return;const next=record?.target||input.value.trim(),next_port=record?.port||0;api.validate_target(next);
    connecting=true;const epoch=++connect_epoch;let current=true;status.textContent=workspace_text("remote_ssh_parsing_ssh_account_configuration");connect_button.disabled=true;disconnect_button.disabled=false;directory?.set_active(record?.id||'','connecting');
    try{
      const attempt=await auth.attempt(next,next_port,()=>current&&!disposed&&epoch===connect_epoch);if(disposed||epoch!==connect_epoch)return;
      let prepared_close:(()=>void)|undefined;
      if(owner_key&&owner_key!==attempt.owner.key){prepared_close=await files.prepare_workspace_switch();if(!prepared_close||disposed||epoch!==connect_epoch)return;}
      auth_attempt?.clear();auth_attempt=attempt;target=next;port=next_port;owner_key=attempt.owner.key;username=attempt.owner.user;active_record=record;input.value=next;folder='';
      const hello=await service.connect(target);if(disposed||epoch!==connect_epoch)return;await attempt.complete();if(disposed||epoch!==connect_epoch||!connected())return;
      if(!record){const saved=await auth.directory.list();active_record=saved.find((item:ssh_connection_record)=>item.target===target&&item.port===port)||await auth.directory.save({target,port,host_name:target.split('@').at(-1),name:username,folder:''});await directory?.refresh();directory?.set_active(active_record?.id||'','connected');}
      if(disposed||epoch!==connect_epoch||!connected())return;
      // Directory transaction owns the active file system's submission; early selection will contaminate the old directory's session snapshot.
      provider=restore_provider(owner_key);
      const project=record?.folder||(provider.root?provider.remote_path(provider.root):hello.home);await browse(project);
      const root=await provider.mount(project);if(disposed||epoch!==connect_epoch||!connected())return;await set_folder(root,prepared_close);
      try{localStorage.setItem('typora-code:ssh:last-host',target);localStorage.setItem('typora-code:ssh:last-connection',JSON.stringify({target,port,owner_key,username,record:active_record}));}catch{/* Current connection does not depend on preference write success. */}
    }finally{current=false;connecting=false;connect_button.disabled=false;disconnect_button.disabled=!connected();directory?.set_active(active_record?.id||'',service.state());}
  };
  let directory:ReturnType<typeof create_ssh_directory>|undefined;
  const unregister_connect=core.app.commands.register({id:'typora_code:remote_ssh_connect',title:workspace_text("remote_ssh_connect_to_ssh_workspace"),scope:'global',showInCommandPanel:false,callback:(id:string)=>{void(async()=>{
    const record=(await auth.directory.list()).find((item:ssh_connection_record)=>item.id===id);if(!record||disposed)return;
    await connect(record);if(!disposed&&active_record?.id===id&&active_remote_files()===provider&&connected())core.app.commands.run('linux_note:terminal');
  })().catch(notice);}});
  const connect_button=button(workspace_text("remote_ssh_authentication_connect"),()=>void connect().catch(notice));
  const disconnect_button=button(workspace_text("remote_ssh_disconnect_cancel"),()=>{++connect_epoch;auth_attempt?.clear();service.disconnect();});disconnect_button.disabled=true;
  const up_button=button(workspace_text("remote_workspace_picker_parent_directory"),()=>void browse(path_api.posix.dirname(folder)).catch(notice));
  const refresh_button=button(workspace_text("remote_workspace_picker_refresh"),()=>void browse(folder).catch(notice));
  const new_file=button(workspace_text("file_tree_new_file"),()=>void create(false).catch(notice)),new_folder=button(workspace_text("file_tree_new_folder"),()=>void create(true).catch(notice));
  const terminal_button=button(workspace_text("remote_ssh_project_terminal"),()=>{try{require_connection();window.dispatchEvent(new CustomEvent('linux-note-open-ssh-terminal',{detail:{target,port,name:active_record?active_record.host_name+' / '+active_record.name:target,remote_path:folder}}));}catch(error){notice(error);}});
  const git_button=button('Git',()=>{try{require_connection();if(provider?.root)window.dispatchEvent(new CustomEvent('linux-note-open-git',{detail:{path:provider.root}}));}catch(error){notice(error);}});

  for(const control of [up_button,refresh_button,new_file,new_folder,terminal_button,git_button])control.disabled=true;
  input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();void connect().catch(notice);}};
  const hosts=el('datalist');hosts.id='workspace-ssh-hosts';input.setAttribute('list',hosts.id);
  try{input.value=localStorage.getItem('typora-code:ssh:last-host')||'';}catch{/* Wait for input when there is no local preference. */}
  if(input.value){
    let saved:any;try{saved=JSON.parse(localStorage.getItem('typora-code:ssh:last-connection')||'null');}catch{}
    const mounted=runtime.File?.getMountFolder?.();target=input.value;port=saved?.port||0;owner_key=saved?.owner_key||target;username=saved?.username||target.split('@')[0];active_record=saved?.record;
    const restored=provider=restore_provider(owner_key);
    if(mounted&&restored.owns(mounted)){provider.root=path_api.normalize(mounted);folder=provider.remote_path(provider.root);select_remote_files(provider);status.textContent=workspace_text("remote_ssh_ssh_workspace_has_been_preserved_please_reconnect_and_contin");}
  }
  try{const config=files.fs.readFileSync(path_api.join(runtime.reqnode('os').homedir(),'.ssh','config'),'utf8');const names=new Set<string>();for(const match of config.matchAll(/^\s*Host\s+(.+)$/gimu))for(const name of match[1].split(/\s+/u)){if(/[!*?#]/u.test(name))continue;try{api.validate_target(name);names.add(name);}catch{/* Patterns that cannot be enumerated are handled by OpenSSH. */}}for(const name of names){const option=el('option');option.value=name;hosts.append(option);}}catch{/* .SSH is optional; it does not create or overwrite user configuration. */}
  class remote_sidebar extends core.SidebarPanel {
    containerEl=el('div','workspace-ssh-sidebar');
    constructor(){super();this.addRibbonButton({id:'typora_code:remote_ssh',title:workspace_text("remote_ssh_remote_resource_explorer_ssh"),icon:git_icon('remote-explorer') as unknown as HTMLElement,group:'top'});
      const toolbar=el('div','workspace-ssh-toolbar');toolbar.append(disconnect_button,up_button,refresh_button,new_file,new_folder,terminal_button,git_button);
      toolbar.append(button(workspace_text("file_commands_open_folder"),()=>core.app.commands.run('linux_note:open_folder')),button(workspace_text("community_plugins_settings"),()=>core.app.commands.run('typora_code:settings')));
      const icons=['debug-disconnect','arrow-up','refresh','new-file','new-folder','terminal','git-branch','folder-opened','settings-gear'] as const;
      [...toolbar.querySelectorAll('button')].forEach((control,index)=>{const label=control.textContent||'';control.title=label;control.setAttribute('aria-label',label);const text=el('span','',label);text.hidden=true;control.replaceChildren(git_icon(icons[index]),text);});
      directory=create_ssh_directory(auth,connect,notice);
      const quick=el('details','workspace-ssh-quick'),summary=el('summary','',workspace_text("remote_ssh_quick_connect_openssh_alias_configuration"));quick.append(summary,input,hosts,connect_button);
      this.containerEl.append(directory.root,quick,toolbar,status,location,list);
    }
    onshow(){void directory?.refresh().catch(notice);document.querySelector('#typora-sidebar')?.classList.remove('active-tab-files','active-tab-outline','ty-show-search');}
  }
  const panel=new remote_sidebar(),interaction=acquire_workspace_interaction(panel.containerEl),sidebar=core.app.workspace.sidebar;
  const remove_panel=sidebar.addPanel(panel);
  const show=()=>{if(sidebar.activePanel===panel)sidebar.show();else sidebar.switch(remote_sidebar);panel.containerEl.querySelector<HTMLInputElement>('.workspace-ssh-search')?.focus();};
  const unregister=core.app.commands.register({id:'typora_code:remote_ssh',title:workspace_text("remote_ssh_remote_connect_to_ssh_host"),scope:'global',callback:show});
  let refresh_timer:ReturnType<typeof setTimeout>;
  const schedule_refresh=()=>{clearTimeout(refresh_timer);const seconds=read_remote_ssh_settings().refresh_interval;if(!seconds)return;refresh_timer=setTimeout(async()=>{try{if(connected()&&folder&&sidebar.isShown&&sidebar.activePanel===panel&&!list.hasAttribute('aria-busy')&&!mutating)await browse(folder);}catch{/* Error remains on the remote panel, do not repeat notification. */}finally{if(!disposed)schedule_refresh();}},seconds*1000);};schedule_refresh();
  window.addEventListener('typora-code-ssh-settings-changed',schedule_refresh);
  return {show,service,panel,connect,browse,open_file,dispose(){if(disposed)return;files.assert_can_dispose();disposed=true;for(const release of provider_releases)release();unregister_connect();release_context();window.removeEventListener('linux-note-workspace-context-changed',local_context_changed);clearTimeout(refresh_timer);window.removeEventListener('typora-code-ssh-settings-changed',schedule_refresh);directory?.dispose();auth.dispose();service.dispose();++browse_epoch;unregister();remove_panel();interaction.remove();style.remove();}};
}
