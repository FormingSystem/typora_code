import {acquire_workspace_style} from "./workspace_styles";
import {create_workspace_progress_view} from "./workspace_progress_view";
import type {git_operation_progress,git_operation_state} from "./git_operation_progress";
import css from "./git_progress.css";

/** 只呈现业务活动，不发起Git读取；标题始终维持原有布局高度。 */
export function bind_git_progress_view(owner:HTMLElement,progress:git_operation_progress){
  const style=acquire_workspace_style("typora-code-git-progress",css),view=create_workspace_progress_view(),bar=view.root;
  bar.classList.add("git-operation-progress");view.bit.classList.add("git-operation-progress-bit");owner.classList.add("git-progress-owner");owner.append(bar);
  let finish_timer:ReturnType<typeof setTimeout>|undefined,visible=false;
  const hide=()=>{clearTimeout(finish_timer);finish_timer=undefined;visible=false;view.hide();};
  const update=(state:git_operation_state)=>{
    owner.setAttribute("aria-busy",String(state.busy));
    if(!state.enabled||state.busy&&!state.running){hide();return;}
    if(state.running){
      clearTimeout(finish_timer);finish_timer=undefined;bar.setAttribute("aria-label",state.label);bar.title=state.label;bar.hidden=false;
      view.update(state.label);visible=true;
    }else if(visible&&!finish_timer){finish_timer=setTimeout(hide,300);}
  };
  const stop=progress.subscribe(update);
  return {dispose(){stop();hide();view.dispose();owner.classList.remove("git-progress-owner");owner.removeAttribute("aria-busy");style.remove();}};
}
