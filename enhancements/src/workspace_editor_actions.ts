import {workspace_text} from "./workspace_i18n";
import {vscode_resource_entry} from "./workspace_open_vscode";
import {get_workspace_quick_open} from "./workspace_quick_open";
import type {graph_core,graph_leaf} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";
import type {detached_window_binding} from "./workspace_detached_window";
import {workspace_menu,type workspace_menu_entry} from "./workspace_widgets";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import {format_file_path} from "./file_paths";
import {is_markdown_file} from "./file_language";
import {git_icon} from "./git_icons";
import {read_workspace_editor_settings,set_workspace_editor_preview,workspace_editor_group_locked,set_workspace_editor_group_locked} from "./workspace_editor_settings";

type direction="left"|"right"|"up"|"down";
type editor_group=graph_leaf["parent"]&{children:graph_leaf[];containerEl:HTMLElement;parent?:{removeChild(group:editor_group):void};root?:{emit(event:string):void}};
type layout_core=graph_core&{
  app:graph_core["app"]&{workspace:graph_core["app"]["workspace"]&{rootSplit:{eachLeaves(callback:(leaf:graph_leaf)=>void):void}}};
  split_workspace_group(leaf:graph_leaf,side:direction):editor_group;
  move_workspace_leaf(leaf:graph_leaf,group:editor_group,index:number):void;
};
type close_mode="others"|"right"|"saved"|"all";
const TITLE_ENTRIES_EVENT = "typora-code:editor-title-entries";
/** Only request synchronization contributions from the document action owner that is already bound to the current window; do not retain the expired leaf's menu cache. */
export function request_workspace_editor_title_entries(leaf:graph_leaf):workspace_menu_entry[]{
  const detail:{leaf:graph_leaf;entries:workspace_menu_entry[]|undefined}={leaf,entries:undefined};
  document.dispatchEvent(new CustomEvent(TITLE_ENTRIES_EVENT,{detail}));return detail.entries||[];
}

