import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import https from 'node:https';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url),service=require('../src/workspace_update_service.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora-update-')),checks=[];
const make_release=sequence=>({schema:1,releases:[{sequence,version:'2026.09.19.'+sequence,date:'2026-09-19',notes:['修复文件识别','<img src=x onerror=alert(1)>']}]});
const old=make_release(1),latest=make_release(2),sha='a'.repeat(40),calls=[];
assert.equal(service.release_info(latest),latest);
for(const value of [{}, {...latest,schema:2},make_release(-1),{schema:1,releases:[latest.releases[0],latest.releases[0]]},make_release(1.2),{schema:1,releases:[{...latest.releases[0],notes:['']}]}])assert.throws(()=>service.release_info(value));
for(const url of ['http://github.com/a','https://github.com.evil.invalid/a','https://u:p@github.com/a','https://github.com:444/a','file:///tmp/x'])assert.throws(()=>service.allowed_url(url));
checks.push('版本、递增顺序、公告和HTTPS来源严格校验');
// 替换传输端口，执行真实下载流逻辑；不访问外网。
const original_get=https.get;
async function transfer(scenario,options={}){
 https.get=(_url,_options,callback)=>{const request=new EventEmitter();request.destroy=()=>{};queueMicrotask(()=>{const response=new PassThrough();response.statusCode=scenario.status||200;response.headers=scenario.headers||{};callback(response);queueMicrotask(()=>scenario.body?.(response));});return request;};
 try{return await service.download('https://github.com/test',{timeout_ms:100,...options});}finally{https.get=original_get;}
}
assert.equal((await transfer({body:response=>response.end('abc')})).toString(),'abc');
await assert.rejects(transfer({status:429}),/429/);
const large_download=Buffer.alloc(2*1024*1024+1,65);assert.deepEqual(await transfer({headers:{'content-length':String(large_download.length)},body:response=>response.end(large_download)}),large_download);
assert.deepEqual(await transfer({body:response=>response.end(large_download)}),large_download);
await assert.rejects(transfer({status:302,headers:{location:'https://evil.invalid/file'}}),/来源/);
await assert.rejects(transfer({status:302,headers:{location:'https://github.com/loop'}}),/重定向/);
await assert.rejects(transfer({body:response=>response.emit('aborted')}),/中断/);
await assert.rejects(transfer({}, {timeout_ms:15}),/超时/);
const cancelled=new AbortController();const pending=transfer({}, {signal:cancelled.signal});cancelled.abort();await assert.rejects(pending,/取消/);
const downloaded=path.join(root,'stream.bin');await transfer({body:response=>response.end('saved')},{file:downloaded});assert.equal(fs.readFileSync(downloaded,'utf8'),'saved');
await assert.rejects(transfer({body:response=>response.end('overwrite')},{file:downloaded}),/EEXIST/);assert.equal(fs.readFileSync(downloaded,'utf8'),'saved');
checks.push('真实下载流覆盖状态码、超过旧字节上限的完整内容、重定向、超时、断流、取消及文件排他写入；HTTPS端口使用替身');

const progress_samples=[];
await transfer({headers:{'content-length':'6'},body:response=>{response.write('abc');response.end('def');}},{on_progress:(bytes,total)=>progress_samples.push({bytes,total})});
assert.deepEqual(progress_samples,[{bytes:3,total:6},{bytes:6,total:6}]);
for(const header of [undefined,'invalid','0','-1','2.5']){
 const samples=[];await transfer({headers:{'content-length':header},body:response=>response.end('abc')},{on_progress:(bytes,total)=>samples.push({bytes,total})});assert.deepEqual(samples,[{bytes:3,total:undefined}]);
}
const oversized=[];await transfer({headers:{'content-length':'2'},body:response=>response.end('abc')},{on_progress:(bytes,total)=>oversized.push({bytes,total})});assert.equal(oversized[0].total,undefined);
checks.push('下载进度按真实分块字节累计；缺失/无效/小于实际的长度不生成百分比');

