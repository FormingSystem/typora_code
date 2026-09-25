import {get_workspace_app} from "./workspace_bootstrap";
import {workspace_dialog,workspace_element as el} from "./workspace_widgets";

/** 字符串键名为上游配置契约；内部接口仍使用snake_case。 */
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
  const settings=get_workspace_app()?.settings;if(!settings)throw new Error("工作台设置尚未就绪。");
  settings.set_and_save(KEY,normalize_workspace_save_settings({...read_workspace_save_settings(),...patch}));
  for(const listener of listeners)listener();
}
export function observe_workspace_save_settings(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
let current_dialog:ReturnType<typeof workspace_dialog>|undefined;
export function open_workspace_save_settings(){
  current_dialog?.close();const dialog=current_dialog=workspace_dialog("资源管理器与保存设置","关闭",()=>{if(current_dialog===dialog)current_dialog=undefined;});
  dialog.root.dataset.workspaceSaveSettings="true";
  const settings=read_workspace_save_settings();
  const rows:[keyof workspace_save_settings,string,string[]?][]=[
    ["files.autoSave","自动保存",["off","afterDelay","onFocusChange","onWindowChange"]],
    ["files.autoSaveDelay","延迟（毫秒）"],["files.autoSaveWorkspaceFilesOnly","仅自动保存工作区内文件"],
    ["files.autoSaveWhenNoErrors","仅在没有诊断错误时自动保存"],
    ["workbench.localHistory.enabled","启用本地历史"],
    ["workbench.localHistory.maxFileEntries","每个文件的历史条数"],["workbench.localHistory.mergeWindow","合并相邻保存（秒）"],
    ["explorer.openEditors.visible","打开的编辑器最大可见行数"],["explorer.openEditors.minVisible","打开的编辑器最少可见行数"],
    ["explorer.openEditors.sortOrder","打开的编辑器排序",["editorOrder","alphabetical","fullPath"]],
  ];
  const error=el("p");error.setAttribute("role","status");
  for(const[key,title,choices]of rows){
    const row=el("label","workspace-save-setting"),label=el("span","",title),control=choices?el("select"):el("input");
    control.setAttribute("aria-label",title);control.title=key;
    if(control instanceof HTMLSelectElement){for(const value of choices!)control.append(new Option(({off:"关闭",afterDelay:"延迟保存",onFocusChange:"编辑器失焦时",onWindowChange:"窗口失焦时",editorOrder:"编辑器顺序",alphabetical:"名称",fullPath:"完整路径"} as any)[value],value));control.value=String(settings[key]);}
    else if(typeof settings[key]==="boolean"){control.type="checkbox";control.checked=Boolean(settings[key]);}
    else{control.type="number";control.min=key.endsWith("maxFileEntries")||key.endsWith(".visible")?"1":"0";control.value=String(settings[key]);}
    control.onchange=()=>{try{if(control instanceof HTMLInputElement&&!control.checkValidity())throw new Error("请输入有效数值。");set_workspace_save_settings({[key]:control instanceof HTMLInputElement?(control.type==="checkbox"?control.checked:Number(control.value)):control.value});error.textContent="";}catch(problem){error.textContent=String(problem);}};
    row.append(label,control);dialog.content.append(row);
  }
  const label=el("label","workspace-save-setting"),exclusions=el("textarea");exclusions.setAttribute("aria-label","本地历史排除规则");exclusions.value=JSON.stringify(settings["workbench.localHistory.exclude"],null,2);
  exclusions.onchange=()=>{try{const value=JSON.parse(exclusions.value);if(!value||Array.isArray(value)||typeof value!=="object"||Object.values(value).some(item=>typeof item!=="boolean"))throw new Error("排除规则应为glob到布尔值的JSON对象。");set_workspace_save_settings({"workbench.localHistory.exclude":value});error.textContent="";}catch(problem){error.textContent=String(problem);}};
  label.append(el("span","","本地历史排除规则（glob）"),exclusions);dialog.content.append(label,error);
}
export function close_workspace_save_settings(){current_dialog?.close();}
