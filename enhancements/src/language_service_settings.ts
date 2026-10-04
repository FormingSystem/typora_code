import {workspace_text} from "./workspace_i18n";
import {get_workspace_app} from './workspace_bootstrap';

export type language_service_profile={provider:'default'|'lsp'|'disabled';command?:string;args?:string[];environment?:Record<string,string>;initialization_options?:Record<string,unknown>;settings?:Record<string,unknown>};
export type language_service_profiles=Record<string,language_service_profile>;
const listeners=new Set<()=>void>();
const providers=new Map<string,{languages:readonly string[];resolve:(root:string,language:string)=>language_service_profile|undefined;prepare?:()=>Promise<unknown>}>();
export function register_language_service_provider(id:string,languages:readonly string[],resolve:(root:string,language:string)=>language_service_profile|undefined,prepare?:()=>Promise<unknown>){
 if(providers.has(id))throw Error('Language provider already registered: '+id);
 providers.set(id,{languages,resolve,prepare});notify_language_services();return()=>{providers.delete(id);notify_language_services();};
}
export function observe_language_services(callback:()=>void){listeners.add(callback);return()=>{listeners.delete(callback);};}
export function notify_language_services(){for(const callback of listeners)callback();}
const key=(root:string)=>{const runtime=window as any,path=runtime.reqnode('path'),process=runtime.reqnode('process');const value=root?path.resolve(root):'';return process.platform==='win32'?value.toLowerCase():value;};
const read=()=>get_workspace_app()?.settings.get('language_services') as {user?:language_service_profiles;workspaces?:Record<string,language_service_profiles>}|undefined;
export function read_language_service_profiles(root:string,scope:'user'|'workspace'):language_service_profiles{return (scope==='user'?read()?.user:read()?.workspaces?.[key(root)])||{};}
export function read_language_service_profile(root:string,language:string):language_service_profile{
 const explicit=read_language_service_profiles(root,'workspace')[language]||read_language_service_profiles(root,'user')[language];
 if(explicit&&explicit.provider!=='default')return explicit;
 for(const provider of providers.values())if(provider.languages.includes(language)){const value=provider.resolve(root,language);if(value)return value;}
 return explicit||{provider:'default'};
}
/** A caller can stop waiting without cancelling the plugin-owned shared preparation. */
export async function resolve_language_service_profile(root:string,language:string,signal:AbortSignal):Promise<language_service_profile>{
 const check=()=>{if(signal.aborted)throw new DOMException('Language request cancelled','AbortError');};check();
 const value=read_language_service_profile(root,language);if(value.provider!=='default')return value;
 for(const provider of providers.values())if(provider.languages.includes(language)&&provider.prepare){
  await new Promise<void>((resolve,reject)=>{
   const abort=()=>{signal.removeEventListener('abort',abort);reject(new DOMException('Language request cancelled','AbortError'));};
   signal.addEventListener('abort',abort,{once:true});
   Promise.resolve().then(provider.prepare).then(()=>{signal.removeEventListener('abort',abort);resolve();},error=>{signal.removeEventListener('abort',abort);reject(error);});
   if(signal.aborted)abort();
  });check();return read_language_service_profile(root,language);
 }
 return value;
}
export function validate_language_service_profiles(value:unknown):language_service_profiles{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(workspace_text("language_service_settings_the_language_configuration_must_be_a_json_object_mapping_fro"));
 for(const [language,raw] of Object.entries(value)){
  if(!/^[a-z][a-z0-9_-]*$/.test(language)||['constructor','prototype','__proto__'].includes(language))throw Error(workspace_text("language_service_settings_please_use_a_valid_language_identifier_such_as_c_cpp_python"));
  const item=raw as language_service_profile;
  if(!item||typeof item!=='object'||Array.isArray(item)||!['default','lsp','disabled'].includes(item.provider))throw Error(workspace_text("language_service_settings_provider_must_be_default_lsp_or_disabled", {value_0: String(language)}));
  if(Object.keys(item).some(name=>!['provider','command','args','environment','initialization_options','settings'].includes(name)))throw Error(workspace_text("language_service_settings_there_is_an_unknown_configuration_field", {value_0: String(language)}));
  if(item.environment!==undefined&&(!item.environment||typeof item.environment!=='object'||Array.isArray(item.environment)||Object.entries(item.environment).some(([name,value])=>! /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||typeof value!=='string'||value.includes('\0'))))throw Error('Invalid language process environment.');
  if(item.provider==='lsp'&&(typeof item.command!=='string'||!item.command.trim()||/[\r\n\0]/.test(item.command)))throw Error(workspace_text("language_service_settings_lsp_requires_an_executable_command", {value_0: String(language)}));
  if(item.args!==undefined&&(!Array.isArray(item.args)||item.args.some(arg=>typeof arg!=='string'||/\0/.test(arg))))throw Error(workspace_text("language_service_settings_args_must_be_a_string_array", {value_0: String(language)}));
  for(const name of ['initialization_options','settings'] as const)if(item[name]!==undefined&&(!item[name]||typeof item[name]!=='object'||Array.isArray(item[name])))throw Error(workspace_text("language_service_settings_must_be_a_json_object", {value_0: String(language), value_1: String(name)}));
 }
 return JSON.parse(JSON.stringify(value));
}
/** The workspace is covered by one language; deleting this key restores inheritance, and notification to the analyzer owner is only made after persistent success. */
export function save_language_service_profiles(root:string,scope:'user'|'workspace',value:unknown){
 const profiles=validate_language_service_profiles(value),settings=get_workspace_app()?.settings;
 if(!settings)throw Error(workspace_text("language_service_settings_the_workbench_settings_are_not_ready"));
 if(scope==='workspace'&&!root)throw Error(workspace_text("language_service_settings_please_open_the_project_folder_first"));
 const stored=read()||{};
 settings.set_and_save('language_services',scope==='user'?{...stored,user:profiles}:{...stored,workspaces:{...stored.workspaces,[key(root)]:profiles}});notify_language_services();
}
