import type {graph_core,graph_leaf} from './git_graph_host';
import type {workspace_file_host} from './workspace_files';
import {workspace_element as el,workspace_button as button,workspace_dialog} from './workspace_widgets';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import {git_icon} from './git_icons';
import {git_diff_editor} from './git_diff_editor';
import {workspace_file_icon} from './workspace_file_icons';
import {workspace_leaf_tab} from './workspace_leaf_tab';
import {select_workspace_editor_group} from './workspace_editor_settings';
import {create_lookup_preview} from './workspace_lookup_preview';
import {detect_binary_bytes,is_markdown_file} from './file_language';
import node_release from '../node_runtime.json';
import css from './workspace_remote_ssh.css';
import {read_remote_ssh_settings} from './remote_ssh_settings';
import {register_remote_workspace_context} from './remote_workspace_context';

const VIEW_ID='typora_code.remote_file';
const GIT_VIEW_ID='typora_code.remote_git_status';
type remote_snapshot={data:string;version:unknown};
type remote_entry={name:string;directory:boolean;link:boolean};

/** 每个窗口一个SSH连接；远程资源从不交给本地文件、Git或宿主Markdown IO。 */
export function bind_workspace_remote_ssh(core:graph_core,files:workspace_file_host,runtime:any=window){
  const path_api=runtime.reqnode('path'),buffer_api=runtime.reqnode('buffer').Buffer;
  const asset_root=path_api.join(runtime._options.userDataPath,'typora_code','assets','remote');
  const api=runtime.reqnode(path_api.join(asset_root,'remote_ssh_service.cjs'));
  const node_path=path_api.join(runtime._options.userDataPath,'linux_note_enhancements','terminal_runtime','node',node_release.version,'node.exe');
  const style=acquire_workspace_style('typora-code-style:workspace_remote_ssh',css);
  const views=new Set<remote_file_view>();
  const git_views=new Set<remote_git_view>();
  let disposed=false,target='',folder='',browse_epoch=0,connecting=false,mutating=false,list_signature='';
  let remote_selected=false;
  let auth_dialog:ReturnType<typeof workspace_dialog>|undefined;
  const notice=(error:unknown)=>{if(!disposed)new core.Notice(String(error instanceof Error?error.message:error),7000);};
  const authenticate=(prompt:string,stale:()=>boolean)=>new Promise<string|undefined>(resolve=>{
    if(disposed||stale()){resolve(undefined);return;}
    let answer:string|undefined;
    const confirm=/yes\/no|fingerprint|authenticity/iu.test(prompt);
    const dialog=workspace_dialog(confirm?'确认SSH主机身份':'SSH身份验证','取消',()=>{input.value='';if(auth_dialog===dialog)auth_dialog=undefined;resolve(answer);});auth_dialog=dialog;
    const input=el('input');input.type='password';input.autocomplete='off';input.setAttribute('aria-label','SSH认证信息');
    dialog.content.append(el('p','workspace-ssh-auth-prompt',prompt));
    if(confirm)dialog.content.append(el('p','','请核对远程电脑提供的主机指纹，确认后由OpenSSH记录信任。'));else dialog.content.append(input);
    const accept=()=>{if(stale()||disposed){dialog.close();return;}answer=confirm?'yes':input.value;dialog.close();};
    dialog.footer.prepend(button(confirm?'信任并连接':'连接',accept));input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();accept();}};
    if(!confirm)input.focus();
  });
  const service=api.create_remote_ssh({asset_root,node_path,authenticate,connection_options:read_remote_ssh_settings,on_state:(value:{state:string;detail:string})=>{
    if(disposed)return;
    status.textContent=value.detail||'未连接SSH';panel.containerEl.dataset.connection=value.state;
    panel.containerEl.setAttribute('aria-busy',String(value.state==='connecting'));
    if(value.state==='disconnected'){auth_dialog?.close();++browse_epoch;list_signature='';list.removeAttribute('aria-busy');list.replaceChildren();for(const view of views)view.update_status();for(const view of git_views)view.disconnected();}
    connect_button.disabled=value.state==='connecting';disconnect_button.disabled=value.state==='disconnected';
    for(const control of [up_button,refresh_button,new_file,new_folder,terminal_button,git_button])control.disabled=value.state!=='connected';
  }});
  const connected=()=>service.state()==='connected';
  const release_context=register_remote_workspace_context(()=>remote_selected&&target?{target,remote_path:folder,state:service.state()}:undefined);
  const local_context_changed=()=>{remote_selected=false;};
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
  class remote_file_view extends core.WorkspaceView {
    containerEl=el('section','workspace-ssh-document');icon='fa-file-code-o';disposed=false;loading=false;saving=false;loaded=false;
    editor?:git_diff_editor;reader?:ReturnType<typeof create_lookup_preview>;version:unknown;saved_text='';bom=false;
    remote_path:string;owner:string;file_path:string;release_port=()=>{};release_document=()=>{};
    toolbar=el('div','workspace-ssh-toolbar');message=el('span','workspace-ssh-document-status');body=el('div','workspace-ssh-body');
    constructor(leaf:graph_leaf){
      super(leaf);const parts=leaf.state.path.split('/');this.owner=decodeURIComponent(parts[3]);this.remote_path=decodeURIComponent(parts[4]);this.file_path=leaf.state.path;views.add(this);
      this.toolbar.append(button('保存',()=>void this.save()),button('重新读取',()=>void this.reload()),button('删除远程文件',()=>void this.remove()),this.message);
      if(is_markdown_file(this.remote_path))this.toolbar.append(button('阅读预览 / 编辑',()=>void this.toggle_preview()));
      this.containerEl.append(this.toolbar,this.body);this.message.setAttribute('role','status');
      const interaction=acquire_workspace_interaction(this.containerEl);this.release_port=()=>interaction.remove();
      this.containerEl.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='s'&&!event.isComposing){event.preventDefault();event.stopImmediatePropagation();void this.save();}},true);
    }
    setIcon(){this.sync_tab();}
    sync_tab(){const tab=workspace_leaf_tab(this.leaf);if(!tab)return;const label=tab.querySelector('.typ-file-basename');if(label)label.textContent=path_api.posix.basename(this.remote_path);tab.querySelector('.typ-file-ext')?.remove();tab.title=`SSH: ${this.owner} ${this.remote_path}`;const icon=tab.querySelector('.typ-file-icon');if(icon){icon.className='typ-file-icon workspace-file-theme-slot';icon.replaceChildren(workspace_file_icon(this.remote_path));}tab.classList.toggle('workspace-file-dirty',this.dirty());}
    busy(){return this.loading||this.saving;}
    dirty(){return this.loaded&&this.read_text()!==this.saved_text;}
    read_text(){return this.editor?.models[0].getValue()??this.saved_text;}
    update_status(){this.message.textContent=`SSH: ${this.owner} · ${this.saving?'正在保存…':this.loading?'正在读取…':!connected()?'已断开，草稿保留':this.dirty()?'未保存':'已保存'}`;this.sync_tab();}
    async onOpen(){this.release_document();this.release_document=files.register_document(this);this.sync_tab();if(!this.loaded&&!this.loading)await this.load();else this.editor?.focused_editor().layout();}
    onClose(){queueMicrotask(()=>{let present=false;core.app.workspace.eachLeaves(leaf=>{if(leaf===this.leaf)present=true;});if(!present)this.release_source();});}
    async load(){
      if(this.busy()||this.disposed)return;this.loading=true;this.editor?.focused_editor().updateOptions({readOnly:true});this.update_status();
      try{require_connection(this.owner);const snapshot=await service.request('read',{path:this.remote_path}) as remote_snapshot;if(this.disposed)return;
        const bytes=buffer_api.from(snapshot.data,'base64');if(detect_binary_bytes(bytes))throw Error('远程文件是二进制，当前编辑器仅支持UTF-8文本。');
        const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);this.bom=bytes[0]===239&&bytes[1]===187&&bytes[2]===191;
        this.reader?.dispose();this.reader=undefined;this.editor?.dispose();this.version=snapshot.version;
        this.editor=new git_diff_editor({title:path_api.posix.basename(this.remote_path),file:this.remote_path,left:text,left_label:`SSH: ${this.owner}`});this.editor.focused_editor().updateOptions({readOnly:false});
        this.body.replaceChildren(this.editor.container);this.saved_text=this.read_text();this.loaded=true;
        this.editor.subscriptions.push(this.editor.focused_editor().onDidChangeModelContent(()=>this.update_status()));
        this.update_status();
      }catch(error){if(!this.disposed){this.message.textContent=String((error as Error).message);notice(error);}}
      finally{this.loading=false;if(!this.disposed){this.editor?.focused_editor().updateOptions({readOnly:false});if(this.loaded)this.update_status();this.sync_tab();}}
    }
    async save(){
      if(this.busy()||this.disposed||!this.loaded)return false;if(!this.dirty())return true;
      this.saving=true;this.update_status();const text=this.read_text();
      try{require_connection(this.owner);const result=await service.request('write',{path:this.remote_path,version:this.version,data:buffer_api.from((this.bom?'\uFEFF':'')+text,'utf8').toString('base64')});this.version=result.version;this.saved_text=text;return true;}
      catch(error){notice(error);return false;}finally{this.saving=false;if(!this.disposed)this.update_status();}
    }
    async reload(){if(this.busy())return;if(this.dirty()){notice('有未保存修改，请先保存；若需丢弃，请关闭标签并选择不保存，再重新打开。');return;}await this.load();}
    async toggle_preview(){if(!this.loaded||this.disposed)return;if(this.reader){this.reader.dispose();this.reader=undefined;this.body.replaceChildren(this.editor!.container);this.editor!.focused_editor().layout();return;}
      this.reader=create_lookup_preview(files,async()=>this.read_text());this.body.replaceChildren(this.reader.container);await this.reader.show({file_path:this.remote_path,relative_path:this.remote_path,matches:[]} as any,{start:0,end:0,line:1,column:1,end_line:1,end_column:1,text:''} as any);
    }
    async remove(){
      if(this.busy())return;if(this.dirty()){notice('请先保存或关闭未保存的远程文档，再删除。');return;}
      const dialog=workspace_dialog('删除远程文件','取消');dialog.content.append(el('p','',`永久删除 ${this.remote_path}？SSH远端不使用本机回收站。`));
      const remove=button('删除',()=>{if(this.disposed||this.busy()||this.dirty()){notice('文档状态已变化，请关闭此对话框并重新检查。');return;}remove.disabled=true;this.saving=true;this.editor?.focused_editor().updateOptions({readOnly:true});void(async()=>{try{require_connection(this.owner);await service.request('remove',{path:this.remote_path,version:this.version});dialog.close();this.saving=false;await files.close_leaf(this.leaf);await browse(folder);}catch(error){notice(error);}finally{this.saving=false;remove.disabled=false;if(!this.disposed)this.editor?.focused_editor().updateOptions({readOnly:false});}})();});dialog.footer.prepend(remove);
    }
    release_source(){if(this.disposed)return;this.disposed=true;this.release_document();this.release_port();this.editor?.dispose();this.reader?.dispose();views.delete(this);}
  }
  const unregister_view=core.app.viewManager.registerView(VIEW_ID,leaf=>new remote_file_view(leaf));
  /** 审阅标签只拥有展示和请求代际；关闭不终止同连接中的文档与终端。 */
  class remote_git_view extends core.WorkspaceView {
    containerEl=el('section','workspace-ssh-document workspace-ssh-git-document');icon='fa-code-fork';
    owner:string;remote_path:string;disposed=false;loading=false;loaded=false;epoch=0;
    message=el('span','workspace-ssh-document-status');output=el('pre','workspace-ssh-git-status');
    refresh=button('刷新',()=>void this.load());release_port:()=>void;
    constructor(leaf:graph_leaf){
      super(leaf);const parts=leaf.state.path.split('/');this.owner=decodeURIComponent(parts[3]);this.remote_path=decodeURIComponent(parts[4]);git_views.add(this);
      const toolbar=el('div','workspace-ssh-toolbar');toolbar.append(this.refresh,this.message);
      this.message.setAttribute('role','status');this.output.tabIndex=0;this.output.setAttribute('aria-label','远程Git只读状态');
      this.containerEl.append(toolbar,el('div','workspace-ssh-location',`SSH: ${this.owner} · ${this.remote_path}`),this.output);
      const interaction=acquire_workspace_interaction(this.containerEl);this.release_port=()=>interaction.remove();
    }
    setIcon(){this.sync_tab();}
    sync_tab(){const tab=workspace_leaf_tab(this.leaf);if(!tab)return;const label=tab.querySelector('.typ-file-basename');if(label)label.textContent=`Git · ${path_api.posix.basename(this.remote_path)||'/'}`;tab.querySelector('.typ-file-ext')?.remove();tab.title=`SSH: ${this.owner} · ${this.remote_path}`;}
    onOpen(){this.sync_tab();if(!this.loaded&&!this.loading)void this.load();}
    onClose(){queueMicrotask(()=>{let present=false;core.app.workspace.eachLeaves(leaf=>{if(leaf===this.leaf)present=true;});if(!present)this.release_source();});}
    disconnected(){if(this.disposed)return;++this.epoch;this.loading=false;this.refresh.disabled=false;this.containerEl.removeAttribute('aria-busy');this.message.textContent='SSH已断开；已有结果保留，重连原主机后刷新。';}
    async load(){
      if(this.disposed||this.loading)return;const epoch=++this.epoch;this.loading=true;this.refresh.disabled=true;this.message.textContent='正在读取远程Git状态…';this.containerEl.setAttribute('aria-busy','true');
      try{require_connection(this.owner);const result=await service.request('git_status',{path:this.remote_path});if(!this.disposed&&epoch===this.epoch){this.output.textContent=result.text;this.message.textContent='远程Git状态 · 只读';this.loaded=true;}}
      catch(error){if(!this.disposed&&epoch===this.epoch)this.message.textContent=String((error as Error).message)+'；可点击刷新重试。';}
      finally{if(!this.disposed&&epoch===this.epoch){this.loading=false;this.refresh.disabled=false;this.containerEl.removeAttribute('aria-busy');}}
    }
    release_source(){if(this.disposed)return;this.disposed=true;++this.epoch;this.release_port();git_views.delete(this);}
  }
  const unregister_git_view=core.app.viewManager.registerView(GIT_VIEW_ID,leaf=>new remote_git_view(leaf));
  const open_file=async(path:string)=>{
    require_connection();const uri=`typ://${VIEW_ID}/${encodeURIComponent(target)}/${encodeURIComponent(path)}/${encodeURIComponent(path_api.posix.basename(path))}`;
    let existing:graph_leaf|undefined;core.app.workspace.eachLeaves(leaf=>{if(leaf.state.path===uri)existing=leaf;});
    if(existing){core.app.workspace.activeLeaf=existing.parent.toggleTab(uri);return;}
    const group=select_workspace_editor_group(core,uri),leaf=core.app.workspace.createLeaf({type:VIEW_ID,state:{path:uri}});group.appendChild(leaf);core.app.workspace.activeLeaf=leaf;
  };
  const input=el('input'),status=el('p','workspace-ssh-status','输入SSH配置别名或 user@hostname。'),location=el('div','workspace-ssh-location'),list=el('div','workspace-ssh-list');
  input.placeholder='user@hostname 或 SSH 配置别名';input.setAttribute('aria-label','SSH主机');input.autocomplete='off';status.setAttribute('role','status');
  const connect=async()=>{
    if(connecting)return;const next=input.value.trim();api.validate_target(next);
    if([...views].some(view=>view.owner!==next))throw Error('切换主机前请先关闭当前远程标签并处理草稿。');
    connecting=true;remote_selected=true;target=next;folder='';try{const hello=await service.connect(target);if(disposed)return;await browse(hello.home);for(const view of views)if(view.owner===target&&!view.loaded)void view.load();try{localStorage.setItem('typora-code:ssh:last-host',target);}catch{/* 存储不可用时本次连接仍可使用。 */}}finally{connecting=false;}
  };
  const connect_button=button('连接',()=>void connect().catch(notice));
  const disconnect_button=button('断开 / 取消',()=>service.disconnect());disconnect_button.disabled=true;
  const up_button=button('上一级',()=>void browse(path_api.posix.dirname(folder)).catch(notice));
  const refresh_button=button('刷新',()=>void browse(folder).catch(notice));
  const new_file=button('新建文件',()=>void create(false).catch(notice)),new_folder=button('新建文件夹',()=>void create(true).catch(notice));
  const terminal_button=button('项目终端',()=>{try{require_connection();window.dispatchEvent(new CustomEvent('linux-note-open-ssh-terminal',{detail:{target,remote_path:folder}}));}catch(error){notice(error);}});
  const git_button=button('Git状态',()=>{try{
    require_connection();const uri=`typ://${GIT_VIEW_ID}/${encodeURIComponent(target)}/${encodeURIComponent(folder)}/Git`;
    let existing:graph_leaf|undefined;core.app.workspace.eachLeaves(leaf=>{if(leaf.state.path===uri)existing=leaf;});
    if(existing){core.app.workspace.activeLeaf=existing.parent.toggleTab(uri);return;}
    const group=select_workspace_editor_group(core,uri),leaf=core.app.workspace.createLeaf({type:GIT_VIEW_ID,state:{path:uri}});group.appendChild(leaf);core.app.workspace.activeLeaf=leaf;
  }catch(error){notice(error);}});
  for(const control of [up_button,refresh_button,new_file,new_folder,terminal_button,git_button])control.disabled=true;
  input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();void connect().catch(notice);}};
  const hosts=el('datalist');hosts.id='workspace-ssh-hosts';input.setAttribute('list',hosts.id);
  try{input.value=localStorage.getItem('typora-code:ssh:last-host')||'';}catch{/* 无本地偏好时等待输入。 */}
  try{const config=files.fs.readFileSync(path_api.join(runtime.reqnode('os').homedir(),'.ssh','config'),'utf8');const names=new Set<string>();for(const match of config.matchAll(/^\s*Host\s+(.+)$/gimu))for(const name of match[1].split(/\s+/u)){if(/[!*?#]/u.test(name))continue;try{api.validate_target(name);names.add(name);}catch{/* 由OpenSSH处理不能枚举的模式。 */}}for(const name of names){const option=el('option');option.value=name;hosts.append(option);}}catch{/* SSH配置可选；不创建或改写用户配置。 */}
  class remote_sidebar extends core.SidebarPanel {
    containerEl=el('div','workspace-ssh-sidebar');
    constructor(){super();this.addRibbonButton({id:'typora_code:remote_ssh',title:'远程资源管理器 (SSH)',icon:git_icon('remote-explorer') as unknown as HTMLElement,group:'top'});
      const toolbar=el('div','workspace-ssh-toolbar');toolbar.append(connect_button,disconnect_button,up_button,refresh_button,new_file,new_folder,terminal_button,git_button);
      toolbar.append(button('设置',()=>core.app.commands.run('typora_code:settings')));
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
  return {show,service,panel,connect,browse,open_file,dispose(){if(disposed)return;files.assert_can_dispose();disposed=true;release_context();window.removeEventListener('linux-note-workspace-context-changed',local_context_changed);clearTimeout(refresh_timer);window.removeEventListener('typora-code-ssh-settings-changed',schedule_refresh);auth_dialog?.close();service.dispose();++browse_epoch;for(const view of [...views])view.release_source();for(const view of [...git_views])view.release_source();unregister();unregister_view();unregister_git_view();remove_panel();interaction.remove();style.remove();}};
}
