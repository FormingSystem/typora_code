import {get_workspace_app} from './workspace_bootstrap';

export type language_service_profile={provider:'default'|'lsp'|'disabled';command?:string;args?:string[];initialization_options?:Record<string,unknown>;settings?:Record<string,unknown>};
export type language_service_profiles=Record<string,language_service_profile>;
const listeners=new Set<()=>void>();
export function observe_language_services(callback:()=>void){listeners.add(callback);return()=>{listeners.delete(callback);};}
export function notify_language_services(){for(const callback of listeners)callback();}
const key=(root:string)=>{const runtime=window as any,path=runtime.reqnode('path'),process=runtime.reqnode('process');const value=root?path.resolve(root):'';return process.platform==='win32'?value.toLowerCase():value;};
const read=()=>get_workspace_app()?.settings.get('language_services') as {user?:language_service_profiles;workspaces?:Record<string,language_service_profiles>}|undefined;
export function read_language_service_profiles(root:string,scope:'user'|'workspace'):language_service_profiles{return (scope==='user'?read()?.user:read()?.workspaces?.[key(root)])||{};}
export function read_language_service_profile(root:string,language:string):language_service_profile{return read_language_service_profiles(root,'workspace')[language]||read_language_service_profiles(root,'user')[language]||{provider:'default'};}
export function validate_language_service_profiles(value:unknown):language_service_profiles{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('语言配置必须是语言标识到配置的JSON对象。');
 for(const [language,raw] of Object.entries(value)){
  if(!/^[a-z][a-z0-9_-]*$/.test(language)||['constructor','prototype','__proto__'].includes(language))throw Error('请使用有效语言标识，如c、cpp、python、java。');
  const item=raw as language_service_profile;
  if(!item||typeof item!=='object'||Array.isArray(item)||!['default','lsp','disabled'].includes(item.provider))throw Error(`${language}：provider须为default、lsp或disabled。`);
  if(Object.keys(item).some(name=>!['provider','command','args','initialization_options','settings'].includes(name)))throw Error(`${language}：存在未知配置字段。`);
  if(item.provider==='lsp'&&(typeof item.command!=='string'||!item.command.trim()||/[\r\n\0]/.test(item.command)))throw Error(`${language}：LSP需要可执行文件command。`);
  if(item.args!==undefined&&(!Array.isArray(item.args)||item.args.some(arg=>typeof arg!=='string'||/\0/.test(arg))))throw Error(`${language}：args须为字符串数组。`);
  for(const name of ['initialization_options','settings'] as const)if(item[name]!==undefined&&(!item[name]||typeof item[name]!=='object'||Array.isArray(item[name])))throw Error(`${language}：${name}须为JSON对象。`);
 }
 return JSON.parse(JSON.stringify(value));
}
/** 工作区整体覆盖一种语言；删除该键恢复继承，持久化成功后才通知分析所有者。 */
export function save_language_service_profiles(root:string,scope:'user'|'workspace',value:unknown){
 const profiles=validate_language_service_profiles(value),settings=get_workspace_app()?.settings;
 if(!settings)throw Error('工作台设置尚未就绪。');
 if(scope==='workspace'&&!root)throw Error('请先打开工程文件夹。');
 const stored=read()||{};
 settings.set_and_save('language_services',scope==='user'?{...stored,user:profiles}:{...stored,workspaces:{...stored.workspaces,[key(root)]:profiles}});notify_language_services();
}
