import type {git_run} from "./git_graph_data";
import {plan_git_action, type action_plan} from "./git_graph_actions";
import {git_graph_text as text} from "./git_graph_i18n";

export type checkout_ref = {name:string; label:string; hash:string; kind:"local"|"remote"|"tag"; upstream:string; author:string; date:number; subject:string; track:string};
export type checkout_request = {ref?:checkout_ref; detached?:boolean; branch?:string; head:string};
/** 一次读取全部引用与提交详情，不依赖Graph分页/过滤。附注标签使用剥离后的commit。 */
export async function read_checkout_refs(run:git_run,root:string):Promise<checkout_ref[]> {
  const format="%(refname)%00%(objectname)%00%(*objectname)%00%(objecttype)%00%(*objecttype)%00%(symref)%00%(upstream)%00%(authorname)%00%(*authorname)%00%(committerdate:unix)%00%(*committerdate:unix)%00%(subject)%00%(*subject)%00%(upstream:track)";
  const output=await run(root,["for-each-ref","--sort=-committerdate","--format="+format,"refs/heads","refs/remotes","refs/tags"]);
  return output.split("\n").filter(Boolean).flatMap(line=>{
    const [name,oid,peeled,type,peeled_type,symref,upstream,author,peeled_author,date,peeled_date,subject,peeled_subject,track]=line.replace(/\r$/u,"").split("\0");
    if(symref||(peeled?peeled_type:type)!=="commit")return [];
    const kind=name.startsWith("refs/heads/")?"local":name.startsWith("refs/remotes/")?"remote":"tag";
    return [{name,label:name.replace(/^refs\/(heads|remotes|tags)\//u,""),hash:peeled||oid,kind,upstream,author:peeled?peeled_author:author,date:Number(peeled?peeled_date:date)||0,subject:peeled?peeled_subject:subject,track}];
  });
}
/** UI选择不是写授权缓存；在panel写锁内重新解析引用，再交给公共指纹/草稿保护事务。 */
export async function prepare_checkout(run:git_run,root:string,request:checkout_request):Promise<action_plan> {
  const refs=await read_checkout_refs(run,root),ref=request.ref&&refs.find(item=>item.name===request.ref!.name);
  if(request.ref&&(!ref||ref.hash!==request.ref.hash))throw Error(text("quick.target_changed"));
  let id="branch_checkout",target="",hash=ref?.hash||request.head,values:Record<string,unknown>={};
  if(request.branch){
    if(refs.some(item=>item.name==="refs/heads/"+request.branch))throw Error(text("checkout.exists",{branch:request.branch}));
    if(!ref){const head=await run(root,["rev-parse","--verify","--quiet","HEAD"]).then(value=>value.trim()).catch(error=>{if(error.code===1)return "";throw error;});if(head!==request.head)throw Error(text("quick.target_changed"));}
    id="branch_create";values={branch:request.branch,checkout:true};
  }else if(!ref)throw Error(text("quick.target_changed"));
  else if(request.detached||ref.kind==="tag")id="commit_checkout";
  else if(ref.kind==="local")target=ref.label;
  else {
    const tracked=refs.find(item=>item.kind==="local"&&item.upstream===ref.name);
    if(tracked)target=tracked.label;
    else {
      const remotes=(await run(root,["remote"])).trim().split(/\r?\n/u).filter(name=>name&&ref.label.startsWith(name+"/")).sort((a,b)=>b.length-a.length);
      if(!remotes[0])throw Error(text("quick.target_changed"));
      const branch=ref.label.slice(remotes[0].length+1);
      if(refs.some(item=>item.name==="refs/heads/"+branch))throw Error(text("checkout.exists",{branch}));
      id="remote_checkout";target=ref.name;values={branch};
    }
  }
  const plan=await plan_git_action(run,id,{root,target,hash,operation:""},values);
  // '--' 防止同名路径成为checkout文件操作；强制本地检出，不猜测远端。
  if(id==="branch_checkout")plan.args=["checkout","--no-guess",target,"--"];
  if(JSON.stringify(await read_checkout_refs(run,root))!==JSON.stringify(refs))throw Error(text("quick.target_changed"));
  return plan;
}
