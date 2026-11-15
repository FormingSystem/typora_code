import {get_workspace_app} from "./workspace_bootstrap";
import {workspace_text} from "./workspace_i18n";

export const IMAGE_ALIGNMENT_VALUES=["left","center","right"] as const;
export type image_alignment=typeof IMAGE_ALIGNMENT_VALUES[number];
export const IMAGE_SHADOW_VALUES=['off','soft','medium','strong'] as const;
export const READING_IMAGE_DEFAULTS=Object.freeze({alignment:"center" as image_alignment,scale:100,size_mode:"natural",border:true,border_width:2,border_color_light:'',border_color_dark:'',shadow:'off' as typeof IMAGE_SHADOW_VALUES[number]});
const KEY="reading_images",listeners=new Set<()=>void>();
let preview:{token:symbol;scale:number}|undefined;
const notify=()=>{for(const listener of listeners)listener();};
function valid_image_setting(key:string,value:unknown){
  if(!Object.hasOwn(READING_IMAGE_DEFAULTS,key))return false;
  if(value===undefined)return true;
  if(key==='border')return typeof value==='boolean';
  if(key==='alignment')return IMAGE_ALIGNMENT_VALUES.includes(value as image_alignment);
  if(key==='shadow')return IMAGE_SHADOW_VALUES.includes(value as typeof IMAGE_SHADOW_VALUES[number]);
  if(key.startsWith('border_color_'))return typeof value==='string'&&/^(?:#[0-9a-f]{6}(?:[0-9a-f]{2})?)?$/i.test(value.trim());
  if(key==='scale'||key==='border_width')return typeof value==='number'&&Number.isFinite(value)&&value>=(key==='scale'?20:.5)&&value<=(key==='scale'?600:8);
  return value==='natural'||value==='fit_width';
}
export function read_reading_image_settings(){
  const value=get_workspace_app()?.settings.get(KEY) as Record<string,unknown>|undefined;
  const current={...READING_IMAGE_DEFAULTS};
  for(const key of Object.keys(current))if(value?.[key]!==undefined&&valid_image_setting(key,value[key]))(current as any)[key]=typeof value[key]==='string'?(value[key] as string).trim():value[key];
  return {...current,scale:preview?.scale??current.scale,size_mode:preview?'natural':current.size_mode};
}
export function write_reading_image_setting(key:string,value:unknown){
  if(!valid_image_setting(key,value))throw Error(workspace_text("image_layout_invalid"));
  const settings=get_workspace_app()?.settings;if(!settings)throw Error(workspace_text("language_service_settings_the_workbench_settings_are_not_ready"));
  const next={...(settings.get(KEY) as Record<string,unknown>||{})};
  if(value===undefined)delete next[key];else next[key]=typeof value==='string'?value.trim():value;
  if(key==="scale")next.size_mode="natural";
  settings.set_and_save(KEY,next);preview=undefined;notify();
}
/** A numeric input draft previews in memory and writes once when committed. */
export function begin_reading_image_scale(){
  const token=Symbol();
  return {update(scale:number){if(!Number.isFinite(scale)||scale<20||scale>600)return;preview={token,scale};notify();},commit(scale:number){try{write_reading_image_setting("scale",scale);}finally{if(preview?.token===token){preview=undefined;notify();}}},cancel(){if(preview?.token===token){preview=undefined;notify();}}};
}
export function observe_reading_image_settings(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function reading_image_alignment_labels(){return {left:workspace_text("image_layout_left"),center:workspace_text("image_layout_center"),right:workspace_text("image_layout_right")};}
