import type {graph_core} from './git_graph_host';
import {workspace_element as el,workspace_button as button,workspace_dialog} from './workspace_widgets';
import {workspace_settings_sections,observe_workspace_settings,notify_workspace_settings} from './workspace_settings_registry';
import {git_icon,git_icon_button} from './git_icons';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_settings_view.css';

export function bind_workspace_settings_view(core:graph_core){
  const views=new Set<settings_view>(),style=acquire_workspace_style('typora-code-style:workspace_settings_view',css);
  let dialog:ReturnType<typeof workspace_dialog>|undefined;
  class settings_view {
    containerEl=el('section','workspace-settings');icon='fa-cog';disposed=false;category='';
    search=el('input');categories=el('nav','workspace-settings-categories');body=el('div','workspace-settings-body');status=el('p','workspace-settings-status');
    release_port:()=>void;release_registry:()=>void;
    constructor(){
      views.add(this);this.search.placeholder='搜索设置';this.search.setAttribute('aria-label','搜索设置');this.status.setAttribute('role','status');
      const content=el('div','workspace-settings-content');content.append(this.categories,this.body);this.containerEl.append(this.search,content,this.status);
      const interaction=acquire_workspace_interaction(this.containerEl);this.release_port=()=>interaction.remove();this.release_registry=observe_workspace_settings(()=>{if(!this.containerEl.contains(document.activeElement))this.render();});
      this.search.oninput=()=>this.render();this.render();
    }
    render(){
      if(this.disposed)return;this.categories.replaceChildren();this.body.replaceChildren();
      const query=this.search.value.trim().toLocaleLowerCase(),sections=workspace_settings_sections();
      const all=button('全部设置',()=>{this.category='';this.render();});all.setAttribute('aria-pressed',String(!this.category));this.categories.append(all);
      for(const section of sections){const item=button(section.title,()=>{this.category=section.id;this.render();});item.setAttribute('aria-pressed',String(this.category===section.id));this.categories.append(item);}
      const native=button('Typora 偏好设置',()=>{try{const command=(window as any).ClientCommand?.showPreferencePanel;if(!command)throw Error('原生偏好接口不可用');command();}catch(error){this.status.textContent=String(error);}});
      native.dataset.settingsOwner='native';const community=button('社区插件设置',()=>core.app.commands.run('typora_code:community_plugin_settings'));community.dataset.settingsOwner='community';
      native.append(git_icon('link-external'));community.append(git_icon('link-external'));this.categories.append(el('hr'),native,community);
      let count=0;
      for(const section of sections){
        if(this.category&&this.category!==section.id)continue;
        const fields=section.fields.filter(field=>!query||`${section.title} ${field.title} ${field.key} ${field.description||''}`.toLocaleLowerCase().includes(query));if(!fields.length)continue;
        const scope=section.scope();this.body.append(el('h2','',section.title),el('p','workspace-settings-scope',scope));
        let values:Record<string,unknown>;try{values=section.read();}catch(error){this.body.append(el('p','',String(error)));continue;}
        for(const field of fields){count++;const value=values[field.key],baseline=section.defaults[field.key];
          const row=el('div','workspace-setting-row'),label=el('label','workspace-setting-label',field.title),key=el('small','',field.key);
          const control=field.choices?el('select'):typeof baseline==='object'?el('textarea'):el('input');control.dataset.setting=section.id+'.'+field.key;control.setAttribute('aria-label',field.title);
          if(control instanceof HTMLSelectElement)for(const choice of field.choices!)control.append(new Option(choice,choice));
          const fill=()=>{const current=section.read()[field.key];if(control instanceof HTMLInputElement&&typeof baseline==='boolean'){control.type='checkbox';control.checked=current===true;}else{if(control instanceof HTMLInputElement)control.type=typeof baseline==='number'?'number':'text';control.value=typeof baseline==='object'?JSON.stringify(current,null,2):String(current??'');}};fill();
          const save=(next:unknown)=>{try{if(section.scope()!==scope)throw Error('配置目标已切换，请刷新设置页后重试。');section.write(field.key,next);fill();this.status.textContent='设置已保存。';notify_workspace_settings();}catch(error){this.status.textContent=String(error instanceof Error?error.message:error);}};
          control.onchange=()=>{try{const next=control instanceof HTMLInputElement&&control.type==='checkbox'?control.checked:typeof baseline==='number'?Number(control.value):typeof baseline==='object'?JSON.parse(control.value):control.value;if(typeof baseline==='number'&&(!control.value.trim()||!Number.isFinite(next)))throw Error('请输入有效数值。');save(next);}catch(error){this.status.textContent=String(error);}};
          label.append(key,control);row.append(label,button('恢复默认',()=>save(structuredClone(baseline))));if(field.description)row.append(el('p','',field.description));this.body.append(row);
        }
      }
      if(!count)this.body.append(el('p','','没有匹配的设置。'));
    }
    dispose(){if(this.disposed)return;this.disposed=true;this.release_port();this.release_registry();views.delete(this);}
  }
  const show=()=>{
    if(dialog){dialog.root.querySelector<HTMLInputElement>('.workspace-settings>input')?.focus();return;}
    const view=new settings_view();
    const panel=dialog=workspace_dialog('设置','关闭设置',()=>{view.dispose();if(dialog===panel)dialog=undefined;});
    panel.root.classList.add('workspace-settings-modal');panel.footer.hidden=true;panel.content.append(view.containerEl);
    const header=panel.root.querySelector('.workspace-dialog-header')!;
    const maximize=git_icon_button('screen-full','最大化设置',()=>{
      const enabled=panel.root.classList.toggle('is-maximized');maximize.title=enabled?'还原设置窗口':'最大化设置';maximize.setAttribute('aria-label',maximize.title);maximize.setAttribute('aria-pressed',String(enabled));maximize.replaceChildren(git_icon(enabled?'screen-normal':'screen-full'));
    });
    maximize.dataset.settingsMaximize='true';header.insertBefore(maximize,header.lastElementChild);
    header.querySelector('.workspace-dialog-title')?.prepend(git_icon('settings-gear'));
  };
  const unregister=core.app.commands.register({id:'typora_code:settings',title:'打开设置',scope:'global',callback:show});
  const keydown=(event:KeyboardEvent)=>{if(event.isComposing||event.repeat||event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey)||event.key!==',')return;event.preventDefault();event.stopImmediatePropagation();show();};
  window.addEventListener('keydown',keydown,true);
  return{show,dispose(){window.removeEventListener('keydown',keydown,true);dialog?.close(false);for(const view of [...views])view.dispose();unregister();style.remove();}};
}
