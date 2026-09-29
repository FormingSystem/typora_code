import {workspace_text} from "./workspace_i18n";
import {observe_workspace_theme} from './workspace_theme';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_colors.css';
import markdown_css from './workspace_markdown_appearance.css';
import {read_color_config,color_config_css,observe_color_config} from './workspace_color_settings';

/** Only owns the workbench color markers, does not change host variables, document content nodes, or domain status. */
export function bind_workspace_colors(){
  const style=acquire_workspace_style('typora-code-style:workspace_colors',css);
  const markdown_style=acquire_workspace_style('typora-code-style:workspace_markdown_appearance',markdown_css);
  const root=document.documentElement,previous=root.getAttribute('data-workspace-colors');
  const custom_style=document.createElement('style');custom_style.id='typora-code-custom-colors';document.head.append(custom_style);
  const refresh_custom=()=>{try{const next=color_config_css(read_color_config());if(custom_style.textContent!==next)custom_style.textContent=next;}catch(error){console.error(workspace_text("colors_custom_colors_not_loaded"),error);}};
  const refresh=()=>{
    // Typora 1.14.10 File.setTheme updates this node; only matches complete filenames, does not take over other themes according to light and dark.
    const href=document.getElementById('theme_css')?.getAttribute('href')||'';
    const name=href.split(/[\\/]/u).pop()?.split(/[?#]/u)[0].toLowerCase();
    const mode=['cpp_github-consolas.css','cpp_github-consolas_light.css','vscode2026_light.css'].includes(name||'')?'light':['night.css','cpp_github-consolas_dark.css','vscode2026_dark.css'].includes(name||'')?'dark':undefined;
    if(mode){if(root.getAttribute('data-workspace-colors')!==mode)root.setAttribute('data-workspace-colors',mode);}
    else root.removeAttribute('data-workspace-colors');
  };
  refresh();refresh_custom();const release_custom=observe_color_config(refresh_custom),release=observe_workspace_theme(refresh,'palette');let disposed=false;
  return{dispose(){if(disposed)return;disposed=true;release_custom();custom_style.remove();release();markdown_style.remove();style.remove();if(previous===null)root.removeAttribute('data-workspace-colors');else root.setAttribute('data-workspace-colors',previous);}};
}
