import type {graph_core,graph_leaf} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {create_link_preview,type workspace_link_request} from "./workspace_link_preview";
import {workspace_element as el,workspace_menu} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import {git_icon} from "./git_icons";

/** 选区向阅读侧栏发送；分屏持有自己的固定目标和资源。 */
export function bind_workspace_link_selection(core:graph_core,files:workspace_file_host,visible:()=>boolean,preview:(request:workspace_link_request)=>void){
  const lifetime=create_workspace_lifetime(),runtime=window as any,type="linux_note.link_preview";
  const payloads=new Map<string,workspace_link_request>(),views=new Set<link_view>();
  let disposed=false,timer=0,last="",close_menu:(()=>void)|undefined;
  const source_for=(node:Element)=>{if(node.closest("#write")&&runtime.File?.bundle?.filePath)return String(runtime.File.bundle.filePath);let source="";core.app.workspace.eachLeaves(leaf=>{if(leaf.view.containerEl.contains(node))source=files.editor_state(leaf).file_path;});return source||files.current_file();};
  const request_for=(node:Node|null):workspace_link_request|undefined=>{
    const element=node instanceof Element?node:node?.parentElement;
    const link=element?.closest<HTMLAnchorElement>("a[href],a[data-href],a[data-ref]");
    if(link?.getRootNode() instanceof ShadowRoot)return;
    if(!link?.closest("#write,.typ-markdown-preview")||link.closest(".workspace-link-preview,.workspace-lookup-preview"))return;
    let href=link.getAttribute("href")||link.getAttribute("data-href")||"";
    if(link.dataset.ref&&link.closest("#write"))href=runtime.File?.editor?.nodeMap?.link_list?.getHrefByRef?.(link.dataset.ref,true,true)||"";
    return {source:source_for(link),href};
  };
  const selected=()=>{const selection=window.getSelection();if(!selection?.rangeCount)return;const first=request_for(selection.anchorNode),last=request_for(selection.focusNode);if(first&&last&&first.source===last.source&&first.href===last.href)return first;};
  const update=()=>{clearTimeout(timer);timer=window.setTimeout(()=>{if(disposed||!visible())return;const request=selected();if(!request){last='';return;}const key=JSON.stringify(request);if(key===last)return;last=key;preview(request);},80);};
  class link_view extends core.WorkspaceView{
    containerEl=el("section","workspace-link-preview");icon="";
    reader=create_link_preview(files);loaded=false;
    constructor(leaf:graph_leaf){super(leaf);views.add(this);this.containerEl.append(this.reader.container);}
    setIcon(){const slot=workspace_leaf_tab(this.leaf)?.querySelector(".typ-file-icon");if(slot){slot.className="typ-file-icon workspace-file-theme-slot";slot.replaceChildren(git_icon("preview"));}}
    onOpen(){const request=payloads.get(this.leaf.state.path);if(request&&!this.loaded){this.loaded=true;void this.reader.show(request);}else if(!request)this.containerEl.textContent="请从原文链接重新打开预览。";}
    onClose(){queueMicrotask(()=>{if(disposed)return;let exists=false,retained=false;core.app.workspace.eachLeaves(leaf=>{if(leaf===this.leaf)exists=true;if(leaf.state.path===this.leaf.state.path)retained=true;});if(!exists){this.reader.dispose();views.delete(this);if(!retained)payloads.delete(this.leaf.state.path);}});}
  }
  lifetime.add(core.app.viewManager.registerView(type,leaf=>new link_view(leaf)));
  const split=(request:workspace_link_request,direction:"right"|"down")=>{
    if(disposed||!core.app.workspace.activeLeaf)return;
    const name=request.href.split("#")[0].split(/[\\/]/u).filter(Boolean).at(-1)||"文内链接";
    const uri=`typ://${type}/${crypto.randomUUID()}/${encodeURIComponent(name)}`;
    payloads.set(uri,{...request});
    try{core.app.commands.run(`core.workspace:split-${direction}`,[uri]);}catch(error){payloads.delete(uri);new core.Notice(String(error),4000);}
  };
  const entries=(request:workspace_link_request)=>[
    {title:"左右分屏预览链接",action:()=>split(request,"right")},
    {title:"上下分屏预览链接",action:()=>split(request,"down")},
  ];
  // 原生正文菜单保留其原有操作，只插入两个链接动作。
  const menu=document.querySelector("#context-menu"),context=runtime.File?.editor?.contextMenu;
  let menu_request:workspace_link_request|undefined;
  if(menu&&context?.show){
    const items=["左右分屏预览链接","上下分屏预览链接"].map((label,index)=>{const item=el("li","hide"),anchor=el("a","",label);item.dataset.key=`typora-code-link-preview-${index}`;anchor.tabIndex=0;anchor.setAttribute("role","menuitem");item.append(anchor);menu.append(item);return item;});
    const interaction=acquire_workspace_interaction(menu);lifetime.add(()=>interaction.remove());
    const original=context.show;
    const show=context.show=function(event:MouseEvent,node?:Element){menu_request=request_for(node||event.target as Node)||selected();items.forEach(item=>item.classList.toggle("hide",!menu_request));return original.call(this,event,node);};
    lifetime.add(()=>{if(context.show===show)context.show=original;items.forEach(item=>item.remove());});
    for(const name of ["pointerdown","mousedown","mouseup","click","keydown"])lifetime.listen(document,name,((event:Event)=>{
      const index=items.findIndex(item=>event.target instanceof Node&&item.contains(event.target));if(index<0)return;
      if(event instanceof KeyboardEvent&&!["Enter"," "].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();if((name==="click"||(event instanceof KeyboardEvent&&!event.repeat))&&menu_request){context.hide();split(menu_request,index===0?"right":"down");}
    }) as EventListener,true);
  }
  lifetime.listen(document,"contextmenu",((event:MouseEvent)=>{
    if(!(event.target instanceof Element)||!event.target.closest("#write,.typ-markdown-preview"))return;
    const request=request_for(event.target as Node)||selected();if(!request)return;
    if(menu&&context?.show&&(event.target as Element)?.closest?.("#write"))return;
    event.stopImmediatePropagation();close_menu=workspace_menu(event,entries(request));
  }) as EventListener,true);
  lifetime.listen(document,"selectionchange",update);
  lifetime.listen(document,"pointerup",update);
  const reset=()=>{last="";clearTimeout(timer);close_menu?.();menu_request=undefined;};
  return {refresh(){last="";update();},dismiss(){clearTimeout(timer);const request=selected();if(request)last=JSON.stringify(request);},reset,dispose(){if(disposed)return;disposed=true;reset();lifetime.dispose();for(const view of views){view.reader.dispose();view.leaf.parent.removeTab?.(view.leaf.state.path);}views.clear();payloads.clear();}};
}
