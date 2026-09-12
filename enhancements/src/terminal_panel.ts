import {workspace_element as el} from "./workspace_widgets";
import {create_workspace_lifetime} from "./workspace_lifetime";

/** 仅负责底部面板几何。给编辑区留出空间，原生 Markdown 跟随叶节点 ResizeObserver。 */
export function create_terminal_panel(changed:()=>void){
  const lifetime=create_workspace_lifetime();
  const container=el("section","typora-terminal-panel"),header=el("div","terminal-panel-header"),toolbar=el("div","terminal-panel-actions"),body=el("div","terminal-panel-body"),tabs=el("div","terminal-tabs"),panes=el("div","terminal-panes"),sash=el("div","terminal-panel-sash");
  const title=el("span","terminal-panel-title","终端");header.append(title,toolbar);body.append(panes,tabs);container.append(sash,header,body);container.hidden=true;
  container.setAttribute("aria-label","终端面板");tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","终端会话");tabs.setAttribute("aria-orientation","vertical");
  sash.tabIndex=0;sash.setAttribute("role","separator");sash.setAttribute("aria-label","调整终端面板高度");sash.setAttribute("aria-orientation","horizontal");
  document.body.append(container);
  const root=document.querySelector<HTMLElement>(".typ-workspace-root");
  const initial_bottom=root?.style.bottom??"",base_bottom=root?getComputedStyle(root).bottom:"0px";
  let visible=false,maximized=false,frame=0,height_ratio=0.4;
  try{const value=Number(localStorage.getItem("linux-note-terminal-panel-height"));if(value>=0.15&&value<=0.9)height_ratio=value;}catch{}
  const layout=()=>{
    frame=0;if(lifetime.disposed)return;
    const root_rect=root?.getBoundingClientRect();
    const footer=document.querySelector<HTMLElement>("footer.ty-footer"),footer_rect=footer?.getBoundingClientRect();
    const bottom=footer_rect&&footer_rect.height&&getComputedStyle(footer!).display!=="none"?innerHeight-footer_rect.top:parseFloat(base_bottom)||0;
    const top=root_rect?.top||0,available=Math.max(0,innerHeight-bottom-top),height=visible?Math.min(available,Math.max(120,maximized?available:available*height_ratio)):0;
    if(root)root.style.bottom=visible?`calc(${base_bottom} + ${height}px)`:initial_bottom;
    container.style.left=(root_rect?.left||0)+"px";container.style.width=(root_rect?.width||innerWidth)+"px";container.style.bottom=bottom+"px";container.style.height=height+"px";
    container.dataset.maximized=String(maximized);sash.setAttribute("aria-valuenow",String(Math.round(height)));changed();
  };
  const schedule=()=>{if(!frame&&!lifetime.disposed)frame=requestAnimationFrame(layout);};
  const resize=new ResizeObserver(schedule);if(root)resize.observe(root);lifetime.add(()=>resize.disconnect());lifetime.listen(window,"resize",schedule);
  // 侧栏开关可能只改变根节点位置、不改变尺寸。
  const mutation=new MutationObserver(schedule);mutation.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});mutation.observe(document.body,{attributes:true,attributeFilter:["class"]});lifetime.add(()=>mutation.disconnect());
  const set_height=(y:number)=>{const top=root?.getBoundingClientRect().top||0,bottom=parseFloat(container.style.bottom)||0,available=innerHeight-bottom-top;height_ratio=Math.min(0.9,Math.max(0.15,(innerHeight-bottom-y)/Math.max(1,available)));maximized=false;schedule();};
  let drag:number|undefined,previous_ratio=height_ratio;
  const persist=()=>{try{localStorage.setItem("linux-note-terminal-panel-height",String(height_ratio));}catch{}};
  sash.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();previous_ratio=height_ratio;drag=event.pointerId;sash.setPointerCapture(drag);};
  sash.onpointermove=event=>{if(event.pointerId===drag)set_height(event.clientY);};
  const finish=()=>{if(drag===undefined)return;drag=undefined;persist();};
  sash.onpointerup=finish;sash.onpointercancel=()=>{if(drag!==undefined){height_ratio=previous_ratio;drag=undefined;schedule();}};sash.onlostpointercapture=finish;
  sash.onkeydown=event=>{if(event.key!=="ArrowUp"&&event.key!=="ArrowDown")return;event.preventDefault();height_ratio=Math.min(0.9,Math.max(0.15,height_ratio+(event.key==="ArrowUp"?0.05:-0.05)));maximized=false;persist();schedule();};
  lifetime.add(()=>{cancelAnimationFrame(frame);container.remove();if(root)root.style.bottom=initial_bottom;});
  return {container,header,title,toolbar,body,tabs,panes,get visible(){return visible;},get maximized(){return maximized;},
    show(){if(lifetime.disposed)return;visible=true;container.hidden=false;schedule();},hide(){if(lifetime.disposed)return;visible=false;container.hidden=true;layout();},
    maximize(){if(lifetime.disposed)return;maximized=!maximized;schedule();},layout:schedule,dispose:lifetime.dispose};
}
