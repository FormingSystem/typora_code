import './fixture_locale.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {build} from 'esbuild';

const node=createRequire(import.meta.url),checks=[];
const compiled=await build({entryPoints:['src/language_analysis_service.ts'],bundle:true,platform:'node',format:'esm',write:false});
const api=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const evidence=await fs.mkdtemp(path.join(os.tmpdir(),'typora_clangd_'));
const signal=()=>new AbortController().signal;
const flatten=items=>items.flatMap(item=>[item,...flatten(item.children)]);
const transport_bundle=await build({entryPoints:['src/language_server_transport.ts'],bundle:true,platform:'node',format:'esm',write:false});
const transport_api=await import(`data:text/javascript;base64,${Buffer.from(transport_bundle.outputFiles[0].text).toString('base64')}`);
let child,writes=[],spawn_options,on_fake_write;
const fake_node=name=>name==='child_process'?{spawn(executable,args,options){
  spawn_options=options;child=new EventEmitter();child.pid=100;child.exitCode=null;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();
  child.stdin.write=bytes=>{const message=JSON.parse(bytes.subarray(bytes.indexOf('\r\n\r\n')+4).toString('utf8'));writes.push(message);if(message.method==='shutdown')queueMicrotask(()=>respond({id:message.id,result:null}));if(message.method==='exit'){child.exitCode=0;queueMicrotask(()=>child.emit('exit',0));}on_fake_write?.(message);};
  child.stdin.end=()=>{};child.kill=()=>{child.exitCode=1;child.emit('exit',1);};return child;
}}:node(name);
const frame=message=>{const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}),'utf8');return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),body]);};
const respond=message=>child.stdout.emit('data',frame(message));
const notifications=[];
const transport=transport_api.create_language_server_transport(fake_node,'clangd',['--background-index=false'],evidence,(method,params)=>notifications.push([method,params]));
assert.equal(spawn_options.shell,false);assert.equal(spawn_options.windowsHide,true);
const framed_request=transport.request('symbols',{}),framed_bytes=frame({id:writes.at(-1).id,result:'中文 😀'});
child.stdout.emit('data',framed_bytes.subarray(0,19));child.stdout.emit('data',framed_bytes.subarray(19,framed_bytes.length-3));child.stdout.emit('data',Buffer.concat([framed_bytes.subarray(framed_bytes.length-3),frame({method:'status',params:{ready:true}})]));
assert.equal(await framed_request,'中文 😀');assert.equal(notifications[0][0],'status');checks.push('LSP framing handles split UTF-8 bytes and coalesced messages');
const cancel_controller=new AbortController(),cancel_request=transport.request('cancel',{},cancel_controller.signal),cancel_id=writes.at(-1).id;cancel_controller.abort();await assert.rejects(cancel_request,error=>error.name==='AbortError');assert(writes.some(item=>item.method==='$/cancelRequest'&&item.params.id===cancel_id));respond({id:cancel_id,result:'late'});
respond({id:300,method:'workspace/applyEdit',params:{edit:{}}});assert(writes.some(item=>item.id===300&&item.error?.code===-32601));
await assert.rejects(transport.request('timeout',{},undefined,10),/超时/);checks.push('cancellation, late responses, request timeouts and server edit refusal');
await transport.dispose();assert.equal(child.exitCode,0);checks.push('transport requests graceful shutdown then exit');
const broken=transport_api.create_language_server_transport(fake_node,'clangd',[],evidence,()=>{}),broken_request=broken.request('bad',{});child.stdout.emit('data',Buffer.from('Wrong: bad\r\n\r\n{}'));await assert.rejects(broken_request,/协议头/);assert.equal(child.exitCode,1);await broken.dispose();checks.push('malformed protocol fails pending requests and terminates owned process');
for(const channel of ['stdin','stdout','stderr']){
  const failed_channel=transport_api.create_language_server_transport(fake_node,'clangd',[],evidence,()=>{});
  const requests=Promise.allSettled([failed_channel.request('first',{}),failed_channel.request('second',{})]);
  assert.doesNotThrow(()=>child[channel].emit('error',new Error('fixture pipe failure')));
  const settled=await requests;
  assert(settled.every(result=>result.status==='rejected'&&result.reason.message.includes(channel)),channel+' failure settles every pending request');
  assert.equal(child.exitCode,1,channel+' failure terminates the owned process');
  await assert.rejects(failed_channel.request('after',{}),new RegExp(channel));
  await failed_channel.dispose();
  assert.doesNotThrow(()=>child[channel].emit('error',new Error('late error after disposal')));
}
checks.push('stdin, stdout and stderr errors reject all pending work, terminate the owned child and remain handled after disposal');

