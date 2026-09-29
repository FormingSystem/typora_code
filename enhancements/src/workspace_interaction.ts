import css from "./workspace_interaction.css";
import {acquire_workspace_style} from "./workspace_styles";

export type workspace_interaction_role = "action"|"menu"|"row"|"tab"|"activity"|"primary"|"none";
/** Factory default connection, special controls only declare semantics; geometry and business states remain with the caller. */
export function workspace_interaction<T extends HTMLElement>(node:T,role:workspace_interaction_role="action"):T {
  node.setAttribute("data-workspace-interaction",role);return node;
}
/** Semantic controls dynamically inserted at the root level automatically adopt default rules, and are restored to the original scope when destroyed. */
export function acquire_workspace_interaction(root?:HTMLElement){
  const previous=root?.getAttribute("data-workspace-surface")??null;
  root?.setAttribute("data-workspace-surface","");
  const style=acquire_workspace_style("typora-code-style:workspace_interaction",css);
  let removed=false;
  return {remove(){if(removed)return;removed=true;style.remove();if(root){if(previous===null)root.removeAttribute("data-workspace-surface");else root.setAttribute("data-workspace-surface",previous);}}};
}
