import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {build} from 'esbuild';import editor_bundle from './editor_bundle.cjs';
const compiled=await build({stdin:{contents:'export * from "./src/workspace_native_save";export * from "./src/workspace_save_service";export * from "./src/workspace_text_document";export * from "./src/workspace_file_events";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,loader:{'.css':'text'},plugins:editor_bundle.editor_plugins()});
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const {bind_native_save}=api;
const changes=[],saved=[],settings=[];let dirty=false,foreground=false;
const file={isNode:true,option:{enableAutoSave:true,noUnsavedDraftsBackup:false},bundle:{filePath:'/fixture/a.md'},changeCounter:{isDocumentEdited:()=>dirty},
  updateChangeCount(value){assert.equal(this,file);dirty=value;return 'counter-result';},isActiveWindow(){assert.equal(this,file);return foreground;}};
const bridge={invoke(...args){assert.equal(this,bridge);if(args[0]==='reject')throw Error('IPC failure');return args;}};
const originals={change:file.updateChangeCount,active:file.isActiveWindow,invoke:bridge.invoke};
const binding=bind_native_save({File:file,JSBridge:bridge},{changed:path=>changes.push(path),saved:path=>saved.push(path),auto_save_changed:enabled=>settings.push(enabled)});
assert.equal(file.option.enableAutoSave,false);assert.equal(file.option.noUnsavedDraftsBackup,false);assert.deepEqual(settings,[]);
file.option.enableAutoSave=false;file.option.enableAutoSave=true;assert.deepEqual(settings,[false,true]);assert.equal(file.option.enableAutoSave,false);
assert.equal(file.updateChangeCount(true),'counter-result');file.updateChangeCount(false);assert.deepEqual(changes,['/fixture/a.md']);
assert.deepEqual(bridge.invoke('app.sendEvent','willSave','/fixture/a.md'),['app.sendEvent','willSave','/fixture/a.md']);assert.deepEqual(saved,[]);
bridge.invoke('app.sendEvent','didSave',{path:'/fixture/a.md'});bridge.invoke('app.sendEvent','didSave',{path:'/fixture/new-name.md'});bridge.invoke('app.sendEvent','didSave',{wrong:'invalid'});
assert.deepEqual(saved,['/fixture/a.md','/fixture/new-name.md']);assert.throws(()=>bridge.invoke('reject'),/IPC failure/);
assert.equal(file.isActiveWindow(),false);assert.equal(binding.save(()=>file.isActiveWindow()),true);assert.equal(file.isActiveWindow(),false);
let release;const pending=binding.save(()=>{assert.equal(file.isActiveWindow(),true);return new Promise(resolve=>release=resolve);});assert.equal(file.isActiveWindow(),false);release();await pending;
assert.throws(()=>binding.save(()=>{throw Error('save failure');}),/save failure/);assert.equal(file.isActiveWindow(),false);
const first_options=file.option;file.option={enableAutoSave:true,noUnsavedDraftsBackup:true};binding.sync_options();assert.equal(file.option.enableAutoSave,false);assert.equal(file.option.noUnsavedDraftsBackup,true);
binding.dispose();assert.equal(file.option.enableAutoSave,true);assert.equal(first_options.enableAutoSave,true);assert.equal(file.updateChangeCount,originals.change);assert.equal(file.isActiveWindow,originals.active);assert.equal(bridge.invoke,originals.invoke);
const other=bind_native_save({File:file,JSBridge:bridge},{changed(){},saved(){},auto_save_changed(){}}),replacement=()=>7;bridge.invoke=replacement;other.dispose();assert.equal(bridge.invoke,replacement);
// 使用实际保存服务连接源码事务和宿主 didSave；事件发出时磁盘已完成写入。
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_save_events_')),native_path=path.join(root,'native.md'),source_path=path.join(root,'source.ts');
const previous_window=globalThis.window,previous_document=globalThis.document;
globalThis.window=new EventTarget();globalThis.document=new EventTarget();
const workspace_listeners=new Set(),commands=new Set(),notices=[],completed=[];
const workspace={activeLeaf:undefined,eachLeaves(){},on(_name,listener){workspace_listeners.add(listener);return()=>workspace_listeners.delete(listener);}};
let reject_bridge=false,notice_waiter,history_updates=0;
const runtime={_options:{userDataPath:root},reqnode:name=>{assert.equal(name,'crypto');return crypto;},
  File:{isNode:true,option:{enableAutoSave:false},bundle:{filePath:native_path}},
  JSBridge:{invoke(...args){if(reject_bridge)throw Error('save did not complete');return args;}}};
const files={fs,path_api:path,context_root:()=>root,core:{Notice:class{constructor(message){notices.push(message);notice_waiter?.();}},app:{workspace,commands:{register(command){commands.add(command);return()=>commands.delete(command);}}}}};
const observe=api.observe_workspace_file_saved(event=>completed.push(event));
const service=api.bind_workspace_save_service(files,runtime);
service.subscribe_history(()=>history_updates++);
async function after_history(action){
  let stop,timer;const finished=new Promise((resolve,reject)=>{stop=service.subscribe_history(resolve);timer=setTimeout(()=>reject(Error('local history did not settle')),5000);});
  try{await action();await finished;}finally{stop();clearTimeout(timer);}
}
try{
  fs.writeFileSync(native_path,'原生已写盘\n');fs.writeFileSync(source_path,'const value = 1;\n');
  runtime.JSBridge.invoke('app.sendEvent','willSave',{path:native_path});
  runtime.JSBridge.invoke('app.sendEvent','didCancelSave',{path:native_path});
  reject_bridge=true;assert.throws(()=>runtime.JSBridge.invoke('app.sendEvent','didSave',{path:native_path}),/did not complete/);reject_bridge=false;
  assert.equal(completed.length,0);assert.equal(history_updates,0);assert.deepEqual(await service.history.list(native_path),[]);
  await after_history(()=>runtime.JSBridge.invoke('app.sendEvent','didSave',{path:native_path}));
  assert.equal(completed.length,1,'原生 didSave 必须发布一次共享保存完成通知');assert.equal(completed[0].file_path,native_path);assert.equal(completed[0].bytes,undefined);
  const native_entries=await service.history.list(native_path);assert.equal(native_entries.length,1);assert.equal(native_entries[0].source,'File Saved');assert.deepEqual(Buffer.from(await service.history.read(native_entries[0])),fs.readFileSync(native_path));
  const document=api.create_text_document({fs,path_api:path},source_path);await document.load();
  await after_history(()=>document.save('const value = 2;\n'));
  assert.equal(completed.length,2,'源码事务保存也只发布一次共享通知');assert.equal(completed[1].file_path,source_path);assert.deepEqual(Buffer.from(completed[1].bytes),fs.readFileSync(source_path));
  const source_entries=await service.history.list(source_path);assert.equal(source_entries.length,1);assert.equal(source_entries[0].source,'File Saved');assert.deepEqual(Buffer.from(await service.history.read(source_entries[0])),fs.readFileSync(source_path));
  fs.writeFileSync(source_path,'external edit\n');await assert.rejects(document.save('conflicting\n'),/变化|修改|changed/u);assert.equal(completed.length,2);assert.equal(history_updates,2);
  const history_failure=new Promise(resolve=>{notice_waiter=resolve;});
  runtime.JSBridge.invoke('app.sendEvent','didSave',{path:path.join(root,'removed-after-save.md')});await history_failure;notice_waiter=undefined;
  assert.equal(completed.length,3,'历史采集失败不阻断已经成功的保存通知');assert.match(notices[0],/^文件已保存，但本地历史写入失败：/u);
  let finish_capture;service.history.capture=()=>new Promise(resolve=>{finish_capture=resolve;});
  runtime.JSBridge.invoke('app.sendEvent','didSave',{path:native_path});assert.equal(completed.length,4);
  service.dispose();finish_capture();await Promise.resolve();await Promise.resolve();assert.equal(history_updates,2,'销毁后的历史完成不能重新通知界面');
  runtime.JSBridge.invoke('app.sendEvent','didSave',{path:native_path});assert.equal(completed.length,4,'销毁后恢复宿主，不再发布完成通知');
  api.publish_workspace_file_saved({file_path:source_path,bytes:Buffer.from('after dispose')});await service.history.flush();
  assert.equal(history_updates,2);assert.equal((await service.history.list(source_path))[0].id,source_entries[0].id);assert.equal(workspace_listeners.size,0);assert.equal(commands.size,0);
}finally{
  service.dispose();observe();
  if(previous_window===undefined)delete globalThis.window;else globalThis.window=previous_window;
  if(previous_document===undefined)delete globalThis.document;else globalThis.document=previous_document;
}
console.log(JSON.stringify({status:'PASS',checks:['one runtime auto-save owner while draft backups remain enabled','native settings route to shared save policy','native dirty changes and successful didSave only','Save As records resulting path','this, return values and exceptions preserved','window-blur save permission ends before asynchronous continuation','option replacement and cleanup preserve later owners','native and source saves publish once through actual shared service','cancelled and failed saves publish nothing','optional native bytes preserve history capture and failure feedback','dispose detaches save events and suppresses late history notifications'],evidence:root}));
