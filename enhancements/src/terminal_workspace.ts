import {load_workspace_service} from "./workspace_service_loader";
import {workspace_text} from "./workspace_i18n";
import {reset_content_font} from './workspace_content_zoom';
import {saved_ssh_connections} from './remote_ssh_auth_context';
import {remote_files_for} from './remote_workspace_files';
import {workspace_context_epoch,workspace_context_switching} from "./workspace_context";
import {workspace_alt_modifier,is_composing_key} from "./workspace_keyboard";
import {bind_terminal_state} from "./terminal_state";
import {acquire_workspace_style} from "./workspace_styles";
import {git_icon,git_icon_button,type git_icon_name} from "./git_icons";
import {create_workspace_lifetime} from "./workspace_lifetime";
import xterm_css from "@xterm/xterm/css/xterm.css";
import terminal_css from "./terminal_workspace.css";
import {administrator_launch} from "./terminal_runtime";
import {create_terminal_profile_service} from "./terminal_profile_detection";
import {workspace_button as button,workspace_element as el,workspace_dialog,workspace_menu,type workspace_menu_entry} from "./workspace_widgets";
import type {graph_host,graph_leaf} from "./git_graph_host";
import {observe_terminal_theme} from "./terminal_theme";
import {create_terminal_settings,terminal_defaults,terminal_setting_choices,type terminal_profile_config} from "./terminal_settings";
import {register_workspace_settings,notify_workspace_settings} from './workspace_settings_registry';
import {show_terminal_settings} from "./terminal_settings_view";
import {terminal_session} from "./terminal_session";
import {terminal_surface} from "./terminal_surface";
import {create_terminal_layout} from "./terminal_layout";
import {bind_terminal_tab_drag} from "./terminal_tab_drag";
import {create_terminal_panel} from "./terminal_panel";
import {read_remote_ssh_settings} from './remote_ssh_settings';
import {current_remote_workspace,require_remote_terminal_context} from './remote_workspace_context';

const TERMINAL_TYPE="linux_note.terminal";
const icons:git_icon_name[]=["terminal","git-branch","folder","file","book","symbol-method"];
type session_entry={session:terminal_session;surface:terminal_surface;location:"panel"|"editor";leaf?:graph_leaf;moving:boolean};

