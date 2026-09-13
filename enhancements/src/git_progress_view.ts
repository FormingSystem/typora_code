import {acquire_workspace_style} from "./workspace_styles";
import {workspace_element as el} from "./workspace_widgets";
import type {git_operation_progress,git_operation_state} from "./git_operation_progress";
import css from "./git_progress.css";

/** 只呈现业务活动，不发起Git读取；标题始终维持原有布局高度。 */
export function bind_git_progress_view(owner:HTMLElement,progress:git_operation_progress){
  const style=acquire_workspace_style("typora-code-git-progress",css),bar=el("span","git-operation-progress"),bit=el("span","git-operation-progress-bit");
  bar.setAttribute("role","progressbar");bar.hidden=true;bar.append(bit);owner.classList.add("git-progress-owner");owner.append(bar);
  let finish_timer:ReturnType<typeof setTimeout>|undefined,long_timer:ReturnType<typeof setTimeout>|undefined,visible=false;
  const clear=()=>{clearTimeout(finish_timer);clearTimeout(long_timer);finish_timer=long_timer=undefined;};
  const hide=()=>{clear();visible=false;bar.hidden=true;bar.classList.remove("is-long-running");};
  const update=(state:git_operation_state)=>{
    owner.setAttribute("aria-busy",String(state.busy));
    if(!state.enabled||state.busy&&!state.running){hide();return;}
    if(state.running){
      clearTimeout(finish_timer);finish_timer=undefined;bar.setAttribute("aria-label",state.label);bar.title=state.label;bar.hidden=false;
      if(!visible){visible=true;long_timer=setTimeout(()=>bar.classList.add("is-long-running"),10000);}
    }else if(visible&&!finish_timer){finish_timer=setTimeout(hide,300);}
  };
  const stop=progress.subscribe(update);
  return {dispose(){stop();hide();bar.remove();owner.classList.remove("git-progress-owner");owner.removeAttribute("aria-busy");style.remove();}};
}
