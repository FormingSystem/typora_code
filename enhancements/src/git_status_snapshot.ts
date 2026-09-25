import type {git_run} from './git_graph_data';
import type {graph_change} from './git_graph_repository';
export const git_yield=()=>new Promise<void>(resolve=>{
  // MessageChannel避免Windows/后台窗口定时器钳制造成分批任务累计十几秒等待。
  if(typeof MessageChannel==='undefined'){setTimeout(resolve,0);return;}
  const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(null);
});
/** 只保留尚未完整的NUL字段；没有全量split/JSON副本。 */
export async function read_git_records(run:git_run,root:string,args:string[],record:(value:string)=>void):Promise<void>{
  let carry='',count=0;
  const consume=async(chunk:string)=>{
    const value=carry+chunk;let start=0,end:number;
    while((end=value.indexOf('\0',start))>=0){record(value.slice(start,end));start=end+1;if(++count%512===0)await git_yield();}
    carry=value.slice(start);
  };
  const source=await run(root,args,{stdout:consume});
  // 测试端口和远程适配允许返回字符串，仍分块消费，不能一次split。
  for(let i=0;i<source.length;i+=65536)await consume(source.slice(i,i+65536));
  if(carry)throw Error('Git状态记录不完整，保留上次状态。');
}
export async function read_status_snapshot(run:git_run,root:string,untracked:boolean):Promise<graph_change[]>{
  const result:graph_change[]=[];let renamed:graph_change|undefined;
  await read_git_records(run,root,['status','--porcelain=v1','-z',untracked?'--untracked-files=all':'--untracked-files=no'],value=>{
    if(renamed){renamed.old_path=value;renamed=undefined;return;}
    if(!value)return;const status=value.slice(0,2);
    const item:graph_change={status:status.trim(),index_status:status[0],work_status:status[1],path:value.slice(3)};
    result.push(item);if(/[RC]/u.test(status))renamed=item;
  });
  if(renamed)throw Error('Git重命名记录不完整。');return result;
}
export async function same_git_changes(left:graph_change[],right:graph_change[]):Promise<boolean>{
  if(left.length!==right.length)return false;
  for(let i=0;i<left.length;i++){const a=left[i],b=right[i];if(a.path!==b.path||a.status!==b.status||a.old_path!==b.old_path||a.index_status!==b.index_status||a.work_status!==b.work_status)return false;if(i%1024===1023)await git_yield();}return true;
}
/** porcelain的XY就是暂存区/工作区状态，SCM不再重复diff扫描整个仓库。 */
export async function project_git_changes(changes:graph_change[]):Promise<{staged:graph_change[];unstaged:graph_change[]}>{
  const staged:graph_change[]=[],unstaged:graph_change[]=[];
  for(let i=0;i<changes.length;i++){
    const file=changes[i],conflict=['DD','AU','UD','UA','DU','AA','UU'].includes(file.status);
    const x=file.index_status||file.status[0],y=file.work_status||' ';
    if(conflict||file.status==='??')unstaged.push(file);
    else{
      if(x&&x!==' '&&x!=='?')staged.push({...file,status:x,old_path:/[RC]/u.test(x)?file.old_path:undefined});
      if(y&&y!==' ')unstaged.push({...file,status:y,old_path:/[RC]/u.test(y)?file.old_path:undefined});
    }
    if(i%1024===1023)await git_yield();
  }return {staged,unstaged};
}
/** 归并排序按比较次数让出线程，长路径/名称排序也不会形成一个大任务。 */
export async function sort_git_changes(items:graph_change[],compare:(a:graph_change,b:graph_change)=>number):Promise<graph_change[]>{
  let current=items.slice(),next=new Array<graph_change>(items.length),steps=0;
  for(let width=1;width<items.length;width*=2){
    for(let start=0;start<items.length;start+=width*2){let a=start,b=Math.min(start+width,items.length),end=b,limit=Math.min(start+width*2,items.length);
      for(let i=start;i<limit;i++){next[i]=a<end&&(b>=limit||compare(current[a],current[b])<=0)?current[a++]:current[b++];if(++steps%2048===0)await git_yield();}
    }[current,next]=[next,current];
  }return current;
}

export async function read_changes_snapshot(run:git_run,root:string,args:string[]):Promise<graph_change[]>{
  const result:graph_change[]=[];let status='',old_path:string|undefined;
  await read_git_records(run,root,args,value=>{
    if(!status){status=value;return;}
    if(/^[RC]/u.test(status)&&old_path===undefined){old_path=value;return;}
    result.push({status,path:value,...(old_path!==undefined?{old_path}:{})});status='';old_path=undefined;
  });if(status)throw Error('Git差异记录不完整。');return result;
}
