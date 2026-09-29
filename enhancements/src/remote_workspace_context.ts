import {workspace_text} from "./workspace_i18n";
export type remote_workspace_context = Readonly<{
  target:string;
  port?:number;name?:string;username?:string;
  remote_path:string;
  state:'connecting'|'connected'|'disconnected';
}>;

// The SSH connection alone owns remote identity; consumers read snapshots instead of guessing the host from the active tab.
let read_context:(()=>remote_workspace_context|undefined)|undefined;
export function register_remote_workspace_context(read:()=>remote_workspace_context|undefined){
  if(read_context)throw Error(workspace_text("remote_workspace_context_the_current_window_is_registered_as_a_ssh_workspace_identity"));
  read_context=read;
  return()=>{if(read_context===read)read_context=undefined;};
}
export function current_remote_workspace(){
  const value=read_context?.();
  return value?{...value}:undefined;
}
export function require_remote_terminal_context(){
  const value=current_remote_workspace();
  if(value&&(value.state!=='connected'||!value.remote_path))throw Error(workspace_text("remote_workspace_context_ssh_is_not_connected_please_create_a_remote_terminal_after_c"));
  return value;
}
