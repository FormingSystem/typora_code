import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {create_community_service} from '../src/community_plugin_service.cjs';
import {download,execute,powershell,acquire_update_lock} from '../src/workspace_update_service.cjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_community_online_'));
const service=create_community_service({root,host_version:'1.14.10',platform:'win32',acquire_lock:()=>acquire_update_lock(root),request:download,
 extract:(archive,destination)=>execute(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve(import.meta.dirname,'../src/workspace_update_archive.ps1'),'-archive',archive,'-destination',destination,'-package_kind','plugin'],{timeout:60000}),
 load_plugin:async()=>{throw Error('在线安装测试禁止执行第三方代码');},unload_plugin:async()=>{},
});
try{
 const catalog=await service.catalog(),info=catalog.find(row=>row.id==='typora-community-plugin.codeblock-copy-button');assert(info);
 const release=await service.latest(info);await service.install_online(info);const installed=service.list()[0];
 assert.equal(installed.version,release.version.replace(/^v/,''));assert.equal(installed.enabled,false);assert.equal(installed.running,false);
 await service.install_online(info);assert.equal(service.list().length,1);
 console.log(JSON.stringify({status:'PASS',catalog_count:catalog.length,release,revision:installed.revision,evidence:root,scope:'真实GitHub目录、发行身份、HTTPS下载和安全ZIP解压；不执行代码'}));
}finally{await service.dispose();}
