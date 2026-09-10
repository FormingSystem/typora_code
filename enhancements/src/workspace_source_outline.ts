import {get_workspace_app} from "./workspace_bootstrap";
import {is_source_file_uri} from "./workspace_file_uri";
import {create_source_symbol_service} from "./source_symbol_service";
import {git_icon, type git_icon_name} from "./git_icons";
import type {source_symbol} from "./source_symbols";

/** 只读取活动源码 Monaco 模型；原生 Markdown 大纲仍由宿主维护。 */
export function install_workspace_source_outline(sidebar:HTMLElement){
  const pane=document.createElement("div");pane.className="workspace-source-outline";pane.setAttribute("role","tree");pane.setAttribute("aria-label","代码符号大纲");
  (sidebar.querySelector("#sidebar-content")||sidebar).append(pane);
  const service=create_source_symbol_service();
  let disposed=false,model:any,editor:any,leaf:any,subscription:any,language_subscription:any,timer=0,version=-1,language="",request:AbortController|undefined;
  const collapsed=new Set<string>();
  const active=()=>get_workspace_app()?.workspace.activeLeaf;
  const source=()=>{const candidate=active();return candidate&&is_source_file_uri(candidate.state.path)?candidate:undefined;};
  const message=(text:string)=>{pane.replaceChildren();const label=document.createElement("p");label.textContent=text;pane.append(label);};
  const current=(target:any,target_model:any)=>!disposed&&active()===target&&model===target_model&&!target_model.isDisposed();
  const render=(symbols:source_symbol[],target:any,target_model:any)=>{
    pane.replaceChildren();
    const append=(items:source_symbol[],container:HTMLElement,depth:number,parent_key:string)=>items.forEach((symbol,index)=>{
      const key=parent_key+"/"+symbol.kind+":"+symbol.name+":"+index;
      const row=document.createElement("div");row.className="workspace-source-symbol";row.setAttribute("role","treeitem");row.setAttribute("aria-level",String(depth+1));row.dataset.symbol=symbol.name;row.style.paddingLeft=`${depth*16}px`;
      const disclosure=document.createElement(symbol.children.length?"button":"span");disclosure.className="workspace-source-disclosure";
      const children=document.createElement("div");children.setAttribute("role","group");
      if(symbol.children.length){disclosure.append(git_icon("chevron-right"));disclosure.setAttribute("aria-label",`折叠或展开 ${symbol.name}`);const update=()=>{children.hidden=collapsed.has(key);row.setAttribute("aria-expanded",String(!children.hidden));};update();disclosure.onclick=()=>{if(disposed)return;collapsed.has(key)?collapsed.delete(key):collapsed.add(key);update();};}
      const button=document.createElement("button");button.className="workspace-source-symbol-label";button.title=symbol.detail;button.dataset.symbolName=symbol.name;
      const icons:Record<string,git_icon_name>={function:"symbol-method",method:"symbol-method",class:"symbol-class",variable:"symbol-variable",property:"symbol-property",namespace:"symbol-namespace",enum:"symbol-enum"};
      button.append(git_icon(icons[symbol.kind]||"symbol-variable"),document.createTextNode(symbol.name));
      button.onclick=()=>{if(!current(target,target_model)||target_model.getVersionId()!==version)return;const start=target_model.getPositionAt(symbol.selection_start),end=target_model.getPositionAt(symbol.selection_end);const range={startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:end.column};editor.setSelection(range);editor.revealRangeInCenter(range);editor.focus();pane.querySelectorAll('[aria-selected="true"]').forEach(node=>node.removeAttribute("aria-selected"));row.setAttribute("aria-selected","true");};
      row.append(disclosure,button);container.append(row);if(symbol.children.length){container.append(children);append(symbol.children,children,depth+1,key);}
    });
    append(symbols,pane,0,"");if(!symbols.length)message("未找到可识别的语法符号。");
  };
  const parse=async()=>{
    timer=0;if(disposed||!model||model.isDisposed())return;
    request?.abort();const controller=request=new AbortController(),target=leaf,target_model=model,target_version=model.getVersionId();version=target_version;language=model.getLanguageId();
    message("正在读取语法符号…");
    try{const result=await service.parse(language,model.getValue(),controller.signal);if(controller.signal.aborted||!current(target,target_model)||target_model.getVersionId()!==target_version)return;render(result.symbols,target,target_model);pane.dataset.incomplete=String(result.incomplete);if(result.incomplete){const note=document.createElement("p");note.textContent="语法尚未完整，显示可识别的符号。";pane.append(note);}}
    catch(error){if(!controller.signal.aborted&&current(target,target_model))message(String(error instanceof Error?error.message:error));}
  };
  const schedule=()=>{request?.abort();clearTimeout(timer);timer=window.setTimeout(parse,150);};
  const refresh=()=>{
    if(disposed)return;const target=source(),visible=Boolean(target&&sidebar.classList.contains("active-tab-outline"));if(pane.hidden===visible)pane.hidden=!visible;
    const next_editor=(target?.view as any)?.editor?.focused_editor?.(),next_model=next_editor?.getModel();
    if(next_model!==model||target!==leaf){subscription?.dispose();language_subscription?.dispose();request?.abort();clearTimeout(timer);timer=0;model=next_model;editor=next_editor;leaf=target;version=-1;collapsed.clear();
      if(model){subscription=model.onDidChangeContent(schedule);language_subscription=model.onDidChangeLanguage(schedule);}else if(target)message("正在等待源码编辑器…");
    }
    if(visible&&model&&!timer&&(version!==model.getVersionId()||language!==model.getLanguageId()))schedule();
  };
  const observer=new MutationObserver(refresh);observer.observe(document.body,{childList:true,subtree:true});
  const unsubscribe=get_workspace_app()?.workspace.on("active-leaf:change",refresh);
  refresh();return {available:()=>Boolean(source()),refresh,dispose(){if(disposed)return;disposed=true;observer.disconnect();if(typeof unsubscribe==="function")unsubscribe();subscription?.dispose();language_subscription?.dispose();request?.abort();clearTimeout(timer);service.dispose();pane.remove();}};
}