/** Domain coordinator: commands, menus and shortcuts only call the session operations here. */
export function bind_terminal_workspace(host:graph_host){
  const lifetime=create_workspace_lifetime(),core=host.core;
  try{
  const runtime=window as unknown as{reqnode(name:string):any;_options:{userDataPath:string}};
  const style=acquire_workspace_style("typora-code-style:terminal_workspace",xterm_css+"\n"+terminal_css,{"data-workspace-terminal-style":"ready"});lifetime.add(style.remove);
  const profile_service=lifetime.own(create_terminal_profile_service({process_api:host.process_api,path_api:host.path_api,fs:host.fs,child_process:runtime.reqnode("child_process")}));
  const settings=lifetime.own(create_terminal_settings(localStorage,profile_service));
  const setting_titles:Record<string,string>={profile:workspace_text("terminal_workspace_default_shell_configuration"),profiles:workspace_text("terminal_workspace_custom_shell_configuration_json"),cwd:workspace_text("terminal_settings_view_default_workspace_directory"),env:workspace_text("terminal_settings_view_environment_variables_json"),font_family:workspace_text("terminal_settings_view_font_family"),font_size:workspace_text("terminal_settings_view_font_size"),font_weight:workspace_text("terminal_settings_view_weight"),line_height:workspace_text("terminal_settings_view_line_height_multiplier"),letter_spacing:workspace_text("terminal_settings_view_character_spacing"),cursor_style:workspace_text("terminal_settings_view_cursor_style"),cursor_blink:workspace_text("terminal_settings_view_cursor_blinking"),cursor_width:workspace_text("terminal_settings_view_cursor_width"),scrollback:workspace_text("terminal_settings_view_scroll_buffer_lines"),smooth_scrolling:workspace_text("terminal_settings_view_smooth_scrolling"),scroll_sensitivity:workspace_text("terminal_settings_view_wheel_speed"),fast_scroll_sensitivity:workspace_text("terminal_workspace_alt_wheel_zoom_speed"),minimum_contrast:workspace_text("terminal_settings_view_minimum_contrast"),tab_stop_width:workspace_text("terminal_settings_view_tab_width"),right_click:workspace_text("terminal_settings_view_right_click_operations"),copy_on_selection:workspace_text("terminal_settings_view_select_and_copy"),confirm_multiline:workspace_text("terminal_settings_view_confirm_before_paste_multiple_lines"),tabs_location:workspace_text("terminal_settings_view_session_list_location"),tabs_hide:workspace_text("terminal_settings_view_auto_hide_session_list"),split_cwd:workspace_text("terminal_settings_view_split_workspace_directory"),location:workspace_text("terminal_settings_view_default_terminal_position")};
  lifetime.add(register_workspace_settings({id:'terminal',title:workspace_text("terminal_panel_terminal"),scope:()=> workspace_text("terminal_workspace_user_settings"),defaults:terminal_defaults,fields:Object.keys(terminal_defaults).map(key=>({key,title:setting_titles[key],choices:terminal_setting_choices[key as keyof typeof terminal_defaults],description:['profile','profiles','env','cwd'].includes(key)?workspace_text("terminal_workspace_changes_to_shell_environment_and_initial_directory_take_effe"):undefined})),read:settings.get,write:(key,value)=>settings.update({...settings.get(),[key]:value})}));
  lifetime.add(settings.subscribe(notify_workspace_settings));
  const sessions=new Map<string,session_entry>(),groups=new Map<string,HTMLElement>();let serial=0,group_serial=0,active_id="",render_frame=0;
  const panel=lifetime.own(create_terminal_panel(()=>{for(const entry of sessions.values())entry.surface.resize();}));
  const layout=lifetime.own(create_terminal_layout(panel.body,panel.tabs,()=>{for(const entry of sessions.values())entry.surface.resize();}));
  const tab_drag=lifetime.own(bind_terminal_tab_drag(panel.tabs,(source,target,after)=>{
    const entry=sessions.get(source),other=sessions.get(target);if(!entry||entry.location!=="panel"||(target&&(!other||other.location!=="panel")))return;
    const entries=ordered_panel_entries(),same_group=other?.session.group===entry.session.group;
    const moving=entries.filter(item=>same_group?item===entry:item.session.group===entry.session.group);
    if(other&&moving.includes(other))return;
    const remaining=entries.filter(item=>!moving.includes(item));let index=remaining.length;
    if(other){const indices=remaining.map((item,index)=>({item,index})).filter(value=>same_group?value.item===other:value.item.session.group===other.session.group);index=after?indices.at(-1)!.index+1:indices[0].index;}
    remaining.splice(index,0,...moving);const editors=[...sessions.values()].filter(item=>item.location!=="panel");sessions.clear();for(const item of [...remaining,...editors])sessions.set(item.session.id,item);render();
  },()=>{if(!lifetime.disposed)render();}));
  function ordered_panel_entries(){const entries=[...sessions.values()].filter(item=>item.location==="panel");return [...new Set(entries.map(item=>item.session.group))].flatMap(group=>entries.filter(item=>item.session.group===group));}
  const active=()=>sessions.get(active_id);
  lifetime.add(bind_terminal_state(core.app,()=>({active_id,location:active()?.location,panel_visible:panel.visible})));
  // Only retain the still open temporary interface; after closing, immediately release all owner references to avoid blocking the session and xterm buffer.
  const overlays=new Set<()=>void>();lifetime.add(()=>{for(const close of [...overlays])close();overlays.clear();});
  const dialog=(title:string)=>{const result=workspace_dialog(title,workspace_text("community_plugin_settings_close"),()=>overlays.delete(result.close));overlays.add(result.close);return result;};
  const fail=(error:unknown)=>{if(lifetime.disposed)return;dialog(workspace_text("terminal_panel_terminal")).content.textContent=String(error instanceof Error?error.message:error);};
  const configure=()=>{
    if(lifetime.disposed)return;const popup=dialog(workspace_text("terminal_workspace_terminal_settings"));popup.content.textContent=workspace_text("terminal_workspace_checking_installed_shell");
    void settings.ready().then(()=>{if(lifetime.disposed||!popup.root.isConnected)return;popup.content.replaceChildren();show_terminal_settings(settings,popup);})
      .catch(error=>{if(popup.root.isConnected&&!lifetime.disposed)popup.content.textContent=String(error instanceof Error?error.message:error);});
  };
  const menu=(event:MouseEvent,entries:workspace_menu_entry[],on_close=()=>{})=>{const close=workspace_menu(event,entries,"workspace-menu-compact",()=>{overlays.delete(close);on_close();});overlays.add(close);return close;};
  const at=(node:HTMLElement)=>{const rect=node.getBoundingClientRect();return new MouseEvent("contextmenu",{clientX:rect.left,clientY:rect.bottom});};
  const schedule=()=>{if(!render_frame&&!lifetime.disposed)render_frame=requestAnimationFrame(()=>{render_frame=0;render();});};
  const activate=(id:string,focus=true)=>{const entry=sessions.get(id);if(!entry||lifetime.disposed)return;active_id=id;
    if(entry.location==="panel")panel.show();else if(entry.leaf)core.app.workspace.activeLeaf=entry.leaf.parent.toggleTab(entry.leaf.state.path);
    render();if(focus)entry.surface.focus();};
  const kill=(id=active_id)=>{
    const entry=sessions.get(id);if(!entry)return;sessions.delete(id);entry.moving=true;entry.session.dispose();entry.surface.dispose();
    if(entry.leaf)entry.leaf.parent.removeTab?.(entry.leaf.state.path);
    if(active_id===id)active_id=[...sessions.keys()].at(-1)||"";render();
    if(![...sessions.values()].some(item=>item.location==="panel"))panel.hide();
  };
  const edit_identity=(kind:"title"|"color"|"icon",id=active_id)=>{
    const entry=sessions.get(id);if(!entry)return;const popup=dialog(kind==="title"?workspace_text("terminal_workspace_rename_terminal"):kind==="color"?workspace_text("terminal_workspace_change_terminal_color"):workspace_text("terminal_workspace_change_terminal_icon"));
    const input=kind==="icon"?el("select"):el("input");if(input instanceof HTMLInputElement){input.type=kind==="color"?"color":"text";input.value=entry.session[kind]||(kind==="color"?"#007ACC":"");}
    else{for(const name of icons){const option=el("option","",name);option.value=name;input.append(option);}input.value=entry.session.icon;}
    input.setAttribute("aria-label",popup.root.getAttribute("aria-label")||kind);popup.content.append(input);
    popup.footer.prepend(button(workspace_text("markdown_color_menu_apply"),()=>{if(sessions.get(id)!==entry)return;if(kind==="title"&&!input.value.trim())return;entry.session[kind]=input.value.trim();popup.close();render();}));
  };
  const move=(location:"panel"|"editor",id=active_id)=>{
    const entry=sessions.get(id);if(!entry||entry.location===location)return;entry.moving=true;
    if(entry.leaf){entry.leaf.parent.removeTab?.(entry.leaf.state.path);entry.leaf=undefined;}
    entry.location=location;entry.session.group="group_"+(++group_serial);
    if(location==="editor")attach_editor(entry);else panel.show();entry.moving=false;activate(id);
    if(![...sessions.values()].some(item=>item.location==="panel"))panel.hide();
  };
  const ssh_profile=(target:string,remote_path:string,port=0,name=''):terminal_profile_config=>{
    const api=load_workspace_service(runtime.reqnode, host.path_api.join(runtime._options.userDataPath,"typora_code","assets","remote","remote_ssh_service.cjs"));
    const executable=host.path_api.join(host.process_api.env.SystemRoot||"C:\\Windows","System32","OpenSSH","ssh.exe");
    const profile=api.remote_terminal_profile(target,remote_path,executable,{...read_remote_ssh_settings(),port});if(name)profile.title='SSH: '+name;return profile;
  };
  const open=(root:string,program="",location:"panel"|"editor"=settings.get().location,split_id="",explicit_cwd=false,resolve_cwd?:()=>Promise<string>,launch_profile?:terminal_profile_config,local=false)=>(async()=>{
    const epoch=workspace_context_epoch();if(lifetime.disposed||workspace_context_switching())return;
    const owner=require_remote_terminal_context();
    if(launch_profile?.remote&&(!owner||owner.target!==launch_profile.remote.target||(owner.port||0)!==(launch_profile.remote.port||0)))throw Error(workspace_text("terminal_workspace_please_switch_to_this_ssh_workspace_first_then_open_the_term"));
    if(local&&!launch_profile?.remote&&owner)throw Error(workspace_text("terminal_workspace_please_open_the_local_folder_first_then_create_a_local_termi"));
    if(!launch_profile&&!local){const remote=require_remote_terminal_context();if(remote)launch_profile=ssh_profile(remote.target,explicit_cwd&&remote_files_for(root)?remote_files_for(root)!.remote_path(root):remote.remote_path,remote.port,remote.name);}
    // The native work directory is only for starting the OpenSSH process; the remote directory is owned by a fixed remote startup protocol.
    if(launch_profile?.remote){root=runtime._options.userDataPath;explicit_cwd=true;resolve_cwd=undefined;}
    // First establish a real session and display surface; the configuration detection is waited by the session startup phase.
    const profile=launch_profile||{id:program||settings.get().profile,title:workspace_text("terminal_panel_terminal"),executable:"",args:[]};
    const id="terminal_"+(++serial);let entry:session_entry;
    const session=new terminal_session(id,root,profile,host,settings,(data,done)=>surface.term.write(data,done),()=>{if(entry){surface.container.dataset.cwd=session.root;surface.container.dataset.pid=String(session.pid);surface.set_status(session.state,session.status,session.launch_pending);schedule();}},explicit_cwd,resolve_cwd,()=>!lifetime.disposed&&!workspace_context_switching()&&epoch===workspace_context_epoch(),launch_profile);
    const windows_pty=host.process_api.platform==="win32"?{backend:"conpty" as const,buildNumber:Number(runtime.reqnode("os").release().split(".")[2])}:undefined;
    const surface=new terminal_surface(settings.get(),{input:data=>session.write(data),resize:(cols,rows)=>session.resize(cols,rows),copy:host.copy,error:fail,active:()=>{if(active_id!==id)activate(id,false);}},windows_pty);
    entry={session,surface,location,moving:false};sessions.set(id,entry);surface.container.dataset.session=id;active_id=id;
    if(split_id&&sessions.get(split_id)?.location==="panel")session.group=sessions.get(split_id)!.session.group;
    surface.container.oncontextmenu=event=>{const config=settings.get();if(!event.shiftKey&&config.right_click!=="menu"){event.preventDefault();if(config.right_click==="copy_paste"&&surface.term.hasSelection())void host.copy(surface.term.getSelection()).catch(fail);else void surface.paste();return;}menu(event,session_menu(id));};
    if(location==="editor")attach_editor(entry);else panel.show();render();surface.mount();surface.focus();void session.start();return entry;
  })().catch(fail);
  const split=(id=active_id)=>{const entry=sessions.get(id);if(!entry)return;const root=settings.get().split_cwd==="workspace"?host.workspace_path():entry.session.root;
    if(entry.location==="editor")move("panel",id);open(root,entry.session.profile.id,"panel",id,true,undefined,entry.session.launch_profile,true);};
  const join=(target:string,id=active_id)=>{const entry=sessions.get(id),other=sessions.get(target);if(!entry||!other||entry===other)return;if(entry.location!=="panel")move("panel",id);entry.session.group=other.session.group;activate(id);};
  const detach=(id=active_id)=>{const entry=sessions.get(id);if(entry){entry.session.group="group_"+(++group_serial);activate(id);}};
  const admin=(root:string)=>{if(lifetime.disposed)return;try{if(current_remote_workspace())throw Error(workspace_text("terminal_workspace_the_ssh_workspace_cannot_start_a_local_administrator_termina"));const launch=administrator_launch(root,host.process_api,host.path_api);runtime.reqnode("child_process").execFile(launch.executable,launch.args,{cwd:root,windowsHide:true,shell:false},(error:Error|null)=>{if(error)fail(workspace_text("terminal_workspace_administrator_terminal_not_started_uac_may_have_been_cancele")+error.message);});}catch(error){fail(error);}};
  function session_menu(id:string):workspace_menu_entry[]{
    const entry=sessions.get(id);if(!entry)return[];const {session,surface}=entry;
    const join_targets=[...sessions.values()].filter(item=>item!==entry&&item.location==="panel"&&item.session.group!==session.group);
    return [
      {id:"terminal_copy",title:workspace_text("monaco_text_input_copy"),shortcut:"Ctrl+Shift+C",disabled:!surface.term.hasSelection(),action:()=>void host.copy(surface.term.getSelection()).catch(fail)},
      {id:"terminal_paste",title:workspace_text("git_diff_editor_paste"),shortcut:"Ctrl+Shift+V",action:()=>void surface.paste()},
      {title:workspace_text("monaco_text_input_select_all"),action:()=>surface.term.selectAll()},{id:"terminal_find",title:workspace_text("terminal_surface_find"),shortcut:"Ctrl+Shift+F",action:()=>surface.find()},
      {title:workspace_text("terminal_workspace_clear_screen"),action:()=>surface.term.clear()},
      {title:workspace_text("terminal_workspace_split_terminal"),separator:true,action:()=>split(id)},
      {title:workspace_text("terminal_workspace_cancel_split"),disabled:![...sessions.values()].some(item=>item!==entry&&item.session.group===session.group),action:()=>detach(id)},
      {title:workspace_text("terminal_workspace_merge_to"),disabled:join_targets.length===0,children:join_targets.map(item=>({title:item.session.title,action:()=>join(item.session.id,id)})),action:()=>{}},
      {title:entry.location==="panel"?workspace_text("terminal_workspace_move_to_editor_area"):workspace_text("terminal_workspace_move_to_panel"),action:()=>move(entry.location==="panel"?"editor":"panel",id)},
      {title:workspace_text("terminal_workspace_rename"),separator:true,action:()=>edit_identity("title",id)},{title:workspace_text("terminal_workspace_change_color"),action:()=>edit_identity("color",id)},{title:workspace_text("terminal_workspace_change_icon"),action:()=>edit_identity("icon",id)},
      {title:workspace_text("terminal_workspace_copy_initial_working_directory"),action:()=>void host.copy(session.launch_profile?.remote?.remote_path||session.root).catch(fail)},
      {id:"terminal_admin",title:workspace_text("terminal_workspace_open_terminal_as_administrator_uac"),disabled:host.process_api.platform!=="win32"||Boolean(session.launch_profile?.remote),action:()=>admin(session.root)},
      {id:"terminal_restart",title:workspace_text("terminal_workspace_restart_terminal"),separator:true,action:()=>void session.start()},
      {id:"terminal_kill",title:workspace_text("terminal_workspace_terminate_terminal"),action:()=>kill(id)},
      {title:workspace_text("terminal_workspace_terminal_settings_e950837d"),separator:true,action:configure},
    ];
  }
  function render(){
    if(lifetime.disposed||tab_drag.active)return;
    const config=settings.get(),entries=ordered_panel_entries();
    const group_ids=new Set(entries.map(item=>item.session.group)),active_group=active()?.location==="panel"?active()!.session.group:entries[0]?.session.group;
    panel.body.dataset.tabsLocation=config.tabs_location;
    panel.tabs.hidden=config.tabs_hide==="single_terminal"?entries.length<2:config.tabs_hide==="single_group"?group_ids.size<2:false;
    const panel_active=entries.find(item=>item.session.id===active_id)||entries[0];
    panel.tabs.replaceChildren();panel.title.textContent=panel.tabs.hidden&&panel_active?workspace_text("terminal_workspace_terminal")+panel_active.session.title:workspace_text("terminal_panel_terminal");
    for(const [id,node]of groups)if(!group_ids.has(id)){node.remove();groups.delete(id);}
    for(const entry of entries){
      const {session,surface}=entry;let group=groups.get(session.group);
      if(!group){group=el("div","terminal-split-group");groups.set(session.group,group);panel.panes.append(group);}group.hidden=session.group!==active_group;
      const position=entries.filter(item=>item.session.group===session.group).indexOf(entry),existing=[...group.children].filter(node=>node.matches(".linux-note-terminal"))[position];
      if(existing!==surface.container)group.insertBefore(surface.container,existing||null);surface.mount();
      const row=el("div","terminal-tab");row.setAttribute("role","tab");row.tabIndex=session.id===active_id?0:-1;row.setAttribute("aria-selected",String(session.id===active_id));row.dataset.session=session.id;row.draggable=true;
      row.title=`${session.title}\n${session.launch_profile?.remote?.remote_path||session.root}\n${session.state}${session.pid?" · PID "+session.pid:""}`;
      const icon=git_icon(icons.includes(session.icon as git_icon_name)?session.icon as git_icon_name:"terminal");if(session.color)icon.style.color=session.color;
      row.append(icon,el("span","terminal-tab-label",session.title),el("span","terminal-tab-state",session.state==="running"?"":session.state==="starting"?"…":session.state==="error"?"!":"○"),git_icon_button("split-horizontal",workspace_text("terminal_workspace_split_terminal"),()=>split(session.id)),git_icon_button("trash",workspace_text("terminal_workspace_terminate_terminal"),()=>kill(session.id)));
      row.onclick=event=>{if(!(event.target as Element).closest("button"))activate(session.id);};row.oncontextmenu=event=>menu(event,session_menu(session.id));row.ondblclick=()=>edit_identity("title",session.id);
      row.onkeydown=event=>{if(event.key==="Delete"){event.preventDefault();kill(session.id);}else if(event.key==="F2")edit_identity("title",session.id);else if(["ArrowDown","ArrowUp","Enter"].includes(event.key)){event.preventDefault();const index=entries.indexOf(entry);activate(event.key==="Enter"?session.id:entries[(index+(event.key==="ArrowDown"?1:entries.length-1))%entries.length].session.id);panel.tabs.querySelector<HTMLElement>(`[data-session="${active_id}"]`)?.focus();}};
      panel.tabs.append(row);
    }
    layout.update(groups);
    for(const entry of sessions.values())if(entry.leaf){const label=entry.leaf.parent.tabHeader?.getTabById(entry.leaf.state.path)?.querySelector(".typ-file-basename");if(label)label.textContent=entry.session.title;}
  }
  class terminal_editor_view extends core.WorkspaceView{
    containerEl=el("section","terminal-editor-host");icon="fa-terminal";entry?:session_entry;close_timer=0;
    constructor(leaf:graph_leaf){super(leaf);const id=leaf.state.path.split("/")[3];this.entry=sessions.get(id);if(this.entry)this.entry.leaf=leaf;}
    onOpen(){const entry=this.entry;if(!entry||!sessions.has(entry.session.id)){this.containerEl.textContent=workspace_text("terminal_workspace_this_terminal_session_has_ended");return;}clearTimeout(this.close_timer);this.containerEl.append(entry.surface.container);entry.surface.mount();active_id=entry.session.id;entry.surface.focus();}
    onClose(){const entry=this.entry;if(!entry||entry.moving)return;this.close_timer=window.setTimeout(()=>{if(lifetime.disposed||entry.moving||entry.leaf!==this.leaf)return;let exists=false;core.app.workspace.eachLeaves(leaf=>{if(leaf===this.leaf)exists=true;});if(!exists)kill(entry.session.id);},0);}
  }
  function attach_editor(entry:session_entry){const parent=core.app.workspace.activeLeaf?.parent;if(!parent){entry.location="panel";panel.show();return;}const leaf=core.app.workspace.createLeaf({type:TERMINAL_TYPE,state:{path:`typ://${TERMINAL_TYPE}/${entry.session.id}/Terminal`,git_cwd:entry.session.root}});entry.leaf=leaf;parent.appendChild(leaf);core.app.workspace.activeLeaf=leaf;}
  // Normal new follows the unified workspace root; only when a file is explicitly passed in, query Git.
  const resolve_root=async(path?:string)=>{let cwd=path||host.workspace_path();if(!host.fs.statSync(cwd).isDirectory())cwd=host.path_api.dirname(cwd);if(!path)return cwd;try{return(await host.runner({git_path:"git"} as Parameters<graph_host["runner"]>[0]).run(cwd,["rev-parse","--show-toplevel"])).trim();}catch{return cwd;}};
  const launch=(admin_mode=false,path?:string)=>{
    if(!admin_mode){void open(host.workspace_path(),"",settings.get().location,"",false,()=>resolve_root(path));return;}
    if(current_remote_workspace()){fail(workspace_text("terminal_workspace_the_current_selection_is_ssh_host_administrator_terminal_is"));return;}
    const epoch=workspace_context_epoch();void resolve_root(path).then(root=>{if(!lifetime.disposed&&!workspace_context_switching()&&epoch===workspace_context_epoch())admin(root);}).catch(fail);
  };
  const toggle=()=>{
    const remote=current_remote_workspace();
    const matches=(entry:session_entry)=>entry.location==='panel'&&(remote?entry.session.launch_profile?.remote?.target===remote.target&&(entry.session.launch_profile.remote.port||0)===(remote.port||0):!entry.session.launch_profile?.remote);
    if(panel.visible&&active()&&matches(active()!)){panel.hide();return;}
    // On reopening, prioritize restoring the just hidden active session, without jumping back to the first item or rebuilding the unchanged list.
    const current=active();if(current&&matches(current)){panel.show();current.surface.resize();current.surface.focus();return;}
    const entry=[...sessions.values()].find(matches);if(entry)activate(entry.session.id);else launch();
  };
  const profile_menu=(event:MouseEvent,refresh=false)=>{
    let closed=false;const close=menu(event,[{title:workspace_text("terminal_workspace_checking_installed_shell"),disabled:true,action:()=>{}}],()=>{closed=true;});
    void (refresh?settings.refresh():settings.ready()).then(async()=>{
      const connections=await saved_ssh_connections();if(closed||lifetime.disposed)return;close();const profiles=settings.profiles();
      const remote=current_remote_workspace();
      menu(event,[...(remote?[{id:'terminal_profile_remote',title:'SSH: '+remote.target,action:()=>launch()}]:[]),...connections.map(record=>({id:'terminal_ssh_'+record.id,title:'SSH: '+record.host_name+' / '+record.name,action:()=>core.app.commands.run('typora_code:remote_ssh_connect',[record.id])})),...(remote?[{id:'terminal_open_local_folder',title:workspace_text("remote_workspace_picker_open_local_folder"),action:()=>core.app.commands.run('linux_note:open_local_folder')}]:profiles.map(profile=>({id:'terminal_profile_'+profile.id,title:profile.title,action:()=>{void open(host.workspace_path(),profile.id,settings.get().location,'',false,undefined,undefined,true);}}))),
        ...(!profiles.length?[{title:workspace_text("terminal_workspace_no_available_shell_found"),disabled:true,action:()=>{}}]:[]),
        ...settings.warnings().map(title=>({title,disabled:true,action:()=>{}})),
        {title:workspace_text("terminal_settings_view_re_detect_terminal"),separator:true,action:()=>profile_menu(event,true)},
        {title:workspace_text("terminal_workspace_select_default_configuration"),separator:true,action:configure},{title:workspace_text("terminal_workspace_configure_terminal"),action:configure}]);
    }).catch(error=>{if(!closed&&!lifetime.disposed){close();fail(error);}});
  };
  const action=(icon:git_icon_name,title:string,callback:(node:HTMLButtonElement)=>void)=>{const node=git_icon_button(icon,title,()=>callback(node));panel.toolbar.append(node);return node;};
  action("add",workspace_text("terminal_workspace_new_terminal_ctrl_shift"),()=>launch());action("chevron-down",workspace_text("terminal_workspace_select_terminal_configuration"),node=>profile_menu(at(node)));
  action("split-horizontal",workspace_text("terminal_workspace_split_terminal"),()=>split());action("trash",workspace_text("terminal_workspace_terminate_terminal"),()=>kill());
  action("more",workspace_text("terminal_workspace_more_terminal_operations"),node=>menu(at(node),active()?session_menu(active_id):[{title:workspace_text("terminal_workspace_terminal_settings_e950837d"),action:configure}]));
  action("screen-full",workspace_text("terminal_workspace_maximize_minimize_panel"),node=>{panel.maximize();node.replaceChildren(git_icon(panel.maximized?"screen-normal":"screen-full"));});
  action("close",workspace_text("terminal_workspace_hide_panel_keep_process"),()=>panel.hide());
  lifetime.add(core.app.viewManager.registerView(TERMINAL_TYPE,leaf=>new terminal_editor_view(leaf)));
  const commands:[string,string,()=>void][]=[
    ["terminal",workspace_text("terminal_workspace_terminal_new_terminal"),()=>launch()],["terminal_toggle",workspace_text("terminal_workspace_terminal_switch_panel"),toggle],["terminal_admin",workspace_text("terminal_workspace_terminal_admin_terminal"),()=>launch(true)],
    ["terminal_settings",workspace_text("terminal_workspace_terminal_settings_daa84bab"),configure],["terminal_split",workspace_text("terminal_workspace_terminal_split"),()=>split()],["terminal_kill",workspace_text("terminal_workspace_terminal_terminate"),()=>kill()],
    ["terminal_restart",workspace_text("terminal_workspace_terminal_restart"),()=>{void active()?.session.start();}],["terminal_find",workspace_text("terminal_workspace_terminal_find"),()=>active()?.surface.find()],
    ["terminal_clear",workspace_text("terminal_workspace_terminal_clear_screen"),()=>active()?.surface.term.clear()],["terminal_rename",workspace_text("terminal_workspace_terminal_rename"),()=>edit_identity("title")],
    ["terminal_move_editor",workspace_text("terminal_workspace_terminal_move_to_editor"),()=>move("editor")],["terminal_move_panel",workspace_text("terminal_workspace_terminal_move_to_panel"),()=>move("panel")],
  ];
  for(const[id,title,callback]of commands)lifetime.add(core.app.commands.register({id:"linux_note:"+id,title,scope:"global",callback}));
  lifetime.add(core.app.workspace.ribbon.addButton({id:"linux_note:terminal",title:workspace_text("terminal_workspace_terminal_ctrl"),group:"bottom",icon:git_icon("terminal"),onclick:toggle}));
  lifetime.add(core.app.workspace.on("file-menu",({menu:popup,path:file_path})=>{
    popup.containerEl.querySelectorAll("[data-terminal-launch]").forEach((node:Element)=>node.remove());
    for(const[title,admin_mode]of[[workspace_text("terminal_workspace_open_integrated_terminal_in_repository_root_directory"),false],[workspace_text("terminal_workspace_open_repository_terminal_as_administrator_uac"),true]] as const){
      if(admin_mode&&host.process_api.platform!=="win32")continue;
      const item=el("li");item.dataset.terminalLaunch="true";item.append(el("a","",title));
      for(const name of["pointerdown","mousedown","mouseup"])item.addEventListener(name,event=>{event.preventDefault();event.stopImmediatePropagation();});
      item.onclick=event=>{event.preventDefault();event.stopImmediatePropagation();popup.containerEl.style.display="none";launch(admin_mode,file_path);};popup.containerEl.append(item);
    }
  }));
  lifetime.listen(window,"linux-note-open-terminal",((event:CustomEvent<{path?:string;cwd?:string;admin?:boolean}>)=>{if(event.detail.cwd)open(event.detail.cwd,"",settings.get().location,"",true);else launch(Boolean(event.detail.admin),event.detail.path);}) as EventListener);
  lifetime.listen(window,"linux-note-open-ssh-terminal",((event:CustomEvent<{target:string;remote_path:string;port?:number;name?:string}>)=>{
    try{const profile=ssh_profile(event.detail.target,event.detail.remote_path,event.detail.port,event.detail.name);
      void open(host.workspace_path(),"","panel","",true,undefined,profile);
    }catch(error){fail(error);}
  }) as EventListener);
  lifetime.listen(window,"keydown",((event:KeyboardEvent)=>{
    if(is_composing_key(event)||document.querySelector('[role="dialog"][aria-modal="true"]'))return;
    if(event.code==="Backquote"&&(event.shiftKey?workspace_alt_modifier(event):event.ctrlKey&&!event.altKey&&!event.metaKey)){event.preventDefault();event.stopImmediatePropagation();event.shiftKey?launch():toggle();}
    else if(event.ctrlKey&&!event.altKey&&!event.metaKey&&event.shiftKey&&event.code==="Digit5"&&event.target instanceof Element&&event.target.closest(".linux-note-terminal")){event.preventDefault();event.stopImmediatePropagation();split();}
  }) as EventListener,true);
  let configured_font_size=settings.get().font_size;
  lifetime.add(settings.subscribe(config=>{if(config.font_size!==configured_font_size){configured_font_size=config.font_size;reset_content_font("terminal");}for(const entry of sessions.values())entry.surface.apply_settings(config);render();}));
  lifetime.add(observe_terminal_theme(theme=>{for(const entry of sessions.values())entry.surface.term.options.theme=theme;}));
  lifetime.add(()=>{cancelAnimationFrame(render_frame);for(const id of [...sessions.keys()])kill(id);document.documentElement.removeAttribute("data-linux-note-terminal");document.documentElement.removeAttribute("data-linux-note-terminal-theme");});
  lifetime.listen(window,"unload",lifetime.dispose);
  lifetime.listen(window,"linux-note-workspace-context-changed",()=>{for(const close of [...overlays])close();for(const id of [...sessions.keys()])kill(id);});
  document.documentElement.setAttribute("data-linux-note-terminal","ready");document.documentElement.setAttribute("data-linux-note-terminal-theme","ready");
  return {open,admin,toggle,dispose:lifetime.dispose};
  }catch(error){lifetime.dispose();throw error;}
}
