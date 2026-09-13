import {get_workspace_app} from "./workspace_bootstrap";
import {is_source_file_uri,source_file_path} from "./workspace_file_uri";
import {subscribe_document_symbols} from "./workspace_document_symbols";
import {open_source_outline_settings} from "./source_outline_settings";
import {observe_terminal_theme} from "./terminal_theme";
import {git_icon,git_icon_button, type git_icon_name} from "./git_icons";
import type {source_symbol} from "./source_symbols";

/** 只读取活动源码 Monaco 模型；原生 Markdown 大纲仍由宿主维护。 */
export function install_workspace_source_outline(sidebar:HTMLElement,context_root?:()=>string){
  const pane=document.createElement("div");pane.className="workspace-source-outline";
  const toolbar=document.createElement("div");toolbar.className="workspace-source-outline-toolbar";
  const provider=document.createElement("span");provider.textContent="代码大纲";
  const tree=document.createElement("div");tree.setAttribute("role","tree");tree.setAttribute("aria-label","代码符号大纲");
  const configure=()=>open_source_outline_settings(context_root?.()||"",()=>{version=-1;schedule();});
  toolbar.append(provider,git_icon_button("settings-gear","代码大纲：解析环境设置",configure));pane.append(toolbar,tree);
  (sidebar.querySelector("#sidebar-content")||sidebar).append(pane);
  let symbols_binding:ReturnType<typeof subscribe_document_symbols>|undefined;
  const release_theme=observe_terminal_theme(theme=>{const rgb=String(theme.background).match(/[\d.]+/g)?.map(Number)||[255,255,255];pane.dataset.theme=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<128?"dark":"light";});
  let disposed=false,model:any,editor:any,leaf:any,version=-1;
  const collapsed=new Set<string>();
  const active=()=>get_workspace_app()?.workspace.activeLeaf;
  const source=()=>{const candidate=active();return candidate&&is_source_file_uri(candidate.state.path)?candidate:undefined;};
  const message=(text:string)=>{tree.replaceChildren();const label=document.createElement("p");label.textContent=text;tree.append(label);};
  const current=(target:any,target_model:any)=>!disposed&&active()===target&&model===target_model&&!target_model.isDisposed();
  const render=(symbols:source_symbol[],target:any,target_model:any)=>{
    tree.replaceChildren();
    const append=(items:source_symbol[],container:HTMLElement,depth:number,parent_key:string)=>items.forEach((symbol,index)=>{
      const key=parent_key+"/"+symbol.kind+":"+symbol.name+":"+index;
      const row=document.createElement("div");row.className="workspace-source-symbol";row.setAttribute("role","treeitem");row.setAttribute("aria-level",String(depth+1));row.dataset.symbol=symbol.name;row.dataset.symbolKind=symbol.kind;row.style.paddingLeft=`${depth*16}px`;
      const disclosure=document.createElement(symbol.children.length?"button":"span");disclosure.className="workspace-source-disclosure";
      const children=document.createElement("div");children.setAttribute("role","group");
      if(symbol.children.length){disclosure.append(git_icon("chevron-right"));disclosure.setAttribute("aria-label",`折叠或展开 ${symbol.name}`);const update=()=>{children.hidden=collapsed.has(key);row.setAttribute("aria-expanded",String(!children.hidden));};update();disclosure.onclick=()=>{if(disposed)return;collapsed.has(key)?collapsed.delete(key):collapsed.add(key);update();};}
      const button=document.createElement("button");button.className="workspace-source-symbol-label";button.title=symbol.detail;button.dataset.symbolName=symbol.name;
      const icons:Record<string,git_icon_name>={function:"symbol-method",method:"symbol-method",class:"symbol-class",struct:"symbol-structure",interface:"symbol-interface",variable:"symbol-variable",constant:"symbol-constant",property:"symbol-property",field:"symbol-field",namespace:"symbol-namespace",enum:"symbol-enum","enum-member":"symbol-enum-member","type-parameter":"symbol-parameter"};
      const label=document.createElement("span");label.textContent=symbol.name;
      button.append(git_icon(icons[symbol.kind]||"symbol-variable"),label);
      button.onclick=()=>{if(!current(target,target_model)||target_model.getVersionId()!==version)return;const start=target_model.getPositionAt(symbol.selection_start),end=target_model.getPositionAt(symbol.selection_end);const range={startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:end.column};editor.setSelection(range);editor.revealRangeInCenter(range);editor.focus();pane.querySelectorAll('[aria-selected="true"]').forEach(node=>node.removeAttribute("aria-selected"));row.setAttribute("aria-selected","true");};
      row.append(disclosure,button);container.append(row);if(symbol.children.length){container.append(children);append(symbol.children,children,depth+1,key);}
    });
    append(symbols,tree,0,"");if(!symbols.length)message("当前文件没有可显示的符号。");
  };
  const schedule=()=>symbols_binding?.refresh();
  const refresh=()=>{
    if(disposed)return;const target=source(),visible=Boolean(target&&sidebar.classList.contains("active-tab-outline"));if(pane.hidden===visible)pane.hidden=!visible;
    const next_editor=(target?.view as any)?.editor?.focused_editor?.(),next_model=next_editor?.getModel();
    if(next_model!==model||target!==leaf||!visible){symbols_binding?.dispose();symbols_binding=undefined;model=next_model;editor=next_editor;leaf=target;version=-1;collapsed.clear();}
    if(visible&&model&&!symbols_binding){const target_model=model;
      symbols_binding=subscribe_document_symbols(model,source_file_path(target.state.path)||"",context_root?.()||"",state=>{
        if(!current(target,target_model))return;version=state.version;provider.textContent=state.provider==="clangd"?"C/C++ · clangd":"代码大纲";provider.title=state.notice;pane.dataset.provider=state.provider;pane.dataset.incomplete=String(state.incomplete);
        if(state.loading)message("正在读取语法符号…");else if(state.error)message(state.error);else{render(state.symbols,target,target_model);if(state.notice){const note=document.createElement("p");note.className="workspace-source-outline-notice";note.textContent=state.notice;tree.append(note);}}
      });
    }
  };
  const observer=new MutationObserver(refresh);observer.observe(document.body,{childList:true,subtree:true});
  const unsubscribe=get_workspace_app()?.workspace.on("active-leaf:change",refresh);
  refresh();return {available:()=>Boolean(source()),refresh,configure,dispose(){if(disposed)return;disposed=true;observer.disconnect();if(typeof unsubscribe==="function")unsubscribe();symbols_binding?.dispose();release_theme();pane.remove();}};
}
