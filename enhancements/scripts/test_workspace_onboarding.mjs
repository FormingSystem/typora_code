import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {create_onboarding_store}=createRequire(import.meta.url)('../src/workspace_onboarding_state.cjs');
if(process.argv[2]==='child'){
 const root=process.argv[3],store=create_onboarding_store({fs,path,process,root,sequence:2026092707});
 for(let i=0;i<30&&store.pending();i++){store.claim(()=>fs.appendFileSync(path.join(root,'shown.log'),'shown\n'));await new Promise(r=>setTimeout(r,10));}
 process.exit(0);
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_onboarding_'));
let count=0;const check=(value,label)=>{assert.ok(value,label);count++;};
const sequence=2026092707,receipt=id=>fs.writeFileSync(path.join(root,'installation.json'),JSON.stringify({schema:1,sequence,install_id:id}));
const store=(extra={})=>create_onboarding_store({fs,path,process,root,sequence,...extra});
try{
 check(!store().pending(),'no receipt is not a new installation');
 const first='a'.repeat(32),second='b'.repeat(32);receipt(first);
 const a=store(),b=store();check(a.pending(),'first install pending');let shown=0;
 check(a.claim(()=>{shown++;check(!b.claim(()=>shown++),'concurrent window cannot show');}),'first window shows');
 check(shown===1&&!b.pending(),'seen shared across windows');check(!store().claim(()=>shown++),'restart does not show');
 receipt(second);check(!a.pending(),'old loaded window cannot consume new install');
 check(!store({sequence:sequence-1}).pending(),'old loaded sequence rejected');
 const c=store();check(c.pending(),'same version reinstall pending');
 fs.writeFileSync(path.join(root,'settings/onboarding.lock'),JSON.stringify({pid:123,token:'stale'}));
 check(store({process:{pid:process.pid,kill(){throw Object.assign(Error(),{code:'ESRCH'});}}}).claim(()=>shown++),'dead owner recovered');
 check(shown===2&&!c.pending(),'reinstall exactly once');
 receipt('c'.repeat(32));assert.throws(()=>store().claim(()=>{throw Error('display failed');}));check(store().pending(),'display failure remains pending');
 check(!fs.existsSync(path.join(root,'settings/onboarding.lock')),'failure releases lock');
 fs.writeFileSync(path.join(root,'settings/onboarding.lock'),'');
 check(!store().claim(()=>{}),'fresh empty lock remains owned');
 const old=new Date(Date.now()-60000);fs.utimesSync(path.join(root,'settings/onboarding.lock'),old,old);
 check(store().claim(()=>{}),'abandoned empty lock recovered');
 for(let i=0;i<100;i++){receipt(i.toString(16).padStart(32,'0'));check(store().claim(()=>{}),'repeat install '+i);}
 check(fs.readdirSync(path.join(root,'settings')).join()==='onboarding_state.json','fixed state footprint, no per-install accumulation');
 receipt('f'.repeat(32));
 await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'child',root],{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('child exit '+code)));})));
 check(fs.readFileSync(path.join(root,'shown.log'),'utf8')==='shown\n','eight real processes show exactly once');
 console.log(`PASS onboarding state ${count} checks`);
}finally{fs.rmSync(root,{recursive:true,force:true});}