/** Menus, keyboard shortcuts, and tab close buttons share the document service; operations are always bound to the actual leaf. */
export function bind_workspace_editor_actions(files:workspace_file_host,windows:detached_window_binding){
  const core=files.core as layout_core,workspace=core.app.workspace;
  const runtime=window as unknown as {reqnode(name:string):any;File?:any};
  const cleanups:(()=>void)[]=[],batches=new WeakSet<object>();
  let disposed=false,close_menu:(()=>void)|undefined;
  const owned_locks=new Set<graph_leaf["parent"]>();
  const present=(leaf:graph_leaf)=>{let found=false;workspace.eachLeaves(item=>{if(item===leaf)found=true;});return found;};
  const is_document=(leaf:graph_leaf)=>!leaf.state.path.startsWith("typ://core.empty/");
  const group_leaves=(leaf:graph_leaf)=>(leaf.parent as editor_group).children.filter(is_document);
  const run=(action:()=>unknown)=>{if(!disposed)void Promise.resolve().then(()=>!disposed&&action()).catch(error=>{if(!disposed)new core.Notice(String(error instanceof Error?error.message:error),5000);});};
  const refresh=()=>{
    if(disposed)return;
    workspace.eachLeaves(leaf=>{
      const tab=workspace_leaf_tab(leaf),close=tab?.querySelector<HTMLElement>(".typ-close");if(!tab||!close)return;
      const pinned=Boolean(leaf.state.workspace_pinned);tab.classList.toggle("is-workspace-pinned",pinned);
      if(pinned&&!close.querySelector(".workspace-tab-pin"))close.append(git_icon("pinned","workspace-tab-pin"));
      if(!pinned)close.querySelector(".workspace-tab-pin")?.remove();
      close.title="";close.setAttribute("aria-label",pinned?workspace_text("editor_actions_unpin"):workspace_text("editor_actions_close_ctrl_f4"));
      tab.classList.toggle("is-workspace-preview",Boolean(leaf.state.workspace_preview));
    });
  };
  const pin=(leaf:graph_leaf,value=!leaf.state.workspace_pinned)=>{
    if(!present(leaf))return;files.keep_open(leaf);leaf.state.workspace_pinned=value;
    const active=workspace.activeLeaf,group=leaf.parent as editor_group;
    const fixed=group.children.filter(item=>item!==leaf&&item.state.workspace_pinned).length;
    core.move_workspace_leaf(leaf,group,fixed);
    if(active&&present(active))workspace.activeLeaf=active.parent.toggleTab(active.state.path);
    refresh();
  };
  const candidates=(leaf:graph_leaf,mode:close_mode)=>{
    const leaves=group_leaves(leaf),index=leaves.indexOf(leaf);
    return leaves.filter((item,i)=>!item.state.workspace_pinned&&(mode!=="others"||item!==leaf)
      &&(mode!=="right"||i>index)&&(mode!=="saved"||!files.editor_state(item).dirty));
  };
  const close_batch=async(leaf:graph_leaf,mode:close_mode)=>{
    if(!present(leaf))return;const group=leaf.parent;
    if(batches.has(group))return;batches.add(group);
    try{
      if(mode==="others")files.keep_open(leaf);
      for(const item of candidates(leaf,mode)){
        if(disposed)break;
        if(!present(item)||item.parent!==group||item.state.workspace_pinned)continue;
        if(mode==="saved"&&files.editor_state(item).dirty)continue;
        if(!await files.close_leaf(item))break;
      }
    }finally{batches.delete(group);}
  };
  const neighbor=(leaf:graph_leaf,side:direction):editor_group|undefined=>{
    const source=leaf.parent as editor_group,origin=source.containerEl.getBoundingClientRect(),groups=new Set<editor_group>();
    workspace.rootSplit.eachLeaves(item=>{if(item.parent!==source&&item.parent.containerEl?.getClientRects().length)groups.add(item.parent as editor_group);});
    const horizontal=side==="left"||side==="right",forward=side==="right"||side==="down";
    const center=(rect:DOMRect)=>horizontal?(rect.left+rect.right)/2:(rect.top+rect.bottom)/2;
    return [...groups].filter(group=>{
      const rect=group.containerEl.getBoundingClientRect();
      return (forward?center(rect)>center(origin):center(rect)<center(origin))
        &&(horizontal?Math.min(rect.bottom,origin.bottom)>Math.max(rect.top,origin.top):Math.min(rect.right,origin.right)>Math.max(rect.left,origin.left))
        &&!group.children.some(item=>item.state.path===leaf.state.path);
    }).sort((a,b)=>Math.abs(center(a.containerEl.getBoundingClientRect())-center(origin))-Math.abs(center(b.containerEl.getBoundingClientRect())-center(origin)))[0];
  };
  const split=async(leaf:graph_leaf,side:direction)=>{
    if(!present(leaf)||files.editor_state(leaf).busy)return;
    const group=core.split_workspace_group(leaf,side);
    try{await files.duplicate_leaf(leaf,group);}
    catch(error){if(!group.children.length)group.parent?.removeChild(group);throw error;}
    refresh();
  };
  const move=(leaf:graph_leaf,side:direction)=>{
    if(!present(leaf)||files.editor_state(leaf).busy)return;const group=neighbor(leaf,side);if(!group)return;
    core.move_workspace_leaf(leaf,group,group.children.length);files.keep_open(leaf);refresh();
  };
  const copy_path=(leaf:graph_leaf,kind:"absolute"|"relative"|"breadcrumbs")=>{
    if(!present(leaf))return;const path=files.editor_state(leaf).file_path;
    const value=format_file_path(files.path_api,path,files.context_root(),kind!=="absolute");
    if(value==null)return;
    return files.copy(kind==="breadcrumbs"?value.split(/[\\/]/u).filter(Boolean).join(" > "):value);
  };
  const reveal=(leaf:graph_leaf,system:boolean)=>{
    const path=files.editor_state(leaf).file_path;if(!path||!present(leaf))return;
    if(system)return runtime.reqnode("electron").shell.showItemInFolder(path);
    const root=files.context_root(),relative=files.path_api.relative(root,path);
    const inside=relative!==".."&&!relative.startsWith(".."+files.path_api.sep)&&!files.path_api.isAbsolute(relative);
    core.app.commands.run("linux_note:reveal_in_explorer",[path,inside?root:files.path_api.dirname(path)]);
  };
  const preview=async(leaf:graph_leaf)=>{
    if(!await files.reopen_leaf(leaf,false))return;
    const active=workspace.activeLeaf;
    if(active&&files.editor_state(active).kind==="markdown"&&runtime.File?.editor?.sourceView?.inSourceMode
      &&runtime.File?.bundle?.filePath===active.state.path)runtime.File.toggleSourceMode();
    refresh();
  };
  const entries=(leaf:graph_leaf):workspace_menu_entry[]=>{
    const state=files.editor_state(leaf),file=Boolean(state.file_path),markdown=is_markdown_file(state.file_path),ordinary=state.kind!=="other";
    const entry=(id:string,title:string,action:()=>unknown,options:Partial<workspace_menu_entry>={}):workspace_menu_entry=>({id,title,action:()=>run(()=>present(leaf)&&action()),...options});
    const split_items:workspace_menu_entry[]=[];
    for(const [side,title] of [["up",workspace_text("editor_actions_above")],["down",workspace_text("editor_actions_below")],["left",workspace_text("terminal_settings_view_left")],["right",workspace_text("terminal_settings_view_right")]] as const)
      split_items.push(entry("split_"+side,workspace_text("editor_split_direction",{direction:title}),()=>split(leaf,side),{disabled:!ordinary||state.busy}));
    for(const [side,title] of [["up",workspace_text("editor_actions_above")],["down",workspace_text("editor_actions_below")],["left",workspace_text("terminal_settings_view_left")],["right",workspace_text("terminal_settings_view_right")]] as const)
      split_items.push(entry("move_"+side,workspace_text("editor_move_direction",{direction:title}),()=>move(leaf,side),{separator:side==="up",disabled:state.busy||!neighbor(leaf,side)}));
    return [
      entry("close",workspace_text("community_plugin_settings_close"),()=>files.close_leaf(leaf),{shortcut:"Ctrl+F4",disabled:state.busy}),
      ...([["others",workspace_text("editor_actions_close_others"),""],["right",workspace_text("editor_actions_close_right"),""],["saved",workspace_text("editor_actions_close_saved"),"Alt+K U"],["all",workspace_text("editor_actions_close_all"),"Alt+K W"]] as const)
        .map(([mode,title,shortcut])=>entry("close_"+mode,title,()=>close_batch(leaf,mode),{shortcut,disabled:!candidates(leaf,mode).length||batches.has(leaf.parent)})),
      entry("copy_path",workspace_text("editor_actions_copy_path"),()=>copy_path(leaf,"absolute"),{shortcut:"Shift+Alt+C",separator:true,disabled:!file}),
      entry("copy_relative_path",workspace_text("file_path_actions_copy_relative_path"),()=>copy_path(leaf,"relative"),{shortcut:"Alt+K Alt+Shift+C",disabled:!file}),
      entry("copy_breadcrumbs_path",workspace_text("breadcrumbs_copy_breadcrumb_path"),()=>copy_path(leaf,"breadcrumbs"),{disabled:!file}),
      ...(markdown?[
        entry("preview",workspace_text("editor_actions_open_preview"),()=>preview(leaf),{separator:true,disabled:state.busy}),
        entry("reopen",workspace_text("editor_actions_reopen_window"),()=>{}, {children:[
          entry("reopen_markdown",workspace_text("breadcrumbs_markdown_editor"),()=>preview(leaf),{checked:state.kind==="markdown",disabled:state.busy}),
          entry("reopen_source",workspace_text("breadcrumbs_text_editor"),async()=>{await files.reopen_leaf(leaf,true);refresh();},{checked:state.kind==="source",disabled:state.busy})
        ]})]:[]),
      entry("reveal_system",workspace_text("editor_actions_show_in_system_file_manager"),()=>reveal(leaf,true),{shortcut:"Shift+Alt+R",separator:true,disabled:!file}),
      entry("reveal_explorer",workspace_text("editor_actions_show_in_explorer_view"),()=>reveal(leaf,false),{disabled:!file}),
      {...vscode_resource_entry(ordinary?state.file_path:""),action:()=>{if(present(leaf)&&ordinary)return vscode_resource_entry(state.file_path).action();}},
      entry("keep_open",workspace_text("editor_actions_keep_open"),()=>{files.keep_open(leaf);refresh();},{separator:true,shortcut:"Alt+K Enter",disabled:!leaf.state.workspace_preview}),
      entry("pin",leaf.state.workspace_pinned?workspace_text("editor_actions_unpin"):workspace_text("editor_actions_pin"),()=>pin(leaf),{shortcut:"Alt+K Shift+Enter"}),
      entry("split_right",workspace_text("editor_actions_split_to_the_right"),()=>split(leaf,"right"),{separator:true,shortcut:"Alt+\\",disabled:!ordinary||state.busy}),
      entry("split_move",workspace_text("editor_actions_split_and_move"),()=>{},{children:split_items}),
      entry("move_window",workspace_text("editor_actions_move_to_new_window"),()=>windows.open(leaf),{separator:true,disabled:!file||!ordinary||state.busy}),
      entry("copy_window",workspace_text("editor_actions_copy_to_new_window"),()=>windows.open(leaf,true),{shortcut:"Alt+K O",disabled:!file||!ordinary||state.busy})
    ];
  };
  const title_entries=(leaf:graph_leaf):workspace_menu_entry[]=>{
    if(!present(leaf))return [];
    const group=leaf.parent;
    const entry=(id:string,title:string,action:()=>unknown,options:Partial<workspace_menu_entry>={}):workspace_menu_entry=>({id,title,action:()=>run(()=>present(leaf)&&leaf.parent===group&&action()),...options});
    return [
      entry("show_opened_editors",workspace_text("editor_actions_show_open_editor"),()=>get_workspace_quick_open()?.open_editors(group)),
      entry("close_all",workspace_text("editor_actions_close_all"),()=>close_batch(leaf,"all"),{separator:true,disabled:!candidates(leaf,"all").length||batches.has(group)}),
      entry("close_saved",workspace_text("editor_actions_close_saved"),()=>close_batch(leaf,"saved"),{disabled:!candidates(leaf,"saved").length||batches.has(group)}),
      entry("enable_preview_editors",workspace_text("editor_actions_enable_preview_editor"),()=>set_workspace_editor_preview(!read_workspace_editor_settings().enable_preview),{separator:true,checked:read_workspace_editor_settings().enable_preview}),
      entry("lock_group",workspace_text("editor_actions_lock_editor_group"),()=>{const locked=!workspace_editor_group_locked(group);set_workspace_editor_group_locked(group,locked);if(locked)owned_locks.add(group);else owned_locks.delete(group);},{separator:true,checked:workspace_editor_group_locked(group)}),
      entry("configure_editors",workspace_text("editor_actions_configure_editor"),()=>core.app.commands.run("typora_code:settings"),{separator:true}),
    ];
  };
  const contribute_title=(event:Event)=>{const detail=(event as CustomEvent<{leaf:graph_leaf;entries?:workspace_menu_entry[]}>).detail;if(detail&&!detail.entries&&present(detail.leaf))detail.entries=title_entries(detail.leaf);};
  document.addEventListener(TITLE_ENTRIES_EVENT,contribute_title);
  const context=(event:Event)=>{
    const detail=(event as CustomEvent<{leaf:graph_leaf;event:MouseEvent}>).detail;
    if(!detail||!present(detail.leaf)||!is_document(detail.leaf))return;
    close_menu=workspace_menu(detail.event,entries(detail.leaf),"workspace-menu-compact workspace-editor-menu",()=>{close_menu=undefined;});
  };
  const find_tab=(event:MouseEvent)=>{
    const tab=event.target instanceof Element?event.target.closest<HTMLElement>(".typ-tab[data-id]"):null;
    let leaf:graph_leaf|undefined;if(tab)workspace.eachLeaves(item=>{if(workspace_leaf_tab(item)===tab)leaf=item;});return leaf;
  };
  const click=(event:MouseEvent)=>{
    if(event.button!==0||!(event.target instanceof Element)||!event.target.closest(".typ-close"))return;
    const leaf=find_tab(event);if(!leaf)return;event.preventDefault();event.stopImmediatePropagation();
    run(()=>leaf.state.workspace_pinned?pin(leaf,false):files.close_leaf(leaf));
  };
  const middle=(event:MouseEvent)=>{if(event.button!==1)return;const leaf=find_tab(event);if(!leaf)return;event.preventDefault();event.stopImmediatePropagation();run(()=>files.close_leaf(leaf));};
  document.addEventListener("typora-code:tab-context-menu",context);
  document.addEventListener("click",click,true);document.addEventListener("mousedown",middle,true);
  const command=(id:string,title:string,action:(leaf:graph_leaf)=>unknown)=>cleanups.push(core.app.commands.register({id:"linux_note:editor_"+id,title:workspace_text("editor_actions_editor")+title,scope:"global",callback:()=>{const leaf=workspace.activeLeaf;if(leaf)run(()=>action(leaf));}}));
  command("close_saved",workspace_text("editor_actions_close_saved"),leaf=>close_batch(leaf,"saved"));command("close_all",workspace_text("editor_actions_close_all"),leaf=>close_batch(leaf,"all"));
  command("keep_open",workspace_text("editor_actions_keep_open"),leaf=>{files.keep_open(leaf);refresh();});command("pin",workspace_text("editor_actions_toggle_fixed"),leaf=>pin(leaf));
  command("copy_window",workspace_text("editor_actions_copy_to_new_window"),leaf=>windows.open(leaf,true));command("move_window",workspace_text("editor_actions_move_to_new_window"),leaf=>windows.open(leaf));
  command("reveal_system",workspace_text("editor_actions_show_in_system_file_manager"),leaf=>reveal(leaf,true));
  command("split_right",workspace_text("editor_actions_split_to_the_right"),leaf=>split(leaf,"right"));command("split_down",workspace_text("editor_actions_split_down"),leaf=>split(leaf,"down"));
  cleanups.push(workspace.on("layout-changed",()=>queueMicrotask(refresh)),workspace.on("active-leaf:change",()=>queueMicrotask(refresh)));refresh();
  return {entries,title_entries,close_batch,pin,split,move,refresh,dispose(){
    if(disposed)return;disposed=true;close_menu?.();for(const cleanup of cleanups.reverse())cleanup();
    document.removeEventListener(TITLE_ENTRIES_EVENT,contribute_title);for(const group of owned_locks)set_workspace_editor_group_locked(group,false);owned_locks.clear();
    document.removeEventListener("typora-code:tab-context-menu",context);document.removeEventListener("click",click,true);document.removeEventListener("mousedown",middle,true);
    document.querySelectorAll(".workspace-tab-pin").forEach(node=>node.remove());
    document.querySelectorAll(".is-workspace-pinned").forEach(node=>node.classList.remove("is-workspace-pinned"));
  }};
}
