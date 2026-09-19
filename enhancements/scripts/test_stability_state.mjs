import assert from 'node:assert/strict';
import {build} from 'esbuild';
const iterations=Number(process.env.TYPORA_STRESS_ITERATIONS||20);
assert([20,100,1000].includes(iterations));
const bundle=await build({stdin:{contents:'export {parse_status,repository_head_label} from "./src/git_graph_repository";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const cases=[['M ',false,true,false],[' M',true,false,false],['??',true,false,false],['MM',true,true,false],['UU',true,true,true],['R ',false,true,false]];
let random=20260919;
const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random;};
for(let iteration=0;iteration<iterations;iteration++) {
  const picked=Array.from({length:1+next()%20},()=>cases[next()%cases.length]);
  const records=picked.map(([status],index)=>status+' 文件 空格 '+index+'\0'+(status==='R '?'原文件 '+index+'\0':''));
  const changes=api.parse_status(records.join(''));
  assert.equal(changes.length,picked.length);
  const original=JSON.stringify(changes),state={branch:'feature/测试',head:'1234567890abcdef',changes,operation:'',refs:[]};
  const markers=(picked.some(entry=>entry[1])?'*':'')+(picked.some(entry=>entry[2])?'+':'')+(picked.some(entry=>entry[3])?'!':'');
  assert.equal(api.repository_head_label(state),'feature/测试'+markers);
  assert.equal(api.repository_head_label({...state,changes:[...changes].reverse()}),'feature/测试'+markers,'文件顺序不改变底栏语义');
  assert.equal(api.repository_head_label({...state,branch:''}),'12345678'+markers);
  assert.equal(JSON.stringify(changes),original,'纯状态投影不修改共享快照');
  changes.forEach((change,index)=>{assert.equal(change.path,'文件 空格 '+index);if(picked[index][0]==='R ')assert.equal(change.old_path,'原文件 '+index);});
}
console.log(JSON.stringify({status:'PASS',iterations,seed:20260919,max_files:20,concurrency:1,scope:'纯解析/状态属性，不替代Git进程或原生界面'}));
