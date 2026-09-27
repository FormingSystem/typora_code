type resource_change={fs:object;paths:string[]};
const listeners=new Set<(change:resource_change)=>void>();
/** 已完成的自有文件写操作；原始宿主及外部程序的变化仍由文件监听报告。 */
export function notify_workspace_resource_change(change:resource_change){for(const listener of [...listeners])listener(change);}
export function subscribe_workspace_resource_change(listener:(change:resource_change)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
