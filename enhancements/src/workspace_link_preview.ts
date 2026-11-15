export type {workspace_link_request} from './workspace_link_preview_session';
import type {workspace_file_host} from './workspace_files';
import {create_link_preview_session,type workspace_link_request} from './workspace_link_preview_session';
import {resolve_preview_link} from './workspace_link_target';
import {workspace_element as el} from './workspace_widgets';

/** Retain bounded reader owners, rather than cloning rendered DOM without its lifecycle. */
export function create_link_preview(files:workspace_file_host,options:{close?:()=>void;pin?:()=>void}={}){
  const container=el('div','workspace-link-preview-cache');
  container.style.cssText='position:relative;display:flex;flex:1;width:100%;height:100%;min-height:0;min-width:0';
  type session=ReturnType<typeof create_link_preview_session>;
  type entry={view:session;stamp:string;ready:Promise<void>;observer:MutationObserver};
  const entries=new Map<string,entry>();let generation=0,disposed=false,pinned=false;
  const identity=(value:workspace_link_request)=>JSON.stringify(resolve_preview_link(files.path_api,value.source,value.href));
  const drop=(key:string,item:entry)=>{if(entries.get(key)===item)entries.delete(key);item.observer.disconnect();item.view.dispose();};
  const clear=()=>{generation++;for(const [key,item]of entries){if(item.view.container.dataset.state==='loading'){drop(key,item);continue;}item.view.suspend();item.view.container.style.display='none';}container.dataset.state='idle';};
  const show=async(value:workspace_link_request)=>{
    if(disposed)return;const version=++generation;container.dataset.state='loading';
    let key:string,stamp='';
    try{
      key=identity(value);const target=resolve_preview_link(files.path_api,value.source,value.href);
      if(target.kind==='file'){
        const stat=await files.fs.promises.stat(target.path);
        stamp=JSON.stringify([stat.mtimeMs,stat.ctimeMs,stat.size,stat.isDirectory()]);
      }
    }catch{key=JSON.stringify(value);stamp='unavailable';}
    if(disposed||version!==generation)return;
    let item=entries.get(key);
    const current=item?.view.current_request();
    if(item&&(item.stamp!==stamp||(current&&identity(current)!==key))){drop(key,item);item=undefined;}
    if(!item){
      const view=create_link_preview_session(files,options);view.set_pinned(pinned);
      view.container.style.cssText='position:absolute;inset:0;visibility:hidden';container.append(view.container);
      const observer=new MutationObserver(()=>{if(view.container.style.display!=='none'&&view.container.style.visibility!=='hidden')container.dataset.state=view.container.dataset.state||'idle';});
      observer.observe(view.container,{attributes:true,attributeFilter:['data-state']});
      item={view,stamp,ready:Promise.resolve(),observer};entries.set(key,item);
      item.ready=view.show(value);
    }else{entries.delete(key);entries.set(key,item);}
    while(entries.size>5){const [old_key,old]=entries.entries().next().value!;drop(old_key,old);}
    await item.ready;
    if(disposed||entries.get(key)!==item)return;
    if(version!==generation){item.view.container.style.cssText='display:none';return;}
    for(const cached of entries.values()){if(cached!==item)cached.view.suspend();cached.view.container.style.cssText=cached===item?'':'display:none';}
    container.dataset.state=item.view.container.dataset.state||'error';
    // Keep the error visible for retry, but never treat it as a successful cache hit.
    if(container.dataset.state!=='ready')item.stamp='failed';
  };
  const reset=()=>{clear();for(const [key,item]of entries)drop(key,item);};
  return {container,show,clear,reset,set_pinned(value:boolean){pinned=value;for(const item of entries.values())item.view.set_pinned(value);},dispose(){if(disposed)return;disposed=true;clear();for(const [key,item]of entries)drop(key,item);container.remove();}};
}
