import {workspace_text as text} from './workspace_i18n';
import {workspace_element as el,workspace_button as button,workspace_dialog,workspace_menu} from './workspace_widgets';
import {git_icon} from './git_icons';
import {workspace_file_icon,acquire_workspace_file_icons} from './workspace_file_icons';
import {workspace_list_selection} from './workspace_list_selection';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import {choose_local_directory} from './workspace_native_picker';
import {open_language_service_settings} from './language_service_settings_view';
import {open_source_outline_settings} from './source_outline_settings';
import {get_workspace_files} from './workspace_files';
import css from './language_support.css';
import type {bind_language_support} from './language_support_service';
type language_support=ReturnType<typeof bind_language_support>;
const sample_files:Record<string,string>={cpp:'source.cpp',csharp:'source.cs',cmake:'CMakeLists.txt',makefile:'Makefile',bash:'source.sh',java:'source.java',javascript:'source.js',html:'source.html',css:'source.css'};
const set_text=(node:HTMLElement,value:string)=>{if(node.textContent!==value)node.textContent=value;};
const set_hidden=(node:HTMLElement,value:boolean)=>{if(node.hidden!==value)node.hidden=value;};
const title=(entry:any)=>entry.name.split(' (')[0];
const description=(entry:any)=>text('language_support_summary',{name:entry.name.slice(entry.name.indexOf('(')+1).replace(/\)$/,'')});
export function open_language_support_settings(service:language_support,id:string){
 const entry=()=>service.list().find((item:any)=>item.id===id),info=entry();if(!info)return;
 let release=()=>{};const dialog=workspace_dialog(title(info),text('community_plugin_settings_close'),()=>{release();interaction.remove();style.remove();});
 dialog.root.classList.add('language-support-settings');const interaction=acquire_workspace_interaction(dialog.root),style=acquire_workspace_style('language-support',css,{},dialog.root);
 dialog.content.append(el('p','',text('language_support_settings_help')));
 const label=el('label','language-support-directory'),location=el('input');location.value=info.installation_directory||'';location.placeholder=text('language_support_default_directory');location.setAttribute('aria-label',text('language_plugin_directory'));label.append(el('span','',text('language_plugin_directory')),location);dialog.content.append(label);
 const status=el('p','language-support-status');status.setAttribute('role','status');
 const run=(action:()=>Promise<unknown>)=>{void action().catch(error=>{status.textContent=String(error.message||error);});};
 const browse=button(text('language_plugin_browse'),()=>run(async()=>{const directory=await choose_local_directory(location.value);if(directory&&dialog.root.isConnected)location.value=directory;}));
 const save=button(text('language_support_save_directory'),()=>run(()=>service.configure(id,{installation_directory:location.value.trim()})));dialog.content.append(browse,save);
 const use_label=el('label','language-support-use'),use=el('input');use.type='checkbox';use.checked=info.use_environment!==false;use.onchange=()=>run(()=>service.configure(id,{use_environment:use.checked}));use_label.append(use,el('span','',text('language_support_automatic')));dialog.content.append(use_label);
 const root=()=>get_workspace_files()?.context_root()||'';
 const advanced=button(text('language_plugin_configure'),()=>open_language_service_settings(root(),root,info.languages[0],language=>info.languages.includes(language)?service.profile(id,root(),language,true):undefined));dialog.content.append(advanced);
 if(info.languages.includes('cpp'))dialog.content.append(button(text('language_plugin_compiler'),()=>open_source_outline_settings(root())));
 const actions=el('div','language-support-settings-actions'),retry=button(text('language_support_retry'),()=>run(()=>service.retry(id))),clear=button(text('language_plugin_clear'),()=>run(()=>service.clear(id))),cancel=button(text('language_plugin_cancel'),()=>run(()=>service.cancel(id)));actions.append(retry,clear,cancel);dialog.content.append(actions,status);
 const refresh=()=>{const current=entry();if(!current?.installed){dialog.close();return;}location.disabled=!!current.record||current.busy;browse.disabled=location.disabled;save.disabled=location.disabled;use.checked=current.use_environment!==false;use.disabled=!!current.removing;retry.disabled=current.busy;clear.disabled=current.busy||!current.record;cancel.disabled=!current.busy||current.removing;status.textContent=(current.record?text('language_plugin_installed',{directory:current.record.directory}):text('language_plugin_not_installed'))+'\n'+current.message;};release=service.subscribe(refresh);refresh();return dialog;
}
export function create_language_support_view(service:language_support,open_community:()=>void){
 const content=el('section','language-support'),header=el('div','language-support-search'),search=el('input'),list=el('div','language-support-list'),message=el('p','language-support-status');
 search.type='search';search.placeholder=text('language_support_search');search.setAttribute('aria-label',search.placeholder);header.append(search);message.setAttribute('role','status');
 const community=button(text('language_support_community'),open_community,'language-support-community');content.append(header,list,message,community);
 const style=acquire_workspace_style('language-support',css),icons=acquire_workspace_file_icons(),interaction=acquire_workspace_interaction(content),selection=new workspace_list_selection(list),rows=new Map<string,{node:HTMLElement;meta:HTMLElement;install:HTMLButtonElement;menu:HTMLButtonElement}>(),groups=new Map<boolean,{header:HTMLButtonElement;count:HTMLElement;items:HTMLElement;closed:boolean}>();
 let disposed=false,close_menu:undefined|(()=>void);
 const run=(action:()=>Promise<unknown>)=>{void action().catch(error=>{if(!disposed)message.textContent=String(error.message||error);});};
 for(const installed of [true,false]){const heading=button('',()=>{const group=groups.get(installed)!;group.closed=!group.closed;group.items.hidden=group.closed;heading.setAttribute('aria-expanded',String(!group.closed));},'language-support-group'),count=el('span','language-support-count'),items=el('div','language-support-items');heading.append(git_icon('chevron-down'),el('span','',text(installed?'language_support_installed':'language_support_available')),count);heading.setAttribute('aria-expanded','true');groups.set(installed,{header:heading,count,items,closed:false});list.append(heading,items);}
 const refresh=()=>{
  if(disposed)return;const previous_focus=document.activeElement as HTMLElement,owned_focus=content.contains(previous_focus);const entries=service.list(),needle=search.value.trim().toLocaleLowerCase();let visible=0;
  for(const info of entries){let row=rows.get(info.id);if(!row){
   const node=el('article','language-support-row'),icon=workspace_file_icon(sample_files[info.id.replace('typora_code.language_','')]),details=el('div','language-support-details'),name=el('strong','language-support-name',title(info)),summary=el('span','language-support-description',description(info)),footer=el('div','language-support-footer'),meta=el('span','language-support-publisher'),install=button(text('community_plugins_install'),()=>run(()=>service.install(info.id)),'language-support-install'),menu=button('',()=>{},'language-support-menu');
   menu.append(git_icon('settings-gear'));menu.setAttribute('aria-label',text('language_support_manage',{name:title(info)}));menu.title=menu.getAttribute('aria-label')!;
   menu.onclick=event=>{const current=service.list().find((entry:any)=>entry.id===info.id);close_menu=workspace_menu(event,[{title:text('community_plugins_settings'),action:()=>{open_language_support_settings(service,info.id);}},{title:text(current.enabled?'community_plugins_disable':'language_support_enable'),disabled:current.removing,action:()=>run(()=>service.set_enabled(info.id,!current.enabled))},{title:text('language_support_retry'),disabled:current.busy,action:()=>run(()=>service.retry(info.id))},{title:text('community_plugins_uninstall'),separator:true,disabled:current.removing,action:()=>run(()=>service.uninstall(info.id))}]);};
   footer.append(meta,install,menu);details.append(name,summary,footer);node.append(icon,details);node.tabIndex=0;node.setAttribute('role','option');node.setAttribute('aria-label',title(info));selection.bind(node,info.id);node.onclick=()=>selection.select([info.id]);node.ondblclick=()=>{if(service.list().find((entry:any)=>entry.id===info.id)?.installed)open_language_support_settings(service,info.id);};rows.set(info.id,row={node,meta,install,menu});
  }
  const group=groups.get(info.installed===true)!;if(row.node.parentElement!==group.items){const order=entries.findIndex((entry:any)=>entry.id===info.id),next=[...group.items.children].find(node=>entries.findIndex((entry:any)=>entry.id===(node as HTMLElement).dataset.workspaceRowKey)>order);group.items.insertBefore(row.node,next||null);}
  set_hidden(row.node,!(info.name+' '+info.id+' '+info.languages.join(' ')).toLocaleLowerCase().includes(needle));if(!row.node.hidden)visible++;
  set_text(row.meta,'TyporaCode'+(info.removing?' · '+text('language_support_removing'):info.busy?' · '+text('language_support_preparing'):info.error?' · '+text('language_support_failed'):info.installed&&!info.enabled?' · '+text('community_plugins_disabled'):info.record?' · '+text('language_support_ready'):''));const hint=info.message||'TyporaCode';if(row.meta.title!==hint)row.meta.title=hint;
  const disabled=!!info.installed&&!info.enabled;if(row.node.classList.contains('is-disabled')!==disabled)row.node.classList.toggle('is-disabled',disabled);const busy=String(!!info.busy);if(row.node.getAttribute('aria-busy')!==busy)row.node.setAttribute('aria-busy',busy);set_hidden(row.install,!!info.installed);set_hidden(row.menu,!info.installed);
  }
  for(const group of groups.values()){const count=[...group.items.children].filter(node=>!(node as HTMLElement).hidden).length;set_text(group.count,String(count));set_hidden(group.header,count===0);set_hidden(group.items,group.closed||count===0);}
  set_text(message,visible?'':text('community_plugins_no_matching_plugin_found'));if(owned_focus&&previous_focus.isConnected&&document.activeElement!==previous_focus){const target=previous_focus.hidden?previous_focus.closest<HTMLElement>('.language-support-row'):previous_focus;if(target&&!target.hidden)target.focus({preventScroll:true});}
 };
 content.addEventListener('keydown',event=>{const row=(event.target as HTMLElement).closest<HTMLElement>('.language-support-row');if(!row||event.target!==row)return;const visible=[...list.querySelectorAll<HTMLElement>('.language-support-row')].filter(node=>!node.hidden&&!node.parentElement!.hidden);const index=visible.indexOf(row);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=visible[Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:-1)))];next?.focus();if(next)selection.select([next.dataset.workspaceRowKey!]);}if(event.key==='Enter'||event.key===' '){event.preventDefault();const id=row.dataset.workspaceRowKey!;selection.select([id]);const entry=service.list().find((item:any)=>item.id===id);if(entry.installed)open_language_support_settings(service,id);else run(()=>service.install(id));}});
 search.oninput=refresh;const release=service.subscribe(refresh);refresh();void service.ready.then(refresh).catch(error=>{if(!disposed)message.textContent=String(error.message||error);});
 return {content,focus:()=>search.focus(),dispose(){disposed=true;release();close_menu?.();selection.dispose();interaction.remove();icons.remove();style.remove();content.remove();}};
}
