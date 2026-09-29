import css from "./workspace_inline_layout.css";
import {acquire_workspace_style} from "./workspace_styles";

/** Tags and status bar share the content centering contract; each area continues to have its own height and width. */
export function acquire_workspace_inline_layout(){
  return acquire_workspace_style("typora-code-style:workspace_inline_layout",css);
}
