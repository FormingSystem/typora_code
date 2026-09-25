import css from "./source_outline_settings.css";
import {get_workspace_app} from "./workspace_bootstrap";
import {acquire_workspace_style} from "./workspace_styles";
import {workspace_button, workspace_dialog, workspace_element} from "./workspace_widgets";
import {discover_clangd_environment} from "./clangd_symbol_service";

export type source_outline_settings = {clangd_path:string;compile_commands_dir:string;fallback_flags:string[]};
type project_settings = Pick<source_outline_settings,"compile_commands_dir"|"fallback_flags">;
type stored_settings = {clangd_path?:string;workspaces?:Record<string,project_settings>};
const SETTINGS_KEY="source_outline";
let current_dialog:ReturnType<typeof workspace_dialog>|undefined;

function workspace_key(root:string):string {
  if(!root)return "";
  const runtime=window as unknown as {reqnode(name:string):any};
  const resolved=runtime.reqnode("path").resolve(root);
  return runtime.reqnode("process").platform==="win32" ? resolved.toLowerCase() : resolved;
}
function relative_database(root:string,directory:string):string {
  if(!root||!directory)return directory;
  const path_api=(window as unknown as {reqnode(name:string):any}).reqnode("path");
  return path_api.isAbsolute(directory)?path_api.relative(root,directory)||".":directory;
}
function read_stored_settings():stored_settings {
  const value=get_workspace_app()?.settings.get(SETTINGS_KEY);
  return value&&typeof value==="object"&&!Array.isArray(value)?value as stored_settings:{};
}
function validate_settings(value:source_outline_settings):source_outline_settings {
  for(const field of ["clangd_path","compile_commands_dir"] as const) {
    if(typeof value[field]!=="string"||/[\r\n\0]/u.test(value[field]))throw new Error("路径必须是单行文本。");
  }
  if(!Array.isArray(value.fallback_flags)||value.fallback_flags.some(flag=>typeof flag!=="string"||/[\r\n\0]/u.test(flag)))throw new Error("编译参数必须每行一项。");
  return {clangd_path:value.clangd_path.trim(),compile_commands_dir:value.compile_commands_dir.trim(),fallback_flags:value.fallback_flags.map(flag=>flag.trim()).filter(Boolean)};
}
/** clangd 路径全局共用，构建目录和参数只覆盖指定工作区，不在工程中写文件。 */
export function read_source_outline_settings(root:string):source_outline_settings {
  const stored=read_stored_settings(),key=workspace_key(root);
  const projects=stored.workspaces&&typeof stored.workspaces==="object"&&!Array.isArray(stored.workspaces)?stored.workspaces:{};
  const project=Object.hasOwn(projects,key)?projects[key]:undefined;
  return {clangd_path:typeof stored.clangd_path==="string"?stored.clangd_path:"",compile_commands_dir:typeof project?.compile_commands_dir==="string"?relative_database(root,project.compile_commands_dir):"",fallback_flags:Array.isArray(project?.fallback_flags)?project.fallback_flags.filter((flag):flag is string=>typeof flag==="string"):[]};
}
export function save_source_outline_settings(root:string,value:source_outline_settings):void {
  const settings=get_workspace_app()?.settings;
  if(!settings)throw new Error("工作区设置尚未就绪。");
  const next=validate_settings(value),stored=read_stored_settings(),key=workspace_key(root);
  next.compile_commands_dir=relative_database(root,next.compile_commands_dir);
  const projects=stored.workspaces&&typeof stored.workspaces==="object"&&!Array.isArray(stored.workspaces)?stored.workspaces:{};
  // 保存前重读并合并，只替换当前工作区；set_and_save 在持久化成功后才发布更新。
  settings.set_and_save(SETTINGS_KEY,{...stored,clangd_path:next.clangd_path,workspaces:{...projects,[key]:{compile_commands_dir:next.compile_commands_dir,fallback_flags:next.fallback_flags}}});
}

