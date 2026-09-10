import css from "./workspace_tab_controls.css";
import {acquire_workspace_style} from "./workspace_styles";
import type {graph_core} from "./git_graph_host";

const bindings = new WeakMap<object, {dispose():void}>();

/** 保留核心标签及其滚动容器，统一标签几何与状态，不添加组内搜索入口。 */
export function bind_workspace_tab_controls(core:graph_core) {
  const existing=bindings.get(core);if(existing)return existing;
  const style=acquire_workspace_style("typora-code-tab-controls",css);
  const strips=new Map<HTMLElement,{strip:HTMLElement}>();
  let frame=0,disposed=false;
  const refresh=()=>{
    frame=0;if(disposed)return;
    for(const [header,entry] of strips)if(!header.isConnected){if(entry.strip.parentElement){entry.strip.before(header);entry.strip.remove();}strips.delete(header);}
    for(const header of document.querySelectorAll<HTMLElement>(".typ-workspace-tabs > .typ-workspace-tab-header")){
      const strip=document.createElement("div");strip.className="workspace-tab-strip";
      header.before(strip);strip.append(header);strips.set(header,{strip});
    }
  };
  const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(refresh);});
  observer.observe(document.body,{childList:true,subtree:true});refresh();
  const binding={dispose(){if(disposed)return;disposed=true;observer.disconnect();cancelAnimationFrame(frame);for(const [header,{strip}] of strips){if(strip.parentElement){strip.before(header);strip.remove();}}strips.clear();style.remove();bindings.delete(core);}};
  bindings.set(core,binding);return binding;
}
