import {workspace_button,workspace_dialog,workspace_element} from './workspace_widgets';

/** 插件设置只呈现公共SettingTab；持久化仍归插件自身的PluginSettings。 */
export function create_community_plugin_settings(list:()=>any[],on_change:()=>void,navigate:(mode:string)=>void=()=>{}){
  const tabs=new Map<string,Set<any>>();
  const opened=new Map<string,ReturnType<typeof workspace_dialog>>();
  let chooser:ReturnType<typeof workspace_dialog>|undefined;
  const render=()=>{
    if(!chooser)return;
    chooser.content.replaceChildren();
    const records=list();
    for(const [id,registered] of tabs){
      if(!registered.size)continue;
      chooser.content.append(workspace_button(records.find(info=>info.id===id)?.name||id,()=>{
        chooser?.close();show(id);
      }));
    }
    for(const info of records){
      if(tabs.get(info.id)?.size)continue;
      chooser.content.append(workspace_element('p','',`${info.name}：${info.running?'此插件未提供设置页。':info.error||'尚未启用，请在已安装中启用后配置。'}`));
    }
    if(!records.length&&!tabs.size)chooser.content.append(workspace_element('p','','当前没有可配置的插件。请先到社区插件市场选择并安装插件。'));
    const actions=workspace_element('div','workspace-community-settings-navigation');
    for(const [title,mode]of [['管理已安装插件','installed'],['浏览社区插件市场','catalog']])actions.append(workspace_button(title,()=>{chooser?.close();navigate(mode);}));
    chooser.content.append(actions);
  };
  const show=(id:string)=>{
    const existing=opened.get(id);
    if(existing){existing.root.querySelector<HTMLElement>('button,input,select')?.focus();return;}
    const registered=[...(tabs.get(id)||[])];if(!registered.length)return;
    const dialog=workspace_dialog('插件设置', '关闭',()=>{
      opened.delete(id);
      for(const tab of registered){tab.hide();tab.containerEl.remove();}
    });
    opened.set(id,dialog);dialog.content.classList.add('workspace-community-settings');
    try{for(const tab of registered){dialog.content.append(workspace_element('h4','',tab.name||id),tab.containerEl);tab.show();}}
    catch(error){dialog.close();throw error;}
  };
  return {
    has:(id:string)=>Boolean(tabs.get(id)?.size),show,refresh:render,
    open(){
      if(chooser){chooser.root.querySelector<HTMLElement>('button')?.focus();return;}
      chooser=workspace_dialog('插件设置','关闭',()=>{chooser=undefined;});
      chooser.content.classList.add('workspace-community-settings','workspace-community-setting-list');render();
    },
    register(id:string,tab:any){
      tab.load();let registered=tabs.get(id);if(!registered){registered=new Set();tabs.set(id,registered);}registered.add(tab);
      render();on_change();let removed=false;
      return()=>{
        if(removed)return;removed=true;opened.get(id)?.close(false);
        try{tab.hide();tab.unload();}finally{tab.containerEl.remove();registered!.delete(tab);if(!registered!.size)tabs.delete(id);render();on_change();}
      };
    },
    dispose(){chooser?.close(false);for(const dialog of [...opened.values()])dialog.close(false);tabs.clear();},
  };
}