const request=async url=>{calls.push(url);return Buffer.from(url.includes('/commits/')?JSON.stringify({sha}):url.endsWith('/release.json')?JSON.stringify(latest):'manifest');};
const plan=await service.check_update(old,{request});assert.equal(plan.commit,sha);assert.equal(plan.archive_url,'https://codeload.github.com/FormingSystem/typora_code/zip/'+sha);assert.equal(plan.notes_sha256,service.digest(Buffer.from(JSON.stringify(latest))));assert(calls.slice(1).every(url=>url.includes('/'+sha+'/')));
assert.equal((await service.check_update(latest,{request})).commit,sha);assert.equal(await service.check_update(make_release(3),{request}),null);
await assert.rejects(service.check_update(old,{request:async()=>{throw Error('HTTP 429');}}),/429/);
await assert.rejects(service.check_update(old,{request:async()=>Buffer.from('{"sha":"main"}')}),/提交身份/);
checks.push('固定提交对应公告和压缩包，同序号仍检查提交／旧远端不降级，网络失败不产生候选');
const iterations=process.env.TYPORA_TEST_PURPOSE==='stress'?Number(process.env.TYPORA_STRESS_ITERATIONS||20):20;
const children=Array.from({length:Math.min(20,iterations)},(_,index)=>new Promise((resolve,reject)=>{
 const count=Math.floor(iterations/Math.min(20,iterations))+(index<iterations%Math.min(20,iterations)?1:0);
 const child=spawn(process.execPath,['-e',`const s=require(${JSON.stringify(require.resolve('../src/workspace_update_service.cjs'))});let wins=0;for(let i=0;i<${count};i++)wins+=Number(s.claim_startup(${JSON.stringify(root)},'123-456'));process.stdout.write(String(wins))`],{windowsHide:true});let output='';child.stdout.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(Number(output)):reject(Error('child '+code)));
}));
assert.equal((await Promise.all(children)).reduce((a,b)=>a+b,0),1);assert.equal(service.claim_startup(root,'123-456'),false);assert.equal(service.claim_startup(root,'123-789'),true);assert.throws(()=>service.claim_startup(root,'../bad'));
checks.push(iterations+'次跨进程会话争抢仅一次成功；同PID新启动时间可再次提醒');
const unlock=await service.acquire_update_lock(root);await assert.rejects(service.acquire_update_lock(root));await unlock();await (await service.acquire_update_lock(root))();checks.push('后台更新独占及释放后可再次运行');
const stale_job='11111111-1111-1111-1111-111111111111',stale_root=path.join(root,stale_job);fs.mkdirSync(stale_root);
assert.equal(service.status_of(root,stale_job).phase,'starting');fs.utimesSync(stale_root,new Date(0),new Date(0));assert.equal(service.status_of(root,stale_job).phase,'failed');
fs.writeFileSync(path.join(stale_root,'status.json'),JSON.stringify({phase:'installing',pid:2147483647}));assert.equal(service.status_of(root,stale_job).phase,'failed');
fs.writeFileSync(path.join(stale_root,'status.json'),JSON.stringify({phase:'succeeded',pid:2147483647}));assert.equal(service.status_of(root,stale_job).phase,'succeeded');
assert.throws(()=>service.status_of(root,'../bad'));checks.push('任务未启动超时和后台进程消失明确失败，已完成状态不因进程退出丢失');
const payload=path.join(root,'payload'),dist=path.join(payload,'enhancements/dist');fs.mkdirSync(path.join(dist,'assets/update'),{recursive:true});
const notes=Buffer.from(JSON.stringify(latest));fs.mkdirSync(path.join(payload,'enhancements'),{recursive:true});fs.writeFileSync(path.join(payload,'enhancements/release.json'),notes);fs.writeFileSync(path.join(dist,'assets/update/release.json'),notes);
for(const name of ['workbench.js','workspace_core.js','workspace.css','workspace_core.css'])fs.writeFileSync(path.join(dist,name),name);
const manifest=['assets/update/release.json','workbench.js','workspace_core.js','workspace.css','workspace_core.css'].map(name=>service.digest(fs.readFileSync(path.join(dist,name)))+'  '+name).join('\n')+'\n';
fs.writeFileSync(path.join(dist,'SHA256SUMS'),manifest);plan.manifest_sha256=service.digest(Buffer.from(manifest));
service.validate_payload(payload,plan);fs.appendFileSync(path.join(dist,'workbench.js'),'tampered');assert.throws(()=>service.validate_payload(payload,plan),/摘要/);fs.writeFileSync(path.join(dist,'workbench.js'),'workbench.js');
checks.push('解压后的公告、构建版本与所有资产摘要一致才接受');
const network_snapshot={proxy_mode:'manual',http_proxy_url:'http://localhost:31080',https_proxy_url:'http://localhost:31443',ca_file:''};
const user_data=path.join(root,'user_data'),installed=path.join(user_data,'typora_code/assets/update');fs.mkdirSync(installed,{recursive:true});fs.writeFileSync(path.join(installed,'release.json'),JSON.stringify(old));
async function run_case(name,{cancel=false,failure=false,network=false,uac_cancel=false}={}){
 const job=path.join(root,name);fs.mkdirSync(job);fs.writeFileSync(path.join(job,'request.json'),JSON.stringify({state_root:root,user_data,host_root:path.join(root,'host'),plan,network:network_snapshot}));let installed_count=0;
 await service.run_worker(path.join(job,'request.json'),{request:async(_url,{file,on_progress,network:actual_network})=>{assert.deepEqual(actual_network,network_snapshot);on_progress(3,6);const progress=JSON.parse(fs.readFileSync(path.join(job,"status.json"),"utf8"));assert.equal(progress.bytes,3);assert.equal(progress.total_bytes,6);if(network)throw Error('network failure');fs.writeFileSync(file,'fixture');if(cancel)fs.writeFileSync(path.join(job,'cancel'),'yes');},unpack:async()=>payload,install:async()=>{installed_count++;if(uac_cancel)throw Error('[TYPORA_INSTALL_CANCELLED] 已取消系统授权，未修改安装目标');if(failure)throw Error('权限不足，安装已回滚');fs.writeFileSync(path.join(installed,'release.json'),notes);fs.writeFileSync(service.update_paths(user_data).manifest_file,manifest);}});
 return {status:JSON.parse(fs.readFileSync(path.join(job,'status.json'),'utf8')),installed_count};
}
let result=await run_case('cancel',{cancel:true});assert.equal(result.status.phase,'cancelled');assert.equal(result.installed_count,0);
result=await run_case('network',{network:true});assert.equal(result.status.phase,'failed');assert.equal(result.installed_count,0);
result=await run_case('install_failure',{failure:true});assert.equal(result.status.phase,'failed');assert.match(result.status.message,/权限/);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(installed,'release.json'),'utf8')),old);
result=await run_case('uac_cancel',{uac_cancel:true});assert.equal(result.status.phase,'cancelled');assert.equal(result.installed_count,1);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(installed,'release.json'),'utf8')),old);
result=await run_case('success');assert.equal(result.status.phase,'succeeded');assert.equal(result.installed_count,1);
result=await run_case('repeat');assert.equal(result.status.phase,'failed');assert.equal(result.installed_count,0);
checks.push('后台worker下载保持HTTP和HTTPS两字段快照');
checks.push('取消及下载失败零安装，安装失败保留旧版本，成功后重复任务拒绝降级／覆盖');
assert.equal(service.installed_identity(user_data).commit,sha);
const identity_bytes=fs.readFileSync(service.update_paths(user_data).identity_file,'utf8');
assert.equal(await service.check_update(latest,{request,user_data}),null);
const next_sha='b'.repeat(40),next_request=async url=>Buffer.from(url.includes('/commits/')?JSON.stringify({sha:next_sha,commit:{message:'修复同版本遗漏更新'}}):url.endsWith('/release.json')?JSON.stringify(latest):manifest);
const next_plan=await service.check_update(latest,{request:next_request,user_data});
assert.equal(next_plan.commit,next_sha);assert.equal(next_plan.commit_message,'修复同版本遗漏更新');
Object.assign(plan,next_plan);
result=await run_case('same_version_failure',{failure:true});assert.equal(result.status.phase,'failed');assert.equal(fs.readFileSync(service.update_paths(user_data).identity_file,'utf8'),identity_bytes);
result=await run_case('same_version_success');assert.equal(result.status.phase,'succeeded');assert.equal(service.installed_identity(user_data).commit,next_sha);
plan.commit='c'.repeat(40);plan.archive_url='https://codeload.github.com/FormingSystem/typora_code/zip/'+plan.commit;
result=await run_case('stale_plan');assert.equal(result.installed_count,0);assert.match(result.status.message,/提交已变化/);
const bootstrap=path.join(root,'zip_only_profile');fs.mkdirSync(path.join(bootstrap,'typora_code'),{recursive:true});
fs.writeFileSync(service.update_paths(bootstrap).manifest_file,manifest);
assert.equal(await service.check_update(latest,{request:next_request,user_data:bootstrap}),null);assert.equal(service.installed_identity(bootstrap).basis,'equivalent-assets');
fs.writeFileSync(service.update_paths(bootstrap).manifest_file,'different');assert.equal(service.installed_identity(bootstrap),null);
assert.equal((await service.check_update(latest,{request:next_request,user_data:bootstrap})).commit,next_sha);
for(const invalid of ['broken json','null','{}','42']){fs.writeFileSync(service.update_paths(bootstrap).identity_file,invalid);assert.equal(service.installed_identity(bootstrap),null);}
const paths=service.update_paths(bootstrap);assert.equal(paths.state_root,path.join(bootstrap,'temp','typora_code_updates'));assert(!fs.existsSync(paths.state_root));assert(service.claim_startup(paths.state_root,'222-333'));assert(fs.existsSync(paths.state_root));
checks.push('无Git首次ZIP按清单建立等价SHA，同序号新SHA可安装，失败回执不变，手工换装/坏回执失效，用户temp自动创建');
console.log(JSON.stringify({status:'PASS',checks,iterations,evidence:root},null,2));
