import type {workspace_file_host} from "./workspace_files";
import type {titlebar_menu_entry} from "./workspace_titlebar_menu";
import {create_recent_service,type recent_item} from "./workspace_recent_service";
import {create_recent_view} from "./workspace_recent_view";
import {workspace_context_epoch,workspace_context_switching} from "./workspace_context";

const bindings=new WeakMap<workspace_file_host,ReturnType<typeof bind_workspace_recents>>();
export function get_workspace_recents(files:workspace_file_host){return bindings.get(files);}

export function bind_workspace_recents(files:workspace_file_host,open_folder:(path:string)=>Promise<unknown>){
  const runtime=window as unknown as {JSBridge?:{invoke(name:string,...args:unknown[]):Promise<any>}};
  const notice=(message:string)=>{new files.core.Notice(message,5000);};
  const service=create_recent_service({fs:files.fs,path_api:files.path_api,open_file:files.open_file,open_folder,
    invoke:(name,...args)=>{if(!runtime.JSBridge?.invoke)return Promise.reject(new Error("最近打开接口不可用。"));return runtime.JSBridge.invoke(name,...args);},
    context_epoch:workspace_context_epoch,context_switching:workspace_context_switching,notice});
  const view=create_recent_view(service,files.path_api,notice);
  const entries=async():Promise<titlebar_menu_entry[]>=>{
    let items:recent_item[]=[];let error="";
    try{items=await service.read();}catch(cause){error="无法读取最近记录："+String(cause);}
    const epoch=workspace_context_epoch();
    const group=(kind:recent_item["kind"])=>items.filter(item=>item.kind===kind).slice(0,10).map(item=>({label:item.path,title:item.path,
      action:()=>service.open(item,()=>workspace_context_epoch()===epoch).catch(cause=>notice(String(cause)))}));
    const folders=group("folder"),documents=group("file");
    return [...folders,...(folders.length&&documents.length?[{separator:true}]:[]),...documents,
      ...(!items.length?[{label:error||"没有最近打开的项目",disabled:true}]:[]),{separator:true},
      {label:"更多…",shortcut:"Ctrl+R",action:view.open},{label:"清空最近打开记录…",disabled:!items.length,action:()=>view.confirm_clear(items)}];
  };
  const binding={entries,open:view.open,open_item:service.open,dispose(){view.dispose();service.dispose();bindings.delete(files);}};
  bindings.set(files,binding);return binding;
}
