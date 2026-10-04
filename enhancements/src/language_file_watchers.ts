import {compile_workspace_globs} from './workspace_glob';
import {acquire_workspace_directories} from './workspace_directory_service';

/** LSP registrations subscribe to the shared directory owner and never create a second watcher tree. */
export function create_language_file_watcher(fs:any,path:any){
 return (root:string,watchers:any[],notify:(changes:{path:string;type:number}[])=>void)=>{
  const matches=watchers.map(item=>{
   if(typeof item.globPattern!=='string')throw Error('Relative LSP watch patterns are not supported.');
   return {match:compile_workspace_globs(item.globPattern,true,false,false),kind:item.kind??7};
  });
  const owner=acquire_workspace_directories(fs,path);owner.service.observe(root);let alive=true;
  const release=owner.service.subscribe(root,change=>{
   if(!change.path)return;const target=change.path,relative=path.relative(root,target).replaceAll('\\','/');
   const applicable=matches.filter(item=>item.match(relative));if(!applicable.length)return;
   void fs.promises.stat(target).then(()=>change.names?1:2,(error:any)=>error.code==='ENOENT'?3:0).then((type:number)=>{if(alive&&type&&applicable.some(item=>item.kind&(type===1?1:type===2?2:4)))notify([{path:target,type}]);});
  });
  return()=>{alive=false;release();owner.dispose();};
 };
}
