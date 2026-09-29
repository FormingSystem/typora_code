import {workspace_text} from "./workspace_i18n";
/** Configuration definitions are uniformly registered; data and save transactions continue to be owned by each domain uniquely. */
export type workspace_setting_field={key:string;title:string;choices?:string[];choice_labels?:Record<string,string>;description?:string;file_extensions?:string[];action?:()=>void};
export type workspace_settings_section={
  id:string;title:string;scope:()=>string;defaults:Record<string,unknown>;fields:workspace_setting_field[];
  read:()=>Record<string,unknown>;write:(key:string,value:unknown)=>void;
  mount?:(host:HTMLElement,fields:workspace_setting_field[],status:(text:string)=>void)=>{update(fields:workspace_setting_field[]):void;dispose():void};
};
const sections=new Map<string,workspace_settings_section>(),listeners=new Set<()=>void>();
export function notify_workspace_settings(){for(const listener of listeners)listener();}
export function register_workspace_settings(section:workspace_settings_section){
  if(sections.has(section.id))throw Error(workspace_text("settings_registry_setting_category_has_been_registered")+section.id);
  sections.set(section.id,section);notify_workspace_settings();
  return()=>{if(sections.get(section.id)===section){sections.delete(section.id);notify_workspace_settings();}};
}
export function workspace_settings_sections(){return [...sections.values()];}
export function observe_workspace_settings(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
