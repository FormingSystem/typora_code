import css from "./workspace_tab_controls.css";
import {acquire_workspace_style} from "./workspace_styles";
import {git_icon} from "./git_icons";
import type {graph_core} from "./git_graph_host";

const bindings = new WeakMap<object, {dispose():void}>();

/** 保留核心标签及其滚动容器，在每个编辑组的固定动作区提供文件搜索。 */
export function bind_workspace_tab_controls(core:graph_core,open_files:()=>void) {
  const existing=bindings.get(core);if(existing)return existing;
  const style=acquire_workspace_style("typora-code-tab-controls",css);
  const strips=new Map<HTMLElement,{strip:HTMLElement;button:HTMLButtonElement}>();
  let frame=0,disposed=false;
  const refresh=()=>{
    frame=0;if(disposed)return;
    for(const [header,entry] of strips)if(!header.isConnected){entry.button.onclick=null;if(entry.strip.parentElement){entry.strip.before(header);entry.strip.remove();}strips.delete(header);}
    for(const header of document.querySelectorAll<HTMLElement>(".typ-workspace-tabs > .typ-workspace-tab-header")){
      const group=header.parentElement!;
      const strip=document.createElement("div");strip.className="workspace-tab-strip";
      const action=document.createElement("button");action.type="button";action.className="workspace-file-search-trigger";
      action.title="快速打开文件 (Ctrl+P)";action.setAttribute("aria-label",action.title);
      const label=document.createElement("span");label.textContent="搜索文件";
      action.append(git_icon("search"),label);
      action.onclick=()=>{
        core.app.workspace.eachLeaves(leaf=>{if(leaf.parent.containerEl===group&&leaf.containerEl.classList.contains("mod-active"))core.app.workspace.activeLeaf=leaf;});
        open_files();
      };
      header.before(strip);strip.append(header,action);strips.set(header,{strip,button:action});
    }
  };
  const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(refresh);});
  observer.observe(document.body,{childList:true,subtree:true});refresh();
  const binding={dispose(){if(disposed)return;disposed=true;observer.disconnect();cancelAnimationFrame(frame);for(const [header,{strip,button}] of strips){button.onclick=null;if(strip.parentElement){strip.before(header);strip.remove();}}strips.clear();style.remove();bindings.delete(core);}};
  bindings.set(core,binding);return binding;
}
