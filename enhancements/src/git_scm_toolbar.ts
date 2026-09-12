import type {git_scm_history} from "./git_scm_history";
import {git_icon_button,git_icon} from "./git_icons";
import {HISTORY_ACTION_IDS,validate_history_shortcuts,type history_action_id} from "./git_scm_data";
import {workspace_element as el,workspace_button as button,workspace_menu,workspace_dialog,shortcut_matches,type workspace_menu_entry} from "./workspace_widgets";
import {git_graph_text as text} from "./git_graph_i18n";

/** 工具栏和快捷键共用动作、可用条件；隐藏与宽度溢出都回到同一个更多菜单。 */
export class git_scm_toolbar {
  element=el("span","git-scm-history-toolbar"); buttons=new Map<history_action_id,HTMLButtonElement>(); overflow=new Set<history_action_id>();
  more:HTMLButtonElement; observer:ResizeObserver;
  constructor(public history:git_scm_history){
    const icons={branches:"git-branch",head:"target",fetch:"git-fetch",pull:"repo-pull",push:"repo-push",refresh:"refresh"} as const;
    for(const id of HISTORY_ACTION_IDS){const node=git_icon_button(icons[id],this.title(id),()=>{},"git-scm-history-"+id);node.dataset.historyAction=id;node.onclick=event=>this.execute(id,event);node.oncontextmenu=event=>this.context_menu(event,id);this.buttons.set(id,node);this.element.append(node);}
    this.more=git_icon_button("more",text("history.more"),()=>{},"git-scm-history-more-menu");this.more.onclick=event=>this.more_menu(event);this.more.oncontextmenu=event=>this.context_menu(event);this.element.append(this.more);
    history.owner.sidebar.addEventListener("keydown",this.keydown);window.addEventListener("linux-note-git-settings",this.settings_changed);
    this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(history.header);
  }
  title(id:history_action_id):string{return {branches:text("history.filter_branches"),head:text("history.reveal_head"),fetch:text("scm.fetch_all"),pull:text("history.pull"),push:text(this.history.owner.panel.state?.tracking?.upstream?"history.push":"scm.publish_branch"),refresh:text("history.refresh")}[id];}
  enabled(id:history_action_id):boolean{
    const panel=this.history.owner.panel,state=panel.state;
    if(panel.disposed||panel.pending||panel.writing)return false;
    if(id==="refresh")return !!panel.root;
    if(!state||state.root!==panel.root||panel.container?.dataset.state==="error")return false;
    if(id==="head")return !!state.head;
    if(id==="branches")return !!state.head;
    if(id==="fetch")return state.remotes.length>0;
    if(id==="pull")return !!state.head&&!!state.branch&&!!state.tracking?.upstream&&!state.operation;
    if(id==="push")return !!state.head&&!!state.branch&&state.remotes.length>0&&!state.operation;
    return true;
  }
  execute(id:history_action_id,event?:MouseEvent):void{
    if(!this.enabled(id))return;
    const panel=this.history.owner.panel;
    if(id==="branches"){panel.filter_branches();return;}
    if(id==="head"){void this.history.reveal_head();return;}
    if(id==="refresh"){void panel.refresh(false);return;}
    this.history.network_action(id);
  }
  entry(id:history_action_id):workspace_menu_entry{
    const panel=this.history.owner.panel,root=panel.root,runner=panel.runner;
    return {id,title:this.title(id),shortcut:panel.settings.history_shortcuts?.[id],disabled:!this.enabled(id),action:()=>{if(root===panel.root&&runner===panel.runner)this.execute(id);}};
  }
  update():void{
    const panel=this.history.owner.panel;
    for(const [id,node] of this.buttons){node.disabled=!this.enabled(id);node.title=this.title(id);node.setAttribute("aria-label",node.title);}
    const label=panel.branches.length===0?text("scm.scope_all"):panel.branches.length===1?panel.branches[0]==="AUTO"?text("scm.scope_auto"):panel.branches[0].replace(/^refs\/(heads|remotes|tags)\//u,""):text("scm.scope_count",{count:panel.branches.length});
    this.buttons.get("branches")!.replaceChildren(git_icon("git-branch"),el("span","git-scm-history-scope",label));
    this.buttons.get("push")!.replaceChildren(git_icon(panel.state?.tracking?.upstream?"repo-push":"cloud-upload"));
    this.layout();
  }
  layout():void{
    const header=this.history.header;
    if(!header.isConnected||header.clientWidth===0)return;
    const hidden=this.history.owner.panel.settings.history_toolbar_hidden||[];
    this.history.count.hidden=false;this.overflow.clear();for(const [id,node] of this.buttons)node.hidden=hidden.includes(id);
    // 保留一个图标宽度供标题展开按钮；动作宽度取实际行盒，引用名称上限来自上游 100px。
    const available=header.clientWidth-parseFloat(getComputedStyle(header).paddingLeft||"0")-parseFloat(getComputedStyle(header).paddingRight||"0")-this.more.getBoundingClientRect().width;
    let total=this.element.getBoundingClientRect().width;
    for(const id of [...HISTORY_ACTION_IDS].reverse()){
      const node=this.buttons.get(id)!;
      if(total<=available)break;
      if(node.hidden)continue;
      const width=node.getBoundingClientRect().width;node.hidden=true;total-=width;this.overflow.add(id);
    }
    const toggle=this.history.toggle,title=toggle.querySelector<HTMLElement>(".git-scm-history-title"),icon=toggle.querySelector("svg");
    if(title&&icon){const gap=parseFloat(getComputedStyle(toggle).gap)||0;this.history.count.hidden=toggle.clientWidth<icon.getBoundingClientRect().width+title.scrollWidth+this.history.count.getBoundingClientRect().width+gap*2;}
  }
  more_menu(event:MouseEvent):void{
    const panel=this.history.owner.panel,owner=this.history.owner,root=panel.root,runner=panel.runner;
    const valid=()=>!panel.disposed&&root===panel.root&&runner===panel.runner;
    const set_tree=(value:boolean)=>{if(!valid())return;owner.history_tree=value;owner.save_layout();if(panel.state)this.history.render(panel.state);};
    workspace_menu(event,[...HISTORY_ACTION_IDS.filter(id=>panel.settings.history_toolbar_hidden?.includes(id)||this.overflow.has(id)).map(id=>this.entry(id)),
      {id:"history_list",title:text("history.list_view"),separator:true,checked:!owner.history_tree,action:()=>set_tree(false)},
      {id:"history_tree",title:text("history.tree_view"),checked:owner.history_tree,action:()=>set_tree(true)},
      {id:"open_graph",title:text("history.open_in_editor"),separator:true,action:()=>{if(valid())panel.host.show_history(root);}},
      {id:"restore_toolbar",title:text("scm.restore_toolbar"),disabled:!panel.settings.history_toolbar_hidden?.length,action:()=>{if(valid()){panel.settings.history_toolbar_hidden=[];panel.persist_settings();this.update();}}},
    ]);
  }
  context_menu(event:MouseEvent,id?:history_action_id):void{
    const panel=this.history.owner.panel,root=panel.root,runner=panel.runner;
    const valid=()=>!panel.disposed&&root===panel.root&&runner===panel.runner;
    const toggle=(key:history_action_id)=>{if(!valid())return;const hidden=panel.settings.history_toolbar_hidden;panel.settings.history_toolbar_hidden=hidden.includes(key)?hidden.filter(value=>value!==key):[...hidden,key];panel.persist_settings();this.update();};
    workspace_menu(event,[
      {id:"configure_keybinding",title:text("scm.configure_keybinding"),disabled:!id,action:()=>{if(id&&valid())this.configure_keybinding(id);}},
      {id:"hide_action",title:id?text("scm.hide_action",{name:this.title(id)}):text("scm.hide"),disabled:!id,action:()=>{if(id)toggle(id);}},
      ...HISTORY_ACTION_IDS.map((key,index)=>({id:"toggle_"+key,title:this.title(key),separator:index===0,checked:!panel.settings.history_toolbar_hidden?.includes(key),action:()=>toggle(key)})),
      {id:"restore_toolbar",title:text("scm.restore_toolbar"),separator:true,disabled:!panel.settings.history_toolbar_hidden?.length,action:()=>{if(valid()){panel.settings.history_toolbar_hidden=[];panel.persist_settings();this.update();}}},
    ]);
  }
  configure_keybinding(id:history_action_id):void{
    const panel=this.history.owner.panel,root=panel.root,runner=panel.runner,dialog=workspace_dialog(text("scm.configure_keybinding"));
    const input=el("input");input.value=panel.settings.history_shortcuts[id]||"";input.placeholder="Mod+Shift+F";input.setAttribute("aria-label",this.title(id));input.dataset.historyKeybinding=id;
    const label=el("label","",this.title(id)),error=el("p");label.append(input);dialog.content.append(label,el("p","",text("scm.shortcut_help")),error);
    dialog.footer.prepend(button(text("graph.apply"),()=>{if(panel.disposed||root!==panel.root||runner!==panel.runner){dialog.close();return;}try{const next={...panel.settings.history_shortcuts,[id]:input.value.trim()};validate_history_shortcuts(next);panel.settings.history_shortcuts=next;panel.persist_settings();dialog.close();}catch(problem){error.textContent=String(problem instanceof Error?problem.message:problem);}}));
  }
  private settings_changed=()=>this.update();
  private keydown=(event:KeyboardEvent)=>{
    if(event.isComposing||event.repeat||event.target instanceof Element&&event.target.closest("input,textarea,select,[contenteditable=true]"))return;
    if(document.querySelector(".git-graph-dialog-shade,.git-graph-menu"))return;
    const settings=this.history.owner.panel.settings;
    for(const id of HISTORY_ACTION_IDS){const shortcut=settings.history_shortcuts?.[id];if(shortcut&&shortcut_matches(event,shortcut)&&this.enabled(id)){event.preventDefault();event.stopPropagation();this.execute(id);break;}}
  };
  dispose():void{this.observer.disconnect();this.history.owner.sidebar.removeEventListener("keydown",this.keydown);window.removeEventListener("linux-note-git-settings",this.settings_changed);}
}
