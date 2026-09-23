import {workspace_element as el,workspace_button as button,workspace_dialog,workspace_menu} from './workspace_widgets';
import {git_icon,git_icon_button} from './git_icons';
import type {ssh_connection_record} from './remote_ssh_auth_context';
import type {create_ssh_authentication} from './remote_ssh_authentication';

type auth_service=ReturnType<typeof create_ssh_authentication>;
/** 连接目录只拥有选择和表单；认证、保险箱、连接生命周期各有唯一所有者。 */
export function create_ssh_directory(auth:auth_service,connect:(record:ssh_connection_record)=>Promise<void>,notice:(error:unknown)=>void){
 const root=el('section','workspace-ssh-directory'),header=el('div','workspace-ssh-title'),search=el('input'),list=el('div','workspace-ssh-connections');
 let records:ssh_connection_record[]=[],disposed=false,epoch=0,active_id='',connection_state='disconnected';
 const dialogs=new Set<ReturnType<typeof workspace_dialog>>();
 const dialog=(title:string)=>{const value=workspace_dialog(title,'取消',()=>{dialogs.delete(value);for(const input of value.content.querySelectorAll<HTMLInputElement>('input[type=password],input[data-secret]'))input.value='';});dialogs.add(value);return value;};
 const field=(container:HTMLElement,title:string,value='',type='text')=>{const label=el('label','workspace-ssh-field'),input=el('input');input.type=type;input.value=value;input.autocomplete='off';input.setAttribute('aria-label',title);label.append(el('span','',title),input);container.append(label);return input;};
 const run=(control:HTMLButtonElement,error:HTMLElement,operation:()=>Promise<void>)=>{control.disabled=true;error.textContent='正在处理…';void operation().catch(reason=>{error.textContent=String(reason.message||reason);}).finally(()=>{control.disabled=false;});};
 const confirm=async(title:string,message:string,operation:()=>Promise<void>)=>{const view=dialog(title),error=el('p','workspace-ssh-message');view.content.append(el('p','',message),error);const accept=button('确认',()=>run(accept,error,async()=>{await operation();view.close();await refresh();}));view.footer.prepend(accept);};
 const vault=async(record?:ssh_connection_record)=>{
  const state=await auth.vault.state();if(disposed)return;const view=dialog(record?'查看账号密码':'SSH密码保险箱'),error=el('p','workspace-ssh-message');
  view.content.append(el('p','',state.configured?'查看保险密码只用于解锁明文查看，不影响SSH自动登录。':'仅在查看明文时需要设置保险密码。自动登录使用独立的系统凭据，无需保险密码。'));
  if(!state.configured){
   view.content.append(el('p','',state.reset?'保险箱已清空，重新配置不会恢复已删除的查看记录。请在账号编辑中重新输入密码加入保险箱。':'首次设置将把已有账号的自动登录密码加入查看保险箱。'));
   const master=field(view.content,'保险密码（至少12个字符）','','password'),repeat=field(view.content,'再次输入保险密码','','password');
   const save=button('设置保险密码',()=>run(save,error,async()=>{if(master.value!==repeat.value)throw Error('两次保险密码不一致');const identities=await Promise.all(records.map(item=>auth.identity(item.target,item.port)));await auth.vault.setup(master.value,identities.map(item=>item.key));view.close();await vault(record);}));view.footer.prepend(save);
  }else{
   const master=field(view.content,'保险密码','','password');
   if(record){
    view.content.append(el('p','',record.host_name+' / '+record.name+' · '+record.target));
    const revealed=field(view.content,'账号密码');revealed.readOnly=true;revealed.dataset.secret='';revealed.type='password';let timer:ReturnType<typeof setTimeout>|undefined;
    const clear=()=>{revealed.value='';revealed.type='password';clearTimeout(timer);};
    const reveal=button('显示30秒',()=>run(reveal,error,async()=>{const owner=await auth.identity(record.target,record.port);const value=await auth.vault.reveal(owner.key,master.value);master.value='';if(!view.root.isConnected||!document.hasFocus())return;revealed.type='text';revealed.value=value;error.textContent='离开窗口或30秒后隐藏';timer=setTimeout(clear,30000);}));
    const hide=button('隐藏',clear);view.content.append(reveal,hide);view.root.addEventListener('focusout',e=>{if(!view.root.contains(e.relatedTarget as Node))clear();});window.addEventListener('blur',clear);
    const close=view.close;view.close=(restore?:boolean)=>{clear();window.removeEventListener('blur',clear);close(restore);};
    // 共享关闭按钮持有原函数，通过节点移除统一清除明文和监听器。
    const observer=new MutationObserver(()=>{if(!view.root.isConnected){clear();window.removeEventListener('blur',clear);observer.disconnect();}});observer.observe(document.body,{childList:true});
   }
   const next=field(view.content,'新保险密码（修改时填写）','','password');
   const change=button('修改保险密码',()=>run(change,error,async()=>{await auth.vault.change(master.value,next.value);view.close();}));view.footer.prepend(change);
   view.content.append(button('重置 / 清除保险密码…',()=>void confirm('清除查看保险箱','仅删除所有可查看密码及保险密码，保留自动登录凭据、连接记录和已连接会话。清除后不能用自动登录凭据重新导入旧的查看记录。',async()=>{await auth.vault.reset();view.close();})));
  }
  view.content.append(error);
 };
 const edit=(record?:ssh_connection_record,another_user=false)=>{
  const view=dialog(record&&!another_user?'编辑SSH连接':'新建SSH连接');view.content.classList.add('workspace-ssh-form');
  const host=field(view.content,'主机地址或OpenSSH别名',record?.target.split('@').at(-1)||'');
  const host_name=field(view.content,'电脑别名',record?.host_name||'');
  const user=field(view.content,'用户名',another_user?'':record?.target.includes('@')?record.target.split('@')[0]:'');
  const name=field(view.content,'账号别名',another_user?'':record?.name||'');
  const port=field(view.content,'端口（留空沿用SSH配置）',record?.port?String(record.port):'');port.inputMode='numeric';
  const folder=field(view.content,'初始目录（留空进入用户主目录）',record?.folder||'');
  const password=field(view.content,'登录密码（留空保留现有凭据）','','password');password.disabled=!auth.credentials.supported;
  view.content.append(el('p','workspace-ssh-hint','密码保存到操作系统凭据管理器；不填写密码时仍支持SSH密钥、代理和当次认证。主机与账号别名仅用于显示。'));
  const error=el('p','workspace-ssh-message');view.content.append(error);
  const save=button('保存',()=>run(save,error,async()=>{
   const address=host.value.trim();if(address.includes('@'))throw Error('主机地址不应包含用户名，请在用户名字段填写');
   const target=(user.value.trim()?user.value.trim()+'@':'')+address;
   // 先验证非秘密字段，避免错误表单创建孤立凭据。
   const values={id:another_user?undefined:record?.id,host_name:host_name.value.trim()||address,name:name.value.trim()||user.value.trim()||address,target,port:Number(port.value||0),folder:folder.value.trim()};
   if(password.value)await auth.identity(target,values.port);
   const saved=await auth.directory.save(values);
   if(password.value)await auth.save(saved.target,saved.port,password.value);
   view.close();await refresh();
  }));view.footer.prepend(save);
 };
 const select=(record:ssh_connection_record)=>{void connect(record).catch(notice);};
 const render=()=>{
  list.replaceChildren();const term=search.value.toLocaleLowerCase();const filtered=records.filter(item=>[item.host_name,item.name,item.target,String(item.port)].join(' ').toLocaleLowerCase().includes(term));
  const groups=new Map<string,ssh_connection_record[]>();for(const item of filtered){const key=item.target.split('@').at(-1)+':'+item.port;const group=groups.get(key)||[];group.push(item);groups.set(key,group);}
  for(const group of groups.values()){
   const first=group[0],section=el('section','workspace-ssh-host'),title=el('div','workspace-ssh-host-title');title.append(git_icon('remote-explorer'),el('strong','',first.host_name));title.title=first.target.split('@').at(-1)+(first.port?':'+first.port:'');
   title.append(git_icon_button('add','为此电脑添加账号',()=>edit(first,true)));section.append(title);
   for(const record of group){
    const row=el('div','workspace-ssh-account');row.dataset.active=String(record.id===active_id);row.dataset.state=record.id===active_id?connection_state:'';
    const open=button('',()=>select(record),'workspace-ssh-account-open');open.title='连接 '+record.host_name+' / '+record.name+' · '+record.target+(record.port?':'+record.port:'');
    open.append(el('span','workspace-ssh-account-name',record.name),el('span','workspace-ssh-account-address',record.target+(record.port?':'+record.port:'')));open.setAttribute('aria-label',open.title);
    if(record.id===active_id&&connection_state!=='disconnected')open.append(el('span','workspace-ssh-account-state',connection_state==='connected'?'已连接':'连接中…'));
    const more=git_icon_button('more','管理 '+record.name,()=>{});more.onclick=event=>workspace_menu(event,[
     {title:'连接',action:()=>select(record)},{title:'编辑名称、账号与密码…',action:()=>edit(record)},
     {title:'用此账号新建终端',action:()=>window.dispatchEvent(new CustomEvent('linux-note-open-ssh-terminal',{detail:{target:record.target,port:record.port,name:record.host_name+' / '+record.name,remote_path:record.folder||''}}))},
     {title:'查看密码…',disabled:!auth.credentials.supported,action:()=>void vault(record).catch(notice)},
     {title:'忘记自动登录密码…',disabled:!auth.credentials.supported,action:()=>void confirm('忘记自动登录密码','删除此身份的自动登录凭据；保险箱查看记录、连接记录和已连接会话保持不变。',async()=>{await auth.forget(record.target,record.port);})},
     {title:'删除连接记录…',separator:true,action:()=>void confirm('删除连接记录','移除“'+record.name+'”记录。保留系统凭据、远端文件及已有连接。',()=>auth.directory.remove(record.id))}
    ]);
    row.append(open,more);section.append(row);
   }list.append(section);
  }
  if(!filtered.length)list.append(el('p','workspace-ssh-empty',records.length?'没有匹配的连接':'保存常用电脑和账号，一键连接。'));
 };
 const refresh=async()=>{const version=++epoch;const values=await auth.directory.list();if(disposed||version!==epoch)return;records=values;render();};
 header.append(el('span','','SSH连接'),git_icon_button('add','新建SSH连接',()=>edit()),git_icon_button('refresh','刷新连接记录',()=>void refresh().catch(notice)),git_icon_button('settings-gear','密码保险箱',()=>void vault().catch(notice)));
 search.placeholder='搜索电脑别名、账号或地址';search.setAttribute('aria-label','搜索SSH连接');search.oninput=render;list.setAttribute('aria-label','已保存的SSH连接');
 root.append(header,search,list);void refresh().catch(notice);
 const focused=()=>void refresh().catch(notice);window.addEventListener('focus',focused);
 return{root,refresh,set_active(id:string,state:string){active_id=id;connection_state=state;render();},dispose(){disposed=true;++epoch;window.removeEventListener('focus',focused);for(const view of dialogs)view.close();root.remove();}};
}
