import {observe_workspace_theme,workspace_theme_mode} from './workspace_theme';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_colors.css';
import markdown_css from './workspace_markdown_appearance.css';

/** 仅拥有工作台颜色标记，不改宿主变量、正文节点或领域状态。 */
export function bind_workspace_colors(){
  const style=acquire_workspace_style('typora-code-style:workspace_colors',css);
  const markdown_style=acquire_workspace_style('typora-code-style:workspace_markdown_appearance',markdown_css);
  const root=document.documentElement,previous=root.getAttribute('data-workspace-colors');
  const refresh=()=>{const mode=workspace_theme_mode();if(root.getAttribute('data-workspace-colors')!==mode)root.setAttribute('data-workspace-colors',mode);};
  refresh();const release=observe_workspace_theme(refresh,'palette');let disposed=false;
  return{dispose(){if(disposed)return;disposed=true;release();markdown_style.remove();style.remove();if(previous===null)root.removeAttribute('data-workspace-colors');else root.setAttribute('data-workspace-colors',previous);}};
}
