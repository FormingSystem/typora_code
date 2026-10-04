import {workspace_text} from './workspace_i18n';
import {workspace_element as el} from './workspace_widgets';
import {git_icon} from './git_icons';
import {create_language_support_view} from './language_support_view';
import {acquire_workspace_style} from './workspace_styles';
import css from './community_plugins.css';
/** The Extensions shell only routes independent first-party and community views. */
export function bind_workspace_extensions(core:any){
 let mode:'languages'|'community'='languages',view:any,disposed=false;
 class extensions_sidebar extends core.SidebarPanel {
  containerEl=el('section','workspace-community-sidebar');visible=false;
  observer=new MutationObserver(()=>this.clear_native());
  constructor(){super();this.addRibbonButton({id:'typora_code:extensions',title:workspace_text('community_plugins_extension_ctrl_shift_x'),icon:git_icon('extensions'),group:'top'});this.containerEl.append(el('div','workspace-community-title',workspace_text('community_plugins_extension')));}
  clear_native(){const native=document.querySelector('#typora-sidebar');if(this.visible&&native)for(const name of ['active-tab-files','active-tab-outline','ty-show-search'])if(native.classList.contains(name))native.classList.remove(name);}
  onshow(){this.visible=true;this.clear_native();const native=document.querySelector('#typora-sidebar');if(native)this.observer.observe(native,{attributes:true,attributeFilter:['class']});show_view();}
  onhide(){this.visible=false;this.observer.disconnect();}
 }
 const panel=new extensions_sidebar(),sidebar=core.app.workspace.sidebar,remove_panel=sidebar.addPanel(panel),style=acquire_workspace_style('typora-code-style:community_plugins',css);
 const show_view=()=>{if(view)return;view=mode==='languages'?create_language_support_view(core.app.language_support,()=>open('community')):core.app.community_plugins.create_manager();panel.containerEl.append(view.content);};
 const open=(target:'languages'|'community'='languages',section?:string)=>{if(disposed)return;if(target!==mode){view?.dispose();view=undefined;mode=target;}if(sidebar.activePanel===panel){sidebar.show();show_view();}else sidebar.switch(extensions_sidebar);if(section)view?.select?.(section);view?.focus();};
 const binding={open};core.app.extensions=binding;
 const unregister=core.app.commands.register({id:'typora_code:extensions',title:workspace_text('community_plugins_extension'),scope:'global',callback:()=>open()});
 return {dispose(){disposed=true;unregister();remove_panel();panel.onhide();view?.dispose();style.remove();if(core.app.extensions===binding)delete core.app.extensions;}};
}
