import type {git_run} from "./git_graph_data";
import {read_worktrees} from "./git_scm_data";
import {git_graph_text as text} from "./git_graph_i18n";

const normalized=(path:string)=>/^[a-z]:/iu.test(path)?path.replace(/\\/gu,"/").replace(/\/$/u,"").toLowerCase():path.replace(/\/$/u,"");
/** 删除只能指向 Git 登记的附加工作树；状态和登记在预览、执行前各核对一次。 */
export async function worktree_guard(run:git_run,root:string,target?:string):Promise<string>{
  const entries=await read_worktrees(run,root);
  if(target){
    const entry=entries.find(entry=>normalized(entry.path)===normalized(target));
    const current=(await run(root,["rev-parse","--show-toplevel"])).trimEnd();
    if(!entry||entry.main||entry.bare||entry.locked||entry.prunable||normalized(entry.path)===normalized(current))throw new Error(text("scm.worktree_protected"));
    if(await run(entry.path,["status","--porcelain=v1","-z","--untracked-files=all","--ignored"]))throw new Error(text("scm.worktree_dirty"));
  }
  return JSON.stringify(entries);
}
