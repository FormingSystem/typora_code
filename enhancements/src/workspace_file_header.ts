import type {graph_leaf} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";
import type {bind_workspace_editor_actions} from "./workspace_editor_actions";
import {request_git_file_title_actions} from "./git_file_title_actions";
import {git_icon_button} from "./git_icons";
import {workspace_element,workspace_menu,type workspace_menu_entry} from "./workspace_widgets";
import {register_workspace_dismissal,capture_workspace_focus} from "./workspace_focus";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import css from "./workspace_file_header.css";

type editor_actions=ReturnType<typeof bind_workspace_editor_actions>;
type editor_group=graph_leaf["parent"]&{activeLeaf?:graph_leaf};
type header_state={group:editor_group;leaf:graph_leaf;path:string;toolbar:HTMLElement;split:HTMLButtonElement;more:HTMLButtonElement;interaction:{remove():void};legacy?:{node:HTMLElement;hidden:boolean}};
const bindings=new WeakMap<workspace_file_host,{refresh():void;dispose():void}>();

/** 每组只有一份普通文件动作；不接管历史比较、搜索预览及工具页。 */
export function bind_workspace_file_header(files:workspace_file_host,actions:editor_actions){
  const existing=bindings.get(files);if(existing)return existing;
  const workspace=files.core.app.workspace,groups=new Map<editor_group,header_state>();
  const style=acquire_workspace_style("typora-code-style:workspace_file_header",css),events=new AbortController();
  let disposed=false,frame=0,menu_owner:header_state|undefined,close_menu:(()=>void)|undefined,loading:AbortController|undefined;
  let loading_layer:ReturnType<typeof register_workspace_dismissal>|undefined;
  const valid=(state:header_state)=>!disposed&&groups.get(state.group)===state&&state.toolbar.isConnected&&state.group.activeLeaf===state.leaf&&state.leaf.parent===state.group&&state.leaf.state.path===state.path;
  const cancel=()=>{
    loading?.abort();loading=undefined;loading_layer?.dispose();loading_layer=undefined;
    if(menu_owner){menu_owner.more.removeAttribute("aria-busy");menu_owner.more.setAttribute("aria-expanded","false");}
    close_menu?.();close_menu=undefined;menu_owner=undefined;
  };
  const entries=(state:header_state):workspace_menu_entry[]=>{
    const leaf=state.leaf,path=state.path;
    const result=actions.title_entries(leaf).map(entry=>({...entry,shortcut:entry.id==="close_all"?"Ctrl+K W":entry.id==="close_saved"?"Ctrl+K U":entry.shortcut}));
    const reopen=actions.entries(leaf).find(entry=>entry.id==="reopen");
    if(reopen)result.push({...reopen,title:"重新打开方式",separator:true});
    // 菜单动作在点击时再复核叶子和组，不能沿用被重命名或移走的标签快照。
    const guard=(entry:workspace_menu_entry):workspace_menu_entry=>({...entry,action:()=>{if(valid(state)&&state.leaf===leaf&&state.path===path)entry.action();},children:entry.children?.map(guard)});
    return result.map(guard);
  };
  const open_menu=async(state:header_state)=>{
    if(!valid(state))return;
    if(menu_owner===state){cancel();return;}cancel();
    const leaf=state.leaf,path=state.path,group=state.group,file_path=files.editor_state(leaf).file_path;
    const current=()=>valid(state)&&state.leaf===leaf&&state.path===path&&state.group===group;
    const focus=capture_workspace_focus();menu_owner=state;
    const controller=loading=new AbortController();state.more.setAttribute("aria-busy","true");
    loading_layer=register_workspace_dismissal(()=>[state.toolbar],reason=>{cancel();if(reason==="escape")focus.restore();},{window_blur:true});
    let git_entries:workspace_menu_entry[]=[];
    try{git_entries=await request_git_file_title_actions(file_path,current,controller.signal);}
    catch(error){if(current()&&!controller.signal.aborted)new files.core.Notice(String(error instanceof Error?error.message:error),5000);}
    if(controller.signal.aborted||!current()||loading!==controller)return;
    loading=undefined;loading_layer?.dispose();loading_layer=undefined;state.more.removeAttribute("aria-busy");
    const items=entries(state);if(git_entries.length&&items[0])items[0]={...items[0],separator:true};
    const rect=state.more.getBoundingClientRect();state.more.setAttribute("aria-expanded","true");
    close_menu=workspace_menu(new MouseEvent("contextmenu",{clientX:rect.right,clientY:rect.bottom}),[...git_entries,...items],"workspace-menu-compact workspace-file-title-menu",()=>{
      state.more.setAttribute("aria-expanded","false");if(menu_owner===state){menu_owner=undefined;close_menu=undefined;}
    },{anchor:state.more,align:"right"});
  };
  const restore_legacy=(state:header_state)=>{if(state.legacy){state.legacy.node.hidden=state.legacy.hidden;state.legacy=undefined;}};
  const release=(state:header_state)=>{if(menu_owner===state)cancel();restore_legacy(state);state.interaction.remove();state.toolbar.remove();groups.delete(state.group);};
  const refresh=()=>{
    frame=0;if(disposed)return;
    const active=new Map<editor_group,graph_leaf>();workspace.eachLeaves(leaf=>{const group=leaf.parent as editor_group;if(group.activeLeaf===leaf&&group.containerEl?.isConnected)active.set(group,leaf);});
    for(const [group,leaf]of active){
      const file_state=files.editor_state(leaf),strip=group.containerEl?.querySelector<HTMLElement>(":scope > .workspace-tab-strip");
      const ordinary=(file_state.kind==="source"||file_state.kind==="markdown")&&(file_state.file_path?files.path_api.isAbsolute(file_state.file_path):leaf.state.path==="");
      if(!ordinary||!strip){const old=groups.get(group);if(old)release(old);continue;}
      let state=groups.get(group);
      if(!state){
        const toolbar=workspace_element("div","workspace-file-header"),split=git_icon_button("split-horizontal","向右拆分（Ctrl+\\）",()=>{}),more=git_icon_button("more","更多编辑器操作",()=>{});
        toolbar.setAttribute("role","toolbar");toolbar.setAttribute("aria-label","文件编辑器操作");
        split.dataset.fileHeaderAction="split";more.dataset.fileHeaderAction="more";more.setAttribute("aria-haspopup","menu");more.setAttribute("aria-expanded","false");
        toolbar.append(split,more);strip.append(toolbar);
        state={group,leaf,path:leaf.state.path,toolbar,split,more,interaction:acquire_workspace_interaction(toolbar)};groups.set(group,state);const owner=state;
        toolbar.addEventListener("mousedown",event=>{if(event.button===0)event.preventDefault();},{signal:events.signal});
        split.onclick=()=>{if(valid(owner))actions.entries(owner.leaf).find(entry=>entry.id==="split_right"&&!entry.disabled)?.action();};
        more.onclick=()=>{void open_menu(owner);};
        toolbar.addEventListener("keydown",event=>{
          if(event.isComposing)return;
          if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){
            event.preventDefault();event.stopPropagation();const buttons=[split,more].filter(button=>!button.disabled),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowLeft"?buttons.length-1:1))%buttons.length]?.focus();
          }else if(event.key==="ArrowDown"&&event.target===more){event.preventDefault();event.stopPropagation();void open_menu(owner);}
        },{signal:events.signal});
      }
      if(state.leaf!==leaf||state.path!==leaf.state.path){if(menu_owner===state)cancel();restore_legacy(state);state.leaf=leaf;state.path=leaf.state.path;}
      if(state.toolbar.parentElement!==strip)strip.append(state.toolbar);
      const legacy=(leaf.view as {editor?:{toolbar:HTMLElement}}).editor?.toolbar;
      if(state.legacy?.node!==legacy){restore_legacy(state);if(legacy){state.legacy={node:legacy,hidden:legacy.hidden};legacy.hidden=true;}}
      state.split.disabled=file_state.busy;
    }
    for(const [group,state]of groups)if(!active.has(group)||!group.containerEl?.isConnected)release(state);
  };
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(refresh);};
  const observer=new MutationObserver(records=>{if(records.some(record=>!(record.target instanceof Element)||!record.target.closest(".monaco-editor,.workspace-file-header,.git-graph-menu")))schedule();});
  const root=document.querySelector(".typ-workspace-root");if(root)observer.observe(root,{childList:true,subtree:true});
  const unsubscribers=[workspace.on("layout-changed",schedule),workspace.on("active-leaf:change",()=>{cancel();schedule();})];
  document.addEventListener("focusin",schedule,{signal:events.signal});refresh();
  const binding={refresh,dispose(){if(disposed)return;cancel();disposed=true;cancelAnimationFrame(frame);observer.disconnect();events.abort();for(const unsubscribe of unsubscribers)unsubscribe?.();for(const state of [...groups.values()])release(state);style.remove();bindings.delete(files);}};
  bindings.set(files,binding);return binding;
}
