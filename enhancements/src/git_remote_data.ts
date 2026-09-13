import type {git_run} from "./git_graph_data";

export type git_remote_target = {name:string;fetch:string;push:string};
export type git_network_state = {
  branch:string;branch_hash:string;head:string;guard:string;config:Map<string,string[]>;remotes:git_remote_target[];
  upstream:string;upstream_remote:string;upstream_ref:string;
};
const optional = async(run:git_run,root:string,args:string[]) => run(root,args).catch(error=>{if(error.code===1)return "";throw error;});
/** 配置与符号 HEAD 决定网络目标；提交对象可在正常 pull 后改变，不属于此保护值。 */
export async function read_git_network_guard(run:git_run,root:string):Promise<string>{
  const [branch,config]=await Promise.all([
    optional(run,root,["symbolic-ref","--quiet","HEAD"]),
    optional(run,root,["config","--null","--get-regexp","^(remote|branch|push|pull|fetch|url)\\."]),
  ]);
  return JSON.stringify([branch,config]);
}
/** 远端、上游和推送覆盖均来自 Git；不拆分 origin/name，不联网猜上游，也不写配置。 */
export async function read_git_network_state(run:git_run,root:string,selected_branch?:string):Promise<git_network_state>{
  const [guard,head,names]=await Promise.all([
    read_git_network_guard(run,root),optional(run,root,["rev-parse","--verify","--quiet","HEAD"]),run(root,["remote"]),
  ]);
  const [branch_ref,raw_config]=JSON.parse(guard) as [string,string];
  const branch=selected_branch??branch_ref.trim().replace(/^refs\/heads\//u,"");
  if(selected_branch!==undefined)await run(root,["check-ref-format","refs/heads/"+selected_branch]);
  const config=new Map<string,string[]>();
  for(const entry of raw_config.split("\0")){
    if(!entry)continue;const separator=entry.indexOf("\n");
    const key=separator<0?entry:entry.slice(0,separator),values=config.get(key)||[];
    values.push(separator<0?"true":entry.slice(separator+1));config.set(key,values);
  }
  const remotes=await Promise.all(names.trim().split(/\r?\n/u).filter(Boolean).map(async name=>({
    name,fetch:(await run(root,["remote","get-url","--all",name])).trim(),push:(await run(root,["remote","get-url","--push","--all",name])).trim(),
  })));
  const ref=branch?"refs/heads/"+branch:"";
  const refs=ref?await run(root,["for-each-ref","--format=%(refname)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)%00%(objectname)",ref]):"";
  const parts=refs.trimEnd().split("\n").find(line=>line.split("\0")[0]===ref)?.split("\0");
  return {branch,branch_hash:parts?.[4]||"",head:head.trim(),guard,config,remotes,upstream:parts?.[1]||"",upstream_remote:parts?.[2]||"",upstream_ref:parts?.[3]||""};
}
export const git_network_config=(state:git_network_state,key:string):string=>state.config.get(key)?.at(-1)||"";

/** 远端名称可以包含斜杠；引用入口按最长已配置名称识别，并解引用 remote/HEAD。 */
export async function resolve_git_remote_ref(run:git_run,root:string,remotes:git_remote_target[],target:string):Promise<{remote:string;branch:string}|undefined>{
  const match=remotes.filter(remote=>target===remote.name||target.startsWith(remote.name+"/")).sort((a,b)=>b.name.length-a.name.length)[0];
  if(!match)return undefined;
  let branch=target===match.name?"":target.slice(match.name.length+1);
  if(branch==="HEAD"){
    const ref=(await optional(run,root,["symbolic-ref","--quiet","refs/remotes/"+target])).trim();
    if(ref.startsWith("refs/remotes/"+match.name+"/"))branch=ref.slice(("refs/remotes/"+match.name+"/").length);
  }
  if(branch)await run(root,["check-ref-format","--branch",branch]);
  return {remote:match.name,branch};
}
