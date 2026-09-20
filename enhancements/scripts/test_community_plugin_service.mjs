import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {plugin_id,compare_version,validate_manifest,verify_directory,create_community_service} from '../src/community_plugin_service.cjs';
import {acquire_update_lock} from '../src/workspace_update_service.cjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_plugins_'));
const large=path.join(root,'large_fixture');fs.mkdirSync(large);fs.writeFileSync(path.join(large,'main.js'),Buffer.alloc(12*1024*1024,65));
let heartbeat=0;const timer=setInterval(()=>heartbeat++,0);const first_hash=await verify_directory(large);clearInterval(timer);assert(heartbeat>1,'大包摘要校验必须让出事件循环');assert.equal(await verify_directory(large),first_hash);fs.appendFileSync(path.join(large,'main.js'),'changed');assert.notEqual(await verify_directory(large),first_hash);
const manifest={id:'example.fixture',name:'Fixture',description:'测试插件',author:'fixture',repo:'example/fixture',version:'1.0.0',minCoreVersion:'2.0.0-beta.31',minAppVersion:'1.0.0',platforms:['win32']};
for(const id of ['../outside','a/b','CON','a..b','_bad'])assert.throws(()=>plugin_id(id));
assert.equal(compare_version('2.10.15','2.0.0-beta.31'),1);assert.equal(compare_version('2.0.0-beta.2','2.0.0-beta.11'),-1);
assert.throws(()=>validate_manifest({...manifest,minCoreVersion:'3.0.0'},{host_version:'1.14.10'}));
assert.throws(()=>validate_manifest({...manifest,minAppVersion:'9.0.0'},{host_version:'1.14.10'}));
let loaded=0,unloaded=0,fail=false,current={...manifest};
const ports={root,acquire_lock:()=>acquire_update_lock(root),host_version:'1.14.10',platform:'win32',load_plugin:async m=>{if(fail)throw Error('坏插件');loaded++;return m;},unload_plugin:async()=>{unloaded++;},extract:async(_archive,dest)=>{fs.mkdirSync(dest);fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(current));fs.writeFileSync(path.join(dest,'main.js'),'export default class {}');},request:async()=>{throw Error('网络不可用');}};
const service=create_community_service(ports);
await service.install_archive('fixture');assert.equal(service.list()[0].enabled,false);assert.equal(loaded,0,'安装不执行');
// 有界重试只能处理暂时占用，持续拒绝必须保留旧文件及旧运行状态。
const rename=fs.promises.rename;let failures=2;
try{fs.promises.rename=async(...args)=>{if(failures-->0)throw Object.assign(Error('暂时占用'),{code:'EPERM'});return rename(...args);};await service.set_enabled(manifest.id,false);assert.equal(failures,-1);}
finally{fs.promises.rename=rename;}
const previous_state=fs.readFileSync(path.join(root,'plugins.json'),'utf8');
try{fs.promises.rename=async()=>{throw Object.assign(Error('拒绝访问'),{code:'EACCES'});};await assert.rejects(service.set_enabled(manifest.id,true),/拒绝访问/);}
finally{fs.promises.rename=rename;}
assert.equal(fs.readFileSync(path.join(root,'plugins.json'),'utf8'),previous_state);assert.equal(loaded,0);assert(!fs.readdirSync(root).some(name=>name.endsWith('.tmp')));
const tier=Number(process.env.TYPORA_STRESS_ITERATIONS||20);
for(let i=0;i<tier;i++){await service.set_enabled(manifest.id,true);await service.set_enabled(manifest.id,true);await service.set_enabled(manifest.id,false);}
assert.equal(loaded,tier);assert.equal(unloaded,tier);
const before=fs.readFileSync(path.join(root,'plugins.json'),'utf8');current={...manifest,id:'wrong.plugin'};
await assert.rejects(service.install_archive('fixture',manifest));assert.equal(fs.readFileSync(path.join(root,'plugins.json'),'utf8'),before,'身份错误保留原配置');
current={...manifest,version:'1.1.0'};await service.set_enabled(manifest.id,true);const old_directory=service.list()[0].dir;
await service.install_archive('fixture');assert(service.list()[0].restart_required);assert(fs.existsSync(path.join(old_directory,'main.js')),'更新保留其他窗口使用的不可变程序版本');
await service.set_enabled(manifest.id,false);fail=true;await assert.rejects(service.set_enabled(manifest.id,true),/坏插件/);assert.match(service.list()[0].error,/坏插件/);fail=false;
await service.set_enabled(manifest.id,true);assert(service.list()[0].running);
const data=path.join(root,'personal.json');fs.writeFileSync(data,'keep');await service.uninstall(manifest.id);assert.equal(service.list().length,0);assert.equal(fs.readFileSync(data,'utf8'),'keep');
await assert.rejects(service.catalog(),/网络不可用/);
current={...manifest};await service.install_archive('fixture');let peer_loads=0,peer_unloads=0;
const peer=create_community_service({...ports,load_plugin:async m=>{peer_loads++;return m;},unload_plugin:async()=>{peer_unloads++;}});
await service.start();await peer.start();await service.set_enabled(manifest.id,true);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(peer_loads,1,'第二窗口接收启用');
await service.set_enabled(manifest.id,false);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(peer_unloads,1,'第二窗口接收停用');
await Promise.all([service.set_enabled(manifest.id,true),peer.set_enabled(manifest.id,false)]);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(service.list()[0].running,peer.list()[0].running,'并发写入经共享互斥后收敛');
await peer.dispose();await service.dispose();await service.dispose();
console.log(JSON.stringify({status:'PASS',iterations:tier,heartbeat,loaded,unloaded,evidence:root,scope:'真实临时文件系统与包事务；下载/解压/插件执行端口替身'}));
