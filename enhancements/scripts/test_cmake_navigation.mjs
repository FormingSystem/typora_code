import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {Parser,Language} from 'web-tree-sitter';
const require=createRequire(import.meta.url);
const compiled=await build({stdin:{contents:"export * from './src/cmake_navigation';export * from './src/cmake_syntax';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
globalThis.window={reqnode:require};
await Parser.init();const grammar=await Language.load('vendor/source_symbols/tree-sitter-cmake.wasm');
const parse=async text=>{const parser=new Parser();parser.setLanguage(grammar);const tree=parser.parse(text);try{return {cmake:api.extract_cmake_document(tree.rootNode,text)};}finally{tree.delete();parser.delete();}};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cmake_navigation_')),file=path.join(root,'leaf.cmake'),defs=path.join(root,'definitions.cmake'),helper=path.join(root,'parts','helper.cmake');
fs.mkdirSync(path.dirname(helper));fs.writeFileSync(helper,'set(HELPER yes)\n');fs.writeFileSync(defs,'# set(EXTERNAL false)\nset(EXTERNAL true)\nfunction(external_command)\nendfunction()\nset(HELPERS "${CMAKE_CURRENT_LIST_DIR}/parts")\n');
const text='message("${EXTERNAL}")\nexternal_command()\ninclude(${HELPERS}/helper.cmake)\nexecute_process(COMMAND tool OUTPUT_VARIABLE WORDSIZE)\nmessage(${WORDSIZE})\n# EXTERNAL\nmessage("EXTERNAL")\n';fs.writeFileSync(file,text);
const service=api.create_cmake_navigation(fs,path,parse),signal=()=>new AbortController().signal;
try{
 for(let index=0;index<20;index++){
  const variable=await service.definition(root,file,text,{line:0,character:14},signal());assert.equal(variable.length,1);assert.equal(variable[0].file_path,defs);assert.equal(variable[0].range.start.line,1);
  const command=await service.definition(root,file,text,{line:1,character:3},signal());assert.equal(command[0].range.start.line,2);
  const include=await service.definition(root,file,text,{line:2,character:24},signal());assert.equal(include[0].file_path,helper);
 }
 const output=await service.definition(root,file,text,{line:4,character:13},signal());assert.equal(output[0].file_path,file);assert.equal(output[0].range.start.line,3);
 for(const line of [5,6])assert.deepEqual(await service.definition(root,file,text,{line,character:line===5?4:12},signal()),[]);
 const explicit_base='get_filename_component(UNRESOLVED parts ABSOLUTE BASE_DIR elsewhere)\ninclude(${UNRESOLVED}/helper.cmake)\n';assert.deepEqual(await service.definition(root,file,explicit_base,{line:1,character:27},signal()),[]);
 const changed='set(EXTERNAL unsaved)\n'+text;const memory=await service.definition(root,file,changed,{line:1,character:14},signal());assert.equal(memory[0].file_path,file);assert.equal(memory[0].range.start.line,0);assert.equal(fs.readFileSync(file,'utf8'),text);
 fs.writeFileSync(defs,'set(EXTERNAL changed)\nset(EXTERNAL second)\n');const multiple=await service.definition(root,file,text,{line:0,character:14},signal());assert.deepEqual(multiple.map(item=>item.range.start.line),[0,1]);
 const abort=new AbortController();abort.abort();await assert.rejects(service.definition(root,file,text,{line:0,character:14},abort.signal),error=>error.name==='AbortError');
 let finish;const delayed=api.create_cmake_navigation(fs,path,()=>new Promise(resolve=>finish=resolve)),controller=new AbortController(),pending=delayed.definition(root,file,text,{line:0,character:14},controller.signal);controller.abort();finish(await parse(text));await assert.rejects(pending,error=>error.name==='AbortError');delayed.dispose();
 service.dispose();await assert.rejects(service.definition(root,file,text,{line:0,character:14},signal()),error=>error.name==='AbortError');
 console.log('PASS CMake static definitions: 20 cross-file variable/function/include cycles, output variable, comment/string exclusions, unsaved preference, changed file, multiple candidates, cancellation and disposal.');
}finally{service.dispose();fs.rmSync(root,{recursive:true,force:true});}
