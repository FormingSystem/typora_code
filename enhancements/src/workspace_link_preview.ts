import type {workspace_file_host} from "./workspace_files";
import {create_lookup_preview} from "./workspace_lookup_preview";
import {resolve_preview_link,type workspace_link_target} from "./workspace_link_target";
import {workspace_element as el} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {git_icon_button} from "./git_icons";
import {create_preview_scale_controls} from './workspace_preview_scale';
import {create_reading_history,type reading_location} from './reading_history';

export type workspace_link_request={source:string;href:string};
type preview_reader=ReturnType<typeof create_lookup_preview>;
type preview_location={request:workspace_link_request;position?:ReturnType<preview_reader['capture_position']>};

/** 一个外部选择为一次预览会话；内部链接和刷新不触及正文历史。 */
export function create_link_preview(files:workspace_file_host,options:{close?:()=>void}={}){
  const container=el("section","workspace-link-preview"),toolbar=el("div","workspace-search-preview-heading"),title=el("span","workspace-link-preview-title");
  const content=el("div","workspace-link-preview-content"),message=el('p','workspace-lookup-preview-message');message.hidden=true;message.setAttribute('role','status');
  const runtime=window as any,interaction=acquire_workspace_interaction(container),history=create_reading_history();
  let target:workspace_link_target|undefined,request:workspace_link_request|undefined,failed_request:workspace_link_request|undefined,generation=0,disposed=false;
  let reader:preview_reader|undefined,pending_reader:preview_reader|undefined,pending_stage:HTMLElement|undefined;
  const scale=create_preview_scale_controls({container,get_scale:()=>reader?.get_scale()||80,set_scale:value=>reader?.set_scale(value)});
  scale.container.hidden=true;
  const sync_scale=()=>{const value=String(reader?.get_scale()||80);if(container.dataset.previewScale!==value)container.dataset.previewScale=value;};
  const scale_observer=new MutationObserver(sync_scale);scale_observer.observe(content,{subtree:true,attributes:true,attributeFilter:['data-preview-scale']});
  const open=git_icon_button("go-to-file","打开源文件",async()=>{const version=generation;if(open.disabled)return;open.disabled=true;try{if(target?.kind==="file")await files.open_file(target.path,{hash:target.hash});else if(target?.kind==="web")runtime.JSBridge?.showInBrowser?.(target.url);}catch(error){if(!disposed&&version===generation)fail(error);}finally{if(!disposed&&version===generation)open.disabled=false;}});
  const retry=git_icon_button("refresh","重新加载",()=>{const value=failed_request||request;if(!value)return;if(failed_request)void navigate(value);else void load(value,capture()?.editor_state as preview_location|undefined);});
  const fail=(error:unknown)=>{message.textContent=String(error);message.hidden=false;container.dataset.state="error";};
  toolbar.setAttribute("role","toolbar");toolbar.setAttribute("aria-label","链接预览操作");toolbar.append(title,scale.container,open,retry);container.append(toolbar,message,content);
  if(options.close)toolbar.append(git_icon_button('close','关闭链接预览',options.close));
  const cancel_pending=()=>{++generation;pending_reader?.dispose();pending_reader=undefined;pending_stage?.remove();pending_stage=undefined;};
  const clear=()=>{cancel_pending();history.clear();reader?.dispose();reader=undefined;content.replaceChildren();scale.container.hidden=true;request=undefined;target=undefined;failed_request=undefined;message.hidden=true;};
  const capture=():reading_location|undefined=>{
    if(!target||!request)return;
    const position=reader?.capture_position();
    return {file_path:target.kind==='file'?target.path:target.url,scroll_top:position?.scroll_top||0,scroll_left:position?.scroll_left||0,cursor:{href:request.href},editor_state:{request:{...request},position} satisfies preview_location};
  };
  const navigate=async(value:workspace_link_request)=>{
    if(history.is_navigating())return;const from=capture();
    if(await load(value)){const to=capture();if(to){if(from)history.record_jump(from,to);else history.record_selection(to);}reader?.focus();}
  };
  const follow=(href:string)=>{if(target?.kind==='file')return navigate({source:target.path,href});};
  const load=async(value:workspace_link_request,restore?:preview_location)=>{
    cancel_pending();if(disposed)return false;const version=generation;
    container.dataset.state="loading";message.textContent="正在加载链接预览…";message.hidden=false;failed_request=undefined;
    if(!target){title.textContent=value.href;title.title=value.href;open.disabled=true;}
    let next:preview_reader|undefined;
    const stage=el('div','workspace-link-preview-stage');stage.style.cssText='position:absolute;inset:0;visibility:hidden;display:flex;min-height:0';pending_stage=stage;content.append(stage);
    try{
      const resolved=resolve_preview_link(files.path_api,value.source,value.href);
      if(resolved.kind==="file"){
        next=create_lookup_preview(files,undefined,{navigate:href=>void follow(href)});pending_reader=next;stage.append(next.container);
        const ok=await next.show({file_path:resolved.path,relative_path:files.path_api.basename(resolved.path),matches:[]},{id:"link",start:0,end:0,line:1,column:1,end_line:1,end_column:1,text:"",preview:"",preview_ranges:[]},resolved.hash,true);
        if(!ok)throw new Error(next.container.textContent||'无法读取链接目标。');
      }else{
        const frame=el("iframe","workspace-link-web");frame.title="网页只读预览";frame.setAttribute("sandbox","allow-scripts");frame.referrerPolicy="no-referrer";frame.src=resolved.url;
        const status=el("div","workspace-link-web-status","正在加载网页；若站点禁止内嵌，可用上方图标在浏览器打开。");
        frame.onload=()=>{if(!disposed&&version===generation)status.textContent="网页由站点提供；若内容不可显示，请在浏览器打开。";};
        frame.onerror=()=>{if(!disposed&&version===generation)status.textContent="网页加载失败，请重试或在浏览器打开。";};stage.append(frame,status);
      }
      if(disposed||version!==generation){next?.dispose();stage.remove();return false;}
      reader?.dispose();reader=next;pending_reader=undefined;pending_stage=undefined;content.replaceChildren(...stage.childNodes);stage.remove();
      target=resolved;request={...value};message.hidden=true;
      if(restore?.position)reader?.restore_position(restore.position);
      title.textContent=resolved.kind==="file"?files.path_api.basename(resolved.path):new URL(resolved.url).hostname;title.title=resolved.kind==='file'?resolved.path+resolved.hash:resolved.url;
      open.title=resolved.kind==="file"?"打开源文件":"在默认浏览器打开";open.setAttribute("aria-label",open.title);open.disabled=resolved.kind==="web"&&!runtime.JSBridge?.showInBrowser;
      scale.container.hidden=resolved.kind!=='file';sync_scale();container.dataset.state="ready";return true;
    }catch(error){next?.dispose();stage.remove();if(!disposed&&version===generation){pending_reader=undefined;pending_stage=undefined;failed_request={...value};fail(error);}return false;}
  };
  const show=async(value:workspace_link_request)=>{clear();if(await load(value)){const location=capture();if(location)history.record_selection(location);}};
  const travel=async(direction:-1|1)=>{
    const current=capture();if(!current)return false;
    const ok=await history.travel(direction,current,async location=>{const saved=location.editor_state as preview_location;return load(saved.request,saved);});
    if(ok)reader?.focus();return ok;
  };
  const keydown=(event:KeyboardEvent)=>{
    if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)void travel(event.key==='ArrowLeft'?-1:1);
  };
  container.addEventListener('keydown',keydown,true);
  return {container,show,clear,dispose(){if(disposed)return;disposed=true;clear();container.removeEventListener('keydown',keydown,true);scale_observer.disconnect();scale.dispose();interaction.remove();container.remove();}};
}
