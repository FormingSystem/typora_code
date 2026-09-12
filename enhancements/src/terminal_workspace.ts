import {acquire_workspace_style} from "./workspace_styles";
import {git_icon,git_icon_button,type git_icon_name} from "./git_icons";
import {create_workspace_lifetime} from "./workspace_lifetime";
import xterm_css from "@xterm/xterm/css/xterm.css";
import terminal_css from "./terminal_workspace.css";
import {administrator_launch} from "./terminal_runtime";
import {workspace_button as button,workspace_element as el,workspace_dialog,workspace_menu,type workspace_menu_entry} from "./workspace_widgets";
import type {graph_host,graph_leaf} from "./git_graph_host";
import {observe_terminal_theme} from "./terminal_theme";
import {create_terminal_settings} from "./terminal_settings";
import {show_terminal_settings} from "./terminal_settings_view";
import {terminal_session} from "./terminal_session";
import {terminal_surface} from "./terminal_surface";
import {create_terminal_panel} from "./terminal_panel";

const TERMINAL_TYPE="linux_note.terminal";
const icons:git_icon_name[]=["terminal","git-branch","folder","file","book","symbol-method"];
type session_entry={session:terminal_session;surface:terminal_surface;location:"panel"|"editor";leaf?:graph_leaf;moving:boolean};

