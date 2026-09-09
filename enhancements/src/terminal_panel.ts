import type { graph_leaf } from "./git_graph_host";
import { workspace_element as el, workspace_button as button } from "./workspace_widgets";
import { git_icon } from "./git_icons";
import panel_css from "./terminal_panel.css";

type panel_view = {leaf: graph_leaf;containerEl: HTMLElement;onOpen(): void;resize(): void;active: boolean};
/** 底部 Panel 只借用编辑区下缘；不改变宿主的定位方式、左右布局或节点身份。 */
export function create_terminal_panel(root: HTMLElement, move_editor: (view: panel_view) => void, new_terminal: (event?: MouseEvent) => void) {
  const style=el("style");style.textContent=panel_css;document.head.append(style);
  const panel=el("section","typora-terminal-panel");panel.hidden=true;
  const sash=el("div","typora-terminal-panel-sash");sash.tabIndex=0;sash.setAttribute("role","separator");sash.setAttribute("aria-orientation","horizontal");sash.setAttribute("aria-label","调整终端面板高度");
  const heading=el("div","typora-terminal-panel-heading"),tabs=el("div","typora-terminal-panel-tabs"),body=el("div","typora-terminal-panel-body");
  tabs.setAttribute("role","tablist");
  const action=(icon: Parameters<typeof git_icon>[0], title: string, run:()=>void)=>{const node=button("",run);node.title=title;node.setAttribute("aria-label",title);node.append(git_icon(icon));return node;};
  const profile_menu=action("chevron-down","选择终端配置",()=>{});profile_menu.onclick=event=>new_terminal(event);
  heading.append(el("span","typora-terminal-panel-label","终端"),tabs,action("add","新建终端",()=>new_terminal()),profile_menu,action("arrow-up","将终端移到编辑区",()=>{if(active)move_editor(active);}),action("close","隐藏面板",()=>hide()));
  panel.append(sash,heading,body);document.body.append(panel);
  const views=new Map<graph_leaf,panel_view>();let active:panel_view|undefined;let height=240;let shown=false;let disposed=false;let frame=0;
  let original_bottom="",original_priority="",base_bottom=0;let drag_y=0,drag_height=0,dragging=false;
  const events=new AbortController();
  const layout=()=>{
    frame=0;if(!shown||disposed)return;
    const rect=root.getBoundingClientRect();height=Math.max(80,Math.min(height,innerHeight-rect.top-base_bottom-80));
    root.style.setProperty("--typora-terminal-panel-height",height+"px");root.style.bottom=(base_bottom+height)+"px";
    panel.style.left=rect.left+"px";panel.style.width=rect.width+"px";panel.style.bottom=base_bottom+"px";panel.style.height=height+"px";
    sash.setAttribute("aria-valuenow",String(Math.round(height)));active?.resize();
  };
  const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(layout);};
  const observer=new ResizeObserver(schedule);observer.observe(root);
  const refresh_tabs=()=>{tabs.replaceChildren();for(const view of views.values()){const tab=button(view.leaf.state.path.split("/").at(-1)||"终端",()=>show(view));tab.setAttribute("role","tab");tab.setAttribute("aria-selected",String(view===active));tabs.append(tab);}};
  const show=(view=active)=>{
    if(disposed||!view)return;
    if(!shown){original_bottom=root.style.getPropertyValue("bottom");original_priority=root.style.getPropertyPriority("bottom");base_bottom=innerHeight-root.getBoundingClientRect().bottom;shown=true;}
    if(active&&active!==view)active.active=false;active=view;panel.hidden=false;body.replaceChildren(view.containerEl);refresh_tabs();layout();view.onOpen();
  };
  const hide=()=>{if(!shown)return;shown=false;dragging=false;panel.hidden=true;if(active)active.active=false;root.style.removeProperty("--typora-terminal-panel-height");if(original_bottom)root.style.setProperty("bottom",original_bottom,original_priority);else root.style.removeProperty("bottom");};
  const attach=(view:panel_view)=>{views.set(view.leaf,view);show(view);};
  const release=(leaf:graph_leaf)=>{const view=views.get(leaf);views.delete(leaf);if(active===view){active=views.values().next().value;if(active)show(active);else hide();}refresh_tabs();return view;};
  sash.addEventListener("pointerdown",event=>{if(event.button!==0)return;event.preventDefault();dragging=true;drag_y=event.clientY;drag_height=height;sash.setPointerCapture(event.pointerId);},{signal:events.signal});
  sash.addEventListener("pointermove",event=>{if(dragging){height=drag_height+drag_y-event.clientY;layout();}},{signal:events.signal});
  sash.addEventListener("pointerup",()=>{dragging=false;},{signal:events.signal});sash.addEventListener("pointercancel",()=>{dragging=false;},{signal:events.signal});
  sash.addEventListener("keydown",event=>{if(event.key!=="ArrowUp"&&event.key!=="ArrowDown")return;event.preventDefault();height+=event.key==="ArrowUp"?10:-10;layout();},{signal:events.signal});
  window.addEventListener("resize",schedule,{signal:events.signal});
  return {attach,release,show,hide,has:(leaf:graph_leaf)=>views.has(leaf),get visible(){return shown;},get has_views(){return views.size>0;},dispose(){if(disposed)return;hide();disposed=true;events.abort();observer.disconnect();cancelAnimationFrame(frame);views.clear();panel.remove();style.remove();}};
}
