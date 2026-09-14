/** 仅在文件成功写盘后通知；原生宿主只提供路径，源码事务可附已验证字节，订阅者失败不改变保存结果。 */
export type workspace_saved_file = {file_path:string; bytes?:Uint8Array; source?:string};
const saved_listeners=new Set<(file:workspace_saved_file)=>void>();
const change_listeners=new Set<(file_path:string)=>void>();
export function observe_workspace_file_saved(listener:(file:workspace_saved_file)=>void){saved_listeners.add(listener);return()=>{saved_listeners.delete(listener);};}
export function observe_workspace_file_changed(listener:(file_path:string)=>void){change_listeners.add(listener);return()=>{change_listeners.delete(listener);};}
export function publish_workspace_file_saved(file:workspace_saved_file){for(const listener of saved_listeners)try{listener(file);}catch(error){console.error("Local history:",error);}}
export function publish_workspace_file_changed(file_path:string){for(const listener of change_listeners)try{listener(file_path);}catch(error){console.error("Auto save:",error);}}
