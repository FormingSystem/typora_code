/** clangd 的 stdio JSON-RPC 通道；只启动指定进程，不经过 shell。 */
export function create_clangd_transport(node:(name:string)=>any,executable:string,args:string[],cwd:string,on_notification:(method:string,params:any)=>void){
  const bytes=node("buffer").Buffer;
  const child=node("child_process").spawn(executable,args,{cwd,shell:false,windowsHide:true,stdio:["pipe","pipe","pipe"]});
  let buffer=bytes.alloc(0),next_id=0,failed:Error|undefined,closed=false,stderr="";
  const pending=new Map<number,{finish:(error?:Error,value?:any)=>void}>();
  const abort_error=()=>new DOMException("分析已取消","AbortError");
  const fail=(error:Error,terminate=false)=>{if(failed)return;failed=error;for(const item of pending.values())item.finish(error);pending.clear();if(terminate&&child.exitCode===null)child.kill();};
  const send=(message:any)=>{
    if(failed)throw failed;if(closed)throw abort_error();
    const body=bytes.from(JSON.stringify({jsonrpc:"2.0",...message}),"utf8");
    child.stdin.write(bytes.concat([bytes.from(`Content-Length: ${body.length}\r\n\r\n`,"ascii"),body]));
  };
  child.on("error",(error:Error)=>{if(!closed)fail(new Error(`无法启动 clangd：${error.message}`),true);});
  child.on("exit",(code:number|null)=>{if(!closed)fail(new Error(`clangd 已退出（${code??"信号"}）${stderr?"："+stderr.trim():""}`));});
  for(const channel of ["stdin","stdout","stderr"] as const)child[channel].on("error",(error:Error)=>{if(!closed)fail(new Error(`clangd ${channel} 通信失败：${error.message}`),true);});
  child.stderr.on("data",(data:Uint8Array)=>{stderr=(stderr+bytes.from(data).toString("utf8")).slice(-4096);});
  child.stdout.on("data",(data:Uint8Array)=>{
    if(failed||closed)return;
    buffer=bytes.concat([buffer,data]);
    try{
      for(;;){
        const boundary=buffer.indexOf("\r\n\r\n");
        if(boundary<0){break;}
        const header=buffer.subarray(0,boundary).toString("ascii"),match=/^Content-Length:\s*(\d+)\s*$/im.exec(header);
        if(!match)throw new Error("clangd 未返回有效的 LSP 协议头。");
        const length=Number(match[1]);if(!Number.isSafeInteger(length)||length<0)throw new Error("clangd 响应长度无效。");
        if(buffer.length<boundary+4+length)break;
        const message=JSON.parse(buffer.subarray(boundary+4,boundary+4+length).toString("utf8"));buffer=buffer.subarray(boundary+4+length);
        if(message.method){
          if(message.id!==undefined){
            // 不接受来自分析器的编辑或进程执行；配置能力也不在本客户端声明。
            send(message.method==="workspace/configuration"?{id:message.id,result:(message.params?.items||[]).map(()=>null)}:{id:message.id,error:{code:-32601,message:"Method not supported"}});
          }else on_notification(message.method,message.params);
        }else if(typeof message.id==="number"){
          pending.get(message.id)?.finish(message.error?new Error(`clangd：${String(message.error.message||"请求失败")}`):undefined,message.result);
        }
      }
    }catch(error){fail(error instanceof Error?error:new Error(String(error)),true);}
  });
  const request=(method:string,params:any,signal?:AbortSignal,timeout_ms=20000):Promise<any>=>{
    if(signal?.aborted)return Promise.reject(abort_error());if(failed)return Promise.reject(failed);if(closed)return Promise.reject(abort_error());
    const id=++next_id;
    return new Promise((resolve,reject)=>{
      const finish=(error?:Error,value?:any)=>{if(!pending.has(id))return;pending.delete(id);clearTimeout(timer);signal?.removeEventListener("abort",abort);error?reject(error):resolve(value);};
      const abort=()=>{try{send({method:"$/cancelRequest",params:{id}});}catch{}finish(abort_error());};
      const timer=setTimeout(()=>{try{send({method:"$/cancelRequest",params:{id}});}catch{}finish(new Error("clangd 分析超时，请检查编译数据库或重新选择解析器。"));},timeout_ms);
      pending.set(id,{finish});signal?.addEventListener("abort",abort,{once:true});
      try{send({id,method,params});}catch(error){finish(error instanceof Error?error:new Error(String(error)));}
    });
  };
  return {request,notify:(method:string,params:any)=>send({method,params}),get failure(){return failed;},get process_id(){return child.pid;},async dispose(){
    if(closed)return;
    for(const item of [...pending.values()])item.finish(abort_error());
    try{if(!failed){await request("shutdown",null,undefined,500);send({method:"exit"});}}catch{}
    closed=true;child.stdin.end();
    if(child.exitCode===null){const timer=setTimeout(()=>child.kill(),500);child.once("exit",()=>clearTimeout(timer));}
  }};
}
