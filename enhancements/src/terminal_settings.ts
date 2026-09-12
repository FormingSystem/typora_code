import { terminal_profiles, terminal_environment, type terminal_profile } from "./terminal_runtime";

export const TERMINAL_SETTINGS_KEY = "linux-note-terminal:v1:";
export type terminal_profile_config = terminal_profile & {env?: Record<string,string|null>; cwd?: string; icon?: string; color?: string};
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
const choices: Partial<Record<keyof terminal_settings,string[]>> = {
  font_weight:["normal","bold"],cursor_style:["block","bar","underline"],right_click:["menu","copy_paste","paste"],
  tabs_location:["left","right"],tabs_hide:["never","single_terminal","single_group"],split_cwd:["initial","workspace"],location:["panel","editor"],
};
function environment_map(value: unknown): Record<string,string|null> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("环境变量必须是 JSON 对象。");
  const result:Record<string,string|null>={};
  for(const [key,item] of Object.entries(value)){
    if(!key||/[=\0]/u.test(key)||!(item===null||typeof item==="string"&&!item.includes("\0")))throw new Error("环境变量名称或值无效："+key);
    Object.defineProperty(result,key,{value:item,enumerable:true,writable:true,configurable:true});
  }
  return result;
}
export function validate_terminal_settings(value: unknown): terminal_settings {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("终端设置必须是 JSON 对象。");
  const candidate=value as Record<string,unknown>,result=structuredClone(terminal_defaults);
  for(const key of Object.keys(result) as (keyof terminal_settings)[]){
    if(!(key in candidate))continue;
    const item=candidate[key];
    if(ranges[key]){const[min,max,integer]=ranges[key]!;if(typeof item!=="number"||!Number.isFinite(item)||item<min||item>max||integer&&!Number.isInteger(item))throw new Error(`${key} 必须在 ${min}–${max} 范围内。`);}
    else if(choices[key]){if(!choices[key]!.includes(item as string))throw new Error(key+" 的选项无效。");}
    else if(typeof result[key]==="boolean"){if(typeof item!=="boolean")throw new Error(key+" 必须是布尔值。");}
    else if(typeof result[key]==="string"){if(typeof item!=="string"||item.includes("\0"))throw new Error(key+" 必须是有效文本。");}
    if(key!=="profiles"&&key!=="env")(result as any)[key]=item;
  }
  result.env=environment_map(candidate.env??{});
  if(candidate.profiles!==undefined){
    if(!Array.isArray(candidate.profiles))throw new Error("profiles 必须是配置数组。");
    const ids=new Set<string>();
    result.profiles=candidate.profiles.map((item:any)=>{
      if(!item||typeof item.id!=="string"||!item.id.trim()||ids.has(item.id)||typeof item.title!=="string"||!item.title.trim()||typeof item.executable!=="string"||!item.executable.trim()||item.executable.includes("\0"))throw new Error("Shell 配置需要唯一 id、名称和可执行文件。");
      ids.add(item.id);
      if(!Array.isArray(item.args)||item.args.some((arg:any)=>typeof arg!=="string"||arg.includes("\0")))throw new Error(item.title+" 的参数必须是字符串数组。");
      for(const key of["cwd","icon","color"])if(item[key]!==undefined&&typeof item[key]!=="string")throw new Error(item.title+" 的 "+key+" 无效。");
      if(item.color&&!/^#[\da-f]{6}$/iu.test(item.color))throw new Error("配置颜色必须是 #RRGGBB。");
      return {id:item.id,title:item.title,executable:item.executable,args:[...item.args],env:environment_map(item.env??{}),cwd:item.cwd||"",icon:item.icon||"terminal",color:item.color||""};
    });
  }
  return result;
}

/** 配置唯一所有者；读取旧设置的有效字段，写入始终整体校验后原子替换。 */
export function create_terminal_settings(storage: Pick<Storage,"getItem"|"setItem">, process_api:any,path_api:any) {
  let current=structuredClone(terminal_defaults);
  try{const data=JSON.parse(storage.getItem(TERMINAL_SETTINGS_KEY)||"{}");
    for(const key of Object.keys(terminal_defaults))try{current=validate_terminal_settings({...current,[key]:data[key]??(current as any)[key]});}catch{/* 单个旧字段不抹去其他有效设置。 */}
  }catch{/* 缺失或损坏数据使用默认配置，不覆盖磁盘。 */}
  const listeners=new Set<(settings:terminal_settings)=>void>();
  const profiles=()=>{const values=new Map(terminal_profiles(process_api,path_api).map(item=>[item.id,item as terminal_profile_config]));for(const item of current.profiles)values.set(item.id,item);return [...values.values()];};
  return {get:()=>structuredClone(current),profiles,
    update(value:unknown){const next=validate_terminal_settings(value);const ids=new Set([...terminal_profiles(process_api,path_api),...next.profiles].map(item=>item.id));if(next.profile&&!ids.has(next.profile))throw new Error("默认 Shell 不存在。");storage.setItem(TERMINAL_SETTINGS_KEY,JSON.stringify(next));current=next;for(const listener of listeners)listener(structuredClone(current));},
    subscribe(listener:(settings:terminal_settings)=>void){listeners.add(listener);return()=>listeners.delete(listener);},dispose(){listeners.clear();},
  };
}
export type terminal_settings_store=ReturnType<typeof create_terminal_settings>;

/** 参数与环境按数组／对象交给 PTY，不拼接 Shell 命令。 */
export function resolve_terminal_launch(settings:terminal_settings,profile:terminal_profile_config,root:string,process_api:any,path_api:any,explicit_cwd=false){
  const lookup=(name:string)=>Object.entries(process_api.env).find(([key])=>process_api.platform==="win32"?key.toLowerCase()===name.toLowerCase():key===name)?.[1];
  const expand=(text:string)=>text.replace(/\$\{(workspaceFolder|env:[^}]+)\}/gu,(_,key:string)=>{const value=key==="workspaceFolder"?root:lookup(key.slice(4));if(typeof value!=="string")throw new Error("无法解析配置变量："+key);return value;});
  const cwd=explicit_cwd?root:expand(profile.cwd||settings.cwd||root);
  const env=terminal_environment(process_api.env);
  for(const [key,value]of Object.entries({...settings.env,...profile.env})){
    const existing=Object.keys(env).find(name=>process_api.platform==="win32"?name.toLowerCase()===key.toLowerCase():name===key);
    if(existing)delete env[existing];if(value!==null)Object.defineProperty(env,key,{value:expand(value),enumerable:true,writable:true,configurable:true});
  }
  return {executable:expand(profile.executable),args:profile.args.map(expand),cwd:path_api.isAbsolute(cwd)?cwd:path_api.resolve(root,cwd),env};
}
