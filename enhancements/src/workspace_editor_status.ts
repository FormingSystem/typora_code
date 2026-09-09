import type { graph_core, graph_leaf } from "./git_graph_host";
import editor_status_css from "./workspace_editor_status.css";

type workspace_editor_status = {container:HTMLElement;register(leaf:graph_leaf,controls:HTMLElement):void;release(leaf:graph_leaf):void;refresh():void;schedule():void;dispose():void};
const status_bindings=new WeakMap<graph_core,workspace_editor_status>();

/** 唯一状态栏只挂载活动 leaf 的原控件；后台编辑器仍更新自己的离屏节点。 */
export function bind_workspace_editor_status(core: graph_core):workspace_editor_status {
  const existing=status_bindings.get(core);if(existing)return existing;
  const footer=document.querySelector<HTMLElement>("footer.ty-footer");
  const native_actions=document.querySelector<HTMLElement>("#ty-sidebar-footer");
  const container=document.createElement("div");container.className="linux-note-editor-status";container.hidden=true;
  container.setAttribute("role","group");container.setAttribute("aria-label","当前编辑器状态");
  const style=document.createElement("style");style.textContent=editor_status_css;document.head.append(style);
  const owners=new Map<graph_leaf,HTMLElement>();let disposed=false,frame=0,observed_controls:HTMLElement|undefined;
  if(footer)footer.insertBefore(container,footer.querySelector("#ty-sidebar-footer,.footer-item-right"));
  const layout=()=>{
    if(!footer||disposed)return;const controls=container.firstElementChild;
    if(!controls){footer.removeAttribute("data-editor-status");return;}
    const information=[...controls.querySelectorAll<HTMLElement>(".workspace-file-location,.workspace-file-detail,button")].reduce((width,node)=>width+node.scrollWidth,32);
    const message=controls.querySelector<HTMLElement>(".workspace-file-status");if(message)message.title=message.textContent||"";
    const other=[...footer.children].filter(node=>node!==container&&node.id!=="ty-sidebar-footer"&&node.id!=="footer-word-count"&&node.id!=="footer-spell-check");
    const reserved=other.reduce((width,node)=>width+(node as HTMLElement).scrollWidth,0);
    const actions_width=native_actions?.getBoundingClientRect().width||0;
    const value=footer.clientWidth<information+reserved+actions_width?"compact":"ready";
    if(footer.getAttribute("data-editor-status")!==value)footer.setAttribute("data-editor-status",value);
  };
  const refresh=()=>{
    if(disposed)return;const active=core.app.workspace.activeLeaf;
    const controls=active?owners.get(active):undefined;
    if(observed_controls!==controls){contents.disconnect();observed_controls=controls;if(controls)contents.observe(controls,{childList:true,characterData:true,subtree:true});}
    if(controls){if(container.firstChild!==controls)container.replaceChildren(controls);container.hidden=false;container.setAttribute("data-editor-path",active!.state.path);}
    else {container.replaceChildren();container.hidden=true;container.removeAttribute("data-editor-path");}
    layout();
  };
  const schedule=()=>{if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;refresh();});};
  const contents=new MutationObserver(schedule);
  // 社区 core EventEmitter.on 返回退订函数；active-leaf:change 已在真实核心核对。
  const unsubscribe=(core.app.workspace as unknown as {on(name:string,callback:()=>void):void|(()=>void)}).on("active-leaf:change",refresh);
  const resize=new ResizeObserver(schedule);if(footer)resize.observe(footer);if(native_actions)resize.observe(native_actions);
  document.addEventListener("focusin",schedule,true);window.addEventListener("resize",schedule);
  const dispose=()=>{if(disposed)return;disposed=true;if(frame)cancelAnimationFrame(frame);resize.disconnect();contents.disconnect();if(typeof unsubscribe==="function")unsubscribe();document.removeEventListener("focusin",schedule,true);window.removeEventListener("resize",schedule);window.removeEventListener("unload",dispose);owners.clear();container.remove();footer?.removeAttribute("data-editor-status");style.remove();status_bindings.delete(core);};
  window.addEventListener("unload",dispose);
  const binding={container,register(leaf:graph_leaf,controls:HTMLElement){owners.set(leaf,controls);refresh();},release(leaf:graph_leaf){owners.delete(leaf);refresh();},refresh,schedule,dispose};
  status_bindings.set(core,binding);return binding;
}
