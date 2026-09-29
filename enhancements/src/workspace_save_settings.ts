import {workspace_text} from "./workspace_i18n";
import {get_workspace_app} from "./workspace_bootstrap";
import {workspace_dialog,workspace_element as el} from "./workspace_widgets";

/** String key names are upstream configuration contracts; internal interfaces still use snake_case. */
export const FILE_SETTING_DEFAULTS=Object.freeze({
  "files.autoSave":"off", "files.autoSaveDelay":1000, "files.autoSaveWorkspaceFilesOnly":false, "files.autoSaveWhenNoErrors":false,
  "workbench.localHistory.enabled":true,
  "workbench.localHistory.maxFileEntries":50, "workbench.localHistory.mergeWindow":10,
  "workbench.localHistory.exclude":{} as Record<string,boolean>,
  "explorer.openEditors.visible":9, "explorer.openEditors.minVisible":0, "explorer.openEditors.sortOrder":"editorOrder",
  "explorer.openEditors.enabled":true, "timeline.enabled":true,
});
export type workspace_save_settings=typeof FILE_SETTING_DEFAULTS;
const KEY="workspace_files",listeners=new Set<()=>void>();
export function normalize_workspace_save_settings(value:unknown):workspace_save_settings{
  const input=value&&typeof value==="object"?value as Record<string,unknown>:{};
  const result={...FILE_SETTING_DEFAULTS};
  for(const key of Object.keys(result) as (keyof workspace_save_settings)[]){
    const entry=input[key],fallback=result[key];
    if(typeof fallback==="boolean"&&typeof entry==="boolean")(result as any)[key]=entry;
    if(typeof fallback==="number"&&typeof entry==="number"&&Number.isFinite(entry)&&entry>=0)(result as any)[key]=Math.floor(entry);
  }
  if(["off","afterDelay","onFocusChange","onWindowChange"].includes(String(input["files.autoSave"])))result["files.autoSave"]=String(input["files.autoSave"]);
  if(["editorOrder","alphabetical","fullPath"].includes(String(input["explorer.openEditors.sortOrder"])))result["explorer.openEditors.sortOrder"]=String(input["explorer.openEditors.sortOrder"]);
  result["explorer.openEditors.visible"]=Math.max(1,result["explorer.openEditors.visible"]);
  result["workbench.localHistory.maxFileEntries"]=Math.max(1,result["workbench.localHistory.maxFileEntries"]);
  const exclude=input["workbench.localHistory.exclude"];
  if(exclude&&typeof exclude==="object"&&!Array.isArray(exclude))result["workbench.localHistory.exclude"]=Object.fromEntries(Object.entries(exclude).filter(([key,value])=>typeof value==="boolean")) as Record<string,boolean>;
  return result;
}
export function read_workspace_save_settings(){return normalize_workspace_save_settings(get_workspace_app()?.settings.get(KEY));}
export function set_workspace_save_settings(patch:Partial<workspace_save_settings>){
  const settings=get_workspace_app()?.settings;if(!settings)throw new Error(workspace_text("language_service_settings_the_workbench_settings_are_not_ready"));
  settings.set_and_save(KEY,normalize_workspace_save_settings({...read_workspace_save_settings(),...patch}));
  for(const listener of listeners)listener();
}
export function observe_workspace_save_settings(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
let current_dialog:ReturnType<typeof workspace_dialog>|undefined;
export function open_workspace_save_settings(){
  current_dialog?.close();const dialog=current_dialog=workspace_dialog(workspace_text("save_settings_explorer_and_save_settings"),workspace_text("community_plugin_settings_close"),()=>{if(current_dialog===dialog)current_dialog=undefined;});
  dialog.root.dataset.workspaceSaveSettings="true";
  const settings=read_workspace_save_settings();
  const rows:[keyof workspace_save_settings,string,string[]?][]=[
    ["files.autoSave",workspace_text("save_settings_auto_save"),["off","afterDelay","onFocusChange","onWindowChange"]],
    ["files.autoSaveDelay",workspace_text("save_settings_delay_milliseconds")],["files.autoSaveWorkspaceFilesOnly",workspace_text("save_settings_auto_save_only_files_in_the_workspace")],
    ["files.autoSaveWhenNoErrors",workspace_text("save_settings_auto_save_only_when_there_are_no_diagnostic_errors")],
    ["workbench.localHistory.enabled",workspace_text("save_settings_enable_local_history")],
    ["workbench.localHistory.maxFileEntries",workspace_text("save_settings_number_of_history_entries_per_file")],["workbench.localHistory.mergeWindow",workspace_text("save_settings_merge_adjacent_saves_seconds")],
    ["explorer.openEditors.visible",workspace_text("save_settings_maximum_visible_lines_in_open_editors")],["explorer.openEditors.minVisible",workspace_text("save_settings_minimum_visible_lines_in_open_editors")],
    ["explorer.openEditors.sortOrder",workspace_text("save_settings_sort_of_open_editors"),["editorOrder","alphabetical","fullPath"]],
  ];
  const error=el("p");error.setAttribute("role","status");
  for(const[key,title,choices]of rows){
    const row=el("label","workspace-save-setting"),label=el("span","",title),control=choices?el("select"):el("input");
    control.setAttribute("aria-label",title);control.title=key;
    if(control instanceof HTMLSelectElement){for(const value of choices!)control.append(new Option(({off:workspace_text("community_plugin_settings_close"),afterDelay:workspace_text("save_settings_delay_save"),onFocusChange:workspace_text("save_settings_when_the_editor_loses_focus"),onWindowChange:workspace_text("save_settings_when_the_window_loses_focus"),editorOrder:workspace_text("save_settings_editor_order"),alphabetical:workspace_text("breadcrumbs_settings_name"),fullPath:workspace_text("breadcrumbs_settings_full_path")} as any)[value],value));control.value=String(settings[key]);}
    else if(typeof settings[key]==="boolean"){control.type="checkbox";control.checked=Boolean(settings[key]);}
    else{control.type="number";control.min=key.endsWith("maxFileEntries")||key.endsWith(".visible")?"1":"0";control.value=String(settings[key]);}
    control.onchange=()=>{try{if(control instanceof HTMLInputElement&&!control.checkValidity())throw new Error(workspace_text("save_settings_please_enter_a_valid_number"));set_workspace_save_settings({[key]:control instanceof HTMLInputElement?(control.type==="checkbox"?control.checked:Number(control.value)):control.value});error.textContent="";}catch(problem){error.textContent=String(problem);}};
    row.append(label,control);dialog.content.append(row);
  }
  const label=el("label","workspace-save-setting"),exclusions=el("textarea");exclusions.setAttribute("aria-label",workspace_text("save_settings_local_history_exclusion_rules"));exclusions.value=JSON.stringify(settings["workbench.localHistory.exclude"],null,2);
  exclusions.onchange=()=>{try{const value=JSON.parse(exclusions.value);if(!value||Array.isArray(value)||typeof value!=="object"||Object.values(value).some(item=>typeof item!=="boolean"))throw new Error(workspace_text("save_settings_exclusion_rules_should_be_an_object_from_glob_to_boolean_jso"));set_workspace_save_settings({"workbench.localHistory.exclude":value});error.textContent="";}catch(problem){error.textContent=String(problem);}};
  label.append(el("span","",workspace_text("save_settings_local_history_exclusion_rules_glob")),exclusions);dialog.content.append(label,error);
}
export function close_workspace_save_settings(){current_dialog?.close();}
