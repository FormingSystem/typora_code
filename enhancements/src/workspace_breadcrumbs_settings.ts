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
/** 默认、用户、工作区及语言覆盖只在此处解析，界面不保留第二份有效值。 */
export function read_breadcrumb_settings(root="",language=""):breadcrumb_settings{
  const value=stored_settings(),user=object(value.user),workspace=object(object(value.workspaces)[root_key(root)]);
  const result={...BREADCRUMB_DEFAULTS,symbol_kinds:{}} as breadcrumb_settings;
  const merge=(v:unknown,language_only=false)=>{const next=clean(v);if(language_only){for(const key of Object.keys(next))if(!["symbol_sort_order","symbol_path_separator","symbol_kinds"].includes(key))delete (next as any)[key];}Object.assign(result,{...next,symbol_kinds:{...result.symbol_kinds,...next.symbol_kinds}});};
  merge(user.values);merge(workspace.values);if(language){merge(object(user.languages)[language],true);merge(object(workspace.languages)[language],true);}return result;
}
export function update_breadcrumb_settings(root:string,scope:"user"|"workspace",key:keyof breadcrumb_settings,value:unknown,language=""){
  const settings=get_workspace_app()?.settings;if(!settings)throw new Error("工作台设置尚未就绪。");
  if(scope==="workspace"&&!root)throw new Error("请先打开文件夹再配置工作区。");
  if(language&&!["symbol_sort_order","symbol_path_separator","symbol_kinds"].includes(key))throw new Error("此选项不支持语言覆盖。");
  const next:stored=JSON.parse(JSON.stringify(stored_settings()));
  const owner=scope==="user"?(next.user??={}):((next.workspaces??={})[root_key(root)]??={});
  const target=language?((owner.languages??={})[language]??={}):(owner.values??={});
  if(value===undefined)delete target[key];else {const valid=clean({[key]:value});if(!(key in valid))throw new Error("配置值无效。");Object.assign(target,valid);}
  settings.set_and_save(KEY,next);for(const listener of changed)listener();
}
/** 切换命令更新实际生效的作用域，避免工作区覆盖使菜单开关看似无效。 */
export function set_breadcrumb_enabled(root:string,enabled:boolean){
  const workspace=clean(object(object(stored_settings().workspaces)[root_key(root)]).values);
  update_breadcrumb_settings(root,typeof workspace.enabled==="boolean"?"workspace":"user","enabled",enabled);
}
export function observe_breadcrumb_settings(listener:()=>void){changed.add(listener);return()=>{changed.delete(listener);};}
export function open_breadcrumb_settings(root:string,language=""){
  dialog?.close(false);const view=dialog=workspace_dialog("面包屑导航设置","关闭设置",()=>{if(dialog===view)dialog=undefined;});view.root.classList.add("workspace-breadcrumb-settings");
  const selectors=el("div","workspace-breadcrumb-setting-scopes"),scope=el("select"),language_scope=el("select");
  scope.setAttribute("aria-label","设置作用域");for(const [value,label] of [["user","用户"],["workspace","工作区"]]){const option=el("option","",label);option.value=value;option.disabled=value==="workspace"&&!root;scope.append(option);}
  language_scope.setAttribute("aria-label","语言覆盖");const all=el("option","","所有语言");all.value="";language_scope.append(all);if(language){const option=el("option","",language);option.value=language;language_scope.append(option);}
  selectors.append(scope,language_scope);const rows=el("div"),status=el("p");status.setAttribute("role","status");view.content.append(selectors,rows,status);
  const render=()=>{
    rows.replaceChildren();const current=read_breadcrumb_settings(scope.value==="user"?"":root,language_scope.value);
    const data=stored_settings(),owner=scope.value==="user"?object(data.user):object(object(data.workspaces)[root_key(root)]),values=clean(language_scope.value?object(owner.languages)[language_scope.value]:owner.values);
    const change=(key:keyof breadcrumb_settings,value:unknown)=>{try{update_breadcrumb_settings(root,scope.value as "user"|"workspace",key,value,language_scope.value);status.textContent="设置已保存并生效。";}catch(error){status.textContent=String(error instanceof Error?error.message:error);}render();};
    const definitions:[keyof breadcrumb_settings,string,string[]?][]=[["enabled","显示面包屑"],["file_path","文件路径",["on","off","last"]],["symbol_path","符号路径",["on","off","last"]],["icons","显示图标"],["show_editor_type","显示编辑器类型"],["symbol_sort_order","符号排序",["position","name","type"]],["symbol_path_separator","复制符号路径分隔符"]];
    const labels:Record<string,string>={on:"完整路径",off:"关闭",last:"仅末级",position:"文档位置",name:"名称",type:"类型"};
    for(const [key,label,options] of definitions){
      if(language_scope.value&&!["symbol_sort_order","symbol_path_separator"].includes(key))continue;
      const row=el("label","workspace-breadcrumb-setting"),name=el("span","",label);let control:HTMLInputElement|HTMLSelectElement;
      if(options){const select=el("select");for(const value of options){const option=el("option","",labels[value]);option.value=value;select.append(option);}select.value=String(current[key]);control=select;}
      else {const input=el("input");input.type=typeof current[key]==="boolean"?"checkbox":"text";input.checked=current[key]===true;input.value=String(current[key]);control=input;}
      control.setAttribute("aria-label",label);control.onchange=()=>change(key,control instanceof HTMLInputElement&&control.type==="checkbox"?control.checked:control.value);
      row.append(name,control,workspace_button("重置",()=>change(key,undefined)));rows.append(row);
    }
    const kinds=el("details"),summary=el("summary","","显示的符号类型");kinds.append(summary);
    for(const kind of BREADCRUMB_KINDS){const label=el("label","workspace-breadcrumb-kind"),input=el("input");input.type="checkbox";input.checked=current.symbol_kinds[kind]!==false;input.onchange=()=>change("symbol_kinds",{...values.symbol_kinds,[kind]:input.checked});label.append(input,el("span","",kind));kinds.append(label);}kinds.append(workspace_button("重置符号类型",()=>change("symbol_kinds",undefined)));rows.append(kinds);
  };scope.onchange=render;language_scope.onchange=render;render();
}
