import './fixture_locale.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),api=require('../src/language_environment_service.cjs'),network=require('../src/workspace_update_service.cjs');
api.set_workspace_service_locale('en');
const base=await fs.mkdtemp(path.join(os.tmpdir(),'typora_language_environments_'));
const real=process.argv.includes('--real'),results=[];
const root=path.join(base,'state');
const service=api.create_language_environment_service({root,request:network.download,acquire_lock:()=>network.acquire_update_lock(root),extract_zip:(archive,destination,signal)=>api.execute(network.powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('src/workspace_update_archive.ps1'),'-archive',archive,'-destination',destination,'-package_kind','tools'],{signal})});
assert.equal(api.catalog.plugins.length,9);
assert.throws(()=>api.allowed_url('https://example.com/tools.zip'));
assert.throws(()=>api.allowed_url('http://nodejs.org/tool.zip'));
const outside=path.join(base,'external');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.txt'),'owned by user','utf8');
await assert.rejects(api.remove_owned(outside,'typora_code.language_cpp'));
assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'owned by user');
await assert.rejects(service.install('unknown'));
const controller=new AbortController();controller.abort();await assert.rejects(service.install(api.catalog.plugins[0].id,{signal:controller.signal}),error=>error.name==='AbortError');
assert.equal(service.current(api.catalog.plugins[0].id),undefined);
const broken_root=path.join(base,'broken');
const broken=api.create_language_environment_service({root:broken_root,acquire_lock:()=>network.acquire_update_lock(broken_root),request:async(_url,{file})=>fs.writeFile(file,'bad download'),extract_zip:()=>{throw Error('Must verify before extraction.');}});
await assert.rejects(broken.install('typora_code.language_cpp'),/checksum mismatch/);
assert.equal(broken.current('typora_code.language_cpp'),undefined);
const packages=path.join(broken_root,'tools/typora_code_tools/cpp');assert.deepEqual(await fs.readdir(packages),[]);
const fixture_entry=api.catalog.plugins[0],original_asset=fixture_entry.asset;
const fixture_root=path.join(base,'transaction'),fixture_data='verified fixture archive';
let gate,entered;
try{
 fixture_entry.asset={url:'https://nodejs.org/fixture.zip',sha256:createHash('sha256').update(fixture_data).digest('hex')};
 const fixture=api.create_language_environment_service({root:fixture_root,acquire_lock:()=>network.acquire_update_lock(fixture_root),request:async(_address,{file,signal})=>{if(gate){entered();await gate;}if(signal?.aborted)throw Object.assign(Error('cancelled'),{name:'AbortError'});await fs.writeFile(file,fixture_data);},extract_zip:async(_archive,destination)=>{await fs.mkdir(path.join(destination,'bin'),{recursive:true});await fs.writeFile(path.join(destination,'bin/clangd.exe'),'owned fixture');}});
 for(let iteration=0;iteration<20;iteration++){
  const record=await fixture.install(fixture_entry.id,{directory:path.join(base,'custom location')});
  assert.equal(fixture.current(fixture_entry.id).directory,record.directory);
  await assert.rejects(fixture.install(fixture_entry.id),/Clear the existing/);
  await fixture.uninstall(fixture_entry.id);assert.equal(fixture.current(fixture_entry.id),undefined);await assert.rejects(fs.stat(record.directory));
 }
 let release;gate=new Promise(resolve=>release=resolve);const ready=new Promise(resolve=>entered=resolve),cancel=new AbortController();
 const pending=fixture.install(fixture_entry.id,{signal:cancel.signal});await ready;
 await assert.rejects(fixture.install(fixture_entry.id),'shared lock rejects overlapping writes');cancel.abort();release();await assert.rejects(pending,error=>error.name==='AbortError');gate=undefined;
 assert.equal(fixture.current(fixture_entry.id),undefined);
 const linked=await fixture.install(fixture_entry.id);await fs.symlink(outside,path.join(linked.directory,'external'),'junction');
 await assert.rejects(fixture.uninstall(fixture_entry.id),/Linked|links/);assert(fixture.current(fixture_entry.id));assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'owned by user');
 await fs.unlink(path.join(linked.directory,'external'));await fixture.uninstall(fixture_entry.id);
 const missing=await fixture.install(fixture_entry.id);await api.remove_owned(missing.directory,fixture_entry.id);await fixture.uninstall(fixture_entry.id);assert.equal(fixture.current(fixture_entry.id),undefined,'retry finalizes an interrupted removal');
 const abort_process=new AbortController(),started=api.execute(process.execPath,['-e','console.log("started");setInterval(()=>{},1000)'],{signal:abort_process.signal,on_output:()=>abort_process.abort()});
 await assert.rejects(started,error=>error.name==='AbortError');
 const direct=api.package_environment({proxy_mode:'direct'});assert.equal(direct.HTTPS_PROXY,'');
 const manual=api.package_environment({proxy_mode:'manual',https_proxy_url:'http://localhost:8080'});assert.equal(manual.https_proxy,'http://localhost:8080');
}finally{fixture_entry.asset=original_asset;}
if(real){
 process.env.PATH=path.join(process.env.SystemRoot,'System32');
 for(const name of ['JAVA_HOME','JDK_HOME','DOTNET_ROOT','CLANGD_PATH','LLVM_PATH','PYTHONPATH','VIRTUAL_ENV','CONDA_PREFIX','NODE_PATH'])delete process.env[name];
 const bundle=await build({entryPoints:['src/language_analysis_service.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const analysis=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const watch_bundle=await build({entryPoints:['src/language_file_watchers.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const watch_api=await import('data:text/javascript;base64,'+Buffer.from(watch_bundle.outputFiles[0].text).toString('base64'));
 const samples={cpp:['cpp','main.cpp','int sample(int a) { return a+1; }\n','sample'],cmake:['cmake','CMakeLists.txt','function(sample)\nendfunction()\n','sample'],makefile:['makefile','Makefile','sample:\n\techo hello\n','sample'],bash:['shell','sample.sh','function sample() { echo hello; }\n','sample'],javascript:['javascript','sample.js','function sample(a) { return a+1; }\n','sample'],html:['html','sample.html','<html><body><h1 id="sample">Hello</h1></body></html>\n','html'],css:['css','sample.css','.sample { color: red; }\n','sample'],csharp:['csharp','Sample.cs','public class Sample { public static int sample(int a) { return a+1; } }\n','sample'],java:['java','Sample.java','public class Sample { public int sample(int a) { return a+1; } }\n','sample']};
 const selected=process.env.TYPORA_LANGUAGE_PLUGIN_FILTER?.split(',');
 for(const info of api.catalog.plugins){
  const short=info.id.replace('typora_code.language_','');if(selected&&!selected.includes(short))continue;
  const start=Date.now();let analyzer;
  try{
   let last='';const record=await service.install(info.id,{directory:path.join(base,'chosen tools 中文'),on_progress:message=>{if(message.startsWith('Downloading ')&&message.includes(' MB'))return;if(message!==last){console.log(short+': '+message.trim().slice(0,160));last=message;}}});
   assert.equal(service.current(info.id).directory,record.directory);await assert.rejects(service.install(info.id),/Clear the existing/);
   const [language,filename,text,symbol]=samples[short],project=path.join(base,'projects',short);await fs.mkdir(project,{recursive:true});await fs.writeFile(path.join(project,filename),text,'utf8');
   if(short==='csharp')await fs.writeFile(path.join(project,'Sample.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>','utf8');
   analyzer=analysis.create_language_analysis_service(require,()=>{},()=>{},watch_api.create_language_file_watcher(require("fs"),path));
   const request={workspace_root:project,file_path:path.join(project,filename),language,text,server:{provider:'lsp',command:record.command,args:record.args,environment:record.environment}};
   let result;const flatten=items=>items.flatMap(item=>[item,...flatten(item.children||[])]);
   for(let attempt=0;attempt<20;attempt++){result=await analyzer.parse(request,new AbortController().signal);if(short==='makefile'||flatten(result.symbols).some(item=>item.name.includes(symbol)))break;await new Promise(resolve=>setTimeout(resolve,500));}
   if(short==='makefile'){
    const make_request={...request,text:'NAME=hello\nsample:\n\techo $(NAME)\n'};
    const first=await analyzer.navigate(make_request,'definition',{line:2,character:9},new AbortController().signal);
    assert(first.some(item=>item.range.start.line===0),'Makefile variable definition');
    const next=await analyzer.navigate({...make_request,text:'\n'+make_request.text},'definition',{line:3,character:9},new AbortController().signal);
    assert(next.some(item=>item.range.start.line===1),'Makefile unsaved definition shift');
   }else assert(flatten(result.symbols).some(item=>item.name.includes(symbol)),short+': expected symbol '+symbol+'; got '+JSON.stringify(result.symbols));
   const changed=await analyzer.parse({...request,text:text.replaceAll('sample','modified')},new AbortController().signal);
   if(!['html','makefile'].includes(short))assert(flatten(changed.symbols).some(item=>item.name.includes('modified')),short+': unsaved memory not analyzed');
   assert.equal(await fs.readFile(path.join(project,filename),'utf8'),text);
   results.push({id:info.id,status:'PASS',symbols:flatten(result.symbols).map(item=>item.name),semantic:!!result.semantic_tokens,definition:short==='makefile',clean_path:process.env.PATH,elapsed_ms:Date.now()-start});
  }catch(error){results.push({id:info.id,status:'FAIL',error:String(error.message||error),elapsed_ms:Date.now()-start});}
  finally{await analyzer?.dispose();await new Promise(resolve=>setTimeout(resolve,1200));try{await service.uninstall(info.id);}catch(error){results.at(-1).uninstall_error=String(error);}}
  console.log(JSON.stringify(results.at(-1)));await fs.writeFile(path.join(base,'language_results.json'),JSON.stringify(results,null,2),'utf8');
 }
 assert(!results.some(item=>item.status==='FAIL'||item.uninstall_error),'Real language environment failures; see language_results.json.');
}
console.log(JSON.stringify({status:'PASS',real,results,base}));
