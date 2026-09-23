import {DEFAULT_SEARCH_REGEX,query_expression} from './workspace_search_matcher';
import {create_search_matcher} from './workspace_search_worker_client';

export type workspace_path_result={path:string;name:string;directory:boolean;link:boolean};
/** 路径搜索只读目录名，结果上限和取消属于本次查询，不持有工作区全局状态。 */
export async function search_workspace_paths(options:{fs:any;path_api:any;root:string;query:string;signal:AbortSignal}){
  const {fs,path_api,root,query,signal}=options,matcher=create_search_matcher();
  const query_options={query,regex:DEFAULT_SEARCH_REGEX};query_expression(query_options);
  const results:workspace_path_result[]=[],pending=[root];let unreadable=0,visited=0,limited=false;
  const current=()=>{if(signal.aborted)throw new DOMException('搜索已取消','AbortError');};
  try{
    while(pending.length&&!limited){
      current();const directory=pending.pop()!;let entries:any[];
      try{entries=await fs.promises.readdir(directory,{withFileTypes:true});}
      catch(error){current();if(directory===root)throw error;unreadable++;continue;}
      current();
      for(let offset=0;offset<entries.length;offset+=256){
        const batch:workspace_path_result[]=entries.slice(offset,offset+256).map(entry=>{
          const path=path_api.join(directory,entry.name);
          return {path,name:path_api.relative(root,path).split(path_api.sep).join('/'),directory:entry.isDirectory(),link:entry.isSymbolicLink()};
        });
        const matches=await matcher.match_paths(batch.map(entry=>entry.name),query_options,signal);current();
        for(const match of matches){results.push(batch[match.index]);if(results.length===512){limited=true;break;}}
        visited+=batch.length;
        if(visited>=100000){limited=true;break;}
        if(limited)break;
        for(const entry of batch)if(entry.directory&&!entry.link&&!['.git','node_modules'].includes(path_api.basename(entry.path)))pending.push(entry.path);
      }
    }
    return {results,unreadable,limited,visited};
  }finally{matcher.dispose();}
}
