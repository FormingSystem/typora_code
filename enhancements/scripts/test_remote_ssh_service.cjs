'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {validate_target,create_remote_ssh}=require('../src/remote_ssh_service.cjs');
(async()=>{
 for(let i=0;i<1000;i++){
  for(const name of ['user@example.test','alias-name','192.0.2.1','[::1]'])assert.equal(validate_target(name),name);
  for(const name of ['',null,'-oProxyCommand=bad','host;command','host\n','user@host --arg','a'.repeat(256),'$(command)','user@host/path'])assert.throws(()=>validate_target(name));
 }
 const options={asset_root:path.join(__dirname,'../src'),node_path:process.execPath,ssh_path:path.join(__dirname,'missing-ssh-executable'),authenticate:async()=>{throw Error('Unexpected authentication');}};
 for(let i=0;i<20;i++){
  const states=[],service=create_remote_ssh({...options,on_state:s=>states.push(s.state)});
  await assert.rejects(service.request('read',{path:'/none'}),/尚未连接/);
  await assert.rejects(service.connect('host'),/无法启动SSH/);assert.equal(service.state(),'disconnected');
  service.dispose();await assert.rejects(service.connect('host'),/已关闭/);assert(states.includes('connecting'));
 }
 const missing=create_remote_ssh({...options,asset_root:path.join(__dirname,'missing-assets')});await assert.rejects(missing.connect('host'),/ENOENT/);assert.equal(missing.state(),'disconnected');missing.dispose();
 const cancel=create_remote_ssh(options);const pending=cancel.connect('host');cancel.disconnect();await assert.rejects(pending,/已取消连接|无法启动SSH/);cancel.dispose();
 console.log(JSON.stringify({status:'PASS',target_cycles:1000,failure_cleanup_cycles:20,checks:['目标不接受命令参数和换行','未连接不允许读写','进程缺失和资产缺失清理','立即取消','销毁后不可重连']}));
})().catch(error=>{console.error(error);process.exitCode=1;});
