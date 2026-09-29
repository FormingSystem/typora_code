import {workspace_text} from "./workspace_i18n";
import {parse_markdown_file_target, resolve_workspace_file, resolve_host_open_file_target, type workspace_path_api} from "./workspace_file_uri";

export type workspace_link_target = {kind:"file"; path:string; hash:string} | {kind:"web"; url:string};

/** Shared path boundary with ordinary open, only Markdown link semantics is decoded once here. */
export function resolve_preview_link(path_api:workspace_path_api, source:string, href:string):workspace_link_target {
  const raw=href.trim().replace(/^<(.*)>$/u,"$1");
  if(/^https?:\/\//iu.test(raw)||raw.startsWith("//")){
    const url=new URL(raw.startsWith("//")?"https:"+raw:raw);
    if(url.username||url.password)throw new Error(workspace_text("link_target_preview_link_cannot_contain_username_or_password"));
    return {kind:"web",url:url.href};
  }
  if(!raw)throw new Error(workspace_text("link_target_link_is_undefined"));
  if(!path_api.isAbsolute(raw)&&/^(?!file:)[a-z][a-z0-9+.-]*:/iu.test(raw))throw new Error(workspace_text("link_target_the_link_protocol_does_not_support_read_only_preview"));
  const markdown=parse_markdown_file_target(raw),separator=raw.indexOf("#");
  const part=markdown?.file_path??(separator<0?raw:raw.slice(0,separator));
  const hash=markdown?.hash??(separator<0?"":raw.slice(separator));
  let decoded=part;
  if(!/^file:/iu.test(part))try{decoded=decodeURIComponent(part);}catch{/* Literal percent sign is retained. */}
  const path=part?resolve_workspace_file(path_api,path_api.dirname(source),resolve_host_open_file_target(path_api,source,decoded)):source;
  if(!path||!path_api.isAbsolute(path))throw new Error(workspace_text("link_target_please_save_the_source_document_first_before_previewing_rela"));
  return {kind:"file",path,hash};
}
