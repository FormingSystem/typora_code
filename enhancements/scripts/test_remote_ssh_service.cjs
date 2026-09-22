'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {validate_target,create_remote_ssh,remote_terminal_profile,connection_arguments}=require('../src/remote_ssh_service.cjs');
(async()=>{
 const configured={config_file:'C:/SSH configs/个人 config',connect_timeout:45,server_alive_interval:0,server_alive_count:5};
 assert.deepEqual(connection_arguments(configured),['-T','-o','ConnectTimeout=45','-o','ServerAliveInterval=0','-o','ServerAliveCountMax=5','-o','StrictHostKeyChecking=ask','-F',configured.config_file]);
 for(const bad of [{connect_timeout:0},{connect_timeout:301},{connect_timeout:'15'},{server_alive_interval:-1},{server_alive_count:0},{server_alive_count:1.5},{config_file:'path\nProxyCommand bad'}])assert.throws(()=>connection_arguments(bad));
 const configured_terminal=remote_terminal_profile('alias','/tmp','default-ssh',{...configured,ssh_path:'C:/SSH tools/ssh.exe'});
 assert.equal(configured_terminal.executable,'C:/SSH tools/ssh.exe');
 assert.deepEqual(configured_terminal.args.slice(0,-2),connection_arguments(configured,true));
 const launch=remote_terminal_profile('test-alias',"/tmp/中文 ' ${env:NOT_LOCAL} $(no-command)",'ssh.exe');
 assert.deepEqual(launch.args.slice(0,-1),['-tt','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-o','StrictHostKeyChecking=ask','test-alias']);
 assert.equal(launch.args.at(-1),"cd -- '/tmp/中文 '\\'' ${env:NOT_LOCAL} $(no-command)' && exec \"${SHELL:-/bin/sh}\" -l");
 for(const value of ['relative','/bad\0path',null])assert.throws(()=>remote_terminal_profile('alias',value,'ssh.exe'));
 assert.throws(()=>remote_terminal_profile('-oProxyCommand=bad','/tmp','ssh.exe'));
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
