// 资源身份、迟到读取和保存并发；远端端口替身与真实临时本地物化目录分开记录。
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {build} from 'esbuild';
const compiled=await build({stdin:{contents:'export * from "./src/remote_workspace_files";export * from "./src/workspace_native_save";export * from "./src/workspace_file_uri";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const require=createRequire(import.meta.url),root=fs.mkdtempSync(path.join(os.tmpdir(),'typora-remote-contract-')),checks=[];let connected=true,pause_read,release_write,writes=0;
const value={data:Buffer.from('# remote\n').toString('base64'),version:{mtime_ns:1}};
const provider=new api.remote_file_provider({target:'fixture',connected:()=>connected,async request(op,args){if(op==='read'){if(pause_read)await pause_read;return value;}if(op==='filesystem')return{file:true,directory:false,size:9,dev:'1',ino:'2',mtimeMs:1,ctimeMs:1};if(op==='write'){writes++;if(release_write)await release_write;return{version:{mtime_ns:2}};}throw Error('unexpected operation '+op);}},fs,path,path.join(root,'host'),Buffer);
const release=api.register_remote_files(provider),routed=api.workspace_resource_fs(fs),file=provider.local_path('/project/a.md');
try{
 for(const count of [20,100,1000]){for(let i=0;i<count;i++){const posix='/project/目录'+i+'/file.md';assert.equal(provider.remote_path(provider.local_path(posix)),posix);}checks.push(count+' namespace round trips');}
 assert.throws(()=>provider.remote_path(path.join(root,'other.md')));assert.throws(()=>provider.local_path('/bad\0name'));
 if(path.sep==='\\'){provider.local_path('/case/A.md');assert.throws(()=>provider.local_path('/case/a.md'),/大小写/);assert.throws(()=>provider.local_path('/CON.md'));}
 let resume;pause_read=new Promise(resolve=>resume=resolve);let valid=true;const stale=provider.prepare(file,true,()=>valid);valid=false;resume();await assert.rejects(stale,/取消/);assert(!fs.existsSync(file));pause_read=undefined;checks.push('stale fetch cannot materialize editor file');
 await provider.prepare(file);assert.equal(fs.readFileSync(file,'utf8'),'# remote\n');connected=false;await assert.rejects(routed.promises.readFile(file),/断开/);await assert.rejects(provider.save_native(file,'draft'),/断开/);connected=true;checks.push('offline reads and saves do not use cached success');
 let text='draft',saved=0;const file_api={isNode:true,bundle:{filePath:file,fileEncode:'utf8'},editor:{getMarkdown:()=>text},sync:()=>text,saveUseNode:()=>{saved++;return true;}};
 const binding=api.bind_native_save({File:file_api,reqnode:name=>name==='iconv-lite'?{encode:text=>Buffer.from(text)}:require(name)},{changed(){},saved(){},auto_save_changed(){}});
 let finish;release_write=new Promise(resolve=>finish=resolve);const pending=file_api.saveUseNode();text='new input';assert.equal(await file_api.saveUseNode(),false);finish();assert.equal(await pending,false);assert.equal(saved,0);release_write=undefined;assert.equal(await file_api.saveUseNode(),true);assert.equal(saved,1);binding.dispose();checks.push('new input during remote save stays dirty and duplicate save coalesces');
 const original_read=routed.promises.readFile;const native_read=fs.promises.readFile;const local_file=path.join(root,'local.txt');fs.writeFileSync(local_file,'local');routed.promises.readFile=(...args)=>original_read(...args);try{assert.equal(await routed.promises.readFile(local_file,'utf8'),'local');}finally{fs.promises.readFile=native_read;}checks.push('filesystem wrapper preserves original call without recursion');
 api.protect_remote_cache(root,path);release();assert.throws(()=>routed.statSync(file),/尚未重新连接/);checks.push('unregistered remote cache cannot turn into local workspace');
 if(process.platform==='win32'){
  const {create_credential_store}=require('../src/remote_ssh_credentials.cjs'),vault_root=path.join(root,'vault'),store=create_credential_store(vault_root),secret='fixture-'+crypto.randomUUID();await store.save('fixture',secret);
  assert.equal(await create_credential_store(vault_root).read('fixture'),secret);assert.equal(fs.existsSync(vault_root),false,'new credentials do not create password files');await store.remove('fixture');assert.equal(await store.read('fixture'),undefined);checks.push('real Windows Credential Manager encrypted storage independent reader and forget');
 }
 console.log(JSON.stringify({status:'PASS',checks,writes,scope:'remote IO port fixture; real filesystem and Windows Credential Manager'}));
}finally{release();if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('typora-remote-contract-'))throw Error('fixture boundary');fs.rmSync(root,{recursive:true,force:true});}
