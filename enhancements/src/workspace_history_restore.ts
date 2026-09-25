import type {local_history_entry,local_history_store} from "./workspace_local_history";
import {publish_workspace_file_saved} from "./workspace_file_events";

/** 已存在文件按预期字节和身份校验；删除文件通过硬链接发布，绝不覆盖抢先创建的文件。 */
export async function restore_history_entry(modules:{fs:any;path_api:any},store:local_history_store,entry:local_history_entry,expected_hash:string|undefined,valid:()=>boolean){
  const fs=modules.fs.promises,path=modules.path_api,target=entry.file_path;
  if(!path.isAbsolute(target))throw new Error("恢复目标无效。");
  const bytes=await store.read(entry);let before:Uint8Array|undefined,identity:string|undefined;
  const fingerprint=(stat:any)=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(":");
  const verify=async()=>{
    if(!valid())throw new Error("编辑器内容或目标已变化，未执行恢复。");
    let stat:any;try{stat=await fs.lstat(target);}catch(error){if((error as any).code==="ENOENT"&&expected_hash===undefined)return;throw new Error("恢复目标已经变化。");}
    if(!stat.isFile()||stat.isSymbolicLink()||expected_hash===undefined)throw new Error("恢复目标已经变化。");
    if((stat.mode&0o222)===0)throw new Error("恢复目标为只读文件。");
    if(identity&&fingerprint(stat)!==identity)throw new Error("文件已变化，请刷新比较后再恢复。");
    const current=await store.read_snapshot(target);
    if(store.hash(current)!==expected_hash)throw new Error("文件已变化，请刷新比较后再恢复。");
    identity=fingerprint(stat);before=current;
  };
  await verify();
  if(before){const backup=await store.record(target,before,"Before Restore",true);if(!backup)throw new Error("无法保留恢复前内容，请先检查本地历史大小或排除设置。");}
  if(!valid())throw new Error("恢复已取消。");
  const parent=await fs.realpath(path.dirname(target)),parent_stat=await fs.stat(parent);
  const temporary=path.join(parent,".typora-history-"+globalThis.crypto.randomUUID()+".tmp");
  let exists=false;
  try{
    const mode=before?(await fs.stat(target)).mode&0o777:0o666;
    const handle=await fs.open(temporary,"wx",mode);exists=true;try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    await verify();const current_parent=await fs.stat(parent);
    if(await fs.realpath(path.dirname(target))!==parent||current_parent.ino!==parent_stat.ino||current_parent.dev!==parent_stat.dev)throw new Error("恢复目标目录已变化。");
    if(!valid())throw new Error("恢复已取消。");
    if(expected_hash===undefined)await fs.link(temporary,target);else{await fs.rename(temporary,target);exists=false;}
    if(store.hash(await store.read_snapshot(target))!==store.hash(bytes))throw new Error("恢复后文件已变化，请重新打开检查。");
    publish_workspace_file_saved({file_path:target,bytes,source:"File Restored"});
  }finally{if(exists)await fs.unlink(temporary).catch(()=>{});}
}
