import {workspace_text} from "./workspace_i18n";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {workspace_element as el} from "./workspace_widgets";
import {create_workspace_lifetime} from "./workspace_lifetime";

/** Only query the installation information: do not load the user Markdown, do not run the candidate ResizeObserver, and do not recursively traverse the disk. */
export function create_terminal_panel(changed:()=>void){
  const lifetime=create_workspace_lifetime();
  const container=el("section","typora-terminal-panel"),header=el("div","terminal-panel-header"),toolbar=el("div","terminal-panel-actions"),body=el("div","terminal-panel-body"),tabs=el("div","terminal-tabs"),panes=el("div","terminal-panes"),sash=el("div","terminal-panel-sash");
  lifetime.add(acquire_workspace_interaction(container).remove);
  const title=el("span","terminal-panel-title",workspace_text("terminal_panel_terminal"));header.append(title,toolbar);body.append(panes,tabs);container.append(sash,header,body);container.hidden=true;
  container.setAttribute("aria-label",workspace_text("terminal_panel_terminal_panel"));tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label",workspace_text("terminal_panel_terminal_session"));tabs.setAttribute("aria-orientation","vertical");
  sash.tabIndex=0;sash.setAttribute("role","separator");sash.setAttribute("aria-label",workspace_text("terminal_panel_adjust_terminal_panel_height"));sash.setAttribute("aria-orientation","horizontal");
  document.body.append(container);
  const root=document.querySelector<HTMLElement>(".typ-workspace-root");
  const initial_bottom=root?.style.bottom??"",base_bottom=root?getComputedStyle(root).bottom:"0px";
  let visible=false,maximized=false,frame=0,height_ratio=0.4;
  try{const value=Number(localStorage.getItem("linux-note-terminal-panel-height"));if(value>=0.15&&value<=0.9)height_ratio=value;}catch{}
  const layout=()=>{
    // Synchronous visibility also consumes queued layouts, avoiding loss of handles and accumulation of old callbacks when fast closing and fast opening.
    cancelAnimationFrame(frame);frame=0;if(lifetime.disposed)return;
    const root_rect=root?.getBoundingClientRect();
    const footer=document.querySelector<HTMLElement>("footer.ty-footer"),footer_rect=footer?.getBoundingClientRect();
    const bottom=footer?footer_rect?.height&&getComputedStyle(footer).display!=="none"?innerHeight-footer_rect.top:0:parseFloat(base_bottom)||0;
    const top=root_rect?.top||0,available=Math.max(0,innerHeight-bottom-top),height=visible?Math.min(available,Math.max(120,maximized?available:available*height_ratio)):0;
    if(root)root.style.bottom=visible?`${bottom+height}px`:initial_bottom;
    container.style.left=(root_rect?.left||0)+"px";container.style.width=(root_rect?.width||innerWidth)+"px";container.style.bottom=bottom+"px";container.style.height=height+"px";
    container.dataset.maximized=String(maximized);sash.setAttribute("aria-valuenow",String(Math.round(height)));changed();
  };
  const schedule=()=>{if(!frame&&!lifetime.disposed)frame=requestAnimationFrame(layout);};
  const resize=new ResizeObserver(schedule);if(root)resize.observe(root);lifetime.add(()=>resize.disconnect());lifetime.listen(window,"resize",schedule);
  // The sidebar switch may only change the position of the root node, not the size.
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
    // First restore measurable dimensions, then by the caller mount/focus xterm; do not display the zero height from the previous hidden state.
    show(){if(lifetime.disposed||visible)return;visible=true;container.hidden=false;layout();},hide(){if(lifetime.disposed||!visible)return;visible=false;container.hidden=true;layout();},
    maximize(){if(lifetime.disposed)return;maximized=!maximized;schedule();},layout:schedule,dispose:lifetime.dispose};
}