/** 复用现有模态框与键盘行为；路径检测不会启动 shell 或修改工作区。 */
export function open_source_outline_settings(root:string,on_saved?:()=>void) {
  current_dialog?.close();
  const dialog=workspace_dialog("C/C++ 语言服务配置","取消");current_dialog=dialog;
  dialog.root.classList.add("source-outline-settings");
  const style=acquire_workspace_style("typora-code-source-outline-settings",css,{},dialog.root);
  const initial=read_source_outline_settings(root);
  const context=workspace_element("p","source-outline-settings-context",root?`当前文件夹：${(window as unknown as {reqnode(name:string):any}).reqnode("path").basename(root)}`:"当前没有打开文件夹，配置用于独立文件。");
  dialog.content.append(context);
  const add_field=(name:keyof source_outline_settings,title:string,hint:string,multiline=false)=>{
    const label=workspace_element("label","source-outline-settings-field");
    const input=workspace_element(multiline?"textarea":"input");
    input.dataset.field=name;input.setAttribute("aria-label",title);input.spellcheck=false;
    if(input instanceof HTMLInputElement){input.type="text";input.autocomplete="off";}
    else input.rows=4;
    label.append(workspace_element("span","",title),input,workspace_element("small","",hint));dialog.content.append(label);
    return input;
  };
  const executable=add_field("clangd_path","clangd 可执行文件（所有工作区）","留空自动查找本机 clangd；可填写完整可执行文件路径。");executable.value=initial.clangd_path;
  const database=add_field("compile_commands_dir","编译数据库文件夹（当前文件夹）","填写包含 compile_commands.json 的目录，如 build/bringup；留空自动查找。");database.value=initial.compile_commands_dir;
  const flags=add_field("fallback_flags","后备编译参数（当前文件夹）","仅在没有编译命令时使用。每行一个参数，含空格也不加额外引号。",true);flags.value=initial.fallback_flags.join("\n");
  const status=workspace_element("p","source-outline-settings-status");status.setAttribute("role","status");status.setAttribute("aria-live","polite");dialog.content.append(status);
  const read_form=()=>validate_settings({clangd_path:executable.value,compile_commands_dir:database.value,fallback_flags:flags.value.split(/\r?\n/u)});
  let generation=0;
  const report=(message:string,error=false)=>{status.textContent=message;status.classList.toggle("is-error",error);};
  const detect=workspace_button("检测路径",()=>{
    let value:source_outline_settings;try{value=read_form();}catch(error){report(String((error as Error).message||error),true);return;}
    const request=++generation;detect.disabled=true;report("正在查找 clangd 和编译数据库…");
    void discover_clangd_environment({executable:value.clangd_path,workspace_root:root,compile_commands_dir:value.compile_commands_dir}).then(environment=>{
      if(!dialog.root.isConnected||request!==generation)return;
      const database_text=environment.compile_commands_dir?`编译数据库：${relative_database(root,environment.compile_commands_dir)}`:"未找到编译数据库，将使用后备参数。";
      report(`clangd：${environment.executable}\n${database_text}`);
    }).catch(error=>{if(dialog.root.isConnected&&request===generation)report(String(error?.message||error),true);}).finally(()=>{if(dialog.root.isConnected&&request===generation)detect.disabled=false;});
  });detect.dataset.action="detect";
  const save=workspace_button("保存",()=>{
    try {
      const value=read_form();
      // 未修改的全局路径不覆盖其他设置入口在弹窗期间保存的新值。
      if(value.clangd_path===initial.clangd_path)value.clangd_path=read_source_outline_settings(root).clangd_path;
      save_source_outline_settings(root,value);
    } catch(error){report(`保存失败：${String((error as Error).message||error)}`,true);return;}
    generation++;dialog.close();style.remove();if(current_dialog===dialog)current_dialog=undefined;
    on_saved?.();
  },"source-outline-settings-save");save.dataset.action="save";
  dialog.footer.prepend(detect,save);
  for(const input of [executable,database,flags])input.addEventListener("input",()=>{generation++;detect.disabled=false;report("");});
  return dialog;
}
