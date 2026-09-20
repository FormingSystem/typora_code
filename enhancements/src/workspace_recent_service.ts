export type recent_item={path:string;kind:"file"|"folder";date:number};
export type recent_ports={
  invoke(name:string,...args:unknown[]):Promise<any>;fs:any;path_api:any;
  open_file(path:string):Promise<unknown>;open_folder(path:string):Promise<unknown>;
  context_epoch():number;context_switching():boolean;notice(message:string):void;
  timeout_ms?:number;
};

/** 主进程拥有历史；这里仅持有一次操作，不复制/回写整份历史配置。 */
export function create_recent_service(ports:recent_ports){
  let disposed=false,pending=false;
  const bounded=<T>(operation:Promise<T>):Promise<T>=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("读取最近项目超时，请检查磁盘连接后重试。")),ports.timeout_ms??2500);
    operation.then(resolve,reject).finally(()=>clearTimeout(timer));
  });
  const key=(item:recent_item)=>item.kind+":"+(ports.path_api.sep==="\\"?item.path.toLowerCase():item.path);
  const read=async():Promise<recent_item[]>=>{
    const data=await bounded(ports.invoke("setting.getRecentFiles"));if(disposed)return [];
    const seen=new Set<string>(),result:recent_item[]=[];
    for(const [group,kind]of [["folders","folder"],["files","file"]]as const){
      const items:recent_item[]=[];
      for(const item of Array.isArray(data?.[group])?data[group]:[]){
        if(typeof item?.path!=="string"||!ports.path_api.isAbsolute(item.path))continue;
        const entry:recent_item={path:ports.path_api.normalize(item.path),kind,date:Number(item.date)||0};
        if(!seen.has(key(entry))){seen.add(key(entry));items.push(entry);}
      }
      result.push(...items.sort((left,right)=>right.date-left.date));
    }
    return result;
  };
  const remove=async(item:recent_item)=>{
    if(disposed)return;
    await ports.invoke(item.kind==="folder"?"setting.removeRecentFolder":"setting.removeRecentDocument",item.path);
  };
  const missing=(error:any)=>error?.code==="ENOENT"||error?.code==="ENOTDIR";
  const available=async(item:recent_item):Promise<boolean>=>{
    try{const stat:any=await bounded(ports.fs.promises.stat(item.path));return item.kind==="folder"?stat.isDirectory():stat.isFile();}
    catch(error){
      if(!missing(error))throw error;
      // 离线盘/网络共享的ENOENT不能作为删除历史的证据。
      const root=ports.path_api.parse(item.path).root;
      try{const stat:any=await bounded(ports.fs.promises.stat(root));if(!stat.isDirectory())throw error;}
      catch{throw new Error("磁盘或共享位置暂时不可用，已保留最近记录："+item.path);}
      return false;
    }
  };
  const forget_missing=async(item:recent_item)=>{
    await remove(item);
    ports.notice("项目已不存在或类型已改变，已从最近打开中移除："+item.path);
  };
  const open=async(item:recent_item,valid:()=>boolean=()=>true):Promise<boolean>=>{
    if(disposed||pending||ports.context_switching()||!valid())return false;
    if(!ports.path_api.isAbsolute(item.path)||!["file","folder"].includes(item.kind))throw new Error("最近项目路径无效。");
    pending=true;const epoch=ports.context_epoch();
    const active=()=>!disposed&&valid()&&!ports.context_switching()&&ports.context_epoch()===epoch;
    try{
      const exists=await available(item);if(!active())return false;
      if(!exists){await forget_missing(item);return false;}
      try{if(item.kind==="folder")await ports.open_folder(item.path);else await ports.open_file(item.path);}
      catch(error){if(active()&&missing(error)&&!(await available(item))){if(active())await forget_missing(item);return false;}throw error;}
      return true;
    }finally{pending=false;}
  };
  const clear=async(items:recent_item[])=>{
    let removed=0;
    for(const item of items){if(disposed)return;try{await remove(item);removed++;}catch(error){throw new Error(`已移除${removed}项，剩余记录清理失败：${String(error)}`);}}
  };
  return {read,remove,clear,open,dispose(){disposed=true;}};
}
export type recent_service=ReturnType<typeof create_recent_service>;
