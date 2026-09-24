import {read_git_records} from './git_status_snapshot';
import type {git_run, git_ref} from "./git_graph_data";
import {git_graph_text as text} from "./git_graph_i18n";

export type branch_status = {branch:string; head:string; upstream:string; ahead:number; behind:number; dirty:boolean};
/** porcelain v2 的分支头与路径记录以 NUL 分隔；重命名第二个路径不是状态。 */
export function parse_branch_status(source:string):branch_status {
  const status:branch_status={branch:"",head:"",upstream:"",ahead:0,behind:0,dirty:false};
  const records=source.split("\0");
  for(let index=0;index<records.length;index++) {
    const record=records[index];
    if(record.startsWith("# branch.head ")) status.branch=record.slice(14);
    else if(record.startsWith("# branch.oid ")) status.head=record.slice(13);
    else if(record.startsWith("# branch.upstream ")) status.upstream=record.slice(18);
    else if(record.startsWith("# branch.ab ")) {const counts=/^# branch\.ab \+(\d+) -(\d+)$/u.exec(record);if(counts){status.ahead=Number(counts[1]);status.behind=Number(counts[2]);}}
    else if(/^[12u?] /u.test(record)){status.dirty=true;if(record.startsWith("2 "))index++;}
  }
  return status;
}
export async function read_branch_status(run:git_run,root:string):Promise<branch_status>{
  let headers='',dirty=false,rename=false;
  await read_git_records(run,root,['status','--porcelain=v2','--branch','-z','--untracked-files=normal'],record=>{
    if(rename){rename=false;return;}if(record.startsWith('# branch.'))headers+=record+'\0';
    else if(/^[12u?] /u.test(record)){dirty=true;rename=record.startsWith('2 ');}
  });return {...parse_branch_status(headers),dirty};
}
export type scm_tracking={upstream:string; upstream_hash:string; remote:string; remote_ref:string; base:string; base_hash:string; ahead:number; behind:number; merge_base?:string};
const optional=async(run:git_run,root:string,args:string[])=>run(root,args).then(value=>value.trim()).catch(error=>{if(error.code===1)return "";throw error;});
/** 读取真实上游和 VS Code 分支基线；只读本地引用，不因显示菜单写 Git 配置或联网。 */
export async function read_scm_tracking(run:git_run,root:string,branch:string,head:string,refs:git_ref[]):Promise<scm_tracking> {
  const result:scm_tracking={upstream:"",upstream_hash:"",remote:"",remote_ref:"",base:"",base_hash:"",ahead:0,behind:0};
  if(!branch||!head)return result;
  const read_upstream=async(name:string)=>{
    const ref="refs/heads/"+name;
    const source=await run(root,["for-each-ref","--format=%(refname)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)",ref]);
    return source.trimEnd().split("\n").find(line=>line.split("\0")[0]===ref)?.split("\0");
  };
  const parts=await read_upstream(branch);
  if(parts?.[1]){result.upstream=parts[1];result.remote=parts[2];result.remote_ref=parts[3];result.upstream_hash=refs.find(ref=>ref.name===result.upstream)?.hash||"";}
  if(result.upstream_hash){const counts=(await run(root,["rev-list","--left-right","--count",`${head}...${result.upstream_hash}`,"--"])).trim().split(/\s+/u).map(Number);if(counts.length===2&&counts.every(Number.isSafeInteger)){[result.ahead,result.behind]=counts;}}
  if(result.ahead||result.behind)result.merge_base=await optional(run,root,['merge-base',head,result.upstream_hash]);
  const remote_ref=(name:string)=>refs.find(ref=>ref.name.startsWith("refs/remotes/")&&ref.name===(name.startsWith("refs/")?name:"refs/remotes/"+name));
  let base=remote_ref(await optional(run,root,["config","--get",`branch.${branch}.vscode-merge-base`]));
  if(!base){
    const reflog=await run(root,["reflog","show","--format=%gs","refs/heads/"+branch,"--"]);
    const created=reflog.split("\n").filter(line=>line.startsWith("branch: Created from "));
    if(created.length===1){
      let source=created[0].slice(21).trim();
      if(source==="HEAD") {const movements=(await run(root,["reflog","show","--format=%gs","HEAD","--"])).split("\n").filter(line=>line.startsWith("checkout: moving from ")&&line.endsWith(" to "+branch));source=movements.at(-1)?.slice(22,-4-branch.length)||"";}
      base=remote_ref(source);
      if(!base&&source&&source!==branch&&refs.some(ref=>ref.name==="refs/heads/"+source)){const upstream=await read_upstream(source);base=remote_ref(upstream?.[1]||"");}
    }
  }
  if(!base){
    const remote=result.remote&&result.remote!=="."?result.remote:"origin";
    const default_ref=await optional(run,root,["symbolic-ref","--quiet",`refs/remotes/${remote}/HEAD`]);
    base=refs.find(ref=>ref.name===default_ref);
  }
  if(base&&base.name!==result.upstream){result.base=base.name;result.base_hash=base.hash;}
  return result;
}

export type git_worktree={path:string; head:string; branch:string; locked:boolean; prunable:boolean; bare:boolean; main:boolean};
export function parse_worktrees(source:string):git_worktree[]{
  const result:git_worktree[]=[];let entry:git_worktree|undefined;
  for(const record of source.split("\0")){
    if(record.startsWith("worktree ")){entry={path:record.slice(9),head:"",branch:"",locked:false,prunable:false,bare:false,main:result.length===0};result.push(entry);}
    else if(entry){if(record.startsWith("HEAD "))entry.head=record.slice(5);else if(record.startsWith("branch "))entry.branch=record.slice(7);else if(/^locked(?: |$)/u.test(record))entry.locked=true;else if(/^prunable(?: |$)/u.test(record))entry.prunable=true;else if(record==="bare")entry.bare=true;}
  }
  return result;
}
export const read_worktrees=async(run:git_run,root:string):Promise<git_worktree[]>=>parse_worktrees(await run(root,["worktree","list","--porcelain","-z"]));
/** 菜单只提供可验证的 GitHub 链接，剥离远端凭据；其他托管平台不冒充 GitHub。 */
export const HISTORY_ACTION_IDS=["branches","head","fetch","pull","push","refresh"] as const;
export type history_action_id=typeof HISTORY_ACTION_IDS[number];
export function validate_history_shortcuts(value:unknown):Record<string,string>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(text("scm.invalid_shortcut"));
  const used=new Set<string>();
  for(const [id,key] of Object.entries(value)){
    if(!HISTORY_ACTION_IDS.includes(id as history_action_id)||typeof key!=="string")throw new Error(text("scm.invalid_shortcut"));
    if(!key)continue;
    const parts=key.toLowerCase().split("+");const modifiers=parts.slice(0,-1);
    if(!/^(?:[a-z0-9]|f(?:[1-9]|1[0-2]))$/u.test(parts.at(-1)!)||modifiers.some(part=>!["mod","alt","shift"].includes(part))||new Set(modifiers).size!==modifiers.length||(!modifiers.includes("mod")&&!modifiers.includes("alt")&&!/^f\d+$/u.test(parts.at(-1)!)))throw new Error(text("scm.invalid_shortcut"));
    const normalized=[...modifiers.sort(),parts.at(-1)].join("+");if(used.has(normalized))throw new Error(text("scm.duplicate_shortcut"));used.add(normalized);
  }
  return value as Record<string,string>;
}
