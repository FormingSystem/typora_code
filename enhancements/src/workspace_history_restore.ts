import {workspace_text} from "./workspace_i18n";
import type {local_history_entry,local_history_store} from "./workspace_local_history";
import {publish_workspace_file_saved} from "./workspace_file_events";

/** Existing files are verified according to expected bytes and identity; deleted files are published via hard links, never overwrite files created in advance. */
export async function restore_history_entry(modules:{fs:any;path_api:any},store:local_history_store,entry:local_history_entry,expected_hash:string|undefined,valid:()=>boolean){
  const fs=modules.fs.promises,path=modules.path_api,target=entry.file_path;
  if(!path.isAbsolute(target))throw new Error(workspace_text("history_restore_invalid_recovery_target"));
  const bytes=await store.read(entry);let before:Uint8Array|undefined,identity:string|undefined;
  const fingerprint=(stat:any)=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(":");
  const verify=async()=>{
    if(!valid())throw new Error(workspace_text("history_restore_editor_content_or_target_has_changed_recovery_not_performed"));
    let stat:any;try{stat=await fs.lstat(target);}catch(error){if((error as any).code==="ENOENT"&&expected_hash===undefined)return;throw new Error(workspace_text("history_restore_target_for_recovery_has_changed"));}
    if(!stat.isFile()||stat.isSymbolicLink()||expected_hash===undefined)throw new Error(workspace_text("history_restore_target_for_recovery_has_changed"));
    if((stat.mode&0o222)===0)throw new Error(workspace_text("history_restore_recovery_target_is_a_read_only_file"));
    if(identity&&fingerprint(stat)!==identity)throw new Error(workspace_text("history_restore_file_has_changed_please_refresh_the_comparison_before_recove"));
    const current=await store.read_snapshot(target);
    if(store.hash(current)!==expected_hash)throw new Error(workspace_text("history_restore_file_has_changed_please_refresh_the_comparison_before_recove"));
    identity=fingerprint(stat);before=current;
  };
  await verify();
  if(before){const backup=await store.record(target,before,"Before Restore",true);if(!backup)throw new Error(workspace_text("history_restore_cannot_retain_the_content_before_recovery_please_check_the_s"));}
  if(!valid())throw new Error(workspace_text("history_restore_recovery_has_been_canceled"));
  const parent=await fs.realpath(path.dirname(target)),parent_stat=await fs.stat(parent);
  const temporary=path.join(parent,".typora-history-"+globalThis.crypto.randomUUID()+".tmp");
  let exists=false;
  try{
    const mode=before?(await fs.stat(target)).mode&0o777:0o666;
    const handle=await fs.open(temporary,"wx",mode);exists=true;try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    await verify();const current_parent=await fs.stat(parent);
    if(await fs.realpath(path.dirname(target))!==parent||current_parent.ino!==parent_stat.ino||current_parent.dev!==parent_stat.dev)throw new Error(workspace_text("history_restore_recovery_target_directory_has_changed"));
    if(!valid())throw new Error(workspace_text("history_restore_recovery_has_been_canceled"));
    if(expected_hash===undefined)await fs.link(temporary,target);else{await fs.rename(temporary,target);exists=false;}
    if(store.hash(await store.read_snapshot(target))!==store.hash(bytes))throw new Error(workspace_text("history_restore_file_has_changed_after_recovery_please_reopen_and_check_agai"));
    publish_workspace_file_saved({file_path:target,bytes,source:"File Restored"});
  }finally{if(exists)await fs.unlink(temporary).catch(()=>{});}
}
