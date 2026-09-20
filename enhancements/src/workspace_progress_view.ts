import {acquire_workspace_style} from "./workspace_styles";
import {workspace_element as el} from "./workspace_widgets";
import css from "./workspace_progress.css";

/** 共享进度绘制；业务决定进度与结束时机，未知总量永远不生成百分比。 */
export function create_workspace_progress_view(){
 const style=acquire_workspace_style("typora-code-workspace-progress",css);
 const root=el("div","workspace-progress"),bit=el("span","workspace-progress-bit");
 root.setAttribute("role","progressbar");root.hidden=true;root.append(bit);
 let long_timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
 const clear=()=>{clearTimeout(long_timer);long_timer=undefined;root.classList.remove("is-long-running");};
 return {root,bit,
  update(label:string,value?:number){
   if(disposed)return;
   root.hidden=false;root.setAttribute("aria-label",label);
   const discrete=typeof value==="number"&&Number.isFinite(value);
   root.classList.toggle("is-discrete",discrete);
   root.setAttribute("aria-busy",String(!discrete||value<100));
   if(discrete){clear();root.setAttribute("aria-valuemin","0");root.setAttribute("aria-valuemax","100");root.setAttribute("aria-valuenow",String(Math.max(0,Math.min(100,value))));bit.style.width=Math.max(0,Math.min(100,value))+"%";}
   else {for(const name of ["aria-valuenow","aria-valuemin","aria-valuemax"])root.removeAttribute(name);bit.style.removeProperty("width");if(!long_timer)long_timer=setTimeout(()=>root.classList.add("is-long-running"),10000);}
  },
  hide(){clear();root.hidden=true;root.setAttribute("aria-busy","false");},
  dispose(){if(disposed)return;disposed=true;clear();root.remove();style.remove();}
 };
}
