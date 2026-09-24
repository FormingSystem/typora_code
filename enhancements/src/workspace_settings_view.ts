import type {graph_core} from './git_graph_host';
import {workspace_element as el,workspace_button as button,workspace_dialog} from './workspace_widgets';
import {workspace_settings_sections,observe_workspace_settings,notify_workspace_settings} from './workspace_settings_registry';
import {git_icon,git_icon_button} from './git_icons';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_settings_view.css';
import {mount_settings_owner} from './workspace_settings_owner';

export function bind_workspace_settings_view(core:graph_core){
  const views=new Set<settings_view>(),style=acquire_workspace_style('typora-code-style:workspace_settings_view',css);
  let dialog:ReturnType<typeof workspace_dialog>|undefined;
  class settings_view {
    containerEl=el('section','workspace-settings');icon='fa-cog';disposed=false;category='';
    owner_host=el('div','workspace-settings-owner');owner:''|'native'|'community'='';owner_binding?:ReturnType<typeof mount_settings_owner>;
    search=el('input');categories=el('nav','workspace-settings-categories');body=el('div','workspace-settings-body');status=el('p','workspace-settings-status');
    release_port:()=>void;release_registry:()=>void;
    constructor(){
      views.add(this);this.search.placeholder='搜索设置';this.search.setAttribute('aria-label','搜索设置');this.status.setAttribute('role','status');
      const content=el('div','workspace-settings-content');this.owner_host.hidden=true;content.append(this.categories,this.body,this.owner_host);this.containerEl.append(this.search,content,this.status);
      const interaction=acquire_workspace_interaction(this.containerEl);this.release_port=()=>interaction.remove();this.release_registry=observe_workspace_settings(()=>{if(!this.containerEl.contains(document.activeElement))this.render();});
      this.search.oninput=()=>{this.select_owner('');this.render();};this.render();
    }
    select_owner(owner:''|'native'|'community'){
      if(this.owner===owner&&this.owner_binding)return;
      this.owner_binding?.dispose();this.owner_binding=undefined;this.owner=owner;this.status.textContent='';
      this.owner_host.textContent='';this.body.hidden=Boolean(owner);this.owner_host.hidden=!owner;
      this.render();
      if(owner)try{this.owner_binding=mount_settings_owner(core,owner,this.owner_host,()=>this.select_owner(''),()=>dialog?.close(false));}catch(error){this.owner_host.textContent=String(error);}
    }
    render(){
      if(this.disposed)return;this.categories.replaceChildren();this.body.replaceChildren();
      const query=this.search.value.trim().toLocaleLowerCase(),sections=workspace_settings_sections();
      const all=button('全部设置',()=>{this.category='';this.select_owner('');this.render();});all.setAttribute('aria-pressed',String(!this.category&&!this.owner));this.categories.append(all);
      for(const section of sections){const item=button(section.title,()=>{this.category=section.id;this.select_owner('');this.render();});item.setAttribute('aria-pressed',String(!this.owner&&this.category===section.id));this.categories.append(item);}
      const native=button('Typora 偏好设置',()=>this.select_owner('native'));native.dataset.settingsOwner='native';native.setAttribute('aria-pressed',String(this.owner==='native'));
      const community=button('社区插件设置',()=>this.select_owner('community'));community.dataset.settingsOwner='community';community.setAttribute('aria-pressed',String(this.owner==='community'));
      this.categories.append(el('hr'),native,community);
      if(this.owner)return;
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
          label.append(key,control);row.append(label,button('恢复默认',()=>save(structuredClone(baseline))));
          if(field.file_extensions){const picker=el('input');picker.type='file';picker.accept=field.file_extensions.map(ext=>'.'+ext).join(',');picker.hidden=true;picker.onchange=()=>{if(this.disposed||!row.isConnected)return;const file=picker.files?.[0] as any;picker.value='';if(!file)return;try{const runtime=window as any;const path=file.path||runtime.reqnode('electron').webUtils?.getPathForFile(file);if(!path)throw Error('无法取得所选证书文件路径。');save(path);}catch(error){this.status.textContent=String(error);}};row.append(button('选择文件…',()=>picker.click()),picker);}
if(field.description)row.append(el('p','',field.description));this.body.append(row);
        }
      }
      if(!count)this.body.append(el('p','','没有匹配的设置。'));
    }
    dispose(){if(this.disposed)return;this.disposed=true;this.owner_binding?.dispose();this.owner_binding=undefined;this.release_port();this.release_registry();views.delete(this);}
  }
  const show=()=>{
    if(dialog){dialog.root.querySelector<HTMLInputElement>('.workspace-settings>input')?.focus();return;}
    const view=new settings_view();
    const panel=dialog=workspace_dialog('设置','关闭设置',()=>{view.dispose();if(dialog===panel)dialog=undefined;},{focus_out:false,regions:()=>view.owner_binding?[view.owner_binding.surface]:[]});
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
