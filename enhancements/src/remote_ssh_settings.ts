import {get_workspace_app} from './workspace_bootstrap';
export const REMOTE_SSH_DEFAULTS={ssh_path:'',config_file:'',connect_timeout:15,server_alive_interval:15,server_alive_count:3,request_timeout:30,refresh_interval:5};
export type remote_ssh_settings=typeof REMOTE_SSH_DEFAULTS;
const KEY='remote_ssh';
export function validate_remote_ssh_settings(value:unknown):remote_ssh_settings{
  const input=value as Record<string,unknown>,result={...REMOTE_SSH_DEFAULTS};
  for(const key of ['ssh_path','config_file'] as const){const entry=input?.[key]??'';if(typeof entry!=='string'||/[\0\r\n]/u.test(entry))throw Error('SSH路径必须是单行文本');result[key]=entry.trim();}
  for(const [key,min,max]of [['connect_timeout',1,300],['server_alive_interval',0,300],['server_alive_count',1,10],['request_timeout',16,300],['refresh_interval',0,300]] as const){const entry=input?.[key]??REMOTE_SSH_DEFAULTS[key];if(typeof entry!=='number'||!Number.isInteger(entry)||entry<min||entry>max)throw Error(`${key} 必须为 ${min}–${max} 的整数`);result[key]=entry;}
  return result;
}
export function read_remote_ssh_settings(){try{return validate_remote_ssh_settings(get_workspace_app()?.settings.get(KEY)||{});}catch{return {...REMOTE_SSH_DEFAULTS};}}
export function write_remote_ssh_setting(key:string,value:unknown){if(!Object.hasOwn(REMOTE_SSH_DEFAULTS,key))throw Error('未知SSH配置项');const settings=get_workspace_app()?.settings;if(!settings)throw Error('设置尚未就绪');settings.set_and_save(KEY,validate_remote_ssh_settings({...read_remote_ssh_settings(),[key]:value}));window.dispatchEvent(new Event('typora-code-ssh-settings-changed'));}
