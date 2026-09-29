import {workspace_text} from "./workspace_i18n";
import {active_remote_files,is_remote_cache_path} from './remote_workspace_files';
import {choose_remote_resource} from './remote_workspace_picker';
import {choose_local_directory} from './workspace_native_picker';

/** Each Git controller captures the associated workspace; display path and execution path only convert at this boundary. */
export function git_workspace_resources(path_api:any){
  const owner=active_remote_files();
  const current=()=>active_remote_files()===owner;
  const accepts=(path:string)=>typeof path==='string'&&path_api.isAbsolute(path)&&(owner?owner.owns(path):!is_remote_cache_path(path));
  const assert=(path:string)=>{if(!current()||!accepts(path))throw Error(workspace_text("git_workspace_resources_git_target_is_not_in_the_current_workspace_please_switch_to"));};
  return {
    key:owner?'remote:'+owner.cache_root:'local',current,accepts,assert,
    label(path:string){return owner&&owner.owns(path)?owner.remote_path(path):path;},
    async choose(root:string){
      if(!current())return;
      const selected=owner?await choose_remote_resource(true,undefined,{initial_path:root||owner.root}):await choose_local_directory(root);
      if(!selected||!current())return;assert(selected);return selected;
    },
  };
}
