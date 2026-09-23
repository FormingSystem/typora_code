'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {create_connection_store,with_store_lock}=require('../src/remote_ssh_connections.cjs');
const {create_credential_store,create_password_vault}=require('../src/remote_ssh_credentials.cjs');
const {resolve_connection_identity,remote_terminal_profile}=require('../src/remote_ssh_service.cjs');
const {create_ssh_auth}=require('../src/remote_ssh_auth.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora-ssh-accounts-')),checks=[];
const roundtrip=(bridge,token,prompt)=>new Promise((resolve,reject)=>{const socket=net.connect(Number(bridge.env.TYPORA_SSH_AUTH_PORT),'127.0.0.1',()=>socket.write(JSON.stringify({token,prompt})+'\n'));let text='';socket.on('data',data=>text+=data);socket.on('end',()=>resolve(text));socket.on('error',reject);});
(async()=>{let system;
 try{
  const first=create_connection_store(root),second=create_connection_store(root);
  await Promise.all(Array.from({length:100},(_,index)=>(index%2?first:second).save({target:'user'+index+'@fixture.invalid',port:2222,host_name:'测试电脑',name:'账号 '+index,folder:'/tmp'})));
  assert.equal((await first.list()).length,100);let records=await first.list();const selected=await first.save({...records[0],host_name:'开发虚拟机',name:'日常账号'});
  assert((await second.list()).every(item=>item.host_name==='开发虚拟机'));assert.equal((await second.list()).find(item=>item.id===selected.id).name,'日常账号');
  await Promise.all(records.slice(0,20).map(item=>second.remove(item.id)));assert.equal((await first.list()).length,80);checks.push('100并发记录保存、主机别名共享、账号独立修改、20删除');
  await assert.rejects(first.save({target:'-oProxyCommand=bad'}));await assert.rejects(first.save({target:'host',port:65536}));await assert.rejects(first.save({target:'host',folder:'relative'}));
  const a=await resolve_connection_identity('alice@fixture.invalid',{port:2222}),b=await resolve_connection_identity('bob@fixture.invalid',{port:2222}),c=await resolve_connection_identity('alice@fixture.invalid',{port:2223});assert.notEqual(a.key,b.key);assert.notEqual(a.key,c.key);
  assert.equal(remote_terminal_profile('alice@fixture.invalid','','ssh',{port:2222}).args.at(-1),'exec "${SHELL:-/bin/sh}" -l');checks.push('真实ssh -G用户/端口身份隔离及默认远程主目录');
  const data=new Map(),storage={supported:true,read:async key=>data.get(key),write:async(key,value)=>{assert(Buffer.byteLength(value)<=2560);data.set(key,value);},remove:async key=>data.delete(key),list:async prefix=>[...data.keys()].filter(key=>key.startsWith(prefix))};
  const credentials=create_credential_store(root,storage),vault=create_password_vault(credentials,fn=>with_store_lock(root,fn));
  await credentials.save(a.key,'auto-login');await vault.setup('first-master-password',[a.key]);assert.equal(await vault.reveal(a.key,'first-master-password'),'auto-login');await assert.rejects(vault.reveal(a.key,'wrong'),/保险密码/);
  for(let index=0;index<20;index++){await vault.remember(b.key,'password-'+index);assert.equal(await vault.reveal(b.key,'first-master-password'),'password-'+index);}
  await vault.change('first-master-password','changed-master-password');await assert.rejects(vault.reveal(a.key,'first-master-password'));assert.equal(await vault.reveal(a.key,'changed-master-password'),'auto-login');
  await vault.reset();assert.equal(await credentials.read(a.key),'auto-login');assert.equal([...data.keys()].filter(key=>key.startsWith('view/')).length,0);
  await vault.setup('reset-master-password',[a.key]);await assert.rejects(vault.reveal(a.key,'reset-master-password'),/没有可查看/);await vault.remember(a.key,'re-entered');assert.equal(await vault.reveal(a.key,'reset-master-password'),'re-entered');checks.push('20保险箱往返、错误密码、修改、重置后自动登录保留且不可自动恢复查看记录');
  let calls=0;const bridge=await create_ssh_auth({asset_root:path.join(__dirname,'../src'),node_path:process.execPath,authenticate:async()=>{calls++;return 'memory-answer';}});
  try{assert.equal(await roundtrip(bridge,'wrong','password'),'');assert.equal(calls,0);assert.equal(JSON.parse(await roundtrip(bridge,bridge.env.TYPORA_SSH_AUTH_TOKEN,'password')).answer,'memory-answer');assert(!JSON.stringify(bridge.env).includes('memory-answer'));}finally{bridge.dispose();}checks.push('ASKPASS随机令牌拒绝伪造、环境无密码、认证端口释放');
  if(process.platform==='win32'){
   system=create_credential_store(path.join(root,'system'));const actual=create_password_vault(system,fn=>with_store_lock(root,fn));await system.save(a.key,'system-probe');assert.equal(await system.read(a.key),'system-probe');
   await actual.setup('real-system-master',[a.key]);assert.equal(await actual.reveal(a.key,'real-system-master'),'system-probe');await actual.reset();assert.equal(await system.read(a.key),'system-probe');assert.deepEqual(await actual.state(),{configured:false,reset:true});checks.push('真实Windows Credential Manager与PowerShell5.1保险箱往返及重置');
  }
  assert(!fs.readFileSync(path.join(root,'connections.json'),'utf8').includes('auto-login'));

 }finally{if(system)for(const key of await system.storage.list(''))await system.storage.remove(key);if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('typora-ssh-accounts-'))throw Error('fixture boundary');fs.rmSync(root,{recursive:true,force:true});}
 console.log(JSON.stringify({status:'PASS',checks}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
