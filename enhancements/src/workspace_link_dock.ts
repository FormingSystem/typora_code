import {workspace_text} from "./workspace_i18n";
import type {graph_core} from './git_graph_host';
import type {workspace_file_host} from './workspace_files';
import {create_link_preview} from './workspace_link_preview';
import {bind_workspace_link_selection} from './workspace_link_selection';
import {read_workspace_editor_settings,observe_workspace_editor_settings} from './workspace_editor_settings';
import {bind_preview_resize} from './workspace_preview_resize';
import {SIDEBAR_MIN_WIDTH,EDITOR_MIN_WIDTH} from './workspace_sidebar_sash';

/** Preview has its own visibility; read-only sidebar status, does not expand or switch any functional panel. */
export function bind_workspace_link_dock(core:graph_core,files:workspace_file_host){
  const root=document.documentElement,body=document.body;
  const dock=document.createElement('section');dock.className='workspace-link-dock';dock.setAttribute('aria-label',workspace_text("link_dock_link_preview"));dock.hidden=true;
  let pinned=false;
  const preview=create_link_preview(files,{close:()=>{close();selection.dismiss();},pin:()=>{pinned=!pinned;preview.set_pinned(pinned);}});dock.append(preview.container);body.append(dock);
  let width=Number.parseFloat(getComputedStyle(root).getPropertyValue('--sidebar-width'))||300,height=0,disposed=false,frame=0;
  const height_owners=[document.getElementById('typora-sidebar'),document.getElementById('typora-sidebar-resizer')].filter((node):node is HTMLElement=>!!node);
  const original_heights=height_owners.map(node=>[node.style.getPropertyValue('--workspace-preview-height'),node.style.getPropertyPriority('--workspace-preview-height')]);
  const set=(node:HTMLElement,name:string,value:string)=>{if(node.style.getPropertyValue(name)!==value)node.style.setProperty(name,value);};
  const restore_heights=()=>height_owners.forEach((node,index)=>{const [value,priority]=original_heights[index];if(value)node.style.setProperty('--workspace-preview-height',value,priority);else node.style.removeProperty('--workspace-preview-height');});
  const layout=()=>{
    if(disposed||dock.hidden)return;
    const style=getComputedStyle(body),ribbon=Number.parseFloat(style.getPropertyValue('--typ-ribbon-width'))||0;
    const top=Number.parseFloat(style.getPropertyValue('--typ-workspace-top'))||35,footer=Number.parseFloat(style.getPropertyValue('--typ-footer-height'))||30;
    const available=Math.max(0,root.clientWidth-ribbon-(Number.parseFloat(style.getPropertyValue('--typ-sidedock-width'))||0)-EDITOR_MIN_WIDTH);
    const max_height=Math.max(0,root.clientHeight-top-footer);
    width=Math.min(available,Math.max(SIDEBAR_MIN_WIDTH,width));height=Math.min(max_height,Math.max(Math.min(120,max_height),height||max_height*.4));
    set(dock,'--workspace-preview-width',width+'px');set(dock,'--workspace-preview-height',height+'px');
    for(const node of height_owners)set(node,'--workspace-preview-height',height+'px');

  };
  // Floating geometry is not a window resize; only the reserved sidebar height is shared.
  const schedule_layout=()=>{if(frame||disposed||dock.hidden)return;frame=requestAnimationFrame(()=>{frame=0;layout();});};
  const resize=bind_preview_resize(dock,()=>({width,height}),size=>{width=size.width;height=size.height;layout();});
  const close=()=>{pinned=false;preview.set_pinned(false);resize.cancel();cancelAnimationFrame(frame);frame=0;dock.hidden=true;body.classList.remove('has-workspace-link-preview');restore_heights();preview.clear();};
  const selection=bind_workspace_link_selection(core,files,()=>read_workspace_editor_settings().link_preview_enabled,request=>{
    dock.hidden=false;body.classList.add('has-workspace-link-preview');layout();void preview.show(request);
  },{root:dock,outside:()=>{if(!pinned&&!dock.hidden)close();}});
  const settings=observe_workspace_editor_settings(()=>{if(!read_workspace_editor_settings().link_preview_enabled){close();selection.dismiss();}});
  const context_changed=()=>{close();selection.reset();};
  const observer=new MutationObserver(schedule_layout);observer.observe(body,{attributes:true,attributeFilter:['class','style']});observer.observe(root,{attributes:true,attributeFilter:['style']});
  window.addEventListener('resize',schedule_layout);window.addEventListener('linux-note-workspace-context-changed',context_changed);
  return {dispose(){if(disposed)return;disposed=true;settings();observer.disconnect();cancelAnimationFrame(frame);resize.dispose();window.removeEventListener('resize',schedule_layout);window.removeEventListener('linux-note-workspace-context-changed',context_changed);selection.dispose();preview.dispose();dock.remove();body.classList.remove('has-workspace-link-preview');restore_heights();}};
}
