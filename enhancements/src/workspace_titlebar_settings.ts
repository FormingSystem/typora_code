import {workspace_text} from "./workspace_i18n";
export const TITLEBAR_SETTINGS_KEY="titlebar";
export const TITLEBAR_DEFAULTS=Object.freeze({menu_bar:true,command_center:true,navigation_controls:true});
export type titlebar_settings={menu_bar:boolean;command_center:boolean;navigation_controls:boolean};
export type titlebar_settings_store={
  get(key:string):unknown;
  set_and_save(key:string,value:unknown):void;
  addChangeListener?(key:string,listener:()=>void):()=>void;
};

const settings_object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};

/** Top bar only reads user-level display settings; invalid values do not hide the user recovery entry. */
export function read_titlebar_settings(store?:titlebar_settings_store):titlebar_settings{
  const saved=settings_object(store?.get(TITLEBAR_SETTINGS_KEY)),result:titlebar_settings={...TITLEBAR_DEFAULTS};
  for(const key of Object.keys(result) as (keyof titlebar_settings)[])if(typeof saved[key]==="boolean")result[key]=saved[key] as boolean;
  return result;
}

/** After successful saving, the change is published by the existing settings service, retain other components' configuration fields. */
export function toggle_titlebar_setting(store:titlebar_settings_store|undefined,key:keyof titlebar_settings):void{
  if(!store)throw new Error(workspace_text("language_service_settings_the_workbench_settings_are_not_ready"));
  const saved=settings_object(store.get(TITLEBAR_SETTINGS_KEY));
  store.set_and_save(TITLEBAR_SETTINGS_KEY,{...saved,[key]:!read_titlebar_settings(store)[key]});
}
