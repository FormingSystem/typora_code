import {get_workspace_app} from "./workspace_bootstrap";
import {workspace_text} from "./workspace_i18n";

export const IMAGE_ALIGNMENT_VALUES=["left","center","right"] as const;
export type image_alignment=typeof IMAGE_ALIGNMENT_VALUES[number];
export const READING_IMAGE_DEFAULTS=Object.freeze({alignment:"center" as image_alignment,scale:100,size_mode:"natural"});
const KEY="reading_images",listeners=new Set<()=>void>();
let preview:{token:symbol;scale:number}|undefined;
const notify=()=>{for(const listener of listeners)listener();};
export function read_reading_image_settings(){
  const value=get_workspace_app()?.settings.get(KEY) as Record<string,unknown>|undefined;
  const scale=typeof value?.scale==="number"&&Number.isFinite(value.scale)&&value.scale>=20&&value.scale<=600?value.scale:100;
  return {alignment:IMAGE_ALIGNMENT_VALUES.includes(value?.alignment as image_alignment)?value!.alignment as image_alignment:READING_IMAGE_DEFAULTS.alignment,scale:preview?.scale??scale,size_mode:preview?"natural":value?.size_mode==="fit_width"?"fit_width":"natural"};
}
export function write_reading_image_setting(key:string,value:unknown){
  if(!Object.hasOwn(READING_IMAGE_DEFAULTS,key)||(value!==undefined&&(key==="alignment"?!IMAGE_ALIGNMENT_VALUES.includes(value as image_alignment):key==="scale"?typeof value!=="number"||!Number.isFinite(value)||value<20||value>600:!["natural","fit_width"].includes(String(value)))))throw Error(workspace_text("image_layout_invalid"));
  const settings=get_workspace_app()?.settings;if(!settings)throw Error(workspace_text("language_service_settings_the_workbench_settings_are_not_ready"));
  const next={...(settings.get(KEY) as Record<string,unknown>||{})};
  if(value===undefined)delete next[key];else next[key]=value;
  if(key==="scale")next.size_mode="natural";
  settings.set_and_save(KEY,next);preview=undefined;notify();
}
/** A slider gesture previews in memory and writes once when committed. */
export function begin_reading_image_scale(){
  const token=Symbol();
  return {update(scale:number){if(!Number.isFinite(scale)||scale<20||scale>600)return;preview={token,scale};notify();},commit(scale:number){try{write_reading_image_setting("scale",scale);}finally{if(preview?.token===token){preview=undefined;notify();}}},cancel(){if(preview?.token===token){preview=undefined;notify();}}};
}
export function observe_reading_image_settings(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function reading_image_alignment_labels(){return {left:workspace_text("image_layout_left"),center:workspace_text("image_layout_center"),right:workspace_text("image_layout_right")};}
