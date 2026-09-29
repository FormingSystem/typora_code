import {workspace_text} from "./workspace_i18n";
import {notify_language_services} from "./language_service_settings";
import css from "./source_outline_settings.css";
import {get_workspace_app} from "./workspace_bootstrap";
import {acquire_workspace_style} from "./workspace_styles";
import {workspace_button, workspace_dialog, workspace_element} from "./workspace_widgets";
import {discover_clangd_environment} from "./language_analysis_service";

export type source_outline_settings = {clangd_path:string;compile_commands_dir:string;fallback_flags:string[];background_index?:boolean};
type project_settings = Pick<source_outline_settings,"compile_commands_dir"|"fallback_flags"|"background_index">;
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
    if(typeof value[field]!=="string"||/[\r\n\0]/u.test(value[field]))throw new Error(workspace_text("source_outline_settings_the_path_must_be_single_line_text"));
  }
  if(!Array.isArray(value.fallback_flags)||value.fallback_flags.some(flag=>typeof flag!=="string"||/[\r\n\0]/u.test(flag)))throw new Error(workspace_text("source_outline_settings_compilation_parameters_must_be_one_per_line"));
  if(value.background_index!==undefined&&typeof value.background_index!=="boolean")throw new Error(workspace_text("source_outline_settings_the_project_index_must_be_a_boolean_value"));
  return {background_index:value.background_index!==false,clangd_path:value.clangd_path.trim(),compile_commands_dir:value.compile_commands_dir.trim(),fallback_flags:value.fallback_flags.map(flag=>flag.trim()).filter(Boolean)};
}
/** clangd path is globally shared, build directory and parameters only override the specified workspace, and no files are written in the project. */
export function read_source_outline_settings(root:string):source_outline_settings {
  const stored=read_stored_settings(),key=workspace_key(root);
  const projects=stored.workspaces&&typeof stored.workspaces==="object"&&!Array.isArray(stored.workspaces)?stored.workspaces:{};
  const project=Object.hasOwn(projects,key)?projects[key]:undefined;
  return {background_index:project?.background_index!==false,clangd_path:typeof stored.clangd_path==="string"?stored.clangd_path:"",compile_commands_dir:typeof project?.compile_commands_dir==="string"?relative_database(root,project.compile_commands_dir):"",fallback_flags:Array.isArray(project?.fallback_flags)?project.fallback_flags.filter((flag):flag is string=>typeof flag==="string"):[]};
}
export function save_source_outline_settings(root:string,value:source_outline_settings):void {
  const settings=get_workspace_app()?.settings;
  if(!settings)throw new Error(workspace_text("source_outline_settings_the_workspace_settings_are_not_yet_ready"));
  const next=validate_settings(value),stored=read_stored_settings(),key=workspace_key(root);
  next.compile_commands_dir=relative_database(root,next.compile_commands_dir);
  const projects=stored.workspaces&&typeof stored.workspaces==="object"&&!Array.isArray(stored.workspaces)?stored.workspaces:{};
  // Read and merge before saving, only replace the current workspace; set_and_save is only published after persistent success.
  settings.set_and_save(SETTINGS_KEY,{...stored,clangd_path:next.clangd_path,workspaces:{...projects,[key]:{compile_commands_dir:next.compile_commands_dir,fallback_flags:next.fallback_flags,background_index:next.background_index}}});notify_language_services();
}

