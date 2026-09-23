/** 所有Git读取共用并发预算；排队可取消，避免多仓库刷新产生进程风暴。 */
let active=0;
const queue:Array<()=>void>=[];
export function acquire_git_process(signal:AbortSignal):Promise<()=>void>{
  return new Promise((resolve,reject)=>{
    let granted=false;
    const cancel=()=>{if(granted)return;const index=queue.indexOf(start);if(index>=0)queue.splice(index,1);reject(Object.assign(Error('Git读取已取消。'),{code:'ABORT_ERR'}));};
    const start=()=>{if(signal.aborted){cancel();return;}granted=true;signal.removeEventListener('abort',cancel);active++;let released=false;resolve(()=>{if(released)return;released=true;active--;queue.shift()?.();});};
    if(signal.aborted){cancel();return;}signal.addEventListener('abort',cancel,{once:true});if(active<4)start();else queue.push(start);
  });
}
/** 流消费者拥有NUL等协议，传输层只负责UTF-8边界、背压、容量、退出和取消。 */
export function spawn_git_process(child_process:any,executable:string,args:string[],options:{cwd:string;env:Record<string,string|undefined>;binary:boolean;writable:boolean;input?:string;consume?:(chunk:string)=>Promise<void>|void;signal:AbortSignal;timeout_ms?:number;max_bytes?:number}):Promise<any>{
  return new Promise((resolve,reject)=>{
    if(options.signal.aborted){reject(Object.assign(Error('Git读取已取消。'),{code:'ABORT_ERR'}));return;}
    let child:any,finished=false,failure:Error|undefined,stderr='',bytes=0;
    const parts:any[]=[],decoder=new TextDecoder("utf-8",{ignoreBOM:true}),limit=options.max_bytes??16*1024*1024;
    let pending=Promise.resolve();
    const stop=(error:Error)=>{failure ||= error;child?.kill();};
    const cancel=()=>stop(Object.assign(Error('Git操作已取消；若为写操作，请刷新确认实际结果。'),{code:'ABORT_ERR'}));
    const timeout_ms=options.timeout_ms??(options.writable?30*60*1000:5*60*1000);
    const timer=setTimeout(()=>stop(Object.assign(Error('Git在'+Math.round(timeout_ms/1000)+'秒内未完成，已停止等待。可检查磁盘/网络/凭据后重试；写入结果请刷新确认。'),{code:'ETIMEDOUT'})),timeout_ms);
    const finish=async(code?:number,error?:Error)=>{
      if(finished)return;finished=true;clearTimeout(timer);options.signal.removeEventListener('abort',cancel);
      await pending;
      if(failure||error){reject(failure||error);return;}
      if(code!==0){reject(Object.assign(Error(stderr.trim()||'Git退出码：'+code),{code}));return;}
      if(options.consume){try{const tail=decoder.decode();if(tail)await options.consume(tail);resolve('');}catch(error){reject(error);}return;}
      if(options.binary){const output=new Uint8Array(bytes);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}resolve(output);}
      else resolve(parts.join('')+decoder.decode());
    };
    try{child=child_process.spawn(executable,args,{cwd:options.cwd,env:options.env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}
    catch(error){void finish(undefined,error as Error);return;}
    options.signal.addEventListener('abort',cancel,{once:true});
    child.stdout.on('data',(data:Uint8Array)=>{
      if(failure)return;bytes+=data.length;
      if(options.consume){
        child.stdout.pause();
        pending=pending.then(async()=>{if(failure)return;await options.consume!(decoder.decode(data,{stream:true}));}).catch((error:Error)=>stop(error)).finally(()=>{if(!failure)child.stdout.resume();});
      }else if(bytes>limit){
        const error=Object.assign(Error('Git单份正文/差异超过'+Math.round(limit/1048576)+' MiB，未载入截断内容。仓库状态仍可使用；写操作请刷新确认结果，大文件请用外部工具查看。'),{code:'GIT_OUTPUT_LIMIT'});
        // 写入不能因诊断输出大而被中途终止；继续排空管道，等Git实际退出再报告。
        if(options.writable)failure=error;else stop(error);
      }
      else parts.push(options.binary?data:decoder.decode(data,{stream:true}));
    });
    child.stderr.on('data',(data:any)=>{stderr=(stderr+String(data)).slice(-65536);});
    child.once('error',(error:Error)=>{void finish(undefined,error);});child.once('close',(code:number)=>{void finish(code);});
    child.stdin.on('error',()=>{});child.stdin.end(options.input);
  });
}
