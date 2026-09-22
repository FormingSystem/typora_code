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

/** Node网络适配只取文档，不发送宿主Cookie；总期限、字节和重定向有界。 */
export async function read_preview_web(reqnode:(name:string)=>any,url:string,signal:AbortSignal):Promise<{html:string;url:string}> {
  const deadline=Date.now()+15000;
  const read=(address:string,redirects:number):Promise<{html:string;url:string}>=>new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(new Error("已取消预览。"));
    const target=new URL(address);
    if(!["http:","https:"].includes(target.protocol)||target.username||target.password)return reject(new Error("网页重定向目标不受支持。"));
    let finished=false;let timer:ReturnType<typeof setTimeout>;
    const finish=(error?:Error,value?:{html:string;url:string})=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener("abort",cancel);error?reject(error):resolve(value!);};
    const request=reqnode(target.protocol==="https:"?"https":"http").get(target,{headers:{Accept:"text/html, text/plain;q=0.8","Accept-Encoding":"identity"}},(response:any)=>{
      const status=response.statusCode||0;
      if(status>=300&&status<400&&response.headers.location){response.resume();if(redirects>=5)return finish(new Error("网页重定向次数过多。"));let next:string;try{next=new URL(response.headers.location,address).href;}catch{return finish(new Error("网页重定向地址无效。"));}finished=true;clearTimeout(timer);signal.removeEventListener("abort",cancel);void read(next,redirects+1).then(resolve,reject);return;}
      if(status<200||status>=300){response.resume();return finish(new Error(`网页返回HTTP ${status}。`));}
      const type=String(response.headers["content-type"]||"");
      if(!/^(text\/(html|plain)|application\/xhtml\+xml)(?:;|$)/iu.test(type)){response.resume();return finish(new Error("该地址不是可预览的网页文档。"));}
      const chunks:Uint8Array[]=[];let size=0;
      response.on("data",(chunk:Uint8Array)=>{size+=chunk.length;if(size>2*1024*1024){finish(new Error("网页超过2 MiB预览上限。"));response.destroy();request.destroy();}else chunks.push(chunk);});
      response.on("error",(error:Error)=>finish(error));
      response.on("end",()=>{try{const bytes=reqnode("buffer").Buffer.concat(chunks);const charset=type.match(/charset\s*=\s*["']?([^;\s"']+)/iu)?.[1]||"utf-8";let html=new TextDecoder(charset).decode(bytes);if(/^text\/plain/iu.test(type))html="<pre>"+html.replace(/&/gu,"&amp;").replace(/</gu,"&lt;")+"</pre>";finish(undefined,{html,url:address});}catch(error){finish(error as Error);}});
    });
    // 重定向保留同一AbortSignal及绝对截止时间，不延长总等待。
    const cancel=()=>{finish(new Error("已取消预览。"));request.destroy();};
    signal.addEventListener("abort",cancel,{once:true});
    request.on("error",(error:Error)=>finish(error));
    timer=setTimeout(()=>{finish(new Error("网页加载超时，请重试。"));request.destroy();},Math.max(1,deadline-Date.now()));
  });
  return read(url,0);
}
