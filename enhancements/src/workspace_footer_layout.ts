import {acquire_workspace_style} from "./workspace_styles";
import css from "./workspace_footer_layout.css";

/** 底栏只共享几何角色，不持有任何业务状态；引用计数确保独立模块可分别清理。 */
export function acquire_workspace_footer_layout(){
  return acquire_workspace_style("typora-code-style:workspace_footer_layout",css);
}
