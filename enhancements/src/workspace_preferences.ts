import css from "./workspace_preferences.css";
import {acquire_workspace_style} from "./workspace_styles";
import {workspace_menu} from "./workspace_widgets";
import type {graph_core} from "./git_graph_host";
import {git_icon} from './git_icons';

const bindings = new WeakMap<object, {dispose():void}>();

/** 设置入口共享菜单；原生偏好和插件配置保持各自的状态所有者。 */
export function bind_workspace_preferences(core:graph_core) {
  const existing=bindings.get(core);if(existing)return existing;
  const style=acquire_workspace_style("typora-code-preferences",css);
  const button=document.createElement("button");button.type="button";
  button.className="typ-ribbon-item workspace-preferences-trigger";
  button.dataset.id="typora_code:preferences";button.title="管理";button.setAttribute("aria-label",button.title);
  button.append(git_icon('settings-gear'));
  let close_menu:(()=>void)|undefined;
  button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');
  button.onclick=event=>{
    if(close_menu){close_menu();return;}
    const plugins=Boolean((core.app as any).community_plugins);
    button.setAttribute('aria-expanded','true');
    close_menu=workspace_menu(event,[
      {title:'设置',shortcut:'Ctrl+,',action:()=>core.app.commands.run('typora_code:settings')},
      {title:'扩展…',shortcut:'Ctrl+Shift+X',disabled:!plugins,action:()=>core.app.commands.run('typora_code:community_plugins')},
    ],'workspace-preferences-menu',()=>{close_menu=undefined;button.setAttribute('aria-expanded','false');},{anchor:button});
  };
  let disposed=false;
  const refresh=()=>{if(disposed)return;const bottom=document.querySelector(".typ-ribbon > .group.bottom");if(bottom&&button.parentElement!==bottom)bottom.prepend(button);};
  const observer=new MutationObserver(refresh);observer.observe(document.body,{childList:true,subtree:true});refresh();
  const binding={dispose(){if(disposed)return;disposed=true;close_menu?.();observer.disconnect();button.onclick=null;button.remove();style.remove();bindings.delete(core);}};
  bindings.set(core,binding);return binding;
}
