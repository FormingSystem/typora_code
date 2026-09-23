export type ssh_connection_record={id:string;name:string;host_name:string;target:string;port:number;folder:string};
type ssh_auth_owner={prepare:(target:string,port:number,is_current:()=>boolean)=>Promise<{env:Record<string,string>;dispose:()=>void}>;list:()=>Promise<ssh_connection_record[]>};
let owner:ssh_auth_owner|undefined;
export function register_ssh_auth_owner(value:ssh_auth_owner){if(owner)throw Error('SSH认证服务已注册');owner=value;return()=>{if(owner===value)owner=undefined;};}
export async function prepare_ssh_terminal_auth(target:string,port:number,is_current:()=>boolean){if(!owner)throw Error('SSH认证服务尚未就绪');return owner.prepare(target,port,is_current);}
export async function saved_ssh_connections(){return owner?owner.list():[];}
