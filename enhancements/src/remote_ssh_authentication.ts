import {workspace_element as el,workspace_button as button,workspace_dialog} from './workspace_widgets';
import {register_ssh_auth_owner} from './remote_ssh_auth_context';
import {read_remote_ssh_settings} from './remote_ssh_settings';

/** 一个窗口共享认证协调器；每次连接拥有独立的重试、取消和凭据身份。 */
export function create_ssh_authentication(runtime:any,asset_root:string,node_path:string){
 const path=runtime.reqnode('path'),root=path.join(runtime._options.userDataPath,'typora_code','ssh_credentials');
 const api=runtime.reqnode(path.join(asset_root,'remote_ssh_service.cjs'));
 const directory_api=runtime.reqnode(path.join(asset_root,'remote_ssh_connections.cjs'));
 const credential_api=runtime.reqnode(path.join(asset_root,'remote_ssh_credentials.cjs'));
 const directory=directory_api.create_connection_store(root),credentials=credential_api.create_credential_store(root);
 const vault=credential_api.create_password_vault(credentials,(operation:()=>Promise<any>)=>directory_api.with_store_lock(root,operation));
 const sessions=new Map<string,string>();let disposed=false,queue=Promise.resolve(),active_dialog:ReturnType<typeof workspace_dialog>|undefined;
 const identity=(target:string,port=0)=>api.resolve_connection_identity(target,{...read_remote_ssh_settings(),port});
 const save=async(target:string,port:number,password:string)=>{const owner=await identity(target,port);await credentials.save(owner.key,password);await vault.remember(owner.key,password);sessions.set(owner.key,password);};
 const prompt=(message:string,remember_allowed:boolean,current:()=>boolean)=>{
  const result=queue.then(()=>new Promise<{answer?:string;remember:boolean}>(resolve=>{
   if(disposed||!current()){resolve({remember:false});return;}
   let answer:string|undefined,remember_value=false;
   const confirm=/yes\/no|fingerprint|authenticity/iu.test(message);
   const input=el('input');input.type='password';input.autocomplete='off';input.setAttribute('aria-label','SSH认证信息');
   const remember=el('input');remember.type='checkbox';const label=el('label');label.append(remember,document.createTextNode('保存到系统凭据管理器'));
   const dialog=workspace_dialog(confirm?'确认SSH主机身份':'SSH身份验证','取消',()=>{clearInterval(timer);input.value='';active_dialog=undefined;resolve({answer,remember:remember_value});});active_dialog=dialog;
   const timer=setInterval(()=>{if(disposed||!current())dialog.close();},100);
   dialog.content.append(el('p','workspace-ssh-auth-prompt',message));
   if(confirm)dialog.content.append(el('p','','请先核对主机指纹，确认后由OpenSSH保存信任。'));else dialog.content.append(input);
   if(remember_allowed&&credentials.supported)dialog.content.append(label);
   const accept=()=>{if(!current()){dialog.close();return;}answer=confirm?'yes':input.value;remember_value=remember.checked;dialog.close();};
   dialog.footer.prepend(button(confirm?'信任并连接':'连接',accept));input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();accept();}};
  }));queue=result.then(()=>undefined,()=>undefined);return result;
 };
 const attempt=async(target:string,port:number,current:()=>boolean,persist_immediately=false)=>{
  const owner=await identity(target,port);let used=false,pending:string|undefined,remember=false,legacy=false,entered=false;
  return {owner,async authenticate(message:string,stale:()=>boolean){
   const valid=()=>!disposed&&current()&&!stale();if(!valid())return;
   // ProxyJump、密钥口令和验证码不可误用目标账号的保存密码。
   const password_prompt=/password/iu.test(message)&&!/passphrase|verification|one.time/iu.test(message);
   const expected=owner.user+'@'+owner.hostname;
   const matches=password_prompt&&(message.includes(expected+"'s password")||message.includes('('+expected+') Password'));
   if(matches&&!used){used=true;let stored=sessions.get(owner.key)||(credentials.supported?await credentials.read(owner.key):undefined);if(!stored&&credentials.supported&&!port&&!read_remote_ssh_settings().config_file){stored=await credentials.read(target);legacy=Boolean(stored);if(legacy){pending=stored;remember=true;}}if(stored&&valid())return stored;}
   const result=await prompt(message,matches,valid);if(!valid())return;
   if(matches&&result.answer){pending=result.answer;remember=result.remember;entered=true;if(persist_immediately&&remember)await save(target,port,pending);}
   return result.answer;
  },async complete(){if(pending){sessions.set(owner.key,pending);if(remember){if(legacy&&!entered)await credentials.save(owner.key,pending);else await save(target,port,pending);if(legacy)await credentials.remove(target);}}pending=undefined;},clear(){pending=undefined;sessions.delete(owner.key);}};
 };
 const bridges=new Set<{dispose:()=>void}>();
 const release=register_ssh_auth_owner({list:()=>directory.list(),prepare:async(target,port,current)=>{
  const auth=await attempt(target,port,current,true);if(disposed||!current())throw Error('SSH终端启动已取消');
  const bridge=await runtime.reqnode(path.join(asset_root,'remote_ssh_auth.cjs')).create_ssh_auth({asset_root,node_path,authenticate:auth.authenticate,is_current:current});
  if(disposed||!current()){bridge.dispose();throw Error('SSH终端启动已取消');}bridges.add(bridge);
  return{env:bridge.env,dispose(){bridges.delete(bridge);bridge.dispose();}};
 }});
 return{directory,credentials,vault,identity,save,attempt,async forget(target:string,port:number){const owner=await identity(target,port);sessions.delete(owner.key);await credentials.remove(owner.key);if(!port&&!read_remote_ssh_settings().config_file)await credentials.remove(target);},dispose(){disposed=true;active_dialog?.close();for(const bridge of bridges)bridge.dispose();bridges.clear();sessions.clear();release();}};
}
