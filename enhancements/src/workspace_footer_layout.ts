import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_inline_layout} from "./workspace_inline_layout";
import css from "./workspace_footer_layout.css";

/** 底栏只共享几何角色，不持有任何业务状态；引用计数确保独立模块可分别清理。 */
export function acquire_workspace_footer_layout(){
  const interaction=acquire_workspace_interaction();
  const inline=acquire_workspace_inline_layout(),style=acquire_workspace_style("typora-code-style:workspace_footer_layout",css);
  return {remove(){style.remove();inline.remove();interaction.remove();}};
}
