import {workspace_button as button,workspace_element as el} from './workspace_widgets';
import {capture_workspace_focus,register_workspace_dismissal} from './workspace_focus';
import {git_icon} from './git_icons';

/** 只托管上游SettingTab的挂载与生命周期；原始控件及持久化归插件所有。 */
export function create_community_plugin_settings(list:()=>any[],on_change:()=>void,navigate:(mode:string)=>void=()=>{}){
  const tabs=new Map<string,Set<any>>();
  let surface:{root:HTMLElement;sidebar:HTMLElement;main:HTMLElement;close:(restore?:boolean)=>void}|undefined;
  let active:{id:string;tab:any}|undefined;
  const detach=()=>{const previous=active;active=undefined;if(previous)try{previous.tab.hide();}finally{previous.tab.containerEl.remove();}};
  const activate=(id:string,tab:any)=>{
    if(!surface||active?.tab===tab)return;
    detach();surface.main.replaceChildren(tab.containerEl);surface.main.classList.remove('workspace-community-setting-list');active={id,tab};
    for(const item of surface.sidebar.querySelectorAll<HTMLElement>('[data-tab-index]'))item.classList.toggle('active',item.dataset.pluginId===id&&Number(item.dataset.tabIndex)===[...(tabs.get(id)||[])].indexOf(tab));
    try{tab.show();}catch(error){detach();surface.main.textContent=String(error);}
  };
  const render=()=>{
    if(!surface)return;const records=list();surface.sidebar.replaceChildren(el('div','typ-nav__group-title','社区插件设置'));
    for(const [id,registered]of tabs){let index=0;for(const tab of registered){
      const item=button(tab.name||records.find(info=>info.id===id)?.name||id,()=>activate(id,tab));item.className='typ-nav__item';item.dataset.pluginId=id;item.dataset.tabIndex=String(index++);item.classList.toggle('active',active?.tab===tab);surface.sidebar.append(item);
    }}
    if(active)return;surface.main.replaceChildren();surface.main.classList.add('workspace-community-setting-list');
    for(const info of records)if(!tabs.get(info.id)?.size)surface.main.append(el('p','',`${info.name}：${info.running?'此插件未提供设置页。':info.error||'尚未启用，请在已安装中启用后配置。'}`));
    if(!records.length&&!tabs.size)surface.main.append(el('p','','当前没有可配置的插件。请先到社区插件市场选择并安装插件。'));
    const actions=el('div','workspace-community-settings-navigation');
    for(const [title,mode]of [['管理已安装插件','installed'],['浏览社区插件市场','catalog']])actions.append(button(title,()=>{surface?.close();navigate(mode);}));
    surface.main.append(actions);
  };
  const open=()=>{
    if(surface)return;
    const focus=capture_workspace_focus(),root=el('div','typ-modal__wrapper middle workspace-community-settings-root'),panel=el('section','typ-modal typ-settings-modal');
    root.dataset.workspaceInteraction='none';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','社区插件设置');
    const header=el('div','typ-modal__header'),body=el('div','typ-modal__body'),sidebar=el('nav','typ-sidebar'),main=el('div','typ-main workspace-community-settings');
    const close=(restore=true)=>{if(surface?.root!==root)return;const owned=layer.owns_focus();try{detach();}finally{layer.dispose();root.remove();surface=undefined;if(restore&&owned)focus.restore();}};
    const close_button=button('',()=>close());close_button.className='workspace-community-settings-close';close_button.append(git_icon('close'));close_button.setAttribute('aria-label','关闭');
    header.append(el('span','','社区插件设置'),close_button);body.append(sidebar,main);panel.append(header,body);root.append(panel);
    const layer=register_workspace_dismissal(()=>[root],()=>close(),{inside:()=>[panel],consume_outside:true,focus_out:false});
    surface={root,sidebar,main,close};document.body.append(root);render();
    const first=tabs.entries().next().value;if(first)activate(first[0],[...first[1]][0]);
    root.addEventListener('keydown',event=>{if(event.key!=='Tab'||!layer.is_top())return;const controls=[...panel.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')].filter(node=>!node.matches(':disabled,[tabindex="-1"]')&&node.getClientRects().length);const index=controls.indexOf(document.activeElement as HTMLElement);if(controls.length&&(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===controls.length-1)){event.preventDefault();controls[event.shiftKey?controls.length-1:0].focus();}});
    close_button.focus({preventScroll:true});
  };
  return {
    has:(id:string)=>Boolean(tabs.get(id)?.size),open,refresh:render,
    show(id:string){const tab=tabs.get(id)?.values().next().value;if(!tab)return;open();activate(id,tab);},
    register(id:string,tab:any){
      tab.load();let registered=tabs.get(id);if(!registered){registered=new Set();tabs.set(id,registered);}registered.add(tab);render();on_change();let removed=false;
      return()=>{if(removed)return;removed=true;if(active?.tab===tab)surface?.close(false);try{tab.unload();}finally{tab.containerEl.remove();registered!.delete(tab);if(!registered!.size)tabs.delete(id);render();on_change();}};
    },
    dispose(){surface?.close(false);tabs.clear();},
  };
}
