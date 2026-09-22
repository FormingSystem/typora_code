'use strict';
// 显式指定SSH测试目标和临时目录，仅创建/清理本测试独占的随机目录。
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const {create_remote_ssh}=require('../src/remote_ssh_service.cjs');
const target=process.env.TYPORA_TEST_SSH_TARGET,password=process.env.TYPORA_TEST_SSH_PASSWORD;
if(!target||!password)throw Error('需要显式设置测试SSH目标及内存认证凭据');
let authentications=0;const checks=[];
const service=create_remote_ssh({asset_root:path.join(__dirname,'../src'),node_path:process.execPath,authenticate:async prompt=>{assert(!/authenticity|fingerprint|yes\/no/i.test(prompt),'live test requires an already trusted host');authentications++;return password;}});
(async()=>{
 let root='',file='';
 try{
  const hello=await service.connect(target);assert.equal(hello.protocol,1);checks.push('真实OpenSSH认证及远程协议');
  root=hello.home+'/.typora-code-test-'+crypto.randomUUID();await service.request('mkdir',{path:root});
  file=root+'/中文 空格 $special.md';const initial='# SSH验证\n\n初始正文\n';
  await service.request('create',{path:file,data:Buffer.from(initial).toString('base64')});
  const listed=await service.request('list',{path:root});assert.equal(listed.entries[0].name,'中文 空格 $special.md');
  let loaded=await service.request('read',{path:file});assert.equal(Buffer.from(loaded.data,'base64').toString(),initial);checks.push('中文/空格/特殊名称创建与远程回读');
  for(let i=0;i<100;i++){
   const text=initial+'操作 '+i+'\n';const result=await service.request('write',{path:file,version:loaded.version,data:Buffer.from(text).toString('base64')});
   loaded=await service.request('read',{path:file});assert.deepEqual(loaded.version,result.version);assert.equal(Buffer.from(loaded.data,'base64').toString(),text);
  }
  checks.push('100轮保存及回读一致');
  await assert.rejects(service.request('write',{path:file,version:{...loaded.version,sha256:'stale'},data:Buffer.from('wrong').toString('base64')}),/其他程序修改/);
  assert.equal((await service.request('read',{path:file})).data,loaded.data);checks.push('过期摘要拒绝覆盖');
  await service.request('remove',{path:file});file='';await service.request('remove',{path:root});root='';
  service.disconnect();await assert.rejects(service.request('read',{path:'/unavailable'}),/尚未连接/);checks.push('断开后拒绝读写');
  console.log(JSON.stringify({status:'PASS',checks,authentications,write_cycles:100},null,2));
 }finally{
  if(service.state()==='connected'){if(file)await service.request('remove',{path:file});if(root)await service.request('remove',{path:root});}
  service.dispose();
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
