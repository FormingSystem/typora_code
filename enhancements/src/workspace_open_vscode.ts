import {workspace_text} from "./workspace_i18n";
import {create_vscode_environment,open_resource_in_vscode} from "./workspace_vscode_service";
import {remote_files_for} from "./remote_workspace_files";
import {workspace_element as el,type workspace_menu_entry} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import type {workspace_file_host} from "./workspace_files";
import {svg} from "../vendor/vscode_brand/icon.json";
import {acquire_workspace_style} from "./workspace_styles";
import vscode_css from "./workspace_open_vscode.css";

export function vscode_menu_icon():HTMLElement {
  const icon=el("img");icon.src="data:image/svg+xml,"+encodeURIComponent(svg);icon.alt="";icon.width=16;icon.height=16;icon.setAttribute("aria-hidden","true");icon.dataset.productIcon="vscode";return icon;
}

export function vscode_resource_available(path:string):boolean {
  if(!path||remote_files_for(path))return false;
  const runtime=window as unknown as {reqnode(name:string):any};
  return runtime.reqnode("path").isAbsolute(path);
}

/** All file entries call the same service; only open disk files, without implicit document saving. */
export function vscode_resource_entry(path:string):workspace_menu_entry {
  const core=(window as any)[Symbol.for("typora-code:workspace")];
  const workspace_root=core?.app?.[Symbol.for("linux-note.workspace-files@v1")]?.host?.context_root();
  return {id:"open_vscode",title:workspace_text("open_vscode_vs_code_open_project"),icon:vscode_menu_icon,disabled:!vscode_resource_available(path),action:()=>{void (async()=>{
    if(!vscode_resource_available(path))throw new Error(workspace_text("open_vscode_please_save_as_a_local_file_first_remote_files_do_not_suppor"));
    const runtime=window as unknown as {reqnode(name:string):any};
    await open_resource_in_vscode(create_vscode_environment(name=>runtime.reqnode(name)),path,workspace_root);
  })().catch(error=>{
    const core=(window as any)[Symbol.for("typora-code:workspace")];
    if(core?.Notice)new core.Notice(error instanceof Error?error.message:String(error),5000);
    else console.error("Typora Code VS Code:",error);
  });}};
}

export function bind_native_vscode_menu(files:workspace_file_host){
  const runtime=window as unknown as {File?:any},context=runtime.File?.editor?.contextMenu,menu=document.querySelector("#context-menu");
  if(!context?.show||!menu)return {dispose(){}};
  let disposed=false,target="";
  const item=el("li","hide"),anchor=el("a","",workspace_text("open_vscode_vs_code_open_project"));
  item.dataset.key="typora-code-open-vscode";anchor.tabIndex=0;anchor.setAttribute("role","menuitem");const slot=el("span","workspace-native-menu-icon");slot.append(vscode_menu_icon());anchor.prepend(slot);item.append(anchor);menu.append(item);
  const style=acquire_workspace_style("typora-code-style:open_vscode",vscode_css);
  const interaction=acquire_workspace_interaction(item),events=new AbortController(),original=context.show;
  const show=context.show=function(event:MouseEvent,node?:Element){
    if(disposed)return original.call(this,event,node);
    const source=node||(event.target instanceof Element?event.target:undefined);
    target=source?.closest("#write")?files.current_file():"";
    const available=vscode_resource_available(target);item.classList.toggle("hide",!source?.closest("#write"));item.classList.toggle("disabled",!available);
    anchor.setAttribute("aria-disabled",String(!available));anchor.title=available?workspace_text("open_vscode_open_the_entire_project_and_jump_to_the_disk_file_unsaved_ed"):workspace_text("open_vscode_please_save_as_a_local_file_first");
    return original.call(this,event,node);
  };
  for(const name of ["pointerdown","mousedown","mouseup","click","keydown"]){
    document.addEventListener(name,(event:Event)=>{
      if(!(event.target instanceof Node)||!item.contains(event.target))return;
      if(event instanceof KeyboardEvent&&!["Enter"," "].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();
      if((name==="click"||(event instanceof KeyboardEvent&&!event.repeat))&&target===files.current_file()&&vscode_resource_available(target)){
        const entry=vscode_resource_entry(target);context.hide();void Promise.resolve().then(()=>entry.action?.()).catch(error=>{if(!disposed)new files.core.Notice(String(error instanceof Error?error.message:error),5000);});
      }
    },{capture:true,signal:events.signal});
  }
  return {dispose(){if(disposed)return;disposed=true;events.abort();if(context.show===show)context.show=original;item.remove();interaction.remove();style.remove();}};
}
