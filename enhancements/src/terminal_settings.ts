import {workspace_text} from "./workspace_i18n";
import { terminal_environment, type terminal_profile } from "./terminal_runtime";
import type {terminal_profile_service} from "./terminal_profile_detection";

export const TERMINAL_SETTINGS_KEY = "linux-note-terminal:v1:";
export type terminal_profile_config = terminal_profile & {env?: Record<string,string|null>; cwd?: string; icon?: string; color?: string; remote?:{target:string;remote_path:string;port?:number}};
export type terminal_settings = {
  profile: string; profiles: terminal_profile_config[]; cwd: string; env: Record<string,string|null>;
  font_family: string; font_size: number; font_weight: "normal"|"bold"; line_height: number; letter_spacing: number;
  cursor_style: "block"|"bar"|"underline"; cursor_blink: boolean; cursor_width: number;
  scrollback: number; smooth_scrolling: boolean; scroll_sensitivity: number; fast_scroll_sensitivity: number;
  minimum_contrast: number; tab_stop_width: number; right_click: "menu"|"copy_paste"|"paste";
  copy_on_selection: boolean; confirm_multiline: boolean; tabs_location: "left"|"right"; tabs_hide: "never"|"single_terminal"|"single_group";
  split_cwd: "initial"|"workspace"; location: "panel"|"editor";
};
export const terminal_defaults: terminal_settings = {
  profile:"",profiles:[],cwd:"",env:{},font_family:"Consolas, 'Cascadia Mono', monospace",font_size:14,font_weight:"normal",line_height:1,letter_spacing:0,
  cursor_style:"block",cursor_blink:false,cursor_width:1,scrollback:1000,smooth_scrolling:false,scroll_sensitivity:1,fast_scroll_sensitivity:5,
  minimum_contrast:4.5,tab_stop_width:8,right_click:"menu",copy_on_selection:false,confirm_multiline:true,tabs_location:"right",tabs_hide:"single_terminal",split_cwd:"initial",location:"panel",
};
const ranges: Partial<Record<keyof terminal_settings,[number,number,boolean?]>> = {
  font_size:[6,100],line_height:[1,3],letter_spacing:[-5,10],cursor_width:[1,10,true],scrollback:[0,100000,true],
  scroll_sensitivity:[0.1,20],fast_scroll_sensitivity:[1,20],minimum_contrast:[1,21],tab_stop_width:[1,32,true],
};
export const terminal_setting_choices: Partial<Record<keyof terminal_settings,string[]>> = {
  font_weight:["normal","bold"],cursor_style:["block","bar","underline"],right_click:["menu","copy_paste","paste"],
  tabs_location:["left","right"],tabs_hide:["never","single_terminal","single_group"],split_cwd:["initial","workspace"],location:["panel","editor"],
};
function environment_map(value: unknown): Record<string,string|null> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(workspace_text("terminal_settings_environment_variable_must_be_json_object"));
  const result:Record<string,string|null>={};
  for(const [key,item] of Object.entries(value)){
    if(!key||/[=\0]/u.test(key)||!(item===null||typeof item==="string"&&!item.includes("\0")))throw new Error(workspace_text("terminal_settings_invalid_environment_variable_name_or_value")+key);
    Object.defineProperty(result,key,{value:item,enumerable:true,writable:true,configurable:true});
  }
  return result;
}
export function validate_terminal_settings(value: unknown): terminal_settings {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(workspace_text("terminal_settings_terminal_settings_must_be_json_object"));
  const candidate=value as Record<string,unknown>,result=structuredClone(terminal_defaults);
  for(const key of Object.keys(result) as (keyof terminal_settings)[]){
    if(!(key in candidate))continue;
    const item=candidate[key];
    if(ranges[key]){const[min,max,integer]=ranges[key]!;if(typeof item!=="number"||!Number.isFinite(item)||item<min||item>max||integer&&!Number.isInteger(item))throw new Error(workspace_text("terminal_settings_must_be_in_the_range_of", {value_0: String(key), value_1: String(min), value_2: String(max)}));}
    else if(terminal_setting_choices[key]){if(!terminal_setting_choices[key]!.includes(item as string))throw new Error(key+workspace_text("terminal_settings_the_options_are_invalid"));}
    else if(typeof result[key]==="boolean"){if(typeof item!=="boolean")throw new Error(key+workspace_text("terminal_settings_must_be_a_boolean"));}
    else if(typeof result[key]==="string"){if(typeof item!=="string"||item.includes("\0"))throw new Error(key+workspace_text("terminal_settings_must_be_valid_text"));}
    if(key!=="profiles"&&key!=="env")(result as any)[key]=item;
  }
  result.env=environment_map(candidate.env??{});
  if(candidate.profiles!==undefined){
    if(!Array.isArray(candidate.profiles))throw new Error(workspace_text("terminal_settings_profiles_must_be_a_configuration_array"));
    const ids=new Set<string>();
    result.profiles=candidate.profiles.map((item:any)=>{
      if(!item||typeof item.id!=="string"||!item.id.trim()||ids.has(item.id)||typeof item.title!=="string"||!item.title.trim()||typeof item.executable!=="string"||!item.executable.trim()||item.executable.includes("\0"))throw new Error(workspace_text("terminal_settings_shell_configuration_requires_unique_id_name_and_executable"));
      ids.add(item.id);
      if(!Array.isArray(item.args)||item.args.some((arg:any)=>typeof arg!=="string"||arg.includes("\0")))throw new Error(item.title+workspace_text("terminal_settings_the_parameters_must_be_a_string_array"));
      for(const key of["cwd","icon","color"])if(item[key]!==undefined&&typeof item[key]!=="string")throw new Error(workspace_text("terminal_invalid_profile_field",{profile:item.title,field:key}));
      if(item.color&&!/^#[\da-f]{6}$/iu.test(item.color))throw new Error(workspace_text("terminal_settings_configuration_color_must_be_rrggbb"));
      return {id:item.id,title:item.title,executable:item.executable,args:[...item.args],env:environment_map(item.env??{}),cwd:item.cwd||"",icon:item.icon||"terminal",color:item.color||""};
    });
  }
  return result;
}

/** Configuration has a unique owner; read valid fields of old settings, and write always overall check and atomically replace. */
export function create_terminal_settings(storage: Pick<Storage,"getItem"|"setItem">, catalog:Pick<terminal_profile_service,"profiles"|"ready"|"refresh"|"warnings">) {
  let current=structuredClone(terminal_defaults);
  try{const data=JSON.parse(storage.getItem(TERMINAL_SETTINGS_KEY)||"{}");
    for(const key of Object.keys(terminal_defaults))try{current=validate_terminal_settings({...current,[key]:data[key]??(current as any)[key]});}catch{/* A single old field does not erase other valid settings. */}
  }catch{/* Missing or damaged data uses the default configuration, without overwriting the disk. */}
  const listeners=new Set<(settings:terminal_settings)=>void>();
  const profiles=()=>{const values=new Map(catalog.profiles().map(item=>[item.id,item as terminal_profile_config]));for(const item of current.profiles)values.set(item.id,item);return structuredClone([...values.values()]);};
  return {get:()=>structuredClone(current),profiles,
    ready:()=>catalog.ready(),refresh:()=>catalog.refresh(),warnings:()=>catalog.warnings(),
    select_profile(id=current.profile){const values=profiles();
      if(id){const selected=values.find(item=>item.id===id);if(!selected)throw new Error(workspace_text("terminal_settings_terminal_configuration_is_unavailable")+id+workspace_text("terminal_settings_please_re_detect_or_select_a_default_configuration"));return selected;}
      const selected=["pwsh","powershell","cmd"].map(name=>values.find(item=>item.id===name)).find(Boolean)||values[0];
      if(!selected)throw new Error(workspace_text("terminal_settings_no_available_shell_found_please_add_a_custom_configuration_i"));return selected;
    },
    update(value:unknown){const next=validate_terminal_settings(value);const ids=new Set([...catalog.profiles(),...next.profiles].map(item=>item.id));if(next.profile&&next.profile!==current.profile&&!ids.has(next.profile))throw new Error(workspace_text("terminal_settings_default_shell_does_not_exist"));storage.setItem(TERMINAL_SETTINGS_KEY,JSON.stringify(next));current=next;for(const listener of listeners)listener(structuredClone(current));},
    subscribe(listener:(settings:terminal_settings)=>void){listeners.add(listener);return()=>listeners.delete(listener);},dispose(){listeners.clear();},
  };
}
export type terminal_settings_store=ReturnType<typeof create_terminal_settings>;

/** Parameters and environment are passed as arrays / objects to PTY, and do not concatenate Shell commands. */
export function resolve_terminal_launch(settings:terminal_settings,profile:terminal_profile_config,root:string,process_api:any,path_api:any,explicit_cwd=false,literal_profile=false){
  const lookup=(name:string)=>Object.entries(process_api.env).find(([key])=>process_api.platform==="win32"?key.toLowerCase()===name.toLowerCase():key===name)?.[1];
  const expand=(text:string)=>text.replace(/\$\{(workspaceFolder|env:[^}]+)\}/gu,(_,key:string)=>{const value=key==="workspaceFolder"?root:lookup(key.slice(4));if(typeof value!=="string")throw new Error(workspace_text("terminal_settings_cannot_parse_configuration_variable")+key);return value;});
  const cwd=explicit_cwd?root:expand(profile.cwd||settings.cwd||root);
  const env=terminal_environment(process_api.env);
  for(const [key,value]of Object.entries({...settings.env,...profile.env})){
    const existing=Object.keys(env).find(name=>process_api.platform==="win32"?name.toLowerCase()===key.toLowerCase():name===key);
    if(existing)delete env[existing];if(value!==null)Object.defineProperty(env,key,{value:expand(value),enumerable:true,writable:true,configurable:true});
  }
  const resolved_cwd=path_api.isAbsolute(cwd)?cwd:path_api.resolve(root,cwd);
  const args=profile.args.map(value=>literal_profile?value:expand(value));if(profile.wsl)args.push("--cd",resolved_cwd);
  return {executable:literal_profile?profile.executable:expand(profile.executable),args,cwd:resolved_cwd,env};
}
