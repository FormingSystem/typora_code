import type {graph_core} from './git_graph_host';
import type {workspace_file_host} from './workspace_files';
import {create_link_preview} from './workspace_link_preview';
import {bind_workspace_link_selection} from './workspace_link_selection';
import {read_workspace_editor_settings,observe_workspace_editor_settings} from './workspace_editor_settings';
import {bind_preview_resize} from './workspace_preview_resize';
import {SIDEBAR_MIN_WIDTH,EDITOR_MIN_WIDTH} from './workspace_sidebar_sash';

/** 预览拥有自己的可见性；只读侧栏状态，不展开或切换任何功能面板。 */
export function bind_workspace_link_dock(core:graph_core,files:workspace_file_host){
  const sidebar=document.getElementById('typora-sidebar'),root=document.documentElement,body=document.body;
  const dock=document.createElement('section');dock.className='workspace-link-dock';dock.setAttribute('aria-label','链接预览');dock.hidden=true;
  const preview=create_link_preview(files,{close:()=>{close();selection.dismiss();}});dock.append(preview.container);body.append(dock);
  let width=Number.parseFloat(getComputedStyle(root).getPropertyValue('--sidebar-width'))||300,height=0,disposed=false,frame=0;
  const set=(name:string,value:string)=>{if(body.style.getPropertyValue(name)!==value)body.style.setProperty(name,value);};
  const layout=()=>{
    if(disposed||dock.hidden)return;
    const style=getComputedStyle(body),ribbon=Number.parseFloat(style.getPropertyValue('--typ-ribbon-width'))||0;
    const top=Number.parseFloat(style.getPropertyValue('--typ-workspace-top'))||35,footer=Number.parseFloat(style.getPropertyValue('--typ-footer-height'))||30;
    const available=Math.max(0,root.clientWidth-ribbon-(Number.parseFloat(style.getPropertyValue('--typ-sidedock-width'))||0)-EDITOR_MIN_WIDTH);
    const max_height=Math.max(0,root.clientHeight-top-footer);
    width=Math.min(available,Math.max(SIDEBAR_MIN_WIDTH,width));height=Math.min(max_height,Math.max(Math.min(120,max_height),height||max_height*.4));
    const sidebar_width=body.classList.contains('pin-outline')?(Number.parseFloat(getComputedStyle(root).getPropertyValue('--sidebar-width'))||sidebar?.offsetWidth||0):0;
    set('--workspace-preview-width',width+'px');set('--workspace-preview-height',height+'px');set('--workspace-preview-column',Math.max(width,sidebar_width)+'px');

  };
  const notify=()=>{if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('optimizedResize'));});};
  const resize=bind_preview_resize(dock,()=>({width,height}),size=>{window.dispatchEvent(new Event('beforeResize'));width=size.width;height=size.height;layout();notify();});
  const close=()=>{resize.cancel();dock.hidden=true;body.classList.remove('has-workspace-link-preview');preview.clear();notify();};
  const selection=bind_workspace_link_selection(core,files,()=>read_workspace_editor_settings().link_preview_enabled,request=>{
    window.dispatchEvent(new Event('beforeResize'));dock.hidden=false;body.classList.add('has-workspace-link-preview');layout();notify();void preview.show(request);
  });
  const settings=observe_workspace_editor_settings(()=>{if(!read_workspace_editor_settings().link_preview_enabled){close();selection.dismiss();}});
  const context_changed=()=>{close();selection.reset();};
  const observer=new MutationObserver(layout);observer.observe(body,{attributes:true,attributeFilter:['class','style']});observer.observe(root,{attributes:true,attributeFilter:['style']});
  window.addEventListener('resize',layout);window.addEventListener('linux-note-workspace-context-changed',context_changed);
  return {dispose(){if(disposed)return;disposed=true;settings();observer.disconnect();cancelAnimationFrame(frame);resize.dispose();window.removeEventListener('resize',layout);window.removeEventListener('linux-note-workspace-context-changed',context_changed);selection.dispose();preview.dispose();dock.remove();body.classList.remove('has-workspace-link-preview');for(const name of ['width','height','column'])body.style.removeProperty('--workspace-preview-'+name);window.dispatchEvent(new Event('resize'));}};
}
