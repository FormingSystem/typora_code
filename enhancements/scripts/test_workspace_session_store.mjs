import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/workspace_session_store.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {create_workspace_session_store:create}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'typora_sessions_')),store=create(fs,path,crypto,dir),a=path.join(dir,'A'),b=path.join(dir,'B');
const file={path:path.join(a,'file.md'),source:false,pinned:true};
for(const cycles of [20,100,1000]){
 for(let i=0;i<cycles;i++){store.write(a,[file],0);store.write(b,[],-1);const reopened=create(fs,path,crypto,dir);assert.deepEqual(reopened.read(a).files,[file]);assert.equal(reopened.read(a).active,0);assert.deepEqual(reopened.read(b).files,[]);}
 console.log('PASS disk session isolation and independent reader: '+cycles);
}
assert.equal(store.read(path.join(dir,'missing')),undefined);
assert.throws(()=>store.write(a,[{...file,path:'typ://core.empty/'}],0));
assert.throws(()=>store.write(a,[file],1));
assert.throws(()=>store.write(a,Array(1001).fill(file),0));
const failing=create({...fs,renameSync(){throw Error('denied');}},path,crypto,dir);
assert.throws(()=>failing.write(a,[],-1),/denied/);assert.deepEqual(store.read(a).files,[file]);assert(!fs.readdirSync(dir).some(name=>name.endsWith('.tmp')));
const target=path.join(dir,crypto.createHash('sha256').update(store.root_key(a)).digest('hex')+'.json');fs.writeFileSync(target,'{bad');assert.throws(()=>store.read(a));
fs.writeFileSync(target,'x'.repeat(2*1024*1024+1));assert.throws(()=>store.read(a),/过大/);
const win=create(fs,path.win32,crypto,dir);assert.equal(win.root_key('C:\\Workspace\\'),win.root_key('c:\\workspace'));
console.log('PASS empty, invalid, corrupt, oversized and atomic failure preservation; Windows root normalization');
