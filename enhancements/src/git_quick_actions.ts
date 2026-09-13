import {plan_git_action,type action_context,type action_plan} from "./git_graph_actions";
import type {git_run} from "./git_graph_data";
import type {graph_settings} from "./git_graph_settings";
import {git_graph_text as text} from "./git_graph_i18n";
import {read_git_network_guard,read_git_network_state,resolve_git_remote_ref,git_network_config,type git_remote_target,type git_network_state} from "./git_remote_data";

export type quick_git_action="fetch"|"pull"|"push"|"sync";
export type quick_git_options={remote?:string;publish?:boolean;branch?:string;remote_ref?:string;target_hash?:string};
export type choose_git_remote=(items:git_remote_target[],branch:string)=>Promise<string|undefined>;

function known_remote(state:git_network_state,name:string):string{
  if(!state.remotes.some(remote=>remote.name===name))throw new Error(text("quick.remote_missing",{remote:name}));
  return name;
}
function rebase_setting(state:git_network_state):string{
  const branch_key=`branch.${state.branch}.rebase`;
  const key=state.config.has(branch_key)?branch_key:"pull.rebase";
  return state.config.has(key)?git_network_config(state,key)||"false":"";
}
function pull_mode(state:git_network_state,settings:graph_settings,id:"pull"|"sync"):string{
  const configured=rebase_setting(state);
  // 显式 --rebase 会覆盖 Git 的 pull.ff=only，因此先保留只允许快进的约束。
  if(git_network_config(state,"pull.ff")==="only")return "ff-only";
  if(["true","1","yes","on","merges","m"].includes(configured.toLowerCase()))return "rebase";
  if(["interactive","i"].includes(configured.toLowerCase()))throw new Error(text("quick.interactive_pull"));
  if(["false","0","no","off"].includes(configured.toLowerCase()))return "merge";
  if(configured)throw new Error(text("action.error.invalid_option",{field:text("action.field.pull_mode")}));
  const preset=settings.dialog_defaults[id]?.mode;
  return typeof preset==="string"&&["merge","rebase","ff-only"].includes(preset)?preset:"merge";
}
async function push_remote(state:git_network_state,choose:choose_git_remote|undefined,explicit:string|undefined):Promise<string|undefined>{
  if(explicit)return known_remote(state,explicit);
  const configured=git_network_config(state,`branch.${state.branch}.pushremote`)||git_network_config(state,"remote.pushdefault");
  if(configured)return known_remote(state,configured);
  if(state.upstream_remote&&state.upstream_remote!==".")return known_remote(state,state.upstream_remote);
  const branch_remote=git_network_config(state,`branch.${state.branch}.remote`);
  if(branch_remote&&branch_remote!==".")return known_remote(state,branch_remote);
  if(state.remotes.length===1)return state.remotes[0].name;
  if(!choose)throw new Error(text("quick.choose_remote"));
  const selected=await choose(state.remotes,state.branch);
  return selected===undefined?undefined:known_remote(state,selected);
}
/** 快捷按钮自动准备准确目标，复用已有执行计划；只有真正多目标时才要求选择。 */
export async function prepare_quick_git_action(run:git_run,id:quick_git_action,context:action_context,settings:graph_settings,choose_remote?:choose_git_remote,options:quick_git_options={}):Promise<action_plan|undefined>{
  const state=await read_git_network_state(run,context.root,id==="push"?options.branch:undefined);
  if(id==="push"&&options.branch&&(!state.branch_hash||options.target_hash&&state.branch_hash!==options.target_hash))throw new Error(text("quick.target_changed"));
  if(id==="pull"&&options.branch&&options.branch!==state.branch)throw new Error(text("quick.current_branch_required"));
  const selected_remote=options.remote_ref?await resolve_git_remote_ref(run,context.root,state.remotes,options.remote_ref):undefined;
  if(options.remote_ref&&!selected_remote)throw new Error(text("quick.remote_missing",{remote:options.remote_ref}));
  if(!state.remotes.length&&!(id==="pull"||id==="sync")&&state.upstream_remote!==".")throw new Error(text("quick.no_remotes"));
  if(id!=="fetch"&&(!state.head||!state.branch))throw new Error(text("quick.branch_required"));
  if(id!=="fetch"&&context.operation)throw new Error(text("action.error.operation_blocks_sync"));
  if(context.hash&&state.head!==context.hash)throw new Error(text("quick.target_changed"));
  let operation:quick_git_action=id;
  let values:Record<string,string|boolean>;
  if(id==="fetch"){
    if(!state.remotes.length)throw new Error(text("quick.no_remotes"));
    values={remote:selected_remote?.remote||(options.remote?known_remote(state,options.remote):""),prune:settings.fetch_prune,prune_tags:settings.fetch_prune_tags};
  }else if(id==="pull"&&selected_remote){
    if(!selected_remote.branch)throw new Error(text("action.error.missing_upstream"));
    values={remote:selected_remote.remote,branch:selected_remote.branch,mode:pull_mode(state,settings,id),squash_message:"default"};
  }else if(id==="pull"||id==="sync"&&state.upstream){
    if(!state.upstream||!state.upstream_remote||!state.upstream_ref.startsWith("refs/heads/"))throw new Error(text("action.error.missing_upstream"));
    if(state.upstream_remote!==".")known_remote(state,state.upstream_remote);
    values={remote:state.upstream_remote,branch:state.upstream_ref.slice(11),mode:pull_mode(state,settings,id),squash_message:"default"};
  }else{
    operation="push";
    if(!state.remotes.length)throw new Error(text("quick.no_remotes"));
    const remote=await push_remote(state,choose_remote,options.remote);if(remote===undefined)return undefined;
    const destination=state.upstream_remote===remote&&state.upstream_ref.startsWith("refs/heads/")?state.upstream_ref.slice(11):state.branch;
    values={remote,branch:state.branch,remote_branch:destination,upstream:options.publish===true||!state.upstream,force_lease:false};
  }
  const latest_head=(await run(context.root,["rev-parse","--verify","--quiet","HEAD"]).catch(error=>{if(error.code===1)return "";throw error;})).trim();
  if(latest_head!==state.head||await read_git_network_guard(run,context.root)!==state.guard)throw new Error(text("quick.target_changed"));
  if(id==="push"&&options.branch&&(await run(context.root,["rev-parse","--verify","refs/heads/"+state.branch])).trim()!==state.branch_hash)throw new Error(text("quick.target_changed"));
  const plan=await plan_git_action(run,operation,context,values);
  if(operation==="fetch"&&selected_remote?.branch){
    plan.args.push(selected_remote.branch);plan.preview="git "+plan.args.map(arg=>JSON.stringify(arg)).join(" ");
  }
  // 不把读取本地配置当作联网；批准的点击只在控制器接收完整计划后开始写操作。
  plan.network_guard=state.guard;
  if(operation==="pull"||operation==="sync"){
    const rebase=rebase_setting(state);
    if(["merges","m"].includes(rebase.toLowerCase()))plan.args=plan.args.map(arg=>arg==="--rebase"?"--rebase=merges":arg);
  }
  return plan;
}
