import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {build} from 'esbuild';

const iterations=Number(process.env.TYPORA_STRESS_ITERATIONS||20);
assert([20,100,1000].includes(iterations));
const bundle=await build({stdin:{contents:'export * from "./src/workspace_native_trash";export {repository_head_label,parse_status} from "./src/git_graph_repository";export {bind_workspace_open_dialog} from "./src/workspace_open_dialog";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_stability_'));
const recycled=path.join(root,'recycled');fs.mkdirSync(recycled);
const require_node=name=>name==='fs'?fs:name==='path'?path:{shell:{trashItem:()=>{throw Error('不应重试renderer回收')}}};
const state=changes=>({branch:'feature/a',head:'1234567890',changes:api.parse_status(changes),operation:'',refs:[]});
assert.equal(api.repository_head_label(state('')),'feature/a');
assert.equal(api.repository_head_label(state('M  file\0')),'feature/a+');
assert.equal(api.repository_head_label(state(' M file\0?? new\0')),'feature/a*');
assert.equal(api.repository_head_label(state('MM file\0')),'feature/a*+');
assert.equal(api.repository_head_label({...state('UU conflict\0'),operation:'merge'}),'feature/a*+!');
assert.equal(api.repository_head_label({...state(''),branch:''}),'12345678');
let attempts=0;
for(let index=0;index<iterations;index++) {
  const file=path.join(root,'文件 '+index);fs.writeFileSync(file,'original '+index);
  const runtime={reqnode:require_node,JSBridge:{invoke:async(command,target)=>{assert.equal(command,'shell.trashItem');attempts++;await fs.promises.rename(target,path.join(recycled,path.basename(target)));return true;}}};
  await api.trash_native_path(runtime,file);
  assert.equal(fs.readFileSync(path.join(recycled,path.basename(file)),'utf8'),'original '+index);
}
assert.equal(attempts,iterations);
const keep=path.join(root,'keep');fs.writeFileSync(keep,'keep');
for(const result of [false,undefined,true]) {
  let calls=0;
  await assert.rejects(api.trash_native_path({reqnode:require_node,JSBridge:{invoke:async()=>{calls++;return result;}}},keep));
  assert.equal(calls,1);assert.equal(fs.readFileSync(keep,'utf8'),'keep');
}
await assert.rejects(api.trash_native_path({reqnode:require_node,JSBridge:{invoke:async()=>{throw Object.assign(Error('access denied'),{code:'EACCES'});}}},keep),/access denied/);
await assert.rejects(api.trash_native_path({reqnode:name=>name==='fs'?fs:{}},keep),/接口/);
let folder='',history=[],changed=0;
globalThis.window={File:{setMountFolder:value=>{folder=value;}},JSBridge:{invoke:async(name,target)=>{assert.equal(name,'setting.addRecentFolder');history=[target,...history.filter(item=>item!==target)];}}};
const files={fs,path_api:path,context_root:()=>folder};
const picker=api.bind_workspace_open_dialog(files,()=>changed++);
for(let index=0;index<iterations;index++)await picker.set_folder(root);
assert.deepEqual(history,[root]);assert.equal(changed,iterations);
await assert.rejects(picker.set_folder(keep),/不是文件夹/);assert.deepEqual(history,[root]);
picker.dispose();await picker.set_folder(root);assert.equal(changed,iterations);
// 先发请求迟到时不能覆盖后来选择或记入历史。
let release;const delayed=new Promise(resolve=>release=resolve);let first=true;
const second=api.bind_workspace_open_dialog({...files,fs:{promises:{stat:async target=>{if(first){first=false;await delayed;}return fs.promises.stat(target);}}}},()=>changed++);
const stale=second.set_folder(root);await second.set_folder(recycled);release();await stale;assert.equal(folder,recycled);assert.equal(history[0],recycled);
second.dispose();delete globalThis.window;
console.log(JSON.stringify({status:'PASS',iterations,port:'宿主端口替身；真实临时文件移动，不是系统回收互通',cases:['TC-files-trash','TC-files-recent','TC-git-head'],root}));
