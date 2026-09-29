'use strict';
const {workspace_service_text,set_workspace_service_locale}=require("./workspace_service_i18n.cjs");
const {create_ssh_auth}=require('./remote_ssh_auth.cjs');
const child_process=require('node:child_process'),fs=require('node:fs'),path=require('node:path');

function validate_target(target){
  if(typeof target!=='string'||!target||target.length>255||target.startsWith('-')||/\s/.test(target)||!/^([a-zA-Z0-9_.-]+@)?[a-zA-Z0-9_.:[\]-]+$/.test(target))throw Error(workspace_service_text("service_554164b395c1"));
  return target;
}
function connection_arguments(settings={},tty=false){
  const number=(key,fallback,min,max)=>{const value=settings[key]??fallback;if(!Number.isInteger(value)||value<min||value>max)throw Error(workspace_service_text("service_cc4c4b56c848")+key);return value;};
  const args=[tty?'-tt':'-T','-o','ConnectTimeout='+number('connect_timeout',15,1,300),'-o','ServerAliveInterval='+number('server_alive_interval',15,0,300),'-o','ServerAliveCountMax='+number('server_alive_count',3,1,10),'-o','StrictHostKeyChecking=ask'];
  if(settings.config_file){if(typeof settings.config_file!=='string'||/[\0\r\n]/u.test(settings.config_file))throw Error(workspace_service_text("service_96c8820ce1b9"));args.push('-F',settings.config_file);}
  if(settings.port){if(!Number.isInteger(settings.port)||settings.port<1||settings.port>65535)throw Error(workspace_service_text("service_d437ef0f577a"));args.push('-p',String(settings.port));}
  return args;
}

/** OpenSSH owns configuration and authentication; this service owns only the bounded JSON file protocol and connection lifecycle. */
function create_remote_ssh(options){
  let process_handle,auth_bridge,disposed=false,serial=0,buffer='',diagnostic='',state='disconnected',generation=0;
  const pending=new Map();
  const notify=(value,detail='')=>{state=value;options.on_state?.({state,detail});};
  const close=(reason=workspace_service_text("service_f4e3aa876830"))=>{
    ++generation;process_handle?.kill();process_handle=undefined;
    auth_bridge?.dispose();auth_bridge=undefined;
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error(reason));}pending.clear();buffer='';
    notify('disconnected',reason);
  };
  const request=(operation,values={})=>new Promise((resolve,reject)=>{
    if(!process_handle||!['connecting','connected'].includes(state))return reject(Error(workspace_service_text("service_3cf7c9ccf421")));
    const timeout=operation==='hello'?(options.connection_options?.().request_timeout??30):0;
    const id=++serial,payload=JSON.stringify({...values,id,operation})+'\n',timer=timeout>0?setTimeout(()=>{close(workspace_service_text("service_28e73833fa8b"));},Math.max(16,Math.min(1810,timeout))*1000):undefined;
    pending.set(id,{resolve,reject,timer});process_handle.stdin.write(payload,error=>{if(error)close(workspace_service_text("service_3a2b8a96449c"));});
  });
  const connect=async(target)=>{
    if(disposed)throw Error(workspace_service_text("service_17ce39f3f50b"));if(state==='connecting')throw Error(workspace_service_text("service_ec7cb96dcf61"));validate_target(target);close('');const epoch=generation;
    notify('connecting',workspace_service_text("service_a9d6f2478a95"));diagnostic='';
    try {
    const bridge=await create_ssh_auth({asset_root:options.asset_root,node_path:options.node_path,authenticate:options.authenticate,is_current:()=>epoch===generation});
    if(epoch!==generation){bridge.dispose();throw Error(workspace_service_text("service_11bb2e12a64d"));}auth_bridge=bridge;
    const agent=fs.readFileSync(path.join(options.asset_root,'remote_ssh_agent.py'),'utf8');
    const code=Buffer.from(agent).toString('base64');
    const command=`python3 -u -c 'import base64;exec(base64.b64decode("${code}"))'`;
    const env={...process.env,...auth_bridge.env};
    const settings=options.connection_options?.()||{};
    process_handle=child_process.spawn(settings.ssh_path||options.ssh_path||'ssh',[...connection_arguments(settings),'-o','NumberOfPasswordPrompts=1',target,command],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const child=process_handle;
    child.on('error',error=>{if(epoch===generation)close(workspace_service_text("service_cf54e297f1f8")+error.message);});
    child.on('exit',()=>{if(epoch===generation)close(diagnostic.trim()||workspace_service_text("service_82c6eb33e121"));});
    child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-8192);});
    child.stdout.on('data',chunk=>{
      if(epoch!==generation)return;try{buffer+=chunk.toString();}catch(error){close(workspace_service_text("service_9957057eaa03")+String(error.message||error));return;}
      while(buffer.includes('\n')){const index=buffer.indexOf('\n'),line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{const message=JSON.parse(line),item=pending.get(message.id);if(!item)continue;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Object.assign(Error(message.error),{code:message.code})):item.resolve(message.result);}catch{close(workspace_service_text("service_753074167007"));return;}}
    });
    const hello=await request('hello');if(epoch!==generation)throw Error(workspace_service_text("service_11bb2e12a64d"));if(hello.protocol!==1)throw Error(workspace_service_text("service_3c91eadb7c47"));notify('connected',target);return hello;
    }catch(error){if(epoch===generation)close(error.message);throw error;}
  };
  return {connect,request,disconnect:()=>close(),state:()=>state,dispose(){if(disposed)return;disposed=true;close();}};
}
/** Use a fixed startup protocol; pass remote directories only as single-quoted arguments and never expand local configuration templates. */
function remote_terminal_profile(target,remote_path,executable,settings={}){
  validate_target(target);
  if(typeof remote_path!=='string'||(remote_path!==''&&!remote_path.startsWith('/'))||remote_path.includes('\0'))throw Error(workspace_service_text("service_1d929e400c33"));
  const quoted="'"+remote_path.replace(/'/g,"'\\''")+"'";
  // Linux terminals load interactive configuration; declare capabilities on the remote side without relying on sshd accepting local environment variables.
  return {id:'ssh_remote',title:'SSH: '+target,remote:{target,remote_path,port:settings.port||0},executable:settings.ssh_path||executable,args:[...connection_arguments(settings,true),target,(remote_path?'cd -- '+quoted+' && ':'')+'exec env TERM=xterm-256color COLORTERM=truecolor TERM_PROGRAM=Typora "${SHELL:-/bin/sh}" -i']};
}
async function resolve_connection_identity(target,settings={}){
 validate_target(target);const result=await new Promise((resolve,reject)=>child_process.execFile(settings.ssh_path||'ssh',['-G',...connection_arguments(settings),target],{windowsHide:true,timeout:15000,maxBuffer:Infinity},(error,stdout)=>error?reject(Error(workspace_service_text("service_dc80bdbd0405"))):resolve(stdout)));
 const fields={};for(const line of result.split(/\r?\n/)){const match=/^(hostname|user|port) (.+)$/.exec(line);if(match)fields[match[1]]=match[2];}
 if(!fields.hostname||!fields.user||!fields.port)throw Error(workspace_service_text("service_2a5fe7343701"));
 return{...fields,key:JSON.stringify([fields.hostname.toLowerCase(),fields.port,fields.user,settings.config_file||''])};
}
module.exports={set_workspace_service_locale,validate_target,create_remote_ssh,remote_terminal_profile,connection_arguments,resolve_connection_identity};
