export type remote_workspace_context = Readonly<{
  target:string;
  port?:number;name?:string;username?:string;
  remote_path:string;
  state:'connecting'|'connected'|'disconnected';
}>;

// SSH连接是远端身份的唯一所有者，消费者读取快照，不能从活动标签猜主机。
let read_context:(()=>remote_workspace_context|undefined)|undefined;
export function register_remote_workspace_context(read:()=>remote_workspace_context|undefined){
  if(read_context)throw Error('当前窗口已注册SSH工作区身份。');
  read_context=read;
  return()=>{if(read_context===read)read_context=undefined;};
}
export function current_remote_workspace(){
  const value=read_context?.();
  return value?{...value}:undefined;
}
export function require_remote_terminal_context(){
  const value=current_remote_workspace();
  if(value&&(value.state!=='connected'||!value.remote_path))throw Error('SSH尚未连接，请连接原主机后新建远程终端；如需本地终端，请先打开本地文件夹。');
  return value;
}
