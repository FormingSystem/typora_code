import {create_preview_web} from './workspace_preview_web';
import type {workspace_file_host} from "./workspace_files";
import {create_lookup_preview} from "./workspace_lookup_preview";
import {resolve_preview_link,type workspace_link_target} from "./workspace_link_target";
import {workspace_element as el,workspace_button} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {git_icon_button} from "./git_icons";
import {create_preview_scale_controls} from './workspace_preview_scale';
import {create_preview_directory,type preview_directory_position} from './workspace_preview_directory';
import {acquire_workspace_style} from './workspace_styles';
import preview_css from './workspace_lookup_preview.css';
import {create_reading_history,type reading_location} from './reading_history';

export type workspace_link_request={source:string;href:string};
type preview_reader=ReturnType<typeof create_lookup_preview>;
type directory_location={path:string;position:preview_directory_position};
type preview_location={request:workspace_link_request;position?:ReturnType<preview_reader['capture_position']>;directory_position?:preview_directory_position;directories:directory_location[]};

/** 一个外部选择为一次预览会话；内部链接和刷新不触及正文历史。 */
export function create_link_preview(files:workspace_file_host,options:{close?:()=>void;pin?:()=>void}={}){
  const container=el("section","workspace-link-preview"),toolbar=el("div","workspace-search-preview-heading"),title=el("span","workspace-link-preview-title");
  const content=el("div","workspace-link-preview-content"),message=el('p','workspace-lookup-preview-message');message.hidden=true;message.setAttribute('role','status');
  const runtime=window as any,interaction=acquire_workspace_interaction(container),history=create_reading_history();
  const style=acquire_workspace_style('typora-code-style:workspace_lookup_preview',preview_css,{});
  let web:ReturnType<typeof create_preview_web>|undefined;
  let target:workspace_link_target|undefined,request:workspace_link_request|undefined,failed_request:workspace_link_request|undefined,generation=0,disposed=false;
  let reader:preview_reader|undefined,pending_reader:preview_reader|undefined,pending_stage:HTMLElement|undefined;
  let directory:ReturnType<typeof create_preview_directory>|undefined,pending_directory:ReturnType<typeof create_preview_directory>|undefined,directories:directory_location[]=[];
  const path_request=(path:string):workspace_link_request=>({source:path,href:encodeURI(path.replace(/\\/gu,'/')).replace(/#/gu,'%23')});
  const return_directory=workspace_button('',()=>{const last=directories.at(-1);if(last)void navigate(path_request(last.path));},'workspace-preview-directory-return');return_directory.hidden=true;
  container.tabIndex=-1;
  const focus=()=>{if(directory)directory.focus();else if(reader)reader.focus();else container.focus({preventScroll:true});};
  const scale=create_preview_scale_controls({container,get_scale:()=>reader?.get_scale()||80,set_scale:value=>reader?.set_scale(value)});
  scale.container.hidden=true;
  const sync_scale=()=>{const value=String(reader?.get_scale()||80);if(container.dataset.previewScale!==value)container.dataset.previewScale=value;};
  const scale_observer=new MutationObserver(sync_scale);scale_observer.observe(content,{subtree:true,attributes:true,attributeFilter:['data-preview-scale']});
  const open=git_icon_button("go-to-file","打开源文件",async()=>{const version=generation;if(open.disabled||directory)return;open.disabled=true;try{if(target?.kind==="file")await files.open_file(target.path,{hash:target.hash});else if(target?.kind==="web")await runtime.JSBridge?.showInBrowser?.(target.url);}catch(error){if(!disposed&&version===generation)fail(error);}finally{if(!disposed&&version===generation)open.disabled=false;}});
  const retry=git_icon_button("refresh","重新加载",()=>{const value=failed_request||request;if(!value)return;if(failed_request)void navigate(value);else void load(value,capture()?.editor_state as preview_location|undefined);});
  const back=git_icon_button('arrow-left','预览后退 (Alt+←)',()=>void travel(-1));
  const forward=git_icon_button('arrow-right','预览前进 (Alt+→)',()=>void travel(1));
  const sync_navigation=()=>{back.disabled=disposed||container.dataset.state==='loading'||!history.can_travel(-1);forward.disabled=disposed||container.dataset.state==='loading'||!history.can_travel(1);};
  sync_navigation();
  const fail=(error:unknown)=>{message.textContent=String(error);message.hidden=false;container.dataset.state="error";};
  toolbar.setAttribute("role","toolbar");toolbar.setAttribute("aria-label","链接预览操作");toolbar.append(title,scale.container,back,forward,open,retry);container.append(toolbar,return_directory,message,content);
  const pin=options.pin?git_icon_button('pinned','固定链接预览',options.pin,'workspace-link-preview-pin'):undefined;
  const set_pinned=(value:boolean)=>{if(!pin)return;pin.setAttribute('aria-pressed',String(value));pin.title=value?'取消固定链接预览':'固定链接预览';pin.setAttribute('aria-label',pin.title);};
  if(pin){container.classList.add('has-pin');toolbar.append(pin);set_pinned(false);}
  if(options.close)toolbar.append(git_icon_button('close','关闭链接预览',options.close));
  const cancel_pending=()=>{++generation;pending_reader?.dispose();pending_reader=undefined;pending_directory?.dispose();pending_directory=undefined;pending_stage?.remove();pending_stage=undefined;};
  const clear=()=>{cancel_pending();web?.dispose();web=undefined;history.clear();sync_navigation();reader?.dispose();reader=undefined;directory?.dispose();directory=undefined;directories=[];return_directory.hidden=true;content.replaceChildren();scale.container.hidden=true;request=undefined;target=undefined;failed_request=undefined;message.hidden=true;};
  const capture=():reading_location|undefined=>{
    if(!target||!request)return;
    const position=reader?.capture_position();
    return {file_path:target.kind==='file'?target.path:target.url,scroll_top:position?.scroll_top||0,scroll_left:position?.scroll_left||0,cursor:{href:request.href},editor_state:{request:{...request},position,directory_position:directory?.capture_position(),directories:[...directories]} satisfies preview_location};
  };
  const navigate=async(value:workspace_link_request)=>{
    if(history.is_navigating())return;const from=capture();
    if(await load(value)){const to=capture();if(to){if(from)history.record_jump(from,to);else history.record_selection(to);}focus();}
    sync_navigation();
  };
  const follow=(href:string)=>{if(target?.kind==='file')return navigate({source:target.path,href});};
  const load=async(value:workspace_link_request,restore?:preview_location)=>{
    cancel_pending();if(disposed)return false;const version=generation;
    container.dataset.state="loading";message.textContent="正在加载链接预览…";message.hidden=false;failed_request=undefined;
    sync_navigation();
    if(!target){title.textContent=value.href;title.title=value.href;open.disabled=true;}
    let next_web:ReturnType<typeof create_preview_web>|undefined;
    let next:preview_reader|undefined,next_directory:ReturnType<typeof create_preview_directory>|undefined;
    const stage=el('div','workspace-link-preview-stage');stage.style.cssText='position:absolute;inset:0;visibility:hidden;display:flex;min-height:0';pending_stage=stage;content.append(stage);
    try{
      const resolved=resolve_preview_link(files.path_api,value.source,value.href);
      let next_directories=restore?[...restore.directories]:[...directories];
      if(!restore&&directory&&target?.kind==='file'&&(resolved.kind!=='file'||resolved.path!==target.path))next_directories=[...next_directories,{path:target.path,position:directory.capture_position()}].slice(-50);
      let directory_position=restore?.directory_position;
      if(resolved.kind==="file"){
        const stat=await files.fs.promises.stat(resolved.path);if(disposed||version!==generation){stage.remove();return false;}
        if(stat.isDirectory()){
          const entries=await files.fs.promises.readdir(resolved.path,{withFileTypes:true});if(disposed||version!==generation){stage.remove();return false;}
          if(!restore){const index=next_directories.findIndex(item=>item.path===resolved.path);if(index>=0){directory_position=next_directories[index].position;next_directories=next_directories.slice(0,index);}}
          next_directory=create_preview_directory(files,resolved.path,entries,path=>void navigate(path_request(path)));pending_directory=next_directory;stage.append(next_directory.container);
        }else{
        next=create_lookup_preview(files,undefined,{navigate:href=>void follow(href)});pending_reader=next;stage.append(next.container);
        const ok=await next.show({file_path:resolved.path,relative_path:files.path_api.basename(resolved.path),matches:[]},{id:"link",start:0,end:0,line:1,column:1,end_line:1,end_column:1,text:"",preview:"",preview_ranges:[]},resolved.hash,true);
        if(!ok)throw new Error(next.container.textContent||'无法读取链接目标。');
        }
      }else{
        next_web=create_preview_web(resolved.url);stage.append(next_web.frame,next_web.status);
      }
      if(disposed||version!==generation){next_web?.dispose();next?.dispose();next_directory?.dispose();stage.remove();return false;}
      web?.dispose();web=next_web;reader?.dispose();directory?.dispose();reader=next;directory=next_directory;directories=next_directories;pending_directory=undefined;pending_reader=undefined;pending_stage=undefined;content.replaceChildren(...stage.childNodes);stage.remove();
      target=resolved;request={...value};message.hidden=true;
      if(restore?.position)reader?.restore_position(restore.position);
      if(directory_position)directory?.restore_position(directory_position);
      const last=directories.at(-1);return_directory.hidden=!last;return_directory.textContent=last?'返回目录：'+(files.path_api.basename(last.path)||last.path):'';return_directory.title=last?.path||'';
      title.textContent=resolved.kind==="file"?files.path_api.basename(resolved.path):new URL(resolved.url).hostname;title.title=resolved.kind==='file'?resolved.path+resolved.hash:resolved.url;
      open.title=resolved.kind==="file"?"打开源文件":"在默认浏览器打开";open.setAttribute("aria-label",open.title);open.disabled=!!directory||(resolved.kind==="web"&&!runtime.JSBridge?.showInBrowser);
      scale.container.hidden=resolved.kind!=='file'||!!directory;sync_scale();container.dataset.state="ready";return true;
    }catch(error){next_web?.dispose();next?.dispose();next_directory?.dispose();stage.remove();if(!disposed&&version===generation){pending_reader=undefined;pending_directory=undefined;pending_stage=undefined;failed_request={...value};fail(error);}return false;}
    finally{if(!disposed&&version===generation)sync_navigation();}
  };
  const show=async(value:workspace_link_request)=>{clear();if(await load(value)){const location=capture();if(location)history.record_selection(location);}sync_navigation();};
  const travel=async(direction:-1|1)=>{
    const current=capture();if(!current)return false;
    const ok=await history.travel(direction,current,async location=>{const saved=location.editor_state as preview_location;return load(saved.request,saved);});
    sync_navigation();if(ok)focus();return ok;
  };
  const keydown=(event:KeyboardEvent)=>{
    if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)void travel(event.key==='ArrowLeft'?-1:1);
  };
  container.addEventListener('keydown',keydown,true);
  return {container,show,clear,set_pinned,dispose(){if(disposed)return;disposed=true;clear();container.removeEventListener('keydown',keydown,true);scale_observer.disconnect();scale.dispose();interaction.remove();style.remove();container.remove();}};
}
