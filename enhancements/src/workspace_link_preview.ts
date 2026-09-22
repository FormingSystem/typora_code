import DOMPurify from "dompurify";
import type {workspace_file_host} from "./workspace_files";
import {create_lookup_preview} from "./workspace_lookup_preview";
import {resolve_preview_link,read_preview_web,type workspace_link_target} from "./workspace_link_target";
import {workspace_element as el,workspace_button as button} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";

export type workspace_link_request={source:string;href:string};

/** 不运行网页脚本，沙箱也不授予同源身份、表单、下载或弹窗能力。 */
export function preview_web_document(html:string,address:string):string {
  const clean=DOMPurify.sanitize(html,{WHOLE_DOCUMENT:true,ADD_TAGS:["style","link"],ADD_ATTR:["rel"],FORBID_TAGS:["script","iframe","frame","frameset","object","embed","base","meta","form","audio","video","source"],FORBID_ATTR:["contenteditable","autofocus","srcdoc","srcset","action","formaction"],ALLOW_DATA_ATTR:false});
  const doc=new DOMParser().parseFromString(clean,"text/html");
  for(const node of doc.querySelectorAll("a,area")){node.removeAttribute("href");node.removeAttribute("target");}
  for(const node of doc.querySelectorAll("input,button,select,textarea"))node.setAttribute("disabled","");
  for(const node of doc.querySelectorAll("link"))if(node.getAttribute("rel")!=="stylesheet")node.remove();
  for(const node of doc.querySelectorAll("[src],link[href]"))for(const attribute of ["src","href"]){const value=node.getAttribute(attribute);if(!value)continue;try{const url=new URL(value,address);if(!["https:","http:"].includes(url.protocol))node.removeAttribute(attribute);else node.setAttribute(attribute,url.href);}catch{node.removeAttribute(attribute);}}
  const base=doc.createElement("base");base.href=address;doc.head.prepend(base);
  const csp=doc.createElement("meta");csp.httpEquiv="Content-Security-Policy";csp.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https: http:; img-src https: http: data:; font-src https: http: data:; form-action 'none'; base-uri https: http:";doc.head.prepend(csp);
  const privacy=doc.createElement("meta");privacy.name="referrer";privacy.content="no-referrer";doc.head.prepend(privacy);
  return "<!doctype html>"+doc.documentElement.outerHTML;
}

export function create_link_preview(files:workspace_file_host){
  const container=el("section","workspace-link-preview"),toolbar=el("div","workspace-search-preview-heading"),title=el("span","workspace-link-preview-title");
  const content=el("div","workspace-link-preview-content"),reader=create_lookup_preview(files);
  const runtime=window as any,interaction=acquire_workspace_interaction(container);
  let target:workspace_link_target|undefined,request:workspace_link_request|undefined,controller:AbortController|undefined,generation=0,disposed=false;
  const open=button("打开源文件",async()=>{const version=generation;if(open.disabled)return;open.disabled=true;try{if(target?.kind==="file")await files.open_file(target.path,{hash:target.hash});else if(target?.kind==="web")runtime.JSBridge?.showInBrowser?.(target.url);}catch(error){if(!disposed&&version===generation)fail(error);}finally{if(!disposed&&version===generation)open.disabled=false;}});
  const retry=button("重新加载",()=>{if(request)void show(request);});
  const fail=(error:unknown)=>{content.replaceChildren(el("p","workspace-lookup-preview-message",String(error)));container.dataset.state="error";};
  toolbar.setAttribute("role","toolbar");toolbar.setAttribute("aria-label","链接预览操作");toolbar.append(title,open,retry);container.append(toolbar,content);
  const clear=()=>{++generation;controller?.abort();controller=undefined;reader.clear();content.replaceChildren();request=undefined;target=undefined;};
  const show=async(value:workspace_link_request)=>{
    clear();if(disposed)return;request={...value};const version=generation;controller=new AbortController();
    container.dataset.state="loading";title.textContent=value.href;title.title=value.href;open.disabled=true;content.replaceChildren(el("p","workspace-lookup-preview-message","正在加载链接预览…"));
    try{
      target=resolve_preview_link(files.path_api,value.source,value.href);const resolved=target;
      open.textContent=resolved.kind==="file"?"打开源文件":"在浏览器打开";open.disabled=resolved.kind==="web"&&!runtime.JSBridge?.showInBrowser;
      if(resolved.kind==="file"){
        content.replaceChildren(reader.container);
        await reader.show({file_path:resolved.path,relative_path:files.path_api.basename(resolved.path),matches:[]},{id:"link",start:0,end:0,line:1,column:1,end_line:1,end_column:1,text:"",preview:"",preview_ranges:[]},resolved.hash,true);
      }else{
        const result=await read_preview_web(runtime.reqnode,resolved.url,controller.signal);
        if(disposed||version!==generation)return;
        const frame=el("iframe","workspace-link-web");frame.title="网页只读预览";frame.setAttribute("sandbox","");frame.referrerPolicy="no-referrer";frame.srcdoc=preview_web_document(result.html,result.url);
        content.replaceChildren(el("div","workspace-lookup-preview-message","网页只读快照；交互或登录请在浏览器打开。"),frame);
      }
      if(!disposed&&version===generation)container.dataset.state="ready";
    }catch(error){if(!disposed&&version===generation)fail(error);}
  };
  return {container,show,clear,dispose(){if(disposed)return;disposed=true;clear();reader.dispose();interaction.remove();container.remove();}};
}
