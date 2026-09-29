import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_inline_layout} from "./workspace_inline_layout";
import css from "./workspace_footer_layout.css";

/** The status bar only shares geometric roles, does not hold any business states; reference counting ensures independent modules can be cleaned separately. */
export function acquire_workspace_footer_layout(){
  const interaction=acquire_workspace_interaction();
  const inline=acquire_workspace_inline_layout(),style=acquire_workspace_style("typora-code-style:workspace_footer_layout",css);
  return {remove(){style.remove();inline.remove();interaction.remove();}};
}
