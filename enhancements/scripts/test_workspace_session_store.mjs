import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/workspace_session_store.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {create_workspace_session_store:create}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'typora_sessions_')),store=create(fs,path,crypto,dir),a=path.join(dir,'A'),b=path.join(dir,'B');
const file={path:path.join(a,'file.md'),source:false,pinned:true};
for(const cycles of [20,100,1000]){
 for(let i=0;i<cycles;i++){store.write(a,[file],0);store.write(b,[],-1);const reopened=create(fs,path,crypto,dir);assert.deepEqual(reopened.read(a).files,[file]);assert.equal(reopened.read(a).active,0);assert.deepEqual(reopened.read(b).files,[]);}
 console.log('PASS disk session isolation and independent reader: '+cycles);
}
assert.equal(store.read(path.join(dir,'missing')),undefined);
assert.throws(()=>store.write(a,[{...file,path:'typ://core.empty/'}],0));
assert.throws(()=>store.write(a,[file],1));
store.write(a,Array.from({length:1001},(_,i)=>({...file,path:path.join(a,'file-'+i+'.md')})),1000);assert.equal(store.read(a).files.length,1001);store.write(a,[file],0);
const failing=create({...fs,renameSync(){throw Error('denied');}},path,crypto,dir);
assert.throws(()=>failing.write(a,[],-1),/denied/);assert.deepEqual(store.read(a).files,[file]);assert(!fs.readdirSync(dir).some(name=>name.endsWith('.tmp')));
const target=path.join(dir,crypto.createHash('sha256').update(store.root_key(a)).digest('hex')+'.json');fs.writeFileSync(target,'{bad');assert.throws(()=>store.read(a));
fs.writeFileSync(target,'x'.repeat(2*1024*1024+1));assert.throws(()=>store.read(a),SyntaxError);
const big_files=Array.from({length:12000},(_,i)=>({...file,path:path.join(a,'x'.repeat(200)+i+'.md')}));store.write(a,big_files,11999);assert(fs.statSync(target).size>2*1024*1024);assert.deepEqual(store.read(a).files,big_files);
const win=create(fs,path.win32,crypto,dir);assert.equal(win.root_key('C:\\Workspace\\'),win.root_key('c:\\workspace'));
console.log('PASS empty, invalid, corrupt, large complete sessions and atomic failure preservation; Windows root normalization');
let replacements=0;
const counted=create({...fs,renameSync(...args){replacements++;fs.renameSync(...args);}},path,crypto,dir);
counted.write(a,[file],0);
for(let i=0;i<1000;i++)counted.write(a,[file],0);
assert.equal(replacements,1,'相同会话连续1000次事件不反复替换文件');
counted.write(a,[],-1);assert.equal(replacements,2,'实际会话变化仍写入');
assert.deepEqual(counted.read(a).files,[]);

// 启动意图在异步恢复之前捕获；拖放附窗不读写目录会话，正常窗口和主动切目录继续恢复。
const session_bundle=await build({entryPoints:['src/workspace_sessions.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {bind_workspace_sessions:bind_sessions}=await import('data:text/javascript;base64,'+Buffer.from(session_bundle.outputFiles[0].text).toString('base64'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const session_user=fs.mkdtempSync(path.join(os.tmpdir(),'typora_session_intent_'));
const service_store=create(fs,path,crypto,path.join(session_user,'typora_code','state','workspace_sessions'));
const saved_files=[{path:path.join(a,'one.c'),source:true,pinned:false},{path:path.join(a,'two.c'),source:true,pinned:true}];
const cases=[
 {name:'transfer',anchor:'#typora-code-window-'+crypto.randomUUID(),initial_file:'',auxiliary:true},
 {name:'invalid token',anchor:'#typora-code-window-bad',initial_file:'',auxiliary:false},
 {name:'normal',anchor:'#',initial_file:'',auxiliary:false},
 {name:'explicit file',anchor:'#typora-code-window-'+crypto.randomUUID(),initial_file:path.join(a,'one.c'),auxiliary:false},
];
for(const scenario of cases){
 service_store.write(a,saved_files,1);
 const original_session=JSON.stringify(service_store.read(a)),opened=[],listeners=new Set();let current_root=a;
 const workspace={activeLeaf:undefined,eachLeaves(){},on(_event,callback){listeners.add(callback);return()=>listeners.delete(callback);}};
 const runtime=Object.assign(new EventTarget(),{_options:{userDataPath:session_user,initAnchor:scenario.anchor,initFilePath:scenario.initial_file},reqnode:()=>crypto,JSBridge:{invoke:async()=>({restoreWhenLaunch:2})}});
 globalThis.window=runtime;globalThis.document={documentElement:{dataset:{linuxNoteTyporaEnhancements:'loading'}}};
 const files={fs,path_api:path,context_root:()=>current_root,core:{app:{workspace},Notice:class{constructor(message){throw Error(message)}}},editor_state:leaf=>({file_path:leaf.path,kind:'source',dirty:false,busy:false}),keep_open(){},async restore_files(){},async open_file(file){opened.push(file);workspace.activeLeaf={path:file,state:{}};}};
 const binding=bind_sessions(files);runtime._options.initAnchor='';document.documentElement.dataset.linuxNoteTyporaEnhancements='ready';await binding.ready;
 assert.equal(opened.length,scenario.auxiliary?0:1,scenario.name+' restores only regular window');
 for(const callback of listeners)callback();await delay(180);runtime.dispatchEvent(new Event('beforeunload'));
 if(scenario.auxiliary){
  assert.equal(JSON.stringify(service_store.read(a)),original_session,'empty or transferred auxiliary never overwrites original session');
  binding.suspend();service_store.write(b,[saved_files[1]],0);current_root=b;await binding.resume(true);
  assert.deepEqual(opened,[saved_files[1].path],'explicit directory switch resumes regular restore');
 }
 binding.dispose();assert.equal(listeners.size,0);
}
delete globalThis.window;delete globalThis.document;
console.log('PASS transfer startup suppresses restore and persistence; consumed/invalid anchors, explicit file and later folder switch');
