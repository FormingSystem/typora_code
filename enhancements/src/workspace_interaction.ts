import css from "./workspace_interaction.css";
import {acquire_workspace_style} from "./workspace_styles";

export type workspace_interaction_role = "action"|"menu"|"row"|"tab"|"activity"|"primary"|"none";
/** 工厂默认接入，特殊控件仅声明语义；几何与业务状态留在调用方。 */
export function workspace_interaction<T extends HTMLElement>(node:T,role:workspace_interaction_role="action"):T {
  node.setAttribute("data-workspace-interaction",role);return node;
}
/** 根范围内动态插入的语义控件自动采用默认规则，销毁时恢复原范围。 */
export function acquire_workspace_interaction(root?:HTMLElement){
  const previous=root?.getAttribute("data-workspace-surface")??null;
  root?.setAttribute("data-workspace-surface","");
  const style=acquire_workspace_style("typora-code-style:workspace_interaction",css);
  let removed=false;
  return {remove(){if(removed)return;removed=true;style.remove();if(root){if(previous===null)root.removeAttribute("data-workspace-surface");else root.setAttribute("data-workspace-surface",previous);}}};
}
