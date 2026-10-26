import './fixture_locale.cjs';
// Only operate on the temporary directory created this time; the recycle bin callback is also redirected to the same temporary tree.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
const bundle = await build({stdin:{contents:'export * from "./src/workspace_file_operations";export * from "./src/workspace_file_operation";',resolveDir:path.dirname(path.dirname(fileURLToPath(import.meta.url)))},bundle:true,platform:"node",format:"esm",write:false});
const {prepare_workspace_removal,permanently_remove_path,create_workspace_file_operation,create_workspace_entry:create,transfer_workspace_entries:transfer,trash_workspace_entries:trash}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"typora_file_operations_")),root=path.join(temporary,"root"),recycle=path.join(temporary,"recycle");fs.mkdirSync(root);fs.mkdirSync(recycle);
const modules={fs,path_api:path};
try {
  await create(modules,root,root,"source",true);await create(modules,root,root,"target",true);await create(modules,root,root,"empty.txt",false);
  await assert.rejects(create(modules,root,root,"empty.txt",false));await assert.rejects(create(modules,root,root,"../escape",false));await assert.rejects(create(modules,root,temporary,"escape",false));
  const source=path.join(root,"source"),target=path.join(root,"target");fs.writeFileSync(path.join(source,"a.txt"),"content α");fs.mkdirSync(path.join(source,"nested"));fs.writeFileSync(path.join(source,"nested","b.bin"),Buffer.from([0,1,255]));
  await transfer(modules,root,[source],target);assert.equal(fs.readFileSync(path.join(target,"source","a.txt"),"utf8"),"content α");assert.deepEqual(fs.readFileSync(path.join(target,"source","nested","b.bin")),Buffer.from([0,1,255]));
  await assert.rejects(transfer(modules,root,[source],target),/同名/);await assert.rejects(transfer(modules,root,[source],source),/自身/);await assert.rejects(transfer(modules,root,[root],target));
  const failure=path.join(root,"failure");fs.mkdirSync(failure);
  const faulty={...fs,promises:{...fs.promises,open:async(file,flags)=>{if(file===path.join(source,"nested","b.bin")&&flags==="r")throw new Error("injected read failure");return fs.promises.open(file,flags)}}};
  await assert.rejects(transfer({fs:faulty,path_api:path},root,[source],failure),/injected/);assert.deepEqual(fs.readdirSync(failure),[],"failed recursive copy removes only entries it created");assert(fs.existsSync(source));
  const retained=path.join(root,"retained");fs.mkdirSync(retained);
  const concurrent={...fs,promises:{...fs.promises,open:async(file,flags)=>{if(file===path.join(source,"nested","b.bin")&&flags==="r"){fs.writeFileSync(path.join(retained,"source","external.txt"),"another writer");throw new Error("injected concurrent failure")}return fs.promises.open(file,flags)}}};
  await assert.rejects(transfer({fs:concurrent,path_api:path},root,[source],retained),error=>error.remaining_paths.includes(path.join(retained,"source")));assert.equal(fs.readFileSync(path.join(retained,"source","external.txt"),"utf8"),"another writer");
  let move_count=0;const move=async(_root,from,to)=>{move_count++;if(from===path.join(root,"empty.txt"))throw new Error("injected move failure");await fs.promises.rename(from,to);return to};
  await assert.rejects(transfer(modules,root,[source,path.join(root,"empty.txt")],failure,move),/injected move/);assert.equal(move_count,3);assert(fs.existsSync(source));assert.deepEqual(fs.readdirSync(failure),[]);
  let trash_count=0;await assert.rejects(trash(modules,root,[path.join(root,"empty.txt"),source],async file=>{if(++trash_count===2)throw new Error("injected recycle failure");await fs.promises.rename(file,path.join(recycle,path.basename(file)))}),error=>error.removed_paths.length===1);assert(fs.existsSync(path.join(recycle,"empty.txt")));assert(fs.existsSync(source));
  await assert.rejects(trash(modules,root,[root],async()=>assert.fail("root never reaches recycle")));
  const link=path.join(root,"link");let link_supported=true;try{fs.symlinkSync(source,link,process.platform==="win32"?"junction":"dir")}catch{link_supported=false}
  if(link_supported){await assert.rejects(create(modules,root,link,"escape.txt",false),/符号链接/);await assert.rejects(transfer(modules,root,[link],failure),/符号链接/);}
  const outside=path.join(temporary,'外部 folder'),outside_target=path.join(root,'external_target');fs.mkdirSync(outside);fs.mkdirSync(outside_target);fs.writeFileSync(path.join(outside,'unicode 空格.bin'),Buffer.from([0,128,255]));
  await assert.rejects(transfer(modules,root,[outside],outside_target),/工作区/);
  await transfer(modules,root,[outside,path.join(outside,'unicode 空格.bin')],outside_target,undefined,true);
  assert.deepEqual(fs.readFileSync(path.join(outside_target,'外部 folder','unicode 空格.bin')),Buffer.from([0,128,255]));assert(fs.existsSync(outside));
  await assert.rejects(transfer(modules,root,[outside],outside_target,undefined,true),/同名/);
  await assert.rejects(transfer(modules,root,[outside],outside_target,move,true),/仅支持复制/);
  await assert.rejects(transfer(modules,root,[root],outside_target,undefined,true),/自身/);
  const outside_failure=path.join(root,'external_failure');fs.mkdirSync(outside_failure);
  const bad_external={...fs,promises:{...fs.promises,open:async(file,flags)=>{if(file===path.join(outside,'unicode 空格.bin')&&flags==='r')throw Error('external read failed');return fs.promises.open(file,flags)}}};
  await assert.rejects(transfer({fs:bad_external,path_api:path},root,[outside],outside_failure,undefined,true),/external read failed/);assert.deepEqual(fs.readdirSync(outside_failure),[]);
  if(link_supported){const outside_link=path.join(temporary,'outside_link');fs.symlinkSync(outside,outside_link,process.platform==='win32'?'junction':'dir');await assert.rejects(transfer(modules,root,[path.join(outside_link,'unicode 空格.bin')],outside_failure,undefined,true),/符号链接/);}
  await assert.rejects(transfer(modules,root,['relative'],outside_target,undefined,true),/绝对路径/);
  const history_bundle=await build({entryPoints:[fileURLToPath(new URL('../src/workspace_file_history.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
  const {create_workspace_file_history}=await import('data:text/javascript;base64,'+Buffer.from(history_bundle.outputFiles[0].text).toString('base64'));
  const rename_bundle=await build({entryPoints:[fileURLToPath(new URL('../src/workspace_rename.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
  const {prepare_workspace_move}=await import('data:text/javascript;base64,'+Buffer.from(rename_bundle.outputFiles[0].text).toString('base64'));
  let current_root=root,fail_source='',fail_rollback=false;
  const raw_move=async(base,source,target)=>{if(source===fail_source||(fail_rollback&&source===b))throw Error('injected move failure');const plan=await prepare_workspace_move(modules,base,source,target);await plan.apply();return target;};
  const history=create_workspace_file_history(modules,()=>current_root,raw_move);
  const a=path.join(root,'undo_a.txt'),b=path.join(root,'undo_b.txt'),ta=path.join(target,'undo_a.txt'),tb=path.join(target,'undo_b.txt');
  fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');
  await history.record(root,move=>transfer(modules,root,[a,b],target,move));assert(history.can());
  await history.replay(root);assert(fs.existsSync(a)&&fs.existsSync(b)&&!fs.existsSync(ta));assert(history.can(true));
  await history.replay(root,true);assert(fs.existsSync(ta)&&fs.existsSync(tb));
  fs.writeFileSync(a,'external collision');await assert.rejects(history.replay(root));assert(fs.existsSync(tb)&&fs.readFileSync(a,'utf8')==='external collision');fs.unlinkSync(a);
  // The first reversed item moves, then the second fails; the first must return.
  fail_source=ta;await assert.rejects(history.replay(root),/injected/);assert(fs.existsSync(ta)&&fs.existsSync(tb)&&!fs.existsSync(b));assert(history.can());fail_source='';
  fs.writeFileSync(ta,'changed after move');await history.replay(root);assert.equal(fs.readFileSync(a,'utf8'),'changed after move');
  const renamed=path.join(root,'renamed.txt');await history.record(root,move=>move(root,a,renamed));assert(!history.can(true));await history.replay(root);assert(fs.existsSync(a));
  history.clear();fail_source=b;await assert.rejects(history.record(root,move=>transfer(modules,root,[a,b],target,move)),/injected/);assert(!history.can()&&fs.existsSync(a)&&fs.existsSync(b));fail_source='';
  for(const rounds of [20,100,1000]){for(let i=0;i<rounds;i++){await history.record(root,move=>move(root,a,ta));await history.replay(root);await history.replay(root,true);await history.replay(root);}assert(fs.existsSync(a)&&!fs.existsSync(ta));}
  const directory=path.join(root,'undo_folder'),moved_directory=path.join(target,'undo_folder');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'child'),'keep');
  await history.record(root,move=>transfer(modules,root,[directory,path.join(directory,'child')],target,move));await history.replay(root);assert(fs.existsSync(path.join(directory,'child'))&&!fs.existsSync(moved_directory));
  await history.record(root,move=>move(root,a,ta));current_root=temporary;assert(!history.can());current_root=root;assert(!history.can());await raw_move(root,ta,a);
  let release;const pending=history.record(root,async move=>{await new Promise(resolve=>release=resolve);return move(root,a,ta);});await assert.rejects(history.replay(root),/正在进行/);release();await pending;await history.replay(root);
  await history.record(root,move=>transfer(modules,root,[a,b],target,move));fail_source=ta;fail_rollback=true;await assert.rejects(history.replay(root));assert(!history.can()&&!history.can(true));fail_source='';fail_rollback=false;
  // Pending native work retains exclusion; timeout observation never claims cancellation.
  let task_epoch=0,task_calls=0,release_task,previous_task;
  const tasks=create_workspace_file_operation((expected,epoch)=>{assert.equal(expected,root);if(epoch!==task_epoch)throw Error('stale owner');},()=>task_epoch);
  const states=[],stop_states=tasks.subscribe(state=>states.push(state));
  const pending_task=tasks.run(root,[a],'prepare',async context=>{previous_task=context;task_calls++;context.phase('executing','native pending');await new Promise(resolve=>release_task=resolve);context.phase('verifying','verify');});
  assert.equal(tasks.state.busy,true);assert.equal(tasks.state.phase,'executing');
  await assert.rejects(tasks.run(root,[a],'duplicate',async()=>{task_calls++;}),/正在进行/);
  assert.throws(()=>tasks.dispose(),/正在进行/);
  await new Promise(resolve=>setTimeout(resolve,5100));assert.equal(tasks.state.phase,'waiting');assert.equal(tasks.state.busy,true);assert.equal(task_calls,1);
  release_task();await pending_task;assert.equal(tasks.state.phase,'succeeded');
  let release_refresh;const stop_refresh=tasks.on_refresh(()=>new Promise(resolve=>release_refresh=resolve));
  const task_failure=tasks.run(root,[a],'prepare',async()=>{throw Error('provider failed');},{refresh:true});
  const current_task_id=tasks.state.id;previous_task.phase('executing','obsolete');previous_task.completed(b);assert.equal(tasks.state.id,current_task_id);assert.notEqual(tasks.state.label,'obsolete');assert.deepEqual(tasks.state.completed_paths,[]);assert.throws(()=>previous_task.checkpoint(),error=>error.name==='AbortError');
  const rejected=assert.rejects(task_failure,/provider failed/);
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(tasks.state.phase,'refreshing');assert.equal(tasks.state.error,'provider failed');assert(tasks.state.busy);
  release_refresh();await rejected;stop_refresh();assert.equal(tasks.state.error,'provider failed');
  let release_batch;const batch=tasks.run(root,[a,b],'batch',async context=>{context.phase('executing','first');await new Promise(resolve=>release_batch=resolve);context.completed(a);context.checkpoint();assert.fail('cancelled batch must not start next item');},{cancelable:true});
  const batch_rejected=assert.rejects(batch,error=>error.name==='AbortError'&&error.removed_paths[0]===a);
  tasks.cancel();assert(tasks.state.busy&&tasks.state.cancel_requested);release_batch();await batch_rejected;
  assert.equal(tasks.state.phase,'cancelled');assert.deepEqual(tasks.state.completed_paths,[a]);
  const cancel_first=path.join(root,'cancel_first.txt'),cancel_second=path.join(root,'cancel_second.txt');
  fs.writeFileSync(cancel_first,'first');fs.writeFileSync(cancel_second,'second');
  await assert.rejects(tasks.run(root,[cancel_first,cancel_second],'real batch adapter',context=>trash(modules,root,[cancel_first,cancel_second],async file=>{
    context.checkpoint();await fs.promises.rename(file,path.join(recycle,path.basename(file)));context.completed(file);tasks.cancel();
  }),{cancelable:true}),error=>error.name==='AbortError'&&error.removed_paths[0]===cancel_first);
  assert.equal(tasks.state.phase,'cancelled');assert.deepEqual(tasks.state.completed_paths,[cancel_first]);
  assert.equal(fs.readFileSync(cancel_second,'utf8'),'second');assert(!fs.existsSync(cancel_first));
  const permanent=path.join(root,'permanent'),external_keep=path.join(temporary,'external_keep');fs.mkdirSync(permanent);fs.mkdirSync(external_keep);fs.writeFileSync(path.join(external_keep,'keep.txt'),'external');
  let deep=permanent;while(deep.length<320)deep=path.join(deep,'nested_segment_0123456789');fs.mkdirSync(deep,{recursive:true});fs.writeFileSync(path.join(deep,'object.o'),'long');fs.writeFileSync(path.join(permanent,'readonly.txt'),'readonly');fs.chmodSync(path.join(permanent,'readonly.txt'),0o444);
  if(link_supported){fs.symlinkSync(external_keep,path.join(permanent,'live_link'),process.platform==='win32'?'junction':'dir');fs.symlinkSync(path.join(temporary,'missing'),path.join(permanent,'broken_link'),process.platform==='win32'?'junction':'dir');}
  const delete_plan=await prepare_workspace_removal(modules,root,[permanent]);assert(fs.existsSync(permanent),'preparation never deletes');
  await delete_plan(file=>permanently_remove_path(modules,file));assert(!fs.existsSync(permanent));assert.equal(fs.readFileSync(path.join(external_keep,'keep.txt'),'utf8'),'external');await assert.rejects(delete_plan(()=>assert.fail('single use')));
  const replacement=path.join(root,'replacement');fs.mkdirSync(replacement);const stale_plan=await prepare_workspace_removal(modules,root,[replacement]);fs.renameSync(replacement,replacement+'_old');fs.mkdirSync(replacement);fs.writeFileSync(path.join(replacement,'keep'),'new');
  await assert.rejects(stale_plan(file=>permanently_remove_path(modules,file)),/变化/);assert.equal(fs.readFileSync(path.join(replacement,'keep'),'utf8'),'new');
  await assert.rejects(permanently_remove_path({fs:{promises:{rm:async()=>{throw Error('controlled disk failure');}}},path_api:path},replacement),error=>error.message.includes('部分删除')&&error.message.includes('controlled disk failure'));assert(fs.existsSync(replacement));
  await assert.rejects(tasks.run(root,[a],'stale',async context=>{task_epoch++;context.checkpoint();}),/stale owner/);
  const stop_bad_refresh=tasks.on_refresh(async()=>{throw Error('refresh failed');});
  await assert.rejects(tasks.run(root,[a],'partial',async context=>{context.completed(a);throw Error('editor cleanup failed');},{refresh:true}),error=>error.message.includes('editor cleanup failed')&&error.message.includes('refresh failed')&&error.message.includes(a));stop_bad_refresh();
  for(const iterations of [20,100,1000])for(let index=0;index<iterations;index++){
    await tasks.run(root,[a],'cycle',async context=>{context.phase('executing','cycle');context.completed(a);});
    assert.equal(tasks.state.busy,false);assert.equal(tasks.state.error,'');assert.equal(tasks.state.completed_paths.length,1);
  }
  assert(states.some(state=>state.phase==='waiting'));stop_states();tasks.dispose();
  console.log('PASS file tasks: pending feedback/exclusion, late settlement, failure before refresh, partial cancellation, stale owner, cleanup/refresh errors and 1120 state cycles');
  console.log('PASS file history: batch/rename/folder, conflict, edited content, rollback, root/busy/redo guards and 1120 undo/redo cycles');
  console.log(JSON.stringify({status:"PASS",checks:["exclusive creation and workspace boundary","recursive binary copy","collision preserves target","copy into self rejected","copy failure rollback","concurrent external file retained during rollback","move callback and batch rollback","recycle partial completion report","root protection","symlink rejection","external Unicode folder and binary copy","external source survives failures","separate source and destination boundaries","external move and ancestor symlink rejected"],link_supported}));
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
