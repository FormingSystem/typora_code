import css from "./workspace_inline_layout.css";
import {acquire_workspace_style} from "./workspace_styles";

/** 标签和底栏共用内容居中契约，各区域继续拥有自己的高度和宽度。 */
export function acquire_workspace_inline_layout(){
  return acquire_workspace_style("typora-code-style:workspace_inline_layout",css);
}
