import {create_workspace_lifetime} from "./workspace_lifetime";
import {workspace_zoom_available,type workspace_zoom_runtime} from "./workspace_zoom";
import {acquire_workspace_footer_layout} from "./workspace_footer_layout";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {bind_workspace_hover,type workspace_hover_target} from "./workspace_hover";
import {capture_workspace_focus,register_workspace_dismissal,type workspace_focus_snapshot} from "./workspace_focus";
import {workspace_button,workspace_element as el} from "./workspace_widgets";
import {git_icon,type git_icon_name} from "./git_icons";
import css from "./workspace_zoom_status.css";

type zoom_app={commands:{run(id:string):void}};
type zoom_runtime=workspace_zoom_runtime&{reqnode?:(name:string)=>any};
const bindings=new WeakMap<HTMLElement,{dispose():void}>();
/** UI只读实际窗口比例；所有写操作仍交给唯一原生命令和设置所有者。 */
export function bind_workspace_zoom_status(app:zoom_app,runtime:zoom_runtime=window as any){
  const footer=document.querySelector<HTMLElement>("footer.ty-footer");if(!footer)return;
  const existing=bindings.get(footer);if(existing)return existing;
  let frame:{getZoomLevel():number;getZoomFactor():number};
  try{frame=runtime.reqnode?.("electron")?.webFrame;if(!frame||typeof frame.getZoomLevel!=="function"||typeof frame.getZoomFactor!=="function")return;}catch{return;}
  const lifetime=create_workspace_lifetime(),layout=acquire_workspace_footer_layout(),style=acquire_workspace_style("typora-code-style:workspace_zoom_status",css);
  lifetime.add(()=>layout.remove());lifetime.add(()=>style.remove());
  const group=el("div","workspace-zoom-status workspace-footer-group"),trigger=workspace_button("",()=>open(),"workspace-footer-control");
  trigger.dataset.zoomAction="toggle";trigger.setAttribute("aria-label","窗口缩放");trigger.setAttribute("aria-haspopup","dialog");trigger.setAttribute("aria-expanded","false");
  group.append(trigger);footer.append(group);
  let popup:HTMLElement|undefined,previous:workspace_focus_snapshot|undefined,update_popup:(()=>void)|undefined,update_frame=0;
  const read=()=>{try{const level=frame.getZoomLevel(),factor=frame.getZoomFactor();return Number.isFinite(level)&&Number.isFinite(factor)&&factor>0?{level,factor}:undefined;}catch{return;}};
  const close=(restore=false)=>{const focus=previous;hover.hide(restore?()=>focus?.restore():undefined);};
  const sync=()=>{
    update_frame=0;if(lifetime.disposed)return;
    const state=read(),hidden=!state;
    if(hidden&&popup)close(popup.contains(document.activeElement));
    group.hidden=hidden;
    if(!state)return;
    const name:git_icon_name=state.level<0?"zoom-out":"zoom-in";
    if(trigger.firstElementChild?.getAttribute("data-git-icon")!==name)trigger.replaceChildren(git_icon(name));
    trigger.setAttribute("aria-label",`窗口缩放：${Math.round(state.factor*100)}%`);
    update_popup?.();hover.reposition();
  };
  const schedule=()=>{if(!lifetime.disposed&&!update_frame)update_frame=requestAnimationFrame(sync);};
  const run=(id:string)=>{
    if(!workspace_zoom_available(runtime,id))return;
    try{app.commands.run(id);sync();}catch(error){if(popup){popup.setAttribute("aria-label","窗口缩放失败");popup.title=String(error);}schedule();}
  };
  const target:workspace_hover_target={anchor:trigger,label:"窗口缩放",preferred_side:"above",show_pointer:true,render(content,signal){
    popup=content;content.classList.add("workspace-zoom-controls");content.tabIndex=-1;
    previous??=capture_workspace_focus(trigger);
    trigger.setAttribute("aria-expanded","true");document.body.setAttribute("data-workspace-zoom-controls-open","");
    const interaction=acquire_workspace_interaction(content);
    const layer=register_workspace_dismissal(()=>[content],reason=>close(reason==="escape"),{inside:()=>[content,trigger],window_blur:true});
    signal.addEventListener("abort",()=>{layer.dispose();interaction.remove();trigger.setAttribute("aria-expanded","false");document.body.removeAttribute("data-workspace-zoom-controls-open");popup=undefined;update_popup=undefined;previous=undefined;},{once:true});
    const button=(name:git_icon_name,label:string,action:string,callback:()=>void)=>{const node=workspace_button("",callback);node.dataset.zoomAction=action;node.title=label;node.setAttribute("aria-label",label);node.append(git_icon(name));return node;};
    const out=button("remove","缩小（Ctrl+-）","out",()=>run("linux_note:zoom_out"));
    const value=el("span","workspace-zoom-level");value.setAttribute("aria-live","polite");
    const into=button("add","放大（Ctrl+=）","in",()=>run("linux_note:zoom_in"));
    const right=el("div","workspace-zoom-controls-right");
    const reset=workspace_button("重置",()=>run("linux_note:zoom_reset"));reset.dataset.zoomAction="reset";reset.title="恢复实际大小（100%）";
    const settings=button("settings-gear","缩放设置（偏好设置 → 外观）","settings",()=>{
      if(typeof runtime.ClientCommand?.showPreferencePanel!=="function")return;
      close(true);runtime.ClientCommand.showPreferencePanel();
    });
    right.append(reset,settings);content.append(out,value,into,right);
    update_popup=()=>{const state=read();value.textContent=state?String(Math.round(state.level*100)/100):"";value.title=state?`缩放比例：${Math.round(state.factor*100)}%`:"无法读取窗口比例";out.disabled=!workspace_zoom_available(runtime,"linux_note:zoom_out");into.disabled=!workspace_zoom_available(runtime,"linux_note:zoom_in");reset.disabled=!workspace_zoom_available(runtime,"linux_note:zoom_reset");settings.disabled=typeof runtime.ClientCommand?.showPreferencePanel!=="function";};
    update_popup();
    content.addEventListener("keydown",event=>{
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const controls=[...content.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")],index=controls.indexOf(document.activeElement as HTMLButtonElement);
      controls[event.key==="Home"?0:event.key==="End"?controls.length-1:(index+(event.key==="ArrowLeft"?controls.length-1:1))%controls.length]?.focus({preventScroll:true});
    },{signal});
  }};
  const hover=bind_workspace_hover(group,node=>trigger.contains(node)&&!group.hidden?target:undefined,{interactive:true});
  const open=()=>{if(group.hidden)return;previous??=capture_workspace_focus(trigger);const view=hover.show(target);view?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({preventScroll:true});};
  lifetime.listen(trigger,"pointerdown",()=>{if(!popup)previous=capture_workspace_focus(trigger);});
  lifetime.listen(window,"resize",schedule);lifetime.listen(window,"focus",schedule);
  const hint=document.querySelector("#zoom-hint-current"),observer=new MutationObserver(schedule);if(hint)observer.observe(hint,{childList:true,characterData:true,subtree:true});
  lifetime.add(()=>{cancelAnimationFrame(update_frame);observer.disconnect();hover.dispose();group.remove();bindings.delete(footer);});
  const binding={dispose:lifetime.dispose};bindings.set(footer,binding);sync();return binding;
}
