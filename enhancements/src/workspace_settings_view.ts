import type {graph_core,graph_leaf} from './git_graph_host';
import {workspace_element as el,workspace_button as button} from './workspace_widgets';
import {workspace_settings_sections,observe_workspace_settings,notify_workspace_settings} from './workspace_settings_registry';
import {select_workspace_editor_group} from './workspace_editor_settings';
import {workspace_leaf_tab} from './workspace_leaf_tab';
import {git_icon} from './git_icons';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_settings_view.css';

const VIEW_ID='typora_code.settings',URI=`typ://${VIEW_ID}/settings`;
export function bind_workspace_settings_view(core:graph_core){
  const views=new Set<settings_view>(),style=acquire_workspace_style('typora-code-style:workspace_settings_view',css);
  class settings_view extends core.WorkspaceView {
    containerEl=el('section','workspace-settings');icon='fa-cog';disposed=false;category='';
    search=el('input');categories=el('nav','workspace-settings-categories');body=el('div','workspace-settings-body');status=el('p','workspace-settings-status');
    release_port:()=>void;release_registry:()=>void;
    constructor(leaf:graph_leaf){
      super(leaf);views.add(this);this.search.placeholder='搜索设置';this.search.setAttribute('aria-label','搜索设置');this.status.setAttribute('role','status');
      const content=el('div','workspace-settings-content');content.append(this.categories,this.body);this.containerEl.append(this.search,content,this.status);
      const interaction=acquire_workspace_interaction(this.containerEl);this.release_port=()=>interaction.remove();this.release_registry=observe_workspace_settings(()=>{if(!this.containerEl.contains(document.activeElement))this.render();});
      this.search.oninput=()=>this.render();this.render();
    }
    setIcon(){const tab=workspace_leaf_tab(this.leaf);const label=tab?.querySelector('.typ-file-basename');if(label)label.textContent='设置';tab?.querySelector('.typ-file-ext')?.remove();const icon=tab?.querySelector('.typ-file-icon');if(icon){icon.className='typ-file-icon git-tab-icon';icon.replaceChildren(git_icon('settings-gear'));}}
    onOpen(){this.setIcon();this.render();}
    onClose(){queueMicrotask(()=>{let present=false;core.app.workspace.eachLeaves(leaf=>{if(leaf===this.leaf)present=true;});if(!present)this.dispose();});}
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
  const unregister_view=core.app.viewManager.registerView(VIEW_ID,leaf=>new settings_view(leaf));
  const show=()=>{let existing:graph_leaf|undefined;core.app.workspace.eachLeaves(leaf=>{if(leaf.state.path===URI)existing=leaf;});if(existing){core.app.workspace.activeLeaf=existing.parent.toggleTab(URI);return;}const group=select_workspace_editor_group(core,URI),leaf=core.app.workspace.createLeaf({type:VIEW_ID,state:{path:URI}});group.appendChild(leaf);core.app.workspace.activeLeaf=leaf;};
  const unregister=core.app.commands.register({id:'typora_code:settings',title:'打开设置',scope:'global',callback:show});
  const keydown=(event:KeyboardEvent)=>{if(event.isComposing||event.repeat||event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey)||event.key!==',')return;event.preventDefault();event.stopImmediatePropagation();show();};
  window.addEventListener('keydown',keydown,true);
  return{show,dispose(){window.removeEventListener('keydown',keydown,true);for(const view of [...views])view.dispose();unregister();unregister_view();style.remove();}};
}
