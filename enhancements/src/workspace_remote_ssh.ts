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

/** 每窗口一个连接；远程文件、Git与原生Markdown适配共用同一资源服务。 */
export function bind_workspace_remote_ssh(core:graph_core,files:workspace_file_host,runtime:any=window){
  const path_api=runtime.reqnode('path'),buffer_api=runtime.reqnode('buffer').Buffer;
  const asset_root=path_api.join(runtime._options.userDataPath,'typora_code','assets','remote');
  const api=runtime.reqnode(path_api.join(asset_root,'remote_ssh_service.cjs'));
  const credentials=runtime.reqnode(path_api.join(asset_root,'remote_ssh_credentials.cjs')).create_credential_store(path_api.join(runtime._options.userDataPath,'typora_code','ssh_credentials'));
  let credential_used=false,pending_credential:string|undefined;
  const node_path=path_api.join(runtime._options.userDataPath,'linux_note_enhancements','terminal_runtime','node',node_release.version,'node.exe');
  const style=acquire_workspace_style('typora-code-style:workspace_remote_ssh',css);
  let disposed=false,target='',folder='',browse_epoch=0,connecting=false,mutating=false,list_signature='';
  let remote_selected=false;
  let provider:remote_file_provider|undefined;
  const host_providers=new Map<string,remote_file_provider>();
  const provider_releases:Array<()=>void>=[];
  let auth_dialog:ReturnType<typeof workspace_dialog>|undefined;
  const notice=(error:unknown)=>{if(!disposed)new core.Notice(String(error instanceof Error?error.message:error),7000);};
  const authenticate=async(prompt:string,stale:()=>boolean)=>{
    const password_prompt=/password/iu.test(prompt)&&!/passphrase|verification|one.time/iu.test(prompt);
    if(password_prompt&&!credential_used){credential_used=true;try{const stored=await credentials.read(target);if(stored&&!disposed&&!stale())return stored;}catch{/* 系统密文不可用时回到用户认证。 */}}
    return new Promise<string|undefined>(resolve=>{
    if(disposed||stale()){resolve(undefined);return;}
    let answer:string|undefined;
    const confirm=/yes\/no|fingerprint|authenticity/iu.test(prompt);
    const dialog=workspace_dialog(confirm?'确认SSH主机身份':'SSH身份验证','取消',()=>{input.value='';if(auth_dialog===dialog)auth_dialog=undefined;resolve(answer);});auth_dialog=dialog;
    const input=el('input');input.type='password';input.autocomplete='off';input.setAttribute('aria-label','SSH认证信息');
    const remember=el('input');remember.type='checkbox';const remember_label=el('label');remember_label.append(remember,document.createTextNode('使用系统加密记住此主机密码'));
    dialog.content.append(el('p','workspace-ssh-auth-prompt',prompt));
    if(confirm)dialog.content.append(el('p','','请核对远程电脑提供的主机指纹，确认后由OpenSSH记录信任。'));else dialog.content.append(input);
    if(password_prompt&&credentials.supported)dialog.content.append(remember_label);
    const accept=()=>{if(stale()||disposed){dialog.close();return;}answer=confirm?'yes':input.value;if(password_prompt&&remember.checked)pending_credential=answer;dialog.close();};
    dialog.footer.prepend(button(confirm?'信任并连接':'连接',accept));input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();accept();}};
    if(!confirm)input.focus();
  });};
  const service=api.create_remote_ssh({asset_root,node_path,authenticate,connection_options:read_remote_ssh_settings,on_state:(value:{state:string;detail:string})=>{
    if(disposed)return;
    status.textContent=value.detail||'未连接SSH';panel.containerEl.dataset.connection=value.state;
    panel.containerEl.setAttribute('aria-busy',String(value.state==='connecting'));
    if(value.state==='disconnected'){auth_dialog?.close();++browse_epoch;list_signature='';list.removeAttribute('aria-busy');list.replaceChildren();}
    connect_button.disabled=value.state==='connecting';disconnect_button.disabled=value.state==='disconnected';
    for(const control of [up_button,refresh_button,new_file,new_folder,terminal_button,git_button])control.disabled=value.state!=='connected';
  }});
  const connected=()=>service.state()==='connected';
  const release_context=register_remote_workspace_context(()=>remote_selected&&target?{target,remote_path:provider?.root?provider.remote_path(provider.root):folder,state:service.state()}:undefined);
  const local_context_changed=()=>{remote_selected=Boolean(active_remote_files());};
  window.addEventListener('linux-note-workspace-context-changed',local_context_changed);
  const require_connection=(owner=target)=>{if(!connected()||target!==owner)throw Error('此文档所属SSH主机未连接；草稿保留，请连接原主机后保存。');};
  const prompt_name=(title:string)=>new Promise<string|undefined>(resolve=>{
    let result:string|undefined;const dialog=workspace_dialog(title,'取消',()=>resolve(result));const input=el('input');input.setAttribute('aria-label',title);dialog.content.append(input);
    const accept=()=>{if(!input.value||input.value==='.'||input.value==='..'||/[\/\0]/u.test(input.value)){input.setCustomValidity('请输入单个有效名称，不含斜线');input.reportValidity();return;}result=input.value;dialog.close();};
    dialog.footer.prepend(button('确定',accept));input.oninput=()=>input.setCustomValidity('');input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();accept();}};input.focus();
  });
  const browse=async(next:string,select=true)=>{
    require_connection();const epoch=++browse_epoch;status.textContent='正在读取远程目录…';list.setAttribute('aria-busy','true');
    try{
      const result=await service.request('list',{path:next}) as {path:string;entries:remote_entry[]};
      if(disposed||epoch!==browse_epoch)return;folder=result.path;if(select)remote_selected=true;location.textContent=folder;location.title=folder;
      const signature=JSON.stringify(result);if(signature===list_signature){status.textContent=`SSH: ${target} · ${result.entries.length} 项`;return;}list_signature=signature;list.replaceChildren();
      let shown=0;const more=button('显示更多',()=>append_batch());
      const append_batch=()=>{more.remove();const end=Math.min(shown+200,result.entries.length);for(;shown<end;shown++){
        const entry=result.entries[shown],entry_path=path_api.posix.join(folder,entry.name);
        const row=button('',()=>void (entry.directory?browse(entry_path):open_file(entry_path)).catch(notice),'workspace-ssh-row');row.title=entry_path+(entry.link?'（符号链接）':'');
        row.append(entry.directory?git_icon('chevron-right'):workspace_file_icon(entry.name),el('span','',entry.name));list.append(row);
      }if(shown<result.entries.length)list.append(more);};append_batch();
      if(!result.entries.length)list.append(el('p','','此目录为空。'));
      status.textContent=`SSH: ${target} · ${result.entries.length} 项`;
    }catch(error){if(epoch===browse_epoch&&!disposed){status.textContent=String((error as Error).message);throw error;}}
    finally{if(epoch===browse_epoch)list.removeAttribute('aria-busy');}
  };
  const create=async(directory:boolean)=>{
    if(mutating)return;require_connection();const owner=target,parent=folder;
    const name=await prompt_name(directory?'新建远程文件夹':'新建远程文件');if(!name||disposed)return;require_connection(owner);if(folder!==parent)throw Error('目录已切换，请重试。');
    mutating=true;status.textContent='正在创建…';try{const path=path_api.posix.join(parent,name);await service.request(directory?'mkdir':'create',{path,data:''});await browse(parent);if(!directory)await open_file(path);}finally{mutating=false;}
  };
  const open_file=async(path:string)=>{
    require_connection();if(!provider)throw Error('远程文件服务尚未就绪');await files.open_file(provider.local_path(path));
  };
  const input=el('input'),status=el('p','workspace-ssh-status','输入SSH配置别名或 user@hostname。'),location=el('div','workspace-ssh-location'),list=el('div','workspace-ssh-list');
  input.placeholder='user@hostname 或 SSH 配置别名';input.setAttribute('aria-label','SSH主机');input.autocomplete='off';status.setAttribute('role','status');
  const restore_provider=(owner:string)=>{
    const existing=host_providers.get(owner);if(existing)return existing;
    const host_key=runtime.reqnode('crypto').createHash('sha256').update(owner).digest('hex');
    const value=new remote_file_provider({target:owner,connected:()=>connected()&&target===owner,poll_interval:()=>read_remote_ssh_settings().refresh_interval*1000,request:(operation,values)=>service.request(operation,values)},runtime.reqnode('fs'),path_api,path_api.join(runtime._options.userDataPath,'typora_code','remote_cache',host_key),buffer_api);
    host_providers.set(owner,value);provider_releases.push(register_remote_files(value));return value;
  };
  const connect=async()=>{
    if(connecting)return;const next=input.value.trim();api.validate_target(next);
    if(target&&target!==next){const close=await files.prepare_workspace_switch();if(!close)return;close();}
    connecting=true;credential_used=false;pending_credential=undefined;remote_selected=true;target=next;folder='';let authenticated=false;try{const hello=await service.connect(target);authenticated=true;if(disposed)return;
      if(pending_credential){try{await credentials.save(target,pending_credential);}catch(error){notice(error);}pending_credential=undefined;}
      if(!provider||provider.connection.target!==target){
        provider=restore_provider(target);
      }
      select_remote_files(provider);const project=provider.root?provider.remote_path(provider.root):hello.home;await browse(project);
      const root=await provider.mount(project);core.app.commands.run('linux_note:open_folder_path',[root]);
      try{localStorage.setItem('typora-code:ssh:last-host',target);}catch{/* 存储不可用时本次连接仍可使用。 */}}catch(error){if(!authenticated&&/permission denied|authentication failed/iu.test(String(error)))await credentials.remove(target);throw error;}finally{pending_credential=undefined;connecting=false;}
  };
  const connect_button=button('连接',()=>void connect().catch(notice));
  const disconnect_button=button('断开 / 取消',()=>service.disconnect());disconnect_button.disabled=true;
  const up_button=button('上一级',()=>void browse(path_api.posix.dirname(folder)).catch(notice));
  const refresh_button=button('刷新',()=>void browse(folder).catch(notice));
  const new_file=button('新建文件',()=>void create(false).catch(notice)),new_folder=button('新建文件夹',()=>void create(true).catch(notice));
  const terminal_button=button('项目终端',()=>{try{require_connection();window.dispatchEvent(new CustomEvent('linux-note-open-ssh-terminal',{detail:{target,remote_path:folder}}));}catch(error){notice(error);}});
  const git_button=button('Git',()=>{try{require_connection();if(provider?.root)window.dispatchEvent(new CustomEvent('linux-note-open-git',{detail:{path:provider.root}}));}catch(error){notice(error);}});

  for(const control of [up_button,refresh_button,new_file,new_folder,terminal_button,git_button])control.disabled=true;
  input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();void connect().catch(notice);}};
  const hosts=el('datalist');hosts.id='workspace-ssh-hosts';input.setAttribute('list',hosts.id);
  try{input.value=localStorage.getItem('typora-code:ssh:last-host')||'';}catch{/* 无本地偏好时等待输入。 */}
  if(input.value){
    const mounted=runtime.File?.getMountFolder?.();
    const restored=provider=restore_provider(input.value);
    if(mounted&&restored.owns(mounted)){provider=restored;provider.root=path_api.normalize(mounted);target=input.value;folder=provider.remote_path(provider.root);remote_selected=true;select_remote_files(provider);status.textContent='SSH工作区已保留，请重新连接后继续读写。';}
  }
  try{const config=files.fs.readFileSync(path_api.join(runtime.reqnode('os').homedir(),'.ssh','config'),'utf8');const names=new Set<string>();for(const match of config.matchAll(/^\s*Host\s+(.+)$/gimu))for(const name of match[1].split(/\s+/u)){if(/[!*?#]/u.test(name))continue;try{api.validate_target(name);names.add(name);}catch{/* 由OpenSSH处理不能枚举的模式。 */}}for(const name of names){const option=el('option');option.value=name;hosts.append(option);}}catch{/* SSH配置可选；不创建或改写用户配置。 */}
  class remote_sidebar extends core.SidebarPanel {
    containerEl=el('div','workspace-ssh-sidebar');
    constructor(){super();this.addRibbonButton({id:'typora_code:remote_ssh',title:'远程资源管理器 (SSH)',icon:git_icon('remote-explorer') as unknown as HTMLElement,group:'top'});
      const toolbar=el('div','workspace-ssh-toolbar');toolbar.append(connect_button,disconnect_button,up_button,refresh_button,new_file,new_folder,terminal_button,git_button);
      toolbar.append(button('打开文件夹',()=>core.app.commands.run('linux_note:open_folder')),button('设置',()=>core.app.commands.run('typora_code:settings')));
      if(credentials.supported)toolbar.append(button('忘记密码',()=>{const owner=input.value.trim();if(!owner)return;void credentials.remove(owner).then(()=>{status.textContent='已移除此主机保存的密码。';}).catch(notice);}));
      this.containerEl.append(el('div','workspace-ssh-title','远程资源管理器 · SSH'),input,hosts,toolbar,status,location,list);
    }
    onshow(){document.querySelector('#typora-sidebar')?.classList.remove('active-tab-files','active-tab-outline','ty-show-search');}
  }
  const panel=new remote_sidebar(),interaction=acquire_workspace_interaction(panel.containerEl),sidebar=core.app.workspace.sidebar;
  const remove_panel=sidebar.addPanel(panel);
  const show=()=>{if(sidebar.activePanel===panel)sidebar.show();else sidebar.switch(remote_sidebar);input.focus();};
  const unregister=core.app.commands.register({id:'typora_code:remote_ssh',title:'远程：连接SSH主机',scope:'global',callback:show});
  let refresh_timer:ReturnType<typeof setTimeout>;
  const schedule_refresh=()=>{clearTimeout(refresh_timer);const seconds=read_remote_ssh_settings().refresh_interval;if(!seconds)return;refresh_timer=setTimeout(async()=>{try{if(connected()&&folder&&sidebar.isShown&&sidebar.activePanel===panel&&!list.hasAttribute('aria-busy')&&!mutating)await browse(folder,false);}catch{/* 错误留在远程面板，不反复弹通知。 */}finally{if(!disposed)schedule_refresh();}},seconds*1000);};schedule_refresh();
  window.addEventListener('typora-code-ssh-settings-changed',schedule_refresh);
  return {show,service,panel,connect,browse,open_file,dispose(){if(disposed)return;files.assert_can_dispose();disposed=true;for(const release of provider_releases)release();release_context();window.removeEventListener('linux-note-workspace-context-changed',local_context_changed);clearTimeout(refresh_timer);window.removeEventListener('typora-code-ssh-settings-changed',schedule_refresh);auth_dialog?.close();service.dispose();++browse_epoch;unregister();remove_panel();interaction.remove();style.remove();}};
}