/** 领域协调器：命令、菜单和快捷键只调用这里的会话操作。 */
export function bind_terminal_workspace(host:graph_host){
  const lifetime=create_workspace_lifetime(),core=host.core;
  try{
  const runtime=window as unknown as{reqnode(name:string):any;_options:{userDataPath:string}};
  const style=acquire_workspace_style("typora-code-style:terminal_workspace",xterm_css+"\n"+terminal_css,{"data-workspace-terminal-style":"ready"});lifetime.add(style.remove);
  const settings=lifetime.own(create_terminal_settings(localStorage,host.process_api,host.path_api));
  const sessions=new Map<string,session_entry>(),groups=new Map<string,HTMLElement>();let serial=0,group_serial=0,active_id="",render_frame=0;
  const panel=lifetime.own(create_terminal_panel(()=>{for(const entry of sessions.values())entry.surface.resize();}));
  const active=()=>sessions.get(active_id);
  // 只保留仍打开的临时界面；关闭后立即解除所有者引用，避免挂住会话与xterm缓冲。
  const overlays=new Set<()=>void>();lifetime.add(()=>{for(const close of [...overlays])close();overlays.clear();});
  const dialog=(title:string)=>{const result=workspace_dialog(title,"关闭",()=>overlays.delete(result.close));overlays.add(result.close);return result;};
  const fail=(error:unknown)=>{if(lifetime.disposed)return;dialog("终端").content.textContent=String(error instanceof Error?error.message:error);};
  const configure=()=>{if(!lifetime.disposed)show_terminal_settings(settings,dialog("终端设置"));};
  const menu=(event:MouseEvent,entries:workspace_menu_entry[])=>{const close=workspace_menu(event,entries,"workspace-menu-compact",()=>overlays.delete(close));overlays.add(close);};
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
  const open=(root:string,program="",location:"panel"|"editor"=settings.get().location,split_id="",explicit_cwd=false)=>{
    if(lifetime.disposed)return;
    const profiles=settings.profiles(),profile=profiles.find(item=>item.id===(program||settings.get().profile))||(!program?profiles[0]:{id:program,title:program,executable:program,args:[]});
    const id="terminal_"+(++serial);let entry:session_entry;
    const session=new terminal_session(id,root,profile,host,settings,(data,done)=>surface.term.write(data,done),()=>{if(entry){surface.container.dataset.cwd=session.root;surface.container.dataset.pid=String(session.pid);surface.set_status(session.state,session.status);schedule();}},explicit_cwd);
    const surface=new terminal_surface(settings.get(),{input:data=>session.write(data),resize:(cols,rows)=>session.resize(cols,rows),copy:host.copy,error:fail,active:()=>{if(active_id!==id)activate(id,false);}});
    entry={session,surface,location,moving:false};sessions.set(id,entry);surface.container.dataset.session=id;active_id=id;
    if(split_id&&sessions.get(split_id)?.location==="panel")session.group=sessions.get(split_id)!.session.group;
    surface.container.oncontextmenu=event=>{const config=settings.get();if(!event.shiftKey&&config.right_click!=="menu"){event.preventDefault();if(config.right_click==="copy_paste"&&surface.term.hasSelection())void host.copy(surface.term.getSelection()).catch(fail);else void surface.paste();return;}menu(event,session_menu(id));};
    if(location==="editor")attach_editor(entry);else panel.show();render();surface.mount();surface.focus();void session.start();return entry;
  };
  const split=(id=active_id)=>{const entry=sessions.get(id);if(!entry)return;const root=settings.get().split_cwd==="workspace"?host.workspace_path():entry.session.root;
    if(entry.location==="editor")move("panel",id);open(root,entry.session.profile.id,"panel",id,true);};
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
    if(lifetime.disposed)return;
    const config=settings.get(),entries=[...sessions.values()].filter(item=>item.location==="panel");
    const group_ids=new Set(entries.map(item=>item.session.group)),active_group=active()?.location==="panel"?active()!.session.group:entries[0]?.session.group;
    panel.body.dataset.tabsLocation=config.tabs_location;
    panel.tabs.hidden=config.tabs_hide==="single_terminal"?entries.length<2:config.tabs_hide==="single_group"?group_ids.size<2:false;
    const panel_active=entries.find(item=>item.session.id===active_id)||entries[0];
    panel.tabs.replaceChildren();panel.title.textContent=panel.tabs.hidden&&panel_active?"终端 · "+panel_active.session.title:"终端";
    for(const [id,node]of groups)if(!group_ids.has(id)){node.remove();groups.delete(id);}
    for(const entry of entries){
      const {session,surface}=entry;let group=groups.get(session.group);
      if(!group){group=el("div","terminal-split-group");groups.set(session.group,group);panel.panes.append(group);}group.hidden=session.group!==active_group;
      if(surface.container.parentElement!==group)group.append(surface.container);surface.mount();
      const row=el("div","terminal-tab");row.setAttribute("role","tab");row.tabIndex=session.id===active_id?0:-1;row.setAttribute("aria-selected",String(session.id===active_id));row.dataset.session=session.id;
      row.title=`${session.title}\n${session.root}\n${session.state}${session.pid?" · PID "+session.pid:""}`;
      const icon=git_icon(icons.includes(session.icon as git_icon_name)?session.icon as git_icon_name:"terminal");if(session.color)icon.style.color=session.color;
      row.append(icon,el("span","terminal-tab-label",session.title),el("span","terminal-tab-state",session.state==="running"?"":session.state==="starting"?"…":session.state==="error"?"!":"○"),git_icon_button("split-horizontal","拆分终端",()=>split(session.id)),git_icon_button("trash","终止终端",()=>kill(session.id)));
      row.onclick=event=>{if(!(event.target as Element).closest("button"))activate(session.id);};row.oncontextmenu=event=>menu(event,session_menu(session.id));row.ondblclick=()=>edit_identity("title",session.id);
      row.onkeydown=event=>{if(event.key==="Delete"){event.preventDefault();kill(session.id);}else if(event.key==="F2")edit_identity("title",session.id);else if(["ArrowDown","ArrowUp","Enter"].includes(event.key)){event.preventDefault();const index=entries.indexOf(entry);activate(event.key==="Enter"?session.id:entries[(index+(event.key==="ArrowDown"?1:entries.length-1))%entries.length].session.id);panel.tabs.querySelector<HTMLElement>(`[data-session="${active_id}"]`)?.focus();}};
      panel.tabs.append(row);
    }
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
  const launch=(admin_mode=false,path?:string)=>{void resolve_root(path).then(root=>{if(!lifetime.disposed)admin_mode?admin(root):open(root);}).catch(fail);};
  const toggle=()=>{if(panel.visible){panel.hide();return;}const entry=[...sessions.values()].find(item=>item.location==="panel");if(entry)activate(entry.session.id);else launch();};
  const profile_menu=(event:MouseEvent)=>menu(event,[...settings.profiles().map(profile=>({title:profile.title,action:()=>open(host.workspace_path(),profile.id)})),{title:"选择默认配置…",separator:true,action:configure},{title:"配置终端…",action:configure}]);
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
  lifetime.listen(window,"keydown",((event:KeyboardEvent)=>{
    if(!event.ctrlKey||event.altKey||event.metaKey||event.isComposing||document.querySelector('[role="dialog"][aria-modal="true"]'))return;
    if(event.code==="Backquote"){event.preventDefault();event.stopImmediatePropagation();event.shiftKey?launch():toggle();}
    else if(event.shiftKey&&event.code==="Digit5"&&event.target instanceof Element&&event.target.closest(".linux-note-terminal")){event.preventDefault();event.stopImmediatePropagation();split();}
  }) as EventListener,true);
  lifetime.add(settings.subscribe(config=>{for(const entry of sessions.values())entry.surface.apply_settings(config);render();}));
  lifetime.add(observe_terminal_theme(theme=>{for(const entry of sessions.values())entry.surface.term.options.theme=theme;}));
  lifetime.add(()=>{cancelAnimationFrame(render_frame);for(const id of [...sessions.keys()])kill(id);document.documentElement.removeAttribute("data-linux-note-terminal");document.documentElement.removeAttribute("data-linux-note-terminal-theme");});
  lifetime.listen(window,"unload",lifetime.dispose);
  document.documentElement.setAttribute("data-linux-note-terminal","ready");document.documentElement.setAttribute("data-linux-note-terminal-theme","ready");
  return {open,admin,toggle,dispose:lifetime.dispose};
  }catch(error){lifetime.dispose();throw error;}
}
