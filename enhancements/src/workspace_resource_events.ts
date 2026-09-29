type resource_change={fs:object;paths:string[]};
const listeners=new Set<(change:resource_change)=>void>();
/** Completed native file write operations; changes to the original host and external programs are still reported by the file listener. */
export function notify_workspace_resource_change(change:resource_change){for(const listener of [...listeners])listener(change);}
export function subscribe_workspace_resource_change(listener:(change:resource_change)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
