// 数学契约测试：检查边界约束和空间守恒，不复制产品裁剪公式。
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import path from 'node:path';
const bundle=await build({entryPoints:[path.join(import.meta.dirname,'../src/git_graph_columns.ts')],bundle:true,write:false,platform:'node',format:'esm'});
const {resize_graph_column_pair:resize}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const widths={subject:300,date:145,author:110,hash:80};
assert.equal(resize('subject',2400,80,-3000,widths).right,1500,'wide flexible subject honors right maximum');
assert.equal(resize('subject',2400,80,10,widths).left,300,'stretch space is not persisted as minimum');
assert.equal(resize('subject',300,145,-260,widths).left,40,'subject minimum can shrink');
assert.equal(resize('author',40,1500,-10,widths).movement,0,'minimum/maximum stop rather than reverse');
let seed=501,checks=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let index=0;index<1000;index++){
 const key=index%2?'subject':'author',left=40+random()*(key==='subject'?3000:1460),right=40+random()*1460,delta=(random()-.5)*10000;
 const before={...widths,subject:Math.min(300,left)},original=JSON.stringify(before),result=resize(key,left,right,delta,before);
 const visible_left=left+result.movement;
 assert(Math.abs(visible_left+result.right-left-right)<1e-8,'pair conserves actual space');
 assert(visible_left>=40-1e-8&&result.right>=40-1e-8&&result.right<=1500+1e-8,'both minima and fixed maximum');
 if(key!=='subject')assert(result.left<=1500+1e-8);else assert(result.left<=before.subject&&result.left<=visible_left,'flex minimum is not frozen');
 assert(Math.abs(result.movement)<=Math.abs(delta)+1e-8&&result.movement*delta>=0,'clamp cannot reverse or overshoot pointer');
 assert.equal(JSON.stringify(before),original,'planner does not mutate settings');checks++;
}
console.log(JSON.stringify({status:'PASS',checks:checks+4,scope:'相邻列数学契约、宽窗口弹性、极限值和设置不可变'}));
