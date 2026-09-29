import {workspace_text} from "./workspace_i18n";
import {workspace_element as el,workspace_button as button,workspace_dialog,workspace_menu} from './workspace_widgets';
import {git_icon,git_icon_button} from './git_icons';
import type {ssh_connection_record} from './remote_ssh_auth_context';
import type {create_ssh_authentication} from './remote_ssh_authentication';

type auth_service=ReturnType<typeof create_ssh_authentication>;
/** The connection directory owns selection and forms only; authentication, the vault, and connection lifecycles each have a single owner. */
export function create_ssh_directory(auth:auth_service,connect:(record:ssh_connection_record)=>Promise<void>,notice:(error:unknown)=>void){
 const root=el('section','workspace-ssh-directory'),header=el('div','workspace-ssh-title'),search=el('input','workspace-ssh-search'),list=el('div','workspace-ssh-connections');
 let records:ssh_connection_record[]=[],disposed=false,epoch=0,active_id='',connection_state='disconnected';
 const dialogs=new Set<ReturnType<typeof workspace_dialog>>();
 const dialog=(title:string)=>{const value=workspace_dialog(title,workspace_text("language_service_settings_view_cancel"),()=>{dialogs.delete(value);for(const input of value.content.querySelectorAll<HTMLInputElement>('input[type=password],input[data-secret]'))input.value='';});dialogs.add(value);return value;};
 const field=(container:HTMLElement,title:string,value='',type='text')=>{const label=el('label','workspace-ssh-field'),input=el('input');input.type=type;input.value=value;input.autocomplete='off';input.setAttribute('aria-label',title);label.append(el('span','',title),input);container.append(label);return input;};
 const run=(control:HTMLButtonElement,error:HTMLElement,operation:()=>Promise<void>)=>{control.disabled=true;error.textContent=workspace_text("community_plugins_processing");void operation().catch(reason=>{error.textContent=String(reason.message||reason);}).finally(()=>{control.disabled=false;});};
 const confirm=async(title:string,message:string,operation:()=>Promise<void>)=>{const view=dialog(title),error=el('p','workspace-ssh-message');view.content.append(el('p','',message),error);const accept=button(workspace_text("remote_ssh_directory_confirm"),()=>run(accept,error,async()=>{await operation();view.close();await refresh();}));view.footer.prepend(accept);};
 const vault=async(record?:ssh_connection_record)=>{
  const state=await auth.vault.state();if(disposed)return;const view=dialog(record?workspace_text("remote_ssh_directory_view_account_password"):workspace_text("remote_ssh_directory_ssh_password_vault")),error=el('p','workspace-ssh-message');
  view.content.append(el('p','',state.configured?workspace_text("remote_ssh_directory_view_password_is_only_for_unlocking_plaintext_view_does_not"):workspace_text("remote_ssh_directory_only_set_the_view_password_when_viewing_plaintext_automatic")));
  if(!state.configured){
   view.content.append(el('p','',state.reset?workspace_text("remote_ssh_directory_the_vault_has_been_cleared_and_reconfiguration_will_not_rest"):workspace_text("remote_ssh_directory_the_first_setup_will_add_the_existing_account_s_automatic_lo")));
   const master=field(view.content,workspace_text("remote_ssh_directory_view_password_at_least_12_characters"),'','password'),repeat=field(view.content,workspace_text("remote_ssh_directory_re_enter_view_password"),'','password');
   const save=button(workspace_text("remote_ssh_directory_set_view_password"),()=>run(save,error,async()=>{if(master.value!==repeat.value)throw Error(workspace_text("remote_ssh_directory_the_two_view_passwords_are_inconsistent"));const identities=await Promise.all(records.map(item=>auth.identity(item.target,item.port)));await auth.vault.setup(master.value,identities.map(item=>item.key));view.close();await vault(record);}));view.footer.prepend(save);
  }else{
   const master=field(view.content,workspace_text("remote_ssh_directory_view_password"),'','password');
   if(record){
    view.content.append(el('p','',record.host_name+' / '+record.name+' · '+record.target));
    const revealed=field(view.content,workspace_text("remote_ssh_directory_account_password"));revealed.readOnly=true;revealed.dataset.secret='';revealed.type='password';let timer:ReturnType<typeof setTimeout>|undefined;
    const clear=()=>{revealed.value='';revealed.type='password';clearTimeout(timer);};
    const reveal=button(workspace_text("remote_ssh_directory_display_30_seconds"),()=>run(reveal,error,async()=>{const owner=await auth.identity(record.target,record.port);const value=await auth.vault.reveal(owner.key,master.value);master.value='';if(!view.root.isConnected||!document.hasFocus())return;revealed.type='text';revealed.value=value;error.textContent=workspace_text("remote_ssh_directory_hide_when_leaving_the_window_or_after_30_seconds");timer=setTimeout(clear,30000);}));
    const hide=button(workspace_text("remote_ssh_directory_hide"),clear);view.content.append(reveal,hide);view.root.addEventListener('focusout',e=>{if(!view.root.contains(e.relatedTarget as Node))clear();});window.addEventListener('blur',clear);
    const close=view.close;view.close=(restore?:boolean)=>{clear();window.removeEventListener('blur',clear);close(restore);};
    // The shared close button retains the original function; node removal clears plaintext and listeners together.
    const observer=new MutationObserver(()=>{if(!view.root.isConnected){clear();window.removeEventListener('blur',clear);observer.disconnect();}});observer.observe(document.body,{childList:true});
   }
   const next=field(view.content,workspace_text("remote_ssh_directory_new_view_password_enter_when_modifying"),'','password');
   const change=button(workspace_text("remote_ssh_directory_modify_view_password"),()=>run(change,error,async()=>{await auth.vault.change(master.value,next.value);view.close();}));view.footer.prepend(change);
   view.content.append(button(workspace_text("remote_ssh_directory_reset_clear_view_password"),()=>void confirm(workspace_text("remote_ssh_directory_clear_view_vault"),workspace_text("remote_ssh_directory_only_delete_all_viewable_passwords_and_view_passwords_retain"),async()=>{await auth.vault.reset();view.close();})));
  }
  view.content.append(error);
 };
 const edit=(record?:ssh_connection_record,another_user=false)=>{
  const view=dialog(record&&!another_user?workspace_text("remote_ssh_directory_edit_ssh_connection"):workspace_text("remote_ssh_directory_new_ssh_connection"));view.content.classList.add('workspace-ssh-form');
  const host=field(view.content,workspace_text("remote_ssh_directory_host_address_or_openssh_alias"),record?.target.split('@').at(-1)||'');
  const host_name=field(view.content,workspace_text("remote_ssh_directory_computer_alias"),record?.host_name||'');
  const user=field(view.content,workspace_text("remote_ssh_directory_username"),another_user?'':record?.target.includes('@')?record.target.split('@')[0]:'');
  const name=field(view.content,workspace_text("remote_ssh_directory_account_alias"),another_user?'':record?.name||'');
  const port=field(view.content,workspace_text("remote_ssh_directory_port_leave_blank_to_use_ssh_configuration"),record?.port?String(record.port):'');port.inputMode='numeric';
  const folder=field(view.content,workspace_text("remote_ssh_directory_initial_directory_leave_blank_to_enter_user_s_home_directory"),record?.folder||'');
  const password=field(view.content,workspace_text("remote_ssh_directory_login_password_leave_blank_to_retain_existing_credentials"),'','password');password.disabled=!auth.credentials.supported;
  view.content.append(el('p','workspace-ssh-hint',workspace_text("remote_ssh_directory_save_password_to_the_operating_system_credential_manager_pas")));
  const error=el('p','workspace-ssh-message');view.content.append(error);
  const save=button(workspace_text("remote_ssh_directory_save"),()=>run(save,error,async()=>{
   const address=host.value.trim();if(address.includes('@'))throw Error(workspace_text("remote_ssh_directory_the_host_address_should_not_include_the_username_please_ente"));
   const target=(user.value.trim()?user.value.trim()+'@':'')+address;
   // Validate non-secret fields first to avoid creating orphan credentials from an invalid form.
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
   title.append(git_icon_button('add',workspace_text("remote_ssh_directory_add_account_to_this_computer"),()=>edit(first,true)));section.append(title);
   for(const record of group){
    const row=el('div','workspace-ssh-account');row.dataset.active=String(record.id===active_id);row.dataset.state=record.id===active_id?connection_state:'';
    const open=button('',()=>select(record),'workspace-ssh-account-open');open.title=workspace_text("remote_ssh_directory_connect")+record.host_name+' / '+record.name+' · '+record.target+(record.port?':'+record.port:'');
    open.append(el('span','workspace-ssh-account-name',record.name),el('span','workspace-ssh-account-address',record.target+(record.port?':'+record.port:'')));open.setAttribute('aria-label',open.title);
    if(record.id===active_id&&connection_state!=='disconnected')open.append(el('span','workspace-ssh-account-state',connection_state==='connected'?workspace_text("remote_ssh_directory_connected"):workspace_text("remote_ssh_directory_connecting")));
    const more=git_icon_button('more',workspace_text("remote_ssh_directory_manage")+record.name,()=>{});more.onclick=event=>workspace_menu(event,[
     {title:workspace_text("remote_ssh_authentication_connect"),action:()=>select(record)},{title:workspace_text("remote_ssh_directory_edit_name_account_and_password"),action:()=>edit(record)},
     {title:workspace_text("remote_ssh_directory_create_new_terminal_with_this_account"),action:()=>window.dispatchEvent(new CustomEvent('linux-note-open-ssh-terminal',{detail:{target:record.target,port:record.port,name:record.host_name+' / '+record.name,remote_path:record.folder||''}}))},
     {title:workspace_text("remote_ssh_directory_view_password_51a3dc5d"),disabled:!auth.credentials.supported,action:()=>void vault(record).catch(notice)},
     {title:workspace_text("remote_ssh_directory_forgot_automatic_login_password"),disabled:!auth.credentials.supported,action:()=>void confirm(workspace_text("remote_ssh_directory_forgot_automatic_login_password_93c10735"),workspace_text("remote_ssh_directory_delete_automatic_login_credentials_for_this_identity_the_vau"),async()=>{await auth.forget(record.target,record.port);})},
     {title:workspace_text("remote_ssh_directory_delete_connection_records"),separator:true,action:()=>void confirm(workspace_text("remote_ssh_directory_delete_connection_records_27ce74bd"),workspace_text("remote_ssh_directory_remove")+record.name+workspace_text("remote_ssh_directory_record_keep_system_credentials_remote_files_and_existing_con"),()=>auth.directory.remove(record.id))}
    ]);
    row.append(open,more);section.append(row);
   }list.append(section);
  }
  if(!filtered.length)list.append(el('p','workspace-ssh-empty',records.length?workspace_text("remote_ssh_directory_no_matching_connection"):workspace_text("remote_ssh_directory_save_common_computers_and_accounts_for_one_click_connection")));
 };
 const refresh=async()=>{const version=++epoch;const values=await auth.directory.list();if(disposed||version!==epoch)return;records=values;render();};
 header.append(el('span','',workspace_text("remote_ssh_directory_ssh_connection")),git_icon_button('add',workspace_text("remote_ssh_directory_new_ssh_connection"),()=>edit()),git_icon_button('refresh',workspace_text("remote_ssh_directory_refresh_connection_records"),()=>void refresh().catch(notice)),git_icon_button('settings-gear',workspace_text("remote_ssh_directory_password_safe"),()=>void vault().catch(notice)));
 search.placeholder=workspace_text("remote_ssh_directory_search_computer_alias_account_or_address");search.setAttribute('aria-label',workspace_text("remote_ssh_directory_search_ssh_connection"));search.oninput=render;list.setAttribute('aria-label',workspace_text("remote_ssh_directory_saved_ssh_connections"));
 root.append(header,search,list);void refresh().catch(notice);
 const focused=()=>void refresh().catch(notice);window.addEventListener('focus',focused);
 return{root,refresh,set_active(id:string,state:string){active_id=id;connection_state=state;render();},dispose(){disposed=true;++epoch;window.removeEventListener('focus',focused);for(const view of dialogs)view.close();root.remove();}};
}
