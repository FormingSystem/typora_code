'use strict';
const {create_ssh_auth}=require('./remote_ssh_auth.cjs');
const child_process=require('node:child_process'),fs=require('node:fs'),path=require('node:path');

function validate_target(target){
  if(typeof target!=='string'||!target||target.length>255||target.startsWith('-')||/\s/.test(target)||!/^([a-zA-Z0-9_.-]+@)?[a-zA-Z0-9_.:[\]-]+$/.test(target))throw Error('SSH主机应为配置别名或 user@hostname，不能包含命令参数。');
  return target;
}
function connection_arguments(settings={},tty=false){
  const number=(key,fallback,min,max)=>{const value=settings[key]??fallback;if(!Number.isInteger(value)||value<min||value>max)throw Error('SSH配置无效：'+key);return value;};
  const args=[tty?'-tt':'-T','-o','ConnectTimeout='+number('connect_timeout',15,1,300),'-o','ServerAliveInterval='+number('server_alive_interval',15,0,300),'-o','ServerAliveCountMax='+number('server_alive_count',3,1,10),'-o','StrictHostKeyChecking=ask'];
  if(settings.config_file){if(typeof settings.config_file!=='string'||/[\0\r\n]/u.test(settings.config_file))throw Error('SSH配置文件路径无效');args.push('-F',settings.config_file);}
  if(settings.port){if(!Number.isInteger(settings.port)||settings.port<1||settings.port>65535)throw Error('SSH端口无效');args.push('-p',String(settings.port));}
  return args;
}

/** OpenSSH拥有配置和认证；该服务只拥有有限JSON文件协议与连接生命周期。 */
function create_remote_ssh(options){
  let process_handle,auth_bridge,disposed=false,serial=0,buffer='',diagnostic='',state='disconnected',generation=0;
  const pending=new Map();
  const notify=(value,detail='')=>{state=value;options.on_state?.({state,detail});};
  const close=(reason='SSH连接已断开')=>{
    ++generation;process_handle?.kill();process_handle=undefined;
    auth_bridge?.dispose();auth_bridge=undefined;
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error(reason));}pending.clear();buffer='';
    notify('disconnected',reason);
  };
  const request=(operation,values={})=>new Promise((resolve,reject)=>{
    if(!process_handle||!['connecting','connected'].includes(state))return reject(Error('SSH尚未连接，请先连接主机。'));
    if(pending.size>=32)return reject(Error('远程请求过多，请等待当前操作完成。'));
    const timeout=operation==='git'?(values.writable?1810:310):options.connection_options?.().request_timeout??30;
    const id=++serial,timer=setTimeout(()=>{close('远程操作超时；若正在保存，请重新读取确认远程结果，当前草稿已保留。');},Math.max(16,Math.min(1810,timeout))*1000);
    pending.set(id,{resolve,reject,timer});process_handle.stdin.write(JSON.stringify({...values,id,operation})+'\n',error=>{if(error)close('SSH写入失败；当前草稿已保留。');});
  });
  const connect=async(target)=>{
    if(disposed)throw Error('SSH服务已关闭');if(state==='connecting')throw Error('正在连接SSH，请等待或取消。');validate_target(target);close('');const epoch=generation;
    notify('connecting','正在连接SSH…');diagnostic='';
    try {
    const bridge=await create_ssh_auth({asset_root:options.asset_root,node_path:options.node_path,authenticate:options.authenticate,is_current:()=>epoch===generation});
    if(epoch!==generation){bridge.dispose();throw Error('已取消连接');}auth_bridge=bridge;
    const agent=fs.readFileSync(path.join(options.asset_root,'remote_ssh_agent.py'),'utf8');
    const code=Buffer.from(agent).toString('base64');
    const command=`python3 -u -c 'import base64;exec(base64.b64decode("${code}"))'`;
    const env={...process.env,...auth_bridge.env};
    const settings=options.connection_options?.()||{};
    process_handle=child_process.spawn(settings.ssh_path||options.ssh_path||'ssh',[...connection_arguments(settings),'-o','NumberOfPasswordPrompts=1',target,command],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const child=process_handle;
    child.on('error',error=>{if(epoch===generation)close('无法启动SSH：'+error.message);});
    child.on('exit',()=>{if(epoch===generation)close(diagnostic.trim()||'SSH连接结束，请检查远程Python3及认证配置。');});
    child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-8192);});
    child.stdout.on('data',chunk=>{
      if(epoch!==generation)return;buffer+=chunk.toString();if(buffer.length>24*1024*1024)return close('远程响应超过限制。');
      while(buffer.includes('\n')){const index=buffer.indexOf('\n'),line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{const message=JSON.parse(line),item=pending.get(message.id);if(!item)continue;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Object.assign(Error(message.error),{code:message.code})):item.resolve(message.result);}catch{close('SSH远程协议异常，请检查登录脚本是否向标准输出打印内容。');return;}}
    });
    const hello=await request('hello');if(epoch!==generation)throw Error('已取消连接');if(hello.protocol!==1)throw Error('远程协议版本不匹配');notify('connected',target);return hello;
    }catch(error){if(epoch===generation)close(error.message);throw error;}
  };
  return {connect,request,disconnect:()=>close(),state:()=>state,dispose(){if(disposed)return;disposed=true;close();}};
}
/** 固定启动协议；远程目录只能作为单引号参数，不能展开本机配置模板。 */
function remote_terminal_profile(target,remote_path,executable,settings={}){
  validate_target(target);
  if(typeof remote_path!=='string'||(remote_path!==''&&!remote_path.startsWith('/'))||remote_path.includes('\0')||remote_path.length>32768)throw Error('远程工作目录必须是绝对路径。');
  const quoted="'"+remote_path.replace(/'/g,"'\\''")+"'";
  return {id:'ssh_remote',title:'SSH: '+target,remote:{target,remote_path,port:settings.port||0},executable:settings.ssh_path||executable,args:[...connection_arguments(settings,true),target,(remote_path?'cd -- '+quoted+' && ':'')+'exec "${SHELL:-/bin/sh}" -l']};
}
async function resolve_connection_identity(target,settings={}){
 validate_target(target);const result=await new Promise((resolve,reject)=>child_process.execFile(settings.ssh_path||'ssh',['-G',...connection_arguments(settings),target],{windowsHide:true,timeout:15000,maxBuffer:1048576},(error,stdout)=>error?reject(Error('无法读取SSH连接配置，请检查主机和SSH程序。')):resolve(stdout)));
 const fields={};for(const line of result.split(/\r?\n/)){const match=/^(hostname|user|port) (.+)$/.exec(line);if(match)fields[match[1]]=match[2];}
 if(!fields.hostname||!fields.user||!fields.port)throw Error('SSH未返回完整连接身份');
 return{...fields,key:JSON.stringify([fields.hostname.toLowerCase(),fields.port,fields.user,settings.config_file||''])};
}
module.exports={validate_target,create_remote_ssh,remote_terminal_profile,connection_arguments,resolve_connection_identity};
