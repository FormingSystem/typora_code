import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_inline_layout} from "./workspace_inline_layout";
import {bind_workspace_hover} from "./workspace_hover";
import {git_icon} from "./git_icons";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import css from "./workspace_tab_controls.css";
import {acquire_workspace_style} from "./workspace_styles";
import type {graph_core} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";

const bindings = new WeakMap<object, {dispose():void}>();
/** 包装原生标签并渲染真实状态，叶子与文件服务继续拥有文档和关闭动作。 */
export function bind_workspace_tab_controls(core:graph_core,files?:Pick<workspace_file_host,"editor_state">) {
  const existing=bindings.get(core);if(existing)return existing;
  const interaction=acquire_workspace_interaction(),inline=acquire_workspace_inline_layout();
  const style=acquire_workspace_style("typora-code-tab-controls",css),events=new AbortController();
  const marked=new Map<HTMLElement,Map<string,string|null>>();
  const strips=new Map<HTMLElement,{strip:HTMLElement}>();
  const tabs=new Map<HTMLElement,{label:HTMLElement;actions:HTMLElement;close:HTMLElement;owned:Element[];classes:string[]}>();
  let frame=0,disposed=false;
  const attr=(node:HTMLElement,name:string,value:string)=>{
    if(!marked.has(node))marked.set(node,new Map());const old=marked.get(node)!;
    if(!old.has(name))old.set(name,node.getAttribute(name));
    if(node.getAttribute(name)!==value)node.setAttribute(name,value);
  };
  const restore_attributes=(node:HTMLElement)=>{
    const values=marked.get(node);if(!values)return;
    for(const [name,value] of values){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}marked.delete(node);
  };
  const release_tab=(tab:HTMLElement)=>{
    const entry=tabs.get(tab);if(!entry)return;
    entry.owned.forEach(node=>node.remove());entry.label.replaceWith(...entry.label.childNodes);entry.actions.replaceWith(entry.close);
    entry.classes.forEach(name=>tab.classList.remove(name));restore_attributes(tab);restore_attributes(entry.close);tabs.delete(tab);
  };
  const refresh=()=>{
    frame=0;if(disposed)return;
    for(const tab of tabs.keys())if(!tab.isConnected)release_tab(tab);
    for(const [header,entry] of strips)if(!header.isConnected){if(entry.strip.parentElement){entry.strip.before(header);entry.strip.remove();}strips.delete(header);}
    for(const header of document.querySelectorAll<HTMLElement>(".typ-workspace-tabs > .typ-workspace-tab-header")){
      const strip=document.createElement("div");strip.className="workspace-tab-strip";
      header.before(strip);strip.append(header);strips.set(header,{strip});
    }
    core.app.workspace.eachLeaves(leaf=>{
      const tab=workspace_leaf_tab(leaf),close=tab?.querySelector<HTMLElement>(".typ-close");if(!tab||!close||!tab.isConnected)return;
      if(!tabs.has(tab)){
        const label=document.createElement("span"),actions=document.createElement("span");label.className="workspace-tab-label";actions.className="workspace-tab-actions";
        label.append(...[...tab.childNodes].filter(node=>node!==close));tab.prepend(label);close.before(actions);actions.append(close);
        const preview_icon=git_icon("preview","workspace-tab-preview-icon"),preview_label=document.createElement("span");preview_label.className="workspace-tab-preview-label";preview_label.textContent="预览";label.prepend(preview_icon,preview_label);
        const close_icon=git_icon("close","workspace-tab-close-icon"),dirty_icon=git_icon("circle-filled","workspace-tab-dirty-icon");close.append(close_icon,dirty_icon);
        const classes=["is-workspace-dirty","is-workspace-markdown-preview"].filter(name=>!tab.classList.contains(name));
        tabs.set(tab,{label,actions,close,owned:[preview_icon,preview_label,close_icon,dirty_icon],classes});
      }
      const view=leaf.view as typeof leaf.view&{isEditor?():boolean};
      tab.classList.toggle("is-workspace-dirty",Boolean(files?.editor_state(leaf).dirty||tab.querySelector(".workspace-file-dirty")));
      tab.classList.toggle("is-workspace-markdown-preview",typeof view.isEditor==="function"&&!view.isEditor());
      attr(tab,"data-workspace-interaction","tab");attr(tab,"role","tab");attr(tab,"aria-selected",String(tab.classList.contains("active")));attr(tab,"tabindex",tab.classList.contains("active")?"0":"-1");
      attr(close,"data-workspace-interaction","action");attr(close,"role","button");attr(close,"tabindex","0");
      attr(close,"aria-label",leaf.state.workspace_pinned?"取消固定":"关闭（Ctrl+F4）");attr(close,"title","");
    });
    for(const node of marked.keys())if(!node.isConnected)restore_attributes(node);
  };
  const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(refresh);};
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","data-id"]});
  const cleanups=[core.app.workspace.on("active-leaf:change",schedule),core.app.workspace.on("layout-changed",schedule)];
  document.addEventListener("input",schedule,{capture:true,signal:events.signal});
  document.addEventListener("keydown",event=>{
    const target=event.target;if(!(target instanceof HTMLElement)||event.altKey||event.ctrlKey||event.metaKey)return;
    const tab=target.closest<HTMLElement>(".workspace-tab-strip .typ-tab");if(!tab||!tabs.has(tab))return;
    if(["Enter"," "].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const close=target.closest<HTMLElement>(".typ-close");if(close)close.click();else tab.click();return;}
    if(target!==tab||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    const siblings=[...tab.parentElement!.querySelectorAll<HTMLElement>(".typ-tab")].filter(node=>node.getClientRects().length),index=siblings.indexOf(tab);
    const next=event.key==="Home"?siblings[0]:event.key==="End"?siblings.at(-1):siblings[(index+(event.key==="ArrowRight"?1:-1)+siblings.length)%siblings.length];
    event.preventDefault();event.stopImmediatePropagation();next?.focus({preventScroll:true});next?.scrollIntoView({block:"nearest",inline:"nearest"});
  },{capture:true,signal:events.signal});
  const hover=bind_workspace_hover(document.body,target=>{
    const close=target.closest<HTMLElement>(".workspace-tab-strip .typ-close");if(!close)return;
    const label=close.getAttribute("aria-label")||"关闭（Ctrl+F4）";return {anchor:close,label,compact:true,render:content=>{content.textContent=label;}};
  });refresh();
  const binding={dispose(){
    if(disposed)return;disposed=true;observer.disconnect();cancelAnimationFrame(frame);events.abort();cleanups.forEach(release=>release?.());hover.dispose();
    for(const tab of tabs.keys())release_tab(tab);
    for(const [header,{strip}] of strips)if(strip.parentElement){strip.before(header);strip.remove();}strips.clear();
    for(const node of marked.keys())restore_attributes(node);
    style.remove();inline.remove();interaction.remove();bindings.delete(core);
  }};
  bindings.set(core,binding);return binding;
}
