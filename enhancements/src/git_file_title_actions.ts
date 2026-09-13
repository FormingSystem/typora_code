import type {graph_host} from "./git_graph_host";
import type {git_graph_panel} from "./git_graph_panel";
import type {workspace_menu_entry} from "./workspace_widgets";
import {get_workspace_files} from "./workspace_files";
import {load_graph_settings} from "./git_graph_settings";
import {parse_status} from "./git_graph_repository";
import {plan_git_action} from "./git_graph_actions";
import {git_graph_text as text} from "./git_graph_i18n";

const FILE_TITLE_ACTIONS_EVENT="typora-code:file-title-git-actions";
type file_title_request={file_path:string;current:()=>boolean;signal:AbortSignal;result?:Promise<workspace_menu_entry[]>};

/** 普通文件只请求菜单贡献；Git 的读取、写事务和刷新仍归 Git 所有者。 */
export function request_git_file_title_actions(file_path:string,current:()=>boolean,signal:AbortSignal):Promise<workspace_menu_entry[]>{
  const detail:file_title_request={file_path,current,signal};
  document.dispatchEvent(new CustomEvent(FILE_TITLE_ACTIONS_EVENT,{detail}));
  return detail.result||Promise.resolve([]);
}

export function bind_git_file_title_actions(host:graph_host,controller_for:(root:string)=>git_graph_panel){
  const readers=new Set<ReturnType<graph_host["runner"]>>();let disposed=false;
  const entries=async(request:file_title_request):Promise<workspace_menu_entry[]>=>{
    const {file_path,current,signal}=request;
    if(disposed||signal.aborted||!current()||!host.path_api.isAbsolute(file_path))return [];
    const directory=host.path_api.dirname(file_path),reader=host.runner(load_graph_settings(localStorage,directory));readers.add(reader);
    const cancel=()=>reader.cancel();signal.addEventListener("abort",cancel,{once:true});
    const valid=()=>!disposed&&!signal.aborted&&current();
    try{
      let root:string;
      try{root=(await reader.run(directory,["rev-parse","--show-toplevel"])).trim();}
      catch(error){if(!valid()||/not a git repository/iu.test(String(error)))return [];throw error;}
      if(!valid())return [];
      const relative=host.path_api.relative(root,file_path).replace(/\\/gu,"/");
      if(!relative||relative===".."||relative.startsWith("../")||host.path_api.isAbsolute(relative))return [];
      // Git 的 literal pathspec 保留带方括号、空格及非 ASCII 的实际文件身份。
      const change=parse_status(await reader.run(root,["status","--porcelain=v1","-z","--untracked-files=all","--",":(literal)"+relative])).find(item=>item.path===relative);
      if(!valid()||!change)return [];
      const panel=controller_for(root);
      while(panel.pending&&valid()&&!panel.disposed)await new Promise(resolve=>window.setTimeout(resolve,25));
      if(!valid()||panel.disposed||!panel.state||host.path_api.relative(panel.root,root)!=="")return [];
      const writer=panel.writer,paths=[change.path,...(change.old_path?[change.old_path]:[])];
      const writable=()=>{
        const files=get_workspace_files();let busy=false;
        if(files)host.core.app.workspace.eachLeaves(leaf=>{const state=files.editor_state(leaf);if(state.file_path&&host.path_api.relative(state.file_path,file_path)===""&&(state.dirty||state.busy))busy=true;});
        return !busy&&files?.can_write(file_path)!==false;
      };
      const available=()=>!disposed&&current()&&!panel.disposed&&!panel.pending&&!panel.writing&&panel.writer===writer&&host.path_api.relative(panel.root,root)===""&&writable();
      const conflict=change.status.includes("U")||["AA","DD"].includes(change.status);
      const action=(id:"stage"|"unstage"):workspace_menu_entry=>({id,title:text(id==="stage"?"scm.stage_change":"scm.unstage_change"),disabled:conflict||!available(),action:()=>{
        if(!available())return;
        void panel.prepare_and_execute_action(async()=>{
          const plan=await plan_git_action(writer.run,id,{root,target:paths[0],paths,hash:panel.state?.head||"",operation:panel.state?.operation||""},{});
          // 计划期间用户仍可能换标签、关闭文件或修改正文，返回事务之前再次验收所有者。
          if(disposed||!current()||!writable())throw new Error("文件状态已变化，请重新打开文件菜单后重试。");
          return plan;
        },writer,id).then(message=>{if(!disposed)panel.report(message);}).catch(error=>{if(!disposed)new host.core.Notice(String(error instanceof Error?error.message:error),5000);});
      }});
      return [
        ...(change.status==="??"||change.work_status!==" "?[action("stage")]:[]),
        ...(change.index_status!==" "&&change.index_status!=="?"?[action("unstage")]:[])
      ];
    }catch(error){if(valid())throw error;return [];}
    finally{signal.removeEventListener("abort",cancel);reader.dispose?.();readers.delete(reader);}
  };
  const contribute=(event:Event)=>{const request=(event as CustomEvent<file_title_request>).detail;if(request&&!request.result)request.result=entries(request);};
  document.addEventListener(FILE_TITLE_ACTIONS_EVENT,contribute);
  return {dispose(){if(disposed)return;disposed=true;document.removeEventListener(FILE_TITLE_ACTIONS_EVENT,contribute);for(const reader of readers)reader.dispose?.();readers.clear();}};
}