const mapped=api.language_document_symbols([{name:'变量',kind:13,range:{start:{line:1,character:0},end:{line:1,character:8}},selectionRange:{start:{line:1,character:4},end:{line:1,character:6}}}],'// 😀\r\nint 变量;\r\n');
assert.equal('// 😀\r\nint 变量;\r\n'.slice(mapped[0].selection_start,mapped[0].selection_end),'变量');
assert.deepEqual(api.language_document_symbols([{name:'invalid',range:{start:{line:-1,character:0}}}],'x'),[]);
checks.push('UTF-16 with astral text, CRLF and invalid ranges');

await assert.rejects(api.discover_clangd_environment({executable:path.join(evidence,'missing-clangd.exe')},node),/clangd/);
checks.push('explicit missing executable does not silently select another analyzer');

let environment;
try{environment=await api.discover_clangd_environment({},node);}catch(error){throw new Error('Real clangd required for this target: '+error.message);}
const project=path.join(evidence,'project 中文 # %');await fs.mkdir(path.join(project,'build','debug'),{recursive:true});
const file=path.join(project,'source header.h');
const disk='// 中文 😀\r\n#ifdef __cplusplus\r\nextern "C" {\r\n#endif\r\n#define VALUE 7\r\ntypedef unsigned int port_t;\r\nextern int external;\r\nint prototype(int arg);\r\nint real(int arg) { return arg; }\r\nstruct device { int state; };\r\n#ifdef PROJECT_FEATURE\r\nint configured;\r\n#endif\r\n#ifdef __cplusplus\r\n}\r\n#endif\r\n';
await fs.writeFile(file,disk,'utf8');
await fs.writeFile(path.join(project,'build','debug','compile_commands.json'),JSON.stringify([{directory:project,file,arguments:['clang','-x','c','-DPROJECT_FEATURE',file]}]),'utf8');
const discovered=await api.discover_clangd_environment({workspace_root:project},node);
assert.equal(discovered.compile_commands_dir,path.join(project,'build','debug'));checks.push('bounded build child database discovery');
const service=api.create_language_analysis_service(node);
try{
  const request={file_path:file,workspace_root:project,language:'c',text:disk};
  const first=await service.parse(request,signal()),all=flatten(first.symbols);
  await fs.writeFile(path.join(evidence,'first_result.json'),JSON.stringify(first,null,2),'utf8');
  for(const name of ['port_t','external','prototype','real','device','state','configured'])assert(all.some(item=>item.name===name),name+' in real clangd symbols');
  const real=all.find(item=>item.name==='real');assert.equal(disk.slice(real.selection_start,real.selection_end),'real');
  assert.equal(all.find(item=>item.name==='device').kind,'struct');assert.equal(all.find(item=>item.name==='prototype').kind,'function');
  assert(first.semantic_tokens?.data.length>0,'real clangd semantic tokens');assert(first.semantic_tokens.token_types.includes('function'));assert.equal(first.provider,'clangd');assert.equal(first.incomplete,false);checks.push('real clangd C conditional header, database macro, declarations, definitions, fields and exact selection');
  const conditional='#if FLAG\nint off;\n#if 1\nint nested;\n#endif\n#else\nint on;\n#endif\n';
  for(let index=0;index<20;index++){
    const enabled=index%2,result=await service.parse({...request,text:'#define FLAG '+enabled+'\n'+conditional},signal());
    assert(result.inactive_regions?.some(range=>range.start.line===(enabled?7:2)),JSON.stringify(result.inactive_regions));
    assert(!result.inactive_regions.some(range=>range.start.line===(enabled?2:7)));
  }
  const empty=await service.parse({...request,text:'int all_active;\n'},signal());assert.deepEqual(empty.inactive_regions,[]);
  checks.push('20 real clangd macro/else changes keep latest inactive ranges; active-only clears snapshot');
  const next=await service.parse({...request,text:disk+'\r\nint unsaved_only;\r\n'},signal());assert(flatten(next.symbols).some(item=>item.name==='unsaved_only'));
  assert.equal(await fs.readFile(file,'utf8'),disk);checks.push('didChange analyzes unsaved buffer without disk writes');
  const cancelled=new AbortController();const stale=service.parse({...request,text:'int stale;'},cancelled.signal);cancelled.abort();await assert.rejects(stale,error=>error.name==='AbortError');
  const fresh=await service.parse({...request,text:'int fresh;'},signal());assert.deepEqual(flatten(fresh.symbols).map(item=>item.name),['fresh']);checks.push('cancellation cannot replace newer document version');
  const cpp_file=path.join(project,'different.cpp');await fs.writeFile(cpp_file,'','utf8');
  const cpp=await service.parse({file_path:cpp_file,workspace_root:project,language:'cpp',text:'namespace engine { class Device { int state; void reset(); }; enum class Color { Red, Blue }; }'},signal());
  await fs.writeFile(path.join(evidence,'cpp_result.json'),JSON.stringify(cpp,null,2),'utf8');
  const cpp_all=flatten(cpp.symbols);for(const name of ['engine','Device','state','reset','Color','Red','Blue'])assert(cpp_all.some(item=>item.name===name));
  assert.equal(cpp_all.find(item=>item.name==='Color').kind,'enum');assert.equal(cpp_all.find(item=>item.name==='Red').kind,'enum-member');checks.push('C++ compiler symbols preserve namespaces, classes, enum values and methods');
  const navigation_text='int destination(int value) { return value; }\nint call(void) { return destination(7); }\n';
  const nav_request={...request,text:navigation_text};
  const definition=await service.navigate(nav_request,'definition',{line:1,character:25},signal());
  assert.equal(definition[0].file_path,file);assert.equal(definition[0].range.start.line,0);
  const declaration=await service.navigate(nav_request,'declaration',{line:1,character:25},signal());assert.equal(declaration[0].range.start.line,0);
  const refs=await service.navigate(nav_request,'references',{line:0,character:7},signal());assert(refs.length>=2);
  assert.deepEqual(await service.navigate(nav_request,'definition',{line:1,character:0},signal()),[]);
  checks.push('real clangd definition, declaration, references and no target from unsaved buffer');
  await service.dispose();await assert.rejects(service.parse(request,signal()),error=>error.name==='AbortError');checks.push('shutdown and disposal reject later work');
}finally{await service.dispose();}

