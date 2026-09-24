import {build_git_graph,type git_commit} from './git_graph_data';
import type {repository_state,graph_commit} from './git_graph_repository';
import {git_graph_text as text} from './git_graph_i18n';

export type git_history_range={id:string;kind:'incoming'|'outgoing';from:string;to:string;branch:string;count:number};
export type git_history_item={id:string;commit?:graph_commit;range?:git_history_range};
export const history_range_label=(range:git_history_range)=>text(range.kind==='outgoing'?'history.outgoing':'history.incoming');
export const history_range_title=(range:git_history_range)=>`${history_range_label(range)} ${range.branch} (${range.count})\n${range.from.slice(0,8)} ↔ ${range.to.slice(0,8)}`;

/** 区间只存在于图投影；传给Git的端点始终是仓库快照中的真实对象。 */
export function build_history_model(state:repository_state,prefix:git_commit[]=[]){
  const items:git_history_item[]=state.commits.map(commit=>({id:commit.hash,commit}));
  const topology=state.commits.map(commit=>({...commit,parents:[...commit.parents]}));
  const tracking=state.tracking,base=tracking?.merge_base;
  const valid=(value:string|undefined)=>!!value&&/^[a-f\d]{40}(?:[a-f\d]{24})?$/u.test(value);
  const included=(ref:string)=>!state.history_refs||state.history_refs.includes(ref);
  if(state.branch&&valid(state.head)&&valid(base)&&valid(tracking?.upstream_hash)){
    const add=(kind:git_history_range['kind'],index:number,to:string,branch:string,count:number,parents:string[])=>{
      const range:git_history_range={id:`${kind}:${base}:${to}`,kind,from:base!,to,branch,count};
      items.splice(index,0,{id:range.id,range});topology.splice(index,0,{hash:range.id,parents,subject:'',date:'',author:''});return range;
    };
    const base_index=topology.findIndex(commit=>commit.hash===base);
    if(tracking!.behind>0&&included(tracking!.upstream)&&base_index>=0){
      const by_hash=new Map(topology.map(commit=>[commit.hash,commit]));const remote=new Set<string>(),pending=[tracking!.upstream_hash];
      while(pending.length){const hash=pending.pop()!;if(hash===base||remote.has(hash))continue;remote.add(hash);const commit=by_hash.get(hash);if(commit)pending.push(...commit.parents);}
      if(topology.some(commit=>remote.has(commit.hash)&&commit.parents.includes(base!))){
        const range=add('incoming',base_index,tracking!.upstream_hash,tracking!.upstream.replace(/^refs\/(remotes|heads)\//u,''),tracking!.behind,[base!]);
        for(const commit of topology)if(remote.has(commit.hash))commit.parents=commit.parents.map(parent=>parent===base?range.id:parent);
      }
    }
    const head_index=topology.findIndex(commit=>commit.hash===state.head);
    if(tracking!.ahead>0&&(included('refs/heads/'+state.branch)||included('HEAD'))&&head_index>=0)add('outgoing',head_index,state.head,state.branch,tracking!.ahead,[state.head]);
  }
  const graph=build_git_graph([...prefix,...topology]);
  return {items,graph};
}
