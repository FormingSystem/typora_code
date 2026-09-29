import {workspace_text} from "./workspace_i18n";
/** All Git reads share a concurrent budget; queued can be canceled, avoiding process storms caused by multiple repository refreshes. */
let active=0;
const queue:Array<()=>void>=[];
export function acquire_git_process(signal:AbortSignal):Promise<()=>void>{
  return new Promise((resolve,reject)=>{
    let granted=false;
    const cancel=()=>{if(granted)return;const index=queue.indexOf(start);if(index>=0)queue.splice(index,1);reject(Object.assign(Error(workspace_text("git_graph_runtime_git_read_canceled")),{code:'ABORT_ERR'}));};
    const start=()=>{if(signal.aborted){cancel();return;}granted=true;signal.removeEventListener('abort',cancel);active++;let released=false;resolve(()=>{if(released)return;released=true;active--;queue.shift()?.();});};
    if(signal.aborted){cancel();return;}signal.addEventListener('abort',cancel,{once:true});if(active<4)start();else queue.push(start);
  });
}
/** Stream consumers have NUL protocols, and the transport layer is only responsible for UTF-8 boundaries, backpressure, exit, and cancellation. */
export function spawn_git_process(child_process:any,executable:string,args:string[],options:{cwd:string;env:Record<string,string|undefined>;binary:boolean;writable:boolean;input?:string;consume?:(chunk:string)=>Promise<void>|void;signal:AbortSignal;timeout_ms?:number}):Promise<any>{
  return new Promise((resolve,reject)=>{
    if(options.signal.aborted){reject(Object.assign(Error(workspace_text("git_graph_runtime_git_read_canceled")),{code:'ABORT_ERR'}));return;}
    let child:any,finished=false,failure:Error|undefined,stderr='',bytes=0;
    const parts:any[]=[],decoder=new TextDecoder("utf-8",{ignoreBOM:true});
    let pending=Promise.resolve();
    const stop=(error:Error)=>{failure ||= error;child?.kill();};
    const cancel=()=>stop(Object.assign(Error(workspace_text("git_process_transport_git_operation_canceled_if_it_is_a_write_operation_please_ref")),{code:'ABORT_ERR'}));
    const timeout_ms=options.timeout_ms??0;
    const timer=timeout_ms>0?setTimeout(()=>stop(Object.assign(Error(workspace_text("git_operation_timeout",{seconds:Math.round(timeout_ms/1000)})),{code:'ETIMEDOUT'})),timeout_ms):undefined;
    const finish=async(code?:number,error?:Error)=>{
      if(finished)return;finished=true;clearTimeout(timer);options.signal.removeEventListener('abort',cancel);
      await pending;
      if(failure||error){reject(failure||error);return;}
      if(code!==0){reject(Object.assign(Error(stderr.trim()||workspace_text("git_process_transport_git_exit_code")+code),{code}));return;}
      if(options.consume){try{const tail=decoder.decode();if(tail)await options.consume(tail);resolve('');}catch(error){reject(error);}return;}
      try {
        if(options.binary){const output=new Uint8Array(bytes);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}resolve(output);}
        else resolve(parts.join('')+decoder.decode());
      } catch(error) {reject(error);}
    };
    try{child=child_process.spawn(executable,args,{cwd:options.cwd,env:options.env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}
    catch(error){void finish(undefined,error as Error);return;}
    options.signal.addEventListener('abort',cancel,{once:true});
    child.stdout.on('data',(data:Uint8Array)=>{
      if(failure)return;bytes+=data.length;
      if(options.consume){
        child.stdout.pause();
        pending=pending.then(async()=>{if(failure)return;await options.consume!(decoder.decode(data,{stream:true}));}).catch((error:Error)=>stop(error)).finally(()=>{if(!failure)child.stdout.resume();});
      }
      else try{parts.push(options.binary?data:decoder.decode(data,{stream:true}));}catch(error){if(options.writable)failure=error as Error;else stop(error as Error);}
    });
    child.stderr.on('data',(data:any)=>{stderr=(stderr+String(data)).slice(-65536);});
    child.once('error',(error:Error)=>{void finish(undefined,error);});child.once('close',(code:number)=>{void finish(code);});
    child.stdin.on('error',()=>{});child.stdin.end(options.input);
  });
}