/** Reuse existing modal dialogs and keyboard behavior; path detection will not start shell or modify the workspace. */
export function open_source_outline_settings(root:string,on_saved?:()=>void) {
  current_dialog?.close();
  const dialog=workspace_dialog(workspace_text("source_outline_settings_c_c_language_service_configuration"),workspace_text("language_service_settings_view_cancel"));current_dialog=dialog;
  dialog.root.classList.add("source-outline-settings");
  const style=acquire_workspace_style("typora-code-source-outline-settings",css,{},dialog.root);
  const initial=read_source_outline_settings(root);
  const context=workspace_element("p","source-outline-settings-context",root?workspace_text("source_outline_settings_current_folder", {value_0: String((window as unknown as {reqnode(name:string):any}).reqnode("path").basename(root))}):workspace_text("source_outline_settings_no_folder_is_open_currently_the_configuration_is_for_individ"));
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
  const executable=add_field("clangd_path",workspace_text("source_outline_settings_clangd_executable_all_workspaces"),workspace_text("source_outline_settings_leave_blank_to_automatically_find_the_native_clangd_you_can"));executable.value=initial.clangd_path;
  const database=add_field("compile_commands_dir",workspace_text("source_outline_settings_compilation_database_folder_current_folder"),workspace_text("source_outline_settings_enter_the_directory_containing_compile_commands_json_such_as"));database.value=initial.compile_commands_dir;
  const flags=add_field("fallback_flags",workspace_text("source_outline_settings_back_end_compilation_parameters_current_folder"),workspace_text("source_outline_settings_use_only_when_there_is_no_compilation_command_each_line_is_o"),true);flags.value=initial.fallback_flags.join("\n");
  const index_label=workspace_element("label","source-outline-settings-field"),index=workspace_element("input");index.type="checkbox";index.dataset.field="background_index";index.checked=initial.background_index!==false;
  index_label.append(index,workspace_element("span","",workspace_text("source_outline_settings_back_end_index_for_project_current_folder")),workspace_element("small","",workspace_text("source_outline_settings_used_for_definitions_and_references_of_unopened_files_clangd")));dialog.content.append(index_label);
  const status=workspace_element("p","source-outline-settings-status");status.setAttribute("role","status");status.setAttribute("aria-live","polite");dialog.content.append(status);
  const read_form=()=>validate_settings({background_index:index.checked,clangd_path:executable.value,compile_commands_dir:database.value,fallback_flags:flags.value.split(/\r?\n/u)});
  let generation=0;
  const report=(message:string,error=false)=>{status.textContent=message;status.classList.toggle("is-error",error);};
  const detect=workspace_button(workspace_text("source_outline_settings_detection_path"),()=>{
    let value:source_outline_settings;try{value=read_form();}catch(error){report(String((error as Error).message||error),true);return;}
    const request=++generation;detect.disabled=true;report(workspace_text("source_outline_settings_looking_for_clangd_and_compilation_database"));
    void discover_clangd_environment({executable:value.clangd_path,workspace_root:root,compile_commands_dir:value.compile_commands_dir}).then(environment=>{
      if(!dialog.root.isConnected||request!==generation)return;
      const database_text=environment.compile_commands_dir?workspace_text("source_outline_settings_compilation_database", {value_0: String(relative_database(root,environment.compile_commands_dir))}):workspace_text("source_outline_settings_compilation_database_not_found_using_back_end_parameters");
      report(`clangd: ${environment.executable}\n${database_text}`);
    }).catch(error=>{if(dialog.root.isConnected&&request===generation)report(String(error?.message||error),true);}).finally(()=>{if(dialog.root.isConnected&&request===generation)detect.disabled=false;});
  });detect.dataset.action="detect";
  const save=workspace_button(workspace_text("remote_ssh_directory_save"),()=>{
    try {
      const value=read_form();
      // Unmodified global paths do not override other settings entries in the popup period saved new values.
      if(value.clangd_path===initial.clangd_path)value.clangd_path=read_source_outline_settings(root).clangd_path;
      save_source_outline_settings(root,value);
    } catch(error){report(workspace_text("source_outline_settings_save_failed", {value_0: String(String((error as Error).message||error))}),true);return;}
    generation++;dialog.close();style.remove();if(current_dialog===dialog)current_dialog=undefined;
    on_saved?.();
  },"source-outline-settings-save");save.dataset.action="save";
  dialog.footer.prepend(detect,save);
  for(const input of [executable,database,flags])input.addEventListener("input",()=>{generation++;detect.disabled=false;report("");});
  return dialog;
}
