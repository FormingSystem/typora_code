import type {source_symbol} from "./source_symbols";
import {SOURCE_SYMBOL_LANGUAGES} from "./source_symbols";
export function create_source_symbol_service(){
  let failure:Error|undefined;
  let disposed=false,worker:Worker|undefined,url="",sequence=0,loading:Promise<Worker>|undefined;
  const sent_languages=new Set<string>();let sent_runtime=false;
  const pending=new Map<number,{resolve:(value:{symbols:source_symbol[];incomplete:boolean})=>void;reject:(error:unknown)=>void}>();
  const runtime=window as unknown as {reqnode:(name:string)=>any;_options:{userDataPath:string}};
  const assets=new Map<string,Promise<Uint8Array>>();
  const read=(name:string)=>{let promise=assets.get(name);if(!promise){promise=runtime.reqnode("fs").promises.readFile(runtime.reqnode("path").join(runtime._options.userDataPath,"typora_code","assets","source_symbols",name)).then((bytes:Uint8Array)=>new Uint8Array(bytes));assets.set(name,promise);}return promise!;};
  const get_worker=()=>loading??=(async()=>{
    const bytes=await read("worker.js");if(disposed)throw new DOMException("已关闭","AbortError");
    url=URL.createObjectURL(new Blob([bytes],{type:"text/javascript"}));worker=new Worker(url);
    worker.onmessage=event=>{const item=pending.get(event.data.id);if(!item)return;pending.delete(event.data.id);event.data.error?item.reject(new Error(event.data.error)):item.resolve(event.data);};
    worker.onerror=event=>{failure=new Error(event.message||"语法解析进程失败，请重新打开工作台。");worker?.terminate();for(const item of pending.values())item.reject(failure);pending.clear();};return worker;
  })();
  return {async parse(language:string,text:string,signal:AbortSignal){
    if(failure)throw failure;
    if(!SOURCE_SYMBOL_LANGUAGES[language])throw new Error("此语言尚未提供语法符号大纲。");
    signal.throwIfAborted();if(disposed)throw new DOMException("已关闭","AbortError");
    const [target,wasm,grammar]=await Promise.all([get_worker(),read("tree-sitter.wasm"),read(`tree-sitter-${language}.wasm`)]);
    signal.throwIfAborted();if(disposed)throw new DOMException("已关闭","AbortError");if(failure)throw failure;
    const id=++sequence;
    return new Promise<{symbols:source_symbol[];incomplete:boolean}>((resolve,reject)=>{
      const abort=()=>{pending.delete(id);reject(new DOMException("已取消","AbortError"));};
      pending.set(id,{resolve:value=>{signal.removeEventListener("abort",abort);resolve(value);},reject:error=>{signal.removeEventListener("abort",abort);reject(error);}});
      signal.addEventListener("abort",abort,{once:true});target.postMessage({id,language,text,runtime:sent_runtime?undefined:wasm,grammar:sent_languages.has(language)?undefined:grammar});sent_runtime=true;sent_languages.add(language);
    });
  },dispose(){if(disposed)return;disposed=true;worker?.terminate();if(url)URL.revokeObjectURL(url);for(const item of pending.values())item.reject(new DOMException("已关闭","AbortError"));pending.clear();assets.clear();}};
}
