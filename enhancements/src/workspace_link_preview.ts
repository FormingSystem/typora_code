import type {workspace_file_host} from "./workspace_files";
import {create_lookup_preview} from "./workspace_lookup_preview";
import {resolve_preview_link,type workspace_link_target} from "./workspace_link_target";
import {workspace_element as el} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {git_icon_button} from "./git_icons";

export type workspace_link_request={source:string;href:string};

export function create_link_preview(files:workspace_file_host,options:{close?:()=>void}={}){
  const container=el("section","workspace-link-preview"),toolbar=el("div","workspace-search-preview-heading"),title=el("span","workspace-link-preview-title");
  const content=el("div","workspace-link-preview-content"),reader=create_lookup_preview(files);
  const runtime=window as any,interaction=acquire_workspace_interaction(container);
  let target:workspace_link_target|undefined,request:workspace_link_request|undefined,generation=0,disposed=false;
  const open=git_icon_button("go-to-file","打开源文件",async()=>{const version=generation;if(open.disabled)return;open.disabled=true;try{if(target?.kind==="file")await files.open_file(target.path,{hash:target.hash});else if(target?.kind==="web")runtime.JSBridge?.showInBrowser?.(target.url);}catch(error){if(!disposed&&version===generation)fail(error);}finally{if(!disposed&&version===generation)open.disabled=false;}});
  const retry=git_icon_button("refresh","重新加载",()=>{if(request)void show(request);});
  const mode=el("span","workspace-link-preview-mode","只读预览");
  const fail=(error:unknown)=>{content.replaceChildren(el("p","workspace-lookup-preview-message",String(error)));container.dataset.state="error";};
  toolbar.setAttribute("role","toolbar");toolbar.setAttribute("aria-label","链接预览操作");toolbar.append(title,open,retry,mode);container.append(toolbar,content);
  if(options.close)toolbar.append(git_icon_button('close','关闭链接预览',options.close));
  const clear=()=>{++generation;reader.clear();content.replaceChildren();request=undefined;target=undefined;};
  const show=async(value:workspace_link_request)=>{
    clear();if(disposed)return;request={...value};const version=generation;
    container.dataset.state="loading";title.textContent=value.href;title.title=value.href;open.disabled=true;content.replaceChildren(el("p","workspace-lookup-preview-message","正在加载链接预览…"));
    try{
      target=resolve_preview_link(files.path_api,value.source,value.href);const resolved=target;
      open.title=resolved.kind==="file"?"打开源文件":"在默认浏览器打开";open.setAttribute("aria-label",open.title);open.disabled=resolved.kind==="web"&&!runtime.JSBridge?.showInBrowser;
      title.textContent=resolved.kind==="file"?files.path_api.basename(resolved.path):new URL(resolved.url).hostname;
      mode.textContent=resolved.kind==="file"?"只读预览":"网页预览";
      if(resolved.kind==="file"){
        content.replaceChildren(reader.container);
        await reader.show({file_path:resolved.path,relative_path:files.path_api.basename(resolved.path),matches:[]},{id:"link",start:0,end:0,line:1,column:1,end_line:1,end_column:1,text:"",preview:"",preview_ranges:[]},resolved.hash,true);
      }else{
        const frame=el("iframe","workspace-link-web");frame.title="网页只读预览";frame.setAttribute("sandbox","allow-scripts");frame.referrerPolicy="no-referrer";
        frame.src=resolved.url;
        // 不代理或移除站点限制；跨域 frame 的 load 也可能是拒绝页，不伪报加载成功。
        const status=el("div","workspace-link-web-status","正在加载网页；若站点禁止内嵌，可用上方图标在浏览器打开。");
        frame.onload=()=>{if(!disposed&&version===generation)status.textContent="网页由站点提供；若内容不可显示，请在浏览器打开。";};
        frame.onerror=()=>{if(!disposed&&version===generation)status.textContent="网页加载失败，请重试或在浏览器打开。";};
        content.replaceChildren(frame,status);
      }
      if(!disposed&&version===generation)container.dataset.state="ready";
    }catch(error){if(!disposed&&version===generation)fail(error);}
  };
  return {container,show,clear,dispose(){if(disposed)return;disposed=true;clear();reader.dispose();interaction.remove();container.remove();}};
}
