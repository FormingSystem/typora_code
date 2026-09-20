import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {build} from 'esbuild';
const bundle=await build({entryPoints:[new URL('../src/workspace_recent_service.ts',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};new Function('module','exports',bundle.outputFiles[0].text)(module,module.exports);
const {create_recent_service}=module.exports;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_recent_')),file=path.join(root,'笔记.md'),folder=path.join(root,'directory'),gone=path.join(root,'deleted.md');fs.mkdirSync(folder);fs.writeFileSync(file,'keep original');
let history={files:[{path:gone,date:4},{path:file,date:1}],folders:[{path:folder,date:3}]},epoch=0,opens=[],removed=[],notices=[],failure='',stat_override;
const invoke=async(name,target)=>{
 if(name==='setting.getRecentFiles')return structuredClone(history);
 if(failure)throw Error(failure);
 const group=name==='setting.removeRecentFolder'?'folders':'files';history[group]=history[group].filter(item=>item.path!==target);removed.push(target);
};
const service=create_recent_service({invoke,fs:{promises:{stat:target=>stat_override?stat_override(target):fs.promises.stat(target)}},path_api:path,context_epoch:()=>epoch,context_switching:()=>false,notice:message=>notices.push(message),open_file:async target=>opens.push(target),open_folder:async target=>opens.push(target),timeout_ms:30});
let items=await service.read();assert.deepEqual(items.map(item=>item.path),[folder,gone,file]);assert.equal(removed.length,0,'reading does not stat/prune offline history');
assert.equal(await service.open(items[1]),false);assert.deepEqual(removed,[gone]);assert.equal(opens.length,0);assert.equal(notices.length,1);assert(!(await service.read()).some(item=>item.path===gone));
await service.open(items[2]);await service.open(items[0]);assert.deepEqual(opens,[file,folder]);
await service.open({path:file,kind:'folder',date:0});assert(removed.includes(file),'changed type removes stale category');assert.equal(fs.readFileSync(file,'utf8'),'keep original');
for(const code of ['EACCES','EPERM','EIO']){stat_override=async()=>{throw Object.assign(Error(code),{code});};const count=removed.length;await assert.rejects(service.open(items[2]),new RegExp(code));assert.equal(removed.length,count);}
stat_override=async()=>{throw Object.assign(Error('offline'),{code:'ENOENT'});};let count=removed.length;await assert.rejects(service.open(items[2]),/暂时不可用/);assert.equal(removed.length,count);
let release;stat_override=()=>new Promise(resolve=>release=resolve);const waiting=service.open(items[2]);assert.equal(await service.open(items[2]),false,'double click only once');epoch++;release({isFile:()=>true});assert.equal(await waiting,false);assert.equal(opens.length,2);
stat_override=()=>new Promise(()=>{});await assert.rejects(service.open(items[2]),/超时/);assert.equal(removed.length,count);
stat_override=undefined;failure='denied';await assert.rejects(service.remove(items[2]),/denied/);await assert.rejects(service.clear(items),/已移除0项/);failure='';
const rounds=Number(process.env.TYPORA_STRESS_ITERATIONS||20);
for(let i=0;i<rounds;i++){
 history={files:[{path:file,date:1},{path:gone,date:2}],folders:[{path:folder,date:3}]};
 const snapshot=await service.read();await service.open(snapshot.find(item=>item.path===gone));assert.equal((await service.read()).length,2);
 history.files.push({path:path.join(root,'concurrent-new.md'),date:5});await service.clear(snapshot);assert.equal(history.files.length,1,'clear snapshot preserves different concurrent addition');
}
assert.equal(fs.readFileSync(file,'utf8'),'keep original');assert(fs.statSync(folder).isDirectory());
service.dispose();assert.deepEqual(await service.read(),[]);assert.equal(await service.open(items[2]),false);
console.log(JSON.stringify({status:'PASS',rounds,checks:['group-order','missing-prune','type-change','permission-offline-timeout','single-open','epoch-cancel','partial-failure','clear-snapshot','disk-preserved']}));
