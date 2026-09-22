import {parse_markdown_file_target, resolve_workspace_file, resolve_host_open_file_target, type workspace_path_api} from "./workspace_file_uri";

export type workspace_link_target = {kind:"file"; path:string; hash:string} | {kind:"web"; url:string};

/** 与普通打开共用路径边界，只有Markdown链接语义在这里解码一次。 */
export function resolve_preview_link(path_api:workspace_path_api, source:string, href:string):workspace_link_target {
  const raw=href.trim().replace(/^<(.*)>$/u,"$1");
  if(/^https?:\/\//iu.test(raw)||raw.startsWith("//")){
    const url=new URL(raw.startsWith("//")?"https:"+raw:raw);
    if(url.username||url.password)throw new Error("预览链接不能包含用户名或密码。");
    return {kind:"web",url:url.href};
  }
  if(!raw)throw new Error("链接未定义。");
  if(!path_api.isAbsolute(raw)&&/^(?!file:)[a-z][a-z0-9+.-]*:/iu.test(raw))throw new Error("此链接协议不支持只读预览。");
  const markdown=parse_markdown_file_target(raw),separator=raw.indexOf("#");
  const part=markdown?.file_path??(separator<0?raw:raw.slice(0,separator));
  const hash=markdown?.hash??(separator<0?"":raw.slice(separator));
  let decoded=part;
  if(!/^file:/iu.test(part))try{decoded=decodeURIComponent(part);}catch{/* 字面百分号保留。 */}
  const path=part?resolve_workspace_file(path_api,path_api.dirname(source),resolve_host_open_file_target(path_api,source,decoded)):source;
  if(!path||!path_api.isAbsolute(path))throw new Error("请先保存来源文档，再预览相对链接。");
  return {kind:"file",path,hash};
}
