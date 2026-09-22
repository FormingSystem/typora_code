import {workspace_context_epoch,workspace_context_switching} from "./workspace_context";
import {is_composing_key} from "./workspace_keyboard";
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

const TERMINAL_TYPE="linux_note.terminal";
const icons:git_icon_name[]=["terminal","git-branch","folder","file","book","symbol-method"];
type session_entry={session:terminal_session;surface:terminal_surface;location:"panel"|"editor";leaf?:graph_leaf;moving:boolean};

/** 领域协调器：命令、菜单和快捷键只调用这里的会话操作。 */
export function bind_terminal_workspace(host:graph_host){
  const lifetime=create_workspace_lifetime(),core=host.core;
  try{
  const runtime=window as unknown as{reqnode(name:string):any;_options:{userDataPath:string}};
  const style=acquire_workspace_style("typora-code-style:terminal_workspace",xterm_css+"\n"+terminal_css,{"data-workspace-terminal-style":"ready"});lifetime.add(style.remove);
  const profile_service=lifetime.own(create_terminal_profile_service({process_api:host.process_api,path_api:host.path_api,fs:host.fs,child_process:runtime.reqnode("child_process")}));
  const settings=lifetime.own(create_terminal_settings(localStorage,profile_service));
  const setting_titles:Record<string,string>={profile:'默认Shell配置',profiles:'自定义Shell配置（JSON）',cwd:'默认工作目录',env:'环境变量（JSON）',font_family:'字体系列',font_size:'字体大小',font_weight:'字重',line_height:'行高倍数',letter_spacing:'字符间距',cursor_style:'光标样式',cursor_blink:'光标闪烁',cursor_width:'光标宽度',scrollback:'滚动缓冲行数',smooth_scrolling:'平滑滚动',scroll_sensitivity:'滚轮速度',fast_scroll_sensitivity:'Alt滚轮倍速',minimum_contrast:'最小对比度',tab_stop_width:'制表符宽度',right_click:'右键操作',copy_on_selection:'选中即复制',confirm_multiline:'粘贴多行前确认',tabs_location:'会话列表位置',tabs_hide:'自动隐藏会话列表',split_cwd:'拆分后的工作目录',location:'默认终端位置'};
  lifetime.add(register_workspace_settings({id:'terminal',title:'终端',scope:()=> '用户设置',defaults:terminal_defaults,fields:Object.keys(terminal_defaults).map(key=>({key,title:setting_titles[key],choices:terminal_setting_choices[key as keyof typeof terminal_defaults],description:['profile','profiles','env','cwd'].includes(key)?'Shell、环境与初始目录的变更在新建或重启会话时生效。':undefined})),read:settings.get,write:(key,value)=>settings.update({...settings.get(),[key]:value})}));
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
  // 只保留仍打开的临时界面；关闭后立即解除所有者引用，避免挂住会话与xterm缓冲。
  const overlays=new Set<()=>void>();lifetime.add(()=>{for(const close of [...overlays])close();overlays.clear();});
  const dialog=(title:string)=>{const result=workspace_dialog(title,"关闭",()=>overlays.delete(result.close));overlays.add(result.close);return result;};
  const fail=(error:unknown)=>{if(lifetime.disposed)return;dialog("终端").content.textContent=String(error instanceof Error?error.message:error);};
  const configure=()=>{
    if(lifetime.disposed)return;const popup=dialog("终端设置");popup.content.textContent="正在检测已安装的 Shell…";
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
    const entry=sessions.get(id);if(!entry)return;const popup=dialog(kind==="title"?"重命名终端":kind==="color"?"更改终端颜色":"更改终端图标");
    const input=kind==="icon"?el("select"):el("input");if(input instanceof HTMLInputElement){input.type=kind==="color"?"color":"text";input.value=entry.session[kind]||(kind==="color"?"#007ACC":"");}
    else{for(const name of icons){const option=el("option","",name);option.value=name;input.append(option);}input.value=entry.session.icon;}
    input.setAttribute("aria-label",popup.root.getAttribute("aria-label")||kind);popup.content.append(input);
    popup.footer.prepend(button("应用",()=>{if(sessions.get(id)!==entry)return;if(kind==="title"&&!input.value.trim())return;entry.session[kind]=input.value.trim();popup.close();render();}));
  };
  const move=(location:"panel"|"editor",id=active_id)=>{
    const entry=sessions.get(id);if(!entry||entry.location===location)return;entry.moving=true;
    if(entry.leaf){entry.leaf.parent.removeTab?.(entry.leaf.state.path);entry.leaf=undefined;}
    entry.location=location;entry.session.group="group_"+(++group_serial);
    if(location==="editor")attach_editor(entry);else panel.show();entry.moving=false;activate(id);
    if(![...sessions.values()].some(item=>item.location==="panel"))panel.hide();
  };
  const open=(root:string,program="",location:"panel"|"editor"=settings.get().location,split_id="",explicit_cwd=false,resolve_cwd?:()=>Promise<string>,launch_profile?:terminal_profile_config)=>(async()=>{
    const epoch=workspace_context_epoch();if(lifetime.disposed||workspace_context_switching())return;
    // 先建立真实会话与显示表面；配置探测由会话启动阶段等待。
    const profile=launch_profile||{id:program||settings.get().profile,title:"终端",executable:"",args:[]};
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
    if(entry.location==="editor")move("panel",id);open(root,entry.session.profile.id,"panel",id,true,undefined,entry.session.launch_profile);};
  const join=(target:string,id=active_id)=>{const entry=sessions.get(id),other=sessions.get(target);if(!entry||!other||entry===other)return;if(entry.location!=="panel")move("panel",id);entry.session.group=other.session.group;activate(id);};
  const detach=(id=active_id)=>{const entry=sessions.get(id);if(entry){entry.session.group="group_"+(++group_serial);activate(id);}};
  const admin=(root:string)=>{if(lifetime.disposed)return;try{const launch=administrator_launch(root,host.process_api,host.path_api);runtime.reqnode("child_process").execFile(launch.executable,launch.args,{cwd:root,windowsHide:true,shell:false},(error:Error|null)=>{if(error)fail("管理员终端未启动（UAC 可能已取消）："+error.message);});}catch(error){fail(error);}};
  function session_menu(id:string):workspace_menu_entry[]{
    const entry=sessions.get(id);if(!entry)return[];const {session,surface}=entry;
    const join_targets=[...sessions.values()].filter(item=>item!==entry&&item.location==="panel"&&item.session.group!==session.group);
    return [
      {id:"terminal_copy",title:"复制",shortcut:"Ctrl+Shift+C",disabled:!surface.term.hasSelection(),action:()=>void host.copy(surface.term.getSelection()).catch(fail)},
      {id:"terminal_paste",title:"粘贴",shortcut:"Ctrl+Shift+V",action:()=>void surface.paste()},
      {title:"全选",action:()=>surface.term.selectAll()},{id:"terminal_find",title:"查找",shortcut:"Ctrl+Shift+F",action:()=>surface.find()},
      {title:"清屏",action:()=>surface.term.clear()},
      {title:"拆分终端",separator:true,action:()=>split(id)},
      {title:"取消拆分",disabled:![...sessions.values()].some(item=>item!==entry&&item.session.group===session.group),action:()=>detach(id)},
      {title:"合并到…",disabled:join_targets.length===0,children:join_targets.map(item=>({title:item.session.title,action:()=>join(item.session.id,id)})),action:()=>{}},
      {title:entry.location==="panel"?"移动到编辑器区域":"移动到面板",action:()=>move(entry.location==="panel"?"editor":"panel",id)},
      {title:"重命名…",separator:true,action:()=>edit_identity("title",id)},{title:"更改颜色…",action:()=>edit_identity("color",id)},{title:"更改图标…",action:()=>edit_identity("icon",id)},
      {title:"复制初始工作目录",action:()=>void host.copy(session.root).catch(fail)},
      {id:"terminal_admin",title:"以管理员身份打开终端（UAC）",disabled:host.process_api.platform!=="win32",action:()=>admin(session.root)},
      {id:"terminal_restart",title:"重启终端",separator:true,action:()=>void session.start()},
      {id:"terminal_kill",title:"终止终端",action:()=>kill(id)},
      {title:"终端设置…",separator:true,action:configure},
    ];
  }
  function render(){
    if(lifetime.disposed||tab_drag.active)return;
    const config=settings.get(),entries=ordered_panel_entries();
    const group_ids=new Set(entries.map(item=>item.session.group)),active_group=active()?.location==="panel"?active()!.session.group:entries[0]?.session.group;
    panel.body.dataset.tabsLocation=config.tabs_location;
    panel.tabs.hidden=config.tabs_hide==="single_terminal"?entries.length<2:config.tabs_hide==="single_group"?group_ids.size<2:false;
    const panel_active=entries.find(item=>item.session.id===active_id)||entries[0];
    panel.tabs.replaceChildren();panel.title.textContent=panel.tabs.hidden&&panel_active?"终端 · "+panel_active.session.title:"终端";
    for(const [id,node]of groups)if(!group_ids.has(id)){node.remove();groups.delete(id);}
    for(const entry of entries){
      const {session,surface}=entry;let group=groups.get(session.group);
      if(!group){group=el("div","terminal-split-group");groups.set(session.group,group);panel.panes.append(group);}group.hidden=session.group!==active_group;
      const position=entries.filter(item=>item.session.group===session.group).indexOf(entry),existing=[...group.children].filter(node=>node.matches(".linux-note-terminal"))[position];
      if(existing!==surface.container)group.insertBefore(surface.container,existing||null);surface.mount();
      const row=el("div","terminal-tab");row.setAttribute("role","tab");row.tabIndex=session.id===active_id?0:-1;row.setAttribute("aria-selected",String(session.id===active_id));row.dataset.session=session.id;row.draggable=true;
      row.title=`${session.title}\n${session.root}\n${session.state}${session.pid?" · PID "+session.pid:""}`;
      const icon=git_icon(icons.includes(session.icon as git_icon_name)?session.icon as git_icon_name:"terminal");if(session.color)icon.style.color=session.color;
      row.append(icon,el("span","terminal-tab-label",session.title),el("span","terminal-tab-state",session.state==="running"?"":session.state==="starting"?"…":session.state==="error"?"!":"○"),git_icon_button("split-horizontal","拆分终端",()=>split(session.id)),git_icon_button("trash","终止终端",()=>kill(session.id)));
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
    onOpen(){const entry=this.entry;if(!entry||!sessions.has(entry.session.id)){this.containerEl.textContent="该终端会话已结束。";return;}clearTimeout(this.close_timer);this.containerEl.append(entry.surface.container);entry.surface.mount();active_id=entry.session.id;entry.surface.focus();}
    onClose(){const entry=this.entry;if(!entry||entry.moving)return;this.close_timer=window.setTimeout(()=>{if(lifetime.disposed||entry.moving||entry.leaf!==this.leaf)return;let exists=false;core.app.workspace.eachLeaves(leaf=>{if(leaf===this.leaf)exists=true;});if(!exists)kill(entry.session.id);},0);}
  }
  function attach_editor(entry:session_entry){const parent=core.app.workspace.activeLeaf?.parent;if(!parent){entry.location="panel";panel.show();return;}const leaf=core.app.workspace.createLeaf({type:TERMINAL_TYPE,state:{path:`typ://${TERMINAL_TYPE}/${entry.session.id}/Terminal`,git_cwd:entry.session.root}});entry.leaf=leaf;parent.appendChild(leaf);core.app.workspace.activeLeaf=leaf;}
  // 普通新建跟随统一工作区根；明确传入文件的仓库入口才查询 Git。
  const resolve_root=async(path?:string)=>{let cwd=path||host.workspace_path();if(!host.fs.statSync(cwd).isDirectory())cwd=host.path_api.dirname(cwd);if(!path)return cwd;try{return(await host.runner({git_path:"git"} as Parameters<graph_host["runner"]>[0]).run(cwd,["rev-parse","--show-toplevel"])).trim();}catch{return cwd;}};
  const launch=(admin_mode=false,path?:string)=>{
    if(!admin_mode){void open(host.workspace_path(),"",settings.get().location,"",false,()=>resolve_root(path));return;}
    const epoch=workspace_context_epoch();void resolve_root(path).then(root=>{if(!lifetime.disposed&&!workspace_context_switching()&&epoch===workspace_context_epoch())admin(root);}).catch(fail);
  };
  const toggle=()=>{if(panel.visible){panel.hide();return;}const entry=[...sessions.values()].find(item=>item.location==="panel");if(entry)activate(entry.session.id);else launch();};
  const profile_menu=(event:MouseEvent,refresh=false)=>{
    let closed=false;const close=menu(event,[{title:"正在检测已安装的 Shell…",disabled:true,action:()=>{}}],()=>{closed=true;});
    void (refresh?settings.refresh():settings.ready()).then(()=>{
      if(closed||lifetime.disposed)return;close();const profiles=settings.profiles();
      menu(event,[...profiles.map(profile=>({id:"terminal_profile_"+profile.id,title:profile.title,action:()=>{void open(host.workspace_path(),profile.id);}})),
        ...(!profiles.length?[{title:"未发现可用的 Shell",disabled:true,action:()=>{}}]:[]),
        ...settings.warnings().map(title=>({title,disabled:true,action:()=>{}})),
        {title:"重新检测终端",separator:true,action:()=>profile_menu(event,true)},
        {title:"选择默认配置…",separator:true,action:configure},{title:"配置终端…",action:configure}]);
    }).catch(error=>{if(!closed&&!lifetime.disposed){close();fail(error);}});
  };
  const action=(icon:git_icon_name,title:string,callback:(node:HTMLButtonElement)=>void)=>{const node=git_icon_button(icon,title,()=>callback(node));panel.toolbar.append(node);return node;};
  action("add","新建终端（Ctrl+Shift+`）",()=>launch());action("chevron-down","选择终端配置",node=>profile_menu(at(node)));
  action("split-horizontal","拆分终端",()=>split());action("trash","终止终端",()=>kill());
  action("more","更多终端操作",node=>menu(at(node),active()?session_menu(active_id):[{title:"终端设置…",action:configure}]));
  action("screen-full","最大化／还原面板",node=>{panel.maximize();node.replaceChildren(git_icon(panel.maximized?"screen-normal":"screen-full"));});
  action("close","隐藏面板（保留进程）",()=>panel.hide());
  lifetime.add(core.app.viewManager.registerView(TERMINAL_TYPE,leaf=>new terminal_editor_view(leaf)));
  const commands:[string,string,()=>void][]=[
    ["terminal","终端：新建终端",()=>launch()],["terminal_toggle","终端：切换面板",toggle],["terminal_admin","终端：管理员终端",()=>launch(true)],
    ["terminal_settings","终端：设置",configure],["terminal_split","终端：拆分",()=>split()],["terminal_kill","终端：终止",()=>kill()],
    ["terminal_restart","终端：重启",()=>{void active()?.session.start();}],["terminal_find","终端：查找",()=>active()?.surface.find()],
    ["terminal_clear","终端：清屏",()=>active()?.surface.term.clear()],["terminal_rename","终端：重命名",()=>edit_identity("title")],
    ["terminal_move_editor","终端：移到编辑器",()=>move("editor")],["terminal_move_panel","终端：移到面板",()=>move("panel")],
  ];
  for(const[id,title,callback]of commands)lifetime.add(core.app.commands.register({id:"linux_note:"+id,title,scope:"global",callback}));
  lifetime.add(core.app.workspace.ribbon.addButton({id:"linux_note:terminal",title:"终端（Ctrl+`）",group:"bottom",icon:git_icon("terminal"),onclick:toggle}));
  lifetime.add(core.app.workspace.on("file-menu",({menu:popup,path:file_path})=>{
    popup.containerEl.querySelectorAll("[data-terminal-launch]").forEach((node:Element)=>node.remove());
    for(const[title,admin_mode]of[["在所属仓库根目录打开集成终端",false],["以管理员身份打开仓库终端（UAC）",true]] as const){
      if(admin_mode&&host.process_api.platform!=="win32")continue;
      const item=el("li");item.dataset.terminalLaunch="true";item.append(el("a","",title));
      for(const name of["pointerdown","mousedown","mouseup"])item.addEventListener(name,event=>{event.preventDefault();event.stopImmediatePropagation();});
      item.onclick=event=>{event.preventDefault();event.stopImmediatePropagation();popup.containerEl.style.display="none";launch(admin_mode,file_path);};popup.containerEl.append(item);
    }
  }));
  lifetime.listen(window,"linux-note-open-terminal",((event:CustomEvent<{path?:string;cwd?:string;admin?:boolean}>)=>{if(event.detail.cwd)open(event.detail.cwd,"",settings.get().location,"",true);else launch(Boolean(event.detail.admin),event.detail.path);}) as EventListener);
  lifetime.listen(window,"linux-note-open-ssh-terminal",((event:CustomEvent<{target:string;remote_path:string}>)=>{
    try{const api=runtime.reqnode(host.path_api.join(runtime._options.userDataPath,"typora_code","assets","remote","remote_ssh_service.cjs"));
      const executable=host.path_api.join(host.process_api.env.SystemRoot||"C:\\Windows","System32","OpenSSH","ssh.exe");
      const profile=api.remote_terminal_profile(event.detail.target,event.detail.remote_path,executable,read_remote_ssh_settings());
      void open(host.workspace_path(),"","panel","",true,undefined,profile);
    }catch(error){fail(error);}
  }) as EventListener);
  lifetime.listen(window,"keydown",((event:KeyboardEvent)=>{
    if(is_composing_key(event)||!event.ctrlKey||event.altKey||event.metaKey||document.querySelector('[role="dialog"][aria-modal="true"]'))return;
    if(event.code==="Backquote"){event.preventDefault();event.stopImmediatePropagation();event.shiftKey?launch():toggle();}
    else if(event.shiftKey&&event.code==="Digit5"&&event.target instanceof Element&&event.target.closest(".linux-note-terminal")){event.preventDefault();event.stopImmediatePropagation();split();}
  }) as EventListener,true);
  lifetime.add(settings.subscribe(config=>{for(const entry of sessions.values())entry.surface.apply_settings(config);render();}));
  lifetime.add(observe_terminal_theme(theme=>{for(const entry of sessions.values())entry.surface.term.options.theme=theme;}));
  lifetime.add(()=>{cancelAnimationFrame(render_frame);for(const id of [...sessions.keys()])kill(id);document.documentElement.removeAttribute("data-linux-note-terminal");document.documentElement.removeAttribute("data-linux-note-terminal-theme");});
  lifetime.listen(window,"unload",lifetime.dispose);
  lifetime.listen(window,"linux-note-workspace-context-changed",()=>{for(const close of [...overlays])close();for(const id of [...sessions.keys()])kill(id);});
  document.documentElement.setAttribute("data-linux-note-terminal","ready");document.documentElement.setAttribute("data-linux-note-terminal-theme","ready");
  return {open,admin,toggle,dispose:lifetime.dispose};
  }catch(error){lifetime.dispose();throw error;}
}
