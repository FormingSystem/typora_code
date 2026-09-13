import type {graph_leaf} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";
import type {workspace_save_service} from "./workspace_save_service";
import {workspace_element as el,workspace_menu,type workspace_menu_entry} from "./workspace_widgets";
import {git_icon,git_icon_button} from "./git_icons";
import {workspace_file_icon} from "./workspace_file_icons";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import {get_workspace_app} from "./workspace_bootstrap";
import {read_workspace_save_settings,set_workspace_save_settings,observe_workspace_save_settings,open_workspace_save_settings} from "./workspace_save_settings";
import {bind_workspace_history_view} from "./workspace_history_view";
import {bind_workspace_timeline} from "./workspace_timeline";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {acquire_workspace_style} from "./workspace_styles";
import {is_markdown_file} from "./file_language";
import css from "./workspace_explorer_sections.css";

/** 分区只消费现有文档叶子与文件命令，关闭和保存不维护第二套状态。 */
export function bind_workspace_explorer_sections(files:workspace_file_host,explorer:{container:HTMLElement;show():void},saves:workspace_save_service,editor_entries:(leaf:graph_leaf)=>workspace_menu_entry[]){
  const lifetime=create_workspace_lifetime(),workspace=files.core.app.workspace,container=explorer.container;
  lifetime.add(acquire_workspace_style("typora-code-explorer-sections",css).remove);
  const viewer=lifetime.own(bind_workspace_history_view(files,saves)),settings=get_workspace_app()!.settings;
  const stored=settings.get("workspace_explorer_sections") as Record<string,boolean>|undefined;
  const collapsed={open:stored?.open===true,folders:stored?.folders===true};
  const remember=()=>settings.set_and_save("workspace_explorer_sections",collapsed);
  const root=container.querySelector<HTMLElement>(".workspace-explorer-root")!,tree=container.querySelector<HTMLElement>(".workspace-explorer-tree")!,status=container.querySelector<HTMLElement>(".workspace-explorer-status")!;
  const folders=el("section","workspace-explorer-folders");root.before(folders);folders.append(root,tree,status);
  const opened=el("section","workspace-explorer-opened"),heading=el("div","workspace-explorer-section-heading"),toggle=el("button","workspace-explorer-section-title"),actions=el("div","workspace-explorer-section-actions"),body=el("div","workspace-explorer-opened-list");
  toggle.type="button";toggle.setAttribute("aria-label","打开的编辑器");body.setAttribute("role","list");body.setAttribute("aria-label","打开的编辑器");heading.append(toggle,actions);opened.append(heading,body);folders.before(opened);
  const run=(operation:()=>unknown)=>{try{Promise.resolve(operation()).catch(saves.report);}catch(error){saves.report(error);}};
  const leaves=()=>{const result:graph_leaf[]=[];workspace.eachLeaves(leaf=>{result.push(leaf);});return result;};
  actions.append(git_icon_button("save-all","全部保存",()=>run(files.save_all)),git_icon_button("close-all","关闭全部编辑器",()=>run(async()=>{for(const leaf of leaves())if(!await files.close_leaf(leaf))break;})));
  const timeline=lifetime.own(bind_workspace_timeline(files,saves,viewer,explorer));container.append(timeline.container);
  const visibility=():workspace_menu_entry[]=>{const value=read_workspace_save_settings();return[
    {title:"打开的编辑器",checked:value["explorer.openEditors.enabled"],action:()=>set_workspace_save_settings({"explorer.openEditors.enabled":!value["explorer.openEditors.enabled"]})},
    {title:"文件夹",checked:true,disabled:true,action:()=>{}},
    {title:"时间线",checked:value["timeline.enabled"],action:()=>set_workspace_save_settings({"timeline.enabled":!value["timeline.enabled"]})},
    {title:"资源管理器与保存设置…",separator:true,action:open_workspace_save_settings},
  ];};
  const toolbar=container.querySelector(".workspace-explorer-toolbar .workspace-explorer-actions")!;
  const menu=git_icon_button("more","资源管理器视图",()=>{});menu.onclick=event=>workspace_menu(event,visibility(),"workspace-menu-compact");toolbar.append(menu);
  const root_title=root.querySelector<HTMLElement>(".workspace-explorer-root-name")!,old_context=root.oncontextmenu,old_title_context=root_title.oncontextmenu,old_click=root_title.onclick;
  const section_menu=(event:MouseEvent)=>{event.preventDefault();event.stopPropagation();workspace_menu(event,visibility(),"workspace-menu-compact");};
  root.oncontextmenu=section_menu;root_title.oncontextmenu=section_menu;
  root_title.onclick=()=>{collapsed.folders=!collapsed.folders;remember();render_layout();};root_title.setAttribute("role","button");root_title.tabIndex=0;
  const root_key=(event:KeyboardEvent)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();root_title.click();}};root_title.addEventListener("keydown",root_key);
  const folder_caret=el("span","workspace-explorer-folder-caret");folder_caret.setAttribute("aria-hidden","true");folder_caret.onclick=()=>root_title.click();root_title.before(folder_caret);
  toggle.onclick=()=>{collapsed.open=!collapsed.open;remember();render_layout();};heading.oncontextmenu=event=>{event.preventDefault();workspace_menu(event,visibility(),"workspace-menu-compact");};
  function render_layout(){
    const value=read_workspace_save_settings();opened.hidden=!value["explorer.openEditors.enabled"];body.hidden=collapsed.open;
    toggle.replaceChildren(git_icon(collapsed.open?"chevron-right":"chevron-down"),document.createTextNode("打开的编辑器"));toggle.setAttribute("aria-expanded",String(!collapsed.open));
    folder_caret.replaceChildren(git_icon(collapsed.folders?"chevron-right":"chevron-down"));
    root_title.setAttribute("aria-expanded",String(!collapsed.folders));tree.hidden=collapsed.folders;status.hidden=collapsed.folders;folders.classList.toggle("is-collapsed",collapsed.folders);
    body.style.maxHeight=value["explorer.openEditors.visible"]*22+"px";body.style.minHeight=Math.min(value["explorer.openEditors.minVisible"],value["explorer.openEditors.visible"])*22+"px";
    render_opened();
  }
  let signature="",frame=0;const ids=new WeakMap<object,number>();let serial=0;
  const identity=(item:object)=>{if(!ids.has(item))ids.set(item,++serial);return ids.get(item);};
  function render_opened(){
    if(lifetime.disposed)return;const items=leaves(),sort=read_workspace_save_settings()["explorer.openEditors.sortOrder"];
    const next=JSON.stringify([sort,items.map(leaf=>[identity(leaf),identity(leaf.parent),leaf.state.path,files.editor_state(leaf),leaf===workspace.activeLeaf,leaf.state.workspace_preview])]);if(signature===next)return;signature=next;
    const focused=(document.activeElement as HTMLElement)?.closest<HTMLElement>("[data-open-leaf]")?.dataset.openLeaf;body.replaceChildren();
    const groups=new Map<object,graph_leaf[]>();for(const leaf of items){const group=groups.get(leaf.parent)||[];group.push(leaf);groups.set(leaf.parent,group);}
    let group_number=0;
    for(const [owner,group] of groups){
      if(groups.size>1)body.append(el("div","workspace-explorer-editor-group","组 "+(++group_number)));
      if(sort==="editorOrder"){const children=(owner as {children?:graph_leaf[]}).children;if(children)group.sort((left,right)=>children.indexOf(left)-children.indexOf(right));}
      if(sort!=="editorOrder")group.sort((a,b)=>{const left=files.editor_state(a).file_path||a.state.path,right=files.editor_state(b).file_path||b.state.path;return(sort==="alphabetical"?files.path_api.basename(left):left).localeCompare(sort==="alphabetical"?files.path_api.basename(right):right);});
      for(const leaf of group){
        const state=files.editor_state(leaf),row=el("div","workspace-explorer-open-row"),close=git_icon_button("close","关闭",()=>run(()=>files.close_leaf(leaf))),button=el("button","workspace-explorer-open-file");
        row.dataset.openLeaf=String(identity(leaf));row.setAttribute("role","listitem");row.classList.toggle("is-active",leaf===workspace.activeLeaf);row.classList.toggle("is-dirty",state.dirty);row.classList.toggle("is-preview",leaf.state.workspace_preview===true);
        const tab=workspace_leaf_tab(leaf),label=state.file_path?files.path_api.basename(state.file_path):tab?.querySelector(".typ-file-basename")?.textContent||tab?.title||"编辑器";
        const description=state.file_path?files.path_api.dirname(files.path_api.relative(files.context_root()||files.path_api.dirname(state.file_path),state.file_path)):"";
        button.type="button";button.title=state.file_path||label;button.dataset.editorPath=state.file_path;button.setAttribute("aria-label",label+(state.dirty?"，未保存":""));button.setAttribute("aria-current",String(leaf===workspace.activeLeaf));
        button.append(state.file_path?workspace_file_icon(state.file_path):git_icon("files"),el("span","workspace-explorer-open-name",label),el("span","workspace-explorer-open-description",description==="."?"":description));
        button.onclick=()=>{if(leaves().includes(leaf)){workspace.activeLeaf=leaf.parent.toggleTab(leaf.state.path);render_opened();}};button.ondblclick=()=>files.keep_open(leaf);
        row.oncontextmenu=event=>{event.preventDefault();const order=["reopen","close","close_others","close_saved","close_all"],entries=editor_entries(leaf).filter(entry=>order.includes(entry.id||"")).sort((a,b)=>order.indexOf(a.id!)-order.indexOf(b.id!)).map(entry=>({...entry,separator:entry.id==="close"}));workspace_menu(event,entries,"workspace-menu-compact");};
        row.append(close,button);body.append(row);
      }
    }
    if(focused)body.querySelector<HTMLElement>('[data-open-leaf="'+focused+'"] .workspace-explorer-open-file')?.focus({preventScroll:true});
  }
  body.onkeydown=event=>{if(event.isComposing)return;const buttons=[...body.querySelectorAll<HTMLButtonElement>(".workspace-explorer-open-file")],index=buttons.indexOf(event.target as HTMLButtonElement);if(index<0)return;if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,index+(event.key==="ArrowDown"?1:-1)))]?.focus();}};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;render_opened();});};
  lifetime.add(workspace.on("active-leaf:change",schedule));lifetime.add(workspace.on("layout-changed",schedule));lifetime.add(workspace.on("file:open",schedule));lifetime.add(saves.subscribe(schedule));lifetime.add(observe_workspace_save_settings(render_layout));
  lifetime.listen(container,"typora-code:explorer-file-menu",((event:CustomEvent<{path:string;directory:boolean;entries:workspace_menu_entry[]}>)=>{
    const {path,directory,entries}=event.detail;if(directory)return;
    const children:workspace_menu_entry[]=[{title:"文本编辑器",action:()=>run(async()=>{await files.open_file(path);const leaf=workspace.activeLeaf;if(leaf)await files.reopen_leaf(leaf,true);})}];
    if(is_markdown_file(path))children.unshift({title:"Markdown 编辑器",action:()=>run(async()=>{await files.open_file(path);const leaf=workspace.activeLeaf;if(leaf)await files.reopen_leaf(leaf,false);})});
    entries.splice(2,0,{title:"打开方式…",children,action:()=>{}},{title:"与剪贴板比较",action:()=>run(async()=>{const right=await files.read_text(path),left=(window as any).reqnode("electron").clipboard.readText();if(left.length>16*1024*1024)throw new Error("剪贴板文本超过16 MiB。");viewer.open({title:files.path_api.basename(path)+"（剪贴板比较）",file:path,left,right,left_label:"剪贴板",right_label:path});})});
    entries.push({title:"打开时间线",separator:true,action:()=>timeline.open(path)});
  }) as EventListener);
  render_layout();lifetime.add(()=>{if(frame)cancelAnimationFrame(frame);menu.remove();folder_caret.remove();root.oncontextmenu=old_context;root_title.oncontextmenu=old_title_context;root_title.onclick=old_click;root_title.removeEventListener("keydown",root_key);root_title.removeAttribute("role");root_title.removeAttribute("tabindex");root_title.removeAttribute("aria-expanded");tree.hidden=false;status.hidden=false;folders.before(root,tree,status);folders.remove();opened.remove();});
  return{dispose:()=>lifetime.dispose()};
}
