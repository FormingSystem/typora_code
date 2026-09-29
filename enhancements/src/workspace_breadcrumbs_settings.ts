import {workspace_text} from "./workspace_i18n";
import {get_workspace_app} from "./workspace_bootstrap";
import {workspace_dialog,workspace_element as el,workspace_button} from "./workspace_widgets";

export const BREADCRUMB_DEFAULTS=Object.freeze({enabled:true,file_path:"on",symbol_path:"on",icons:true,show_editor_type:true,symbol_sort_order:"position",symbol_path_separator:"."});
export type breadcrumb_settings={enabled:boolean;file_path:"on"|"off"|"last";symbol_path:"on"|"off"|"last";icons:boolean;show_editor_type:boolean;symbol_sort_order:"position"|"name"|"type";symbol_path_separator:string;symbol_kinds:Record<string,boolean>};
export const BREADCRUMB_KINDS=["file","module","namespace","package","class","method","property","field","constructor","enum","interface","function","variable","constant","string","number","boolean","array","object","key","null","enum-member","struct","event","operator","type-parameter"] as const;
type overrides=Partial<breadcrumb_settings>;
type layer={values?:overrides;languages?:Record<string,overrides>};
type stored={user?:layer;workspaces?:Record<string,layer>};
const KEY="breadcrumbs";
const changed=new Set<()=>void>();
let dialog:ReturnType<typeof workspace_dialog>|undefined;
const object=(v:unknown):any=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
function root_key(root:string){if(!root)return "";const runtime=window as any,p=runtime.reqnode("path").resolve(root);return runtime.reqnode("process").platform==="win32"?p.toLowerCase():p;}
function stored_settings():stored{return object(get_workspace_app()?.settings.get(KEY));}
function clean(value:unknown):overrides{
  const source=object(value),result:overrides={};
  for(const key of ["enabled","icons","show_editor_type"] as const)if(typeof source[key]==="boolean")result[key]=source[key];
  for(const key of ["file_path","symbol_path"] as const)if(["on","off","last"].includes(source[key]))result[key]=source[key];
  if(["position","name","type"].includes(source.symbol_sort_order))result.symbol_sort_order=source.symbol_sort_order;
  if(typeof source.symbol_path_separator==="string"&&source.symbol_path_separator.length<=16&&!/[\r\n\0]/.test(source.symbol_path_separator))result.symbol_path_separator=source.symbol_path_separator;
  const kinds=object(source.symbol_kinds);if(Object.keys(kinds).length)result.symbol_kinds=Object.fromEntries(BREADCRUMB_KINDS.filter(k=>typeof kinds[k]==="boolean").map(k=>[k,kinds[k]]));
  return result;
}
/** Default, user, workspace, and language coverage are only parsed here; the interface does not retain a second valid value. */
export function read_breadcrumb_settings(root="",language=""):breadcrumb_settings{
  const value=stored_settings(),user=object(value.user),workspace=object(object(value.workspaces)[root_key(root)]);
  const result={...BREADCRUMB_DEFAULTS,symbol_kinds:{}} as breadcrumb_settings;
  const merge=(v:unknown,language_only=false)=>{const next=clean(v);if(language_only){for(const key of Object.keys(next))if(!["symbol_sort_order","symbol_path_separator","symbol_kinds"].includes(key))delete (next as any)[key];}Object.assign(result,{...next,symbol_kinds:{...result.symbol_kinds,...next.symbol_kinds}});};
  merge(user.values);merge(workspace.values);if(language){merge(object(user.languages)[language],true);merge(object(workspace.languages)[language],true);}return result;
}
export function update_breadcrumb_settings(root:string,scope:"user"|"workspace",key:keyof breadcrumb_settings,value:unknown,language=""){
  const settings=get_workspace_app()?.settings;if(!settings)throw new Error(workspace_text("language_service_settings_the_workbench_settings_are_not_ready"));
  if(scope==="workspace"&&!root)throw new Error(workspace_text("breadcrumbs_settings_please_open_a_folder_before_configuring_the_workspace"));
  if(language&&!["symbol_sort_order","symbol_path_separator","symbol_kinds"].includes(key))throw new Error(workspace_text("breadcrumbs_settings_this_option_does_not_support_language_overrides"));
  const next:stored=JSON.parse(JSON.stringify(stored_settings()));
  const owner=scope==="user"?(next.user??={}):((next.workspaces??={})[root_key(root)]??={});
  const target=language?((owner.languages??={})[language]??={}):(owner.values??={});
  if(value===undefined)delete target[key];else {const valid=clean({[key]:value});if(!(key in valid))throw new Error(workspace_text("breadcrumbs_settings_invalid_configuration_value"));Object.assign(target,valid);}
  settings.set_and_save(KEY,next);for(const listener of changed)listener();
}
/** Switching commands update the actual effective scope; avoid the workspace coverage making the menu switch seem ineffective. */
export function set_breadcrumb_enabled(root:string,enabled:boolean){
  const workspace=clean(object(object(stored_settings().workspaces)[root_key(root)]).values);
  update_breadcrumb_settings(root,typeof workspace.enabled==="boolean"?"workspace":"user","enabled",enabled);
}
export function observe_breadcrumb_settings(listener:()=>void){changed.add(listener);return()=>{changed.delete(listener);};}
export function open_breadcrumb_settings(root:string,language=""){
  dialog?.close(false);const view=dialog=workspace_dialog(workspace_text("breadcrumbs_settings_breadcrumbs_navigation_settings"),workspace_text("breadcrumbs_settings_close_settings"),()=>{if(dialog===view)dialog=undefined;});view.root.classList.add("workspace-breadcrumb-settings");
  const selectors=el("div","workspace-breadcrumb-setting-scopes"),scope=el("select"),language_scope=el("select");
  scope.setAttribute("aria-label",workspace_text("breadcrumbs_settings_setting_scope"));for(const [value,label] of [["user",workspace_text("breadcrumbs_settings_user")],["workspace",workspace_text("breadcrumbs_settings_workspace")]]){const option=el("option","",label);option.value=value;option.disabled=value==="workspace"&&!root;scope.append(option);}
  language_scope.setAttribute("aria-label",workspace_text("breadcrumbs_settings_language_overrides"));const all=el("option","",workspace_text("breadcrumbs_settings_all_languages"));all.value="";language_scope.append(all);if(language){const option=el("option","",language);option.value=language;language_scope.append(option);}
  selectors.append(scope,language_scope);const rows=el("div"),status=el("p");status.setAttribute("role","status");view.content.append(selectors,rows,status);
  const render=()=>{
    rows.replaceChildren();const current=read_breadcrumb_settings(scope.value==="user"?"":root,language_scope.value);
    const data=stored_settings(),owner=scope.value==="user"?object(data.user):object(object(data.workspaces)[root_key(root)]),values=clean(language_scope.value?object(owner.languages)[language_scope.value]:owner.values);
    const change=(key:keyof breadcrumb_settings,value:unknown)=>{try{update_breadcrumb_settings(root,scope.value as "user"|"workspace",key,value,language_scope.value);status.textContent=workspace_text("breadcrumbs_settings_settings_saved_and_applied");}catch(error){status.textContent=String(error instanceof Error?error.message:error);}render();};
    const definitions:[keyof breadcrumb_settings,string,string[]?][]=[["enabled",workspace_text("breadcrumbs_show_breadcrumbs")],["file_path",workspace_text("breadcrumbs_settings_file_path"),["on","off","last"]],["symbol_path",workspace_text("breadcrumbs_settings_symbol_path"),["on","off","last"]],["icons",workspace_text("breadcrumbs_settings_show_icon")],["show_editor_type",workspace_text("breadcrumbs_settings_show_editor_type")],["symbol_sort_order",workspace_text("breadcrumbs_settings_symbol_sort"),["position","name","type"]],["symbol_path_separator",workspace_text("breadcrumbs_settings_copy_symbol_path_separator")]];
    const labels:Record<string,string>={on:workspace_text("breadcrumbs_settings_full_path"),off:workspace_text("community_plugin_settings_close"),last:workspace_text("breadcrumbs_settings_only_top_level"),position:workspace_text("breadcrumbs_settings_document_location"),name:workspace_text("breadcrumbs_settings_name"),type:workspace_text("breadcrumbs_settings_type")};
    for(const [key,label,options] of definitions){
      if(language_scope.value&&!["symbol_sort_order","symbol_path_separator"].includes(key))continue;
      const row=el("label","workspace-breadcrumb-setting"),name=el("span","",label);let control:HTMLInputElement|HTMLSelectElement;
      if(options){const select=el("select");for(const value of options){const option=el("option","",labels[value]);option.value=value;select.append(option);}select.value=String(current[key]);control=select;}
      else {const input=el("input");input.type=typeof current[key]==="boolean"?"checkbox":"text";input.checked=current[key]===true;input.value=String(current[key]);control=input;}
      control.setAttribute("aria-label",label);control.onchange=()=>change(key,control instanceof HTMLInputElement&&control.type==="checkbox"?control.checked:control.value);
      row.append(name,control,workspace_button(workspace_text("breadcrumbs_settings_reset"),()=>change(key,undefined)));rows.append(row);
    }
    const kinds=el("details"),summary=el("summary","",workspace_text("breadcrumbs_settings_displayed_symbol_type"));kinds.append(summary);
    for(const kind of BREADCRUMB_KINDS){const label=el("label","workspace-breadcrumb-kind"),input=el("input");input.type="checkbox";input.checked=current.symbol_kinds[kind]!==false;input.onchange=()=>change("symbol_kinds",{...values.symbol_kinds,[kind]:input.checked});label.append(input,el("span","",kind));kinds.append(label);}kinds.append(workspace_button(workspace_text("breadcrumbs_settings_reset_symbol_type"),()=>change("symbol_kinds",undefined)));rows.append(kinds);
  };scope.onchange=render;language_scope.onchange=render;render();
}