// If the implementation file is not open: it must come from the real engineering index of the compilation database, not from the current AST.
const indexed_root=path.join(evidence,'indexed project'),caller=path.join(indexed_root,'caller.c'),implementation=path.join(indexed_root,'implementation.c'),header=path.join(indexed_root,'api.h');
await fs.mkdir(indexed_root);await fs.writeFile(header,'int project_function(int value);\n');await fs.writeFile(implementation,'#include "api.h"\nint project_function(int value) { return value + 1; }\n');
const caller_text='#include "api.h"\nint caller(void) { return project_function(7); }\n';await fs.writeFile(caller,caller_text);
await fs.writeFile(path.join(indexed_root,'compile_commands.json'),JSON.stringify([caller,implementation].map(file=>({directory:indexed_root,file,arguments:['clang','-c',file]}))));
const indexed_service=api.create_language_analysis_service(node),indexed_request={file_path:caller,workspace_root:indexed_root,language:'c',text:caller_text,background_index:true};
try{
 let definitions=[];for(let i=0;i<80;i++){definitions=await indexed_service.navigate(indexed_request,'definition',{line:1,character:28},signal());if(definitions.some(item=>item.file_path===implementation))break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert(definitions.some(item=>item.file_path===implementation&&item.range.start.line===1),'unopened implementation from project index');
 const declarations=await indexed_service.navigate(indexed_request,'declaration',{line:1,character:28},signal());assert(declarations.some(item=>item.file_path===header));
 const references=await indexed_service.navigate(indexed_request,'references',{line:1,character:28},signal());assert(references.some(item=>item.file_path===caller)&&references.some(item=>item.file_path===implementation));
 assert.equal(await fs.readFile(caller,'utf8'),caller_text);
 checks.push('real project index: unopened implementation, separate header declaration, cross-translation-unit references; source unchanged');
}finally{await indexed_service.dispose();}

let diagnostic_document,diagnostic_mode='none';
on_fake_write=message=>{
  if(message.method==='initialize')respond({id:message.id,result:{capabilities:{documentSymbolProvider:true,positionEncoding:'utf-16'}}});
  if(message.method==='textDocument/didOpen'||message.method==='textDocument/didChange')diagnostic_document=message.params.textDocument;
  if(message.method==='textDocument/documentSymbol'){
    if(diagnostic_mode==='stale'||diagnostic_mode==='unversioned')respond({method:'textDocument/publishDiagnostics',params:{uri:diagnostic_document.uri,version:diagnostic_mode==='stale'?diagnostic_document.version-1:undefined,diagnostics:[{severity:1,message:'old or unassigned'}]}});
    respond({id:message.id,result:[]});
  }
};
const diagnostic_service=api.create_language_analysis_service(fake_node),diagnostic_request={file_path:file,workspace_root:project,language:'c',text:disk};
try{
  const pending_diagnostic=await diagnostic_service.parse(diagnostic_request,signal());
  assert.equal(pending_diagnostic.diagnostics.received,false,'symbols can precede their diagnostics');
  respond({method:'textDocument/publishDiagnostics',params:{uri:diagnostic_document.uri,version:diagnostic_document.version,diagnostics:[{severity:1,message:'current compiler setting'}]}});
  const delivered=await diagnostic_service.parse(diagnostic_request,signal());assert.equal(delivered.diagnostics.received,true);assert.equal(delivered.diagnostics.errors,1);
  diagnostic_mode='stale';const stale=await diagnostic_service.parse({...diagnostic_request,text:disk+'\nint new_version;'},signal());assert.equal(stale.diagnostics.received,false);assert.equal(stale.diagnostics.errors,0);
  diagnostic_mode='unversioned';const unversioned=await diagnostic_service.parse(diagnostic_request,signal());assert.equal(unversioned.diagnostics.received,false);assert.equal(unversioned.diagnostics.errors,0);
}finally{await diagnostic_service.dispose();on_fake_write=undefined;}
checks.push('diagnostics distinguish not-yet-received, current-version, stale and unversioned notifications');

// Multi-language protocol validation: the real child process is still validated by the following clangd use case.
for(const language of ['python','java']){
 writes=[];
 on_fake_write=message=>{
  if(message.method==='initialize')queueMicrotask(()=>respond({id:message.id,result:{capabilities:{positionEncoding:'utf-16',documentSymbolProvider:true,semanticTokensProvider:{full:true,legend:{tokenTypes:['function'],tokenModifiers:['declaration']}}}}}));
  if(message.method==='textDocument/documentSymbol')queueMicrotask(()=>respond({id:message.id,result:[]}));
  if(message.method==='textDocument/semanticTokens/full')queueMicrotask(()=>respond({id:message.id,result:{data:[0,0,3,0,1]}}));
 };
 let semantic_refreshes=0;const language_service=api.create_language_analysis_service(fake_node,()=>{semantic_refreshes++;});
 try{
  const result=await language_service.parse({file_path:file,workspace_root:project,language,text:'abc',server:{provider:'lsp',command:process.execPath,args:['server.js','--stdio'],initialization_options:{test:true},settings:{demo:{enabled:true}}}},signal());
  respond({id:557,method:'workspace/semanticTokens/refresh',params:{}});assert.equal(semantic_refreshes,1);assert.equal(writes.find(m=>m.id===557).result,null);assert.equal(writes.find(m=>m.method==='initialize').params.capabilities.workspace.semanticTokens.refreshSupport,true);
  assert.equal(result.provider,'lsp');assert.equal(result.semantic_tokens.data.length,5);
  assert.equal(writes.find(m=>m.method==='textDocument/didOpen').params.textDocument.languageId,language);
  assert.deepEqual(writes.find(m=>m.method==='initialize').params.initializationOptions,{test:true});
  respond({id:555,method:'workspace/configuration',params:{items:[{section:'demo'},{section:'missing'}]}});
  assert.deepEqual(writes.find(m=>m.id===555).result,[{enabled:true},null]);
  respond({id:556,method:'workspace/applyEdit',params:{}});assert.equal(writes.find(m=>m.id===556).error.code,-32601);
 }finally{await language_service.dispose();on_fake_write=undefined;}
}
checks.push('Python/Java stdio LSP profiles preserve language, initialization, configuration, semantic legend and reject edits (protocol fixture)');

// Strictly distinguish undefined, protocol failure, and declared fallback; do not allow arbitrary protocol targets.
const target_uri=node('url').pathToFileURL(file).href,range={start:{line:0,character:4},end:{line:0,character:8}};
let navigation_mode='fallback',navigation_diagnostics=[];
on_fake_write=message=>{
 if(message.method==='initialize')respond({id:message.id,result:{capabilities:{definitionProvider:true,declarationProvider:true,referencesProvider:true,documentSymbolProvider:true}}});
 if(message.method==='textDocument/didOpen'||message.method==='textDocument/didChange')diagnostic_document=message.params.textDocument;
 if(message.method==='textDocument/definition')respond(navigation_mode==='error'?{id:message.id,error:{code:-32603,message:'navigation failure'}}:{id:message.id,result:[]});
 if(message.method==='textDocument/declaration')respond({id:message.id,result:[{targetUri:target_uri,targetRange:range,targetSelectionRange:range},{uri:target_uri,range},{uri:'https://invalid.test/x',range},{uri:target_uri,range:{start:{line:-1,character:0},end:{line:1,character:1}}}]});
};
const navigation_service=api.create_language_analysis_service(fake_node,()=>{},(text,items)=>navigation_diagnostics.push({text,items}));
try{
 writes=[];const result=await navigation_service.navigate(diagnostic_request,'definition',{line:0,character:4},signal());assert.equal(result.length,1);assert.equal(result[0].file_path,file);
 assert(writes.findIndex(m=>m.method==='textDocument/definition')<writes.findIndex(m=>m.method==='textDocument/declaration'));
 respond({method:'textDocument/publishDiagnostics',params:{uri:diagnostic_document.uri,version:diagnostic_document.version,diagnostics:[{range,severity:1,message:'late valid error'}]}});assert.equal(navigation_diagnostics.at(-1).items[0].message,'late valid error');
 respond({method:'textDocument/publishDiagnostics',params:{uri:diagnostic_document.uri,version:diagnostic_document.version-1,diagnostics:[{range,severity:1,message:'stale error'}]}});assert.equal(navigation_diagnostics.length,1);
 navigation_mode='error';writes=[];await assert.rejects(navigation_service.navigate(diagnostic_request,'definition',{line:0,character:4},signal()),/navigation failure/);assert(!writes.some(m=>m.method==='textDocument/declaration'));
 const aborted=new AbortController();aborted.abort();await assert.rejects(navigation_service.navigate(diagnostic_request,'definition',{line:0,character:4},aborted.signal),e=>e.name==='AbortError');
}finally{await navigation_service.dispose();on_fake_write=undefined;}
checks.push('definition falls back only on empty results, LocationLink/dedup/URI validation, error and cancellation preserve origin, late diagnostic version guard');

const launch_fail=api.create_language_analysis_service(node);
try{await assert.rejects(launch_fail.parse({file_path:file,workspace_root:project,language:'c',text:disk,executable:process.execPath},signal()),/clangd/);checks.push('non-LSP executable exit rejects without hanging');}finally{await launch_fail.dispose();}

// Optional read-only engineering validation is only executed when explicitly passed in, and does not write personal workspace paths into products or fixtures.
if(process.env.TYPORA_CLANGD_TEST_FILE){
  const file_path=path.resolve(process.env.TYPORA_CLANGD_TEST_FILE),workspace_root=path.resolve(process.env.TYPORA_CLANGD_TEST_ROOT||path.dirname(file_path)),text=await fs.readFile(file_path,'utf8');
  const real_service=api.create_language_analysis_service(node);
  try{const result=await real_service.parse({file_path,workspace_root,language:/\.cpp$/i.test(file_path)?'cpp':'c',text},signal());assert.equal(await fs.readFile(file_path,'utf8'),text);await fs.writeFile(path.join(evidence,'project_result.json'),JSON.stringify(result,null,2),'utf8');checks.push('explicit project header read-only parse: '+result.symbols.length+' roots');}finally{await real_service.dispose();}
}
assert.equal(await fs.readFile(file,'utf8'),disk);
assert.deepEqual((await fs.readdir(project)).sort(),['build','different.cpp','source header.h']);
checks.push('no project cache, hidden configuration or source mutation');
await fs.writeFile(path.join(evidence,'result.json'),JSON.stringify({checks,executable:environment.executable},null,2),'utf8');
console.log(JSON.stringify({ok:true,checks,evidence},null,2));
