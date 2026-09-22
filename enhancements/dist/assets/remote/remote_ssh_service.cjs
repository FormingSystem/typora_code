'use strict';
const child_process=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');

function validate_target(target){
  if(typeof target!=='string'||!target||target.length>255||target.startsWith('-')||/\s/.test(target)||!/^([a-zA-Z0-9_.-]+@)?[a-zA-Z0-9_.:[\]-]+$/.test(target))throw Error('SSH主机应为配置别名或 user@hostname，不能包含命令参数。');
  return target;
}

/** OpenSSH拥有配置和认证；该服务只拥有有限JSON文件协议与连接生命周期。 */
function create_remote_ssh(options){
  let process_handle,auth_server,cancel_listen,disposed=false,serial=0,buffer='',diagnostic='',state='disconnected',generation=0;
  const pending=new Map(),sockets=new Set();
  const notify=(value,detail='')=>{state=value;options.on_state?.({state,detail});};
  const close=(reason='SSH连接已断开')=>{
    ++generation;cancel_listen?.();cancel_listen=undefined;process_handle?.kill();process_handle=undefined;
    auth_server?.close();auth_server=undefined;for(const socket of sockets)socket.destroy();sockets.clear();
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error(reason));}pending.clear();buffer='';
    notify('disconnected',reason);
  };
  const request=(operation,values={})=>new Promise((resolve,reject)=>{
    if(!process_handle||!['connecting','connected'].includes(state))return reject(Error('SSH尚未连接，请先连接主机。'));
    if(pending.size>=32)return reject(Error('远程请求过多，请等待当前操作完成。'));
    const id=++serial,timer=setTimeout(()=>{close('远程操作超时；若正在保存，请重新读取确认远程结果，当前草稿已保留。');},30000);
    pending.set(id,{resolve,reject,timer});process_handle.stdin.write(JSON.stringify({...values,id,operation})+'\n',error=>{if(error)close('SSH写入失败；当前草稿已保留。');});
  });
  const connect=async(target)=>{
    if(disposed)throw Error('SSH服务已关闭');if(state==='connecting')throw Error('正在连接SSH，请等待或取消。');validate_target(target);close('');const epoch=generation;
    notify('connecting','正在连接SSH…');diagnostic='';const token=crypto.randomBytes(32).toString('hex');
    const server=auth_server=net.createServer(socket=>{
      sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(120000,()=>socket.destroy());let input='',requested=false;
      socket.on('data',chunk=>{input+=chunk;if(input.length>65536)return socket.destroy();if(requested||!input.includes('\n'))return;requested=true;
        void(async()=>{try{const message=JSON.parse(input);if(message.token!==token)return socket.destroy();notify('connecting','等待SSH身份验证…');const answer=await options.authenticate(String(message.prompt),()=>epoch!==generation);if(epoch!==generation||typeof answer!=='string')return socket.destroy();socket.end(JSON.stringify({answer})+'\n');}catch{socket.destroy();}})();
      });
    });
    try {
    await new Promise((resolve,reject)=>{cancel_listen=()=>reject(Error('已取消连接'));server.once('error',reject);server.listen(0,'127.0.0.1',()=>{cancel_listen=undefined;resolve();});});
    if(epoch!==generation){server.close();throw Error('已取消连接');}
    const agent=fs.readFileSync(path.join(options.asset_root,'remote_ssh_agent.py'),'utf8');
    const code=Buffer.from(agent).toString('base64');
    const command=`python3 -u -c 'import base64;exec(base64.b64decode("${code}"))'`;
    const env={...process.env,SSH_ASKPASS:options.node_path,SSH_ASKPASS_REQUIRE:'force',DISPLAY:'typora-code:0',NODE_OPTIONS:'--import '+JSON.stringify(require('node:url').pathToFileURL(path.join(options.asset_root,'remote_ssh_askpass.mjs')).href),TYPORA_SSH_AUTH_PORT:String(auth_server.address().port),TYPORA_SSH_AUTH_TOKEN:token};
    process_handle=child_process.spawn(options.ssh_path||'ssh',['-T','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-o','NumberOfPasswordPrompts=1','-o','StrictHostKeyChecking=ask',target,command],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const child=process_handle;
    child.on('error',error=>{if(epoch===generation)close('无法启动SSH：'+error.message);});
    child.on('exit',()=>{if(epoch===generation)close(diagnostic.trim()||'SSH连接结束，请检查远程Python3及认证配置。');});
    child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-8192);});
    child.stdout.on('data',chunk=>{
      if(epoch!==generation)return;buffer+=chunk.toString();if(buffer.length>24*1024*1024)return close('远程响应超过限制。');
      while(buffer.includes('\n')){const index=buffer.indexOf('\n'),line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{const message=JSON.parse(line),item=pending.get(message.id);if(!item)continue;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error)):item.resolve(message.result);}catch{close('SSH远程协议异常，请检查登录脚本是否向标准输出打印内容。');return;}}
    });
    const hello=await request('hello');if(epoch!==generation)throw Error('已取消连接');if(hello.protocol!==1)throw Error('远程协议版本不匹配');notify('connected',target);return hello;
    }catch(error){if(epoch===generation)close(error.message);throw error;}
  };
  return {connect,request,disconnect:()=>close(),state:()=>state,dispose(){if(disposed)return;disposed=true;close();}};
}
module.exports={validate_target,create_remote_ssh};
