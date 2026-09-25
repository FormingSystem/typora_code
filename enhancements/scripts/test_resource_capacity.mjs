import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';import {setFlagsFromString} from 'node:v8';import {runInNewContext} from 'node:vm';
setFlagsFromString('--expose_gc');const collect=runInNewContext('gc');
const built=await build({entryPoints:[fileURLToPath(new URL('../src/workspace_text_document.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {create_text_document}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_capacity_memory_')),samples=[];
const sample=async label=>{for(let i=0;i<3;i++){collect();await new Promise(r=>setTimeout(r,30));}samples.push({label,...process.memoryUsage()});};
const make=async (name,mib)=>{const target=path.join(root,name);const fd=fs.openSync(target,'w'),chunk=Buffer.alloc(1024*1024,65);for(let i=0;i<mib;i++)fs.writeSync(fd,chunk);fs.writeSync(fd,Buffer.from('TAIL'));fs.closeSync(fd);return target;};
const small=await make('repeat.txt',17),large=await make('large.txt',300);
const load=async file=>{const doc=create_text_document({fs,path_api:path},file);const result=await doc.load();assert(result.text.endsWith('TAIL'));return result.text.length;};
await sample('baseline');const length=await load(large);assert.equal(length,300*1024*1024+4);await sample('after_300MiB_load_released');
for(let i=0;i<20;i++){await load(small);if((i+1)%5===0)await sample('after_'+(i+1)+'_loads');}
// 真实原子保存；通过末尾和大小验证写入完整，正文对象离开函数作用域后再采样。
await (async()=>{const doc=create_text_document({fs,path_api:path},large);const result=await doc.load();await doc.save(result.text+'SAVED');assert.equal(fs.statSync(large).size,300*1024*1024+9);const fd=fs.openSync(large,'r'),tail=Buffer.alloc(9);fs.readSync(fd,tail,0,9,fs.statSync(large).size-9);fs.closeSync(fd);assert.equal(tail.toString(),'TAILSAVED');})();
await sample('after_300MiB_save_released');
console.log(JSON.stringify({status:'PASS',large_bytes:300*1024*1024+4,cycles:20,samples,evidence:root,scope:'Node text document load/save; not a whole-application leak proof'},null,2));
