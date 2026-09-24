// 真实双克隆与bare远端；显示读取不访问用户仓库或公共网络。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:['git_graph_repository','git_graph_settings','git_graph_runtime','git_history_ranges'].map(name=>`export * from './src/${name}.ts'`).join(';'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'typora_history_ranges_')),checks=[];
const git=(root,args)=>child_process.execFileSync('git',['-c','core.hooksPath=.git/unused_hooks','-c','user.name=Range QA','-c','user.email=qa@example.invalid','-c','commit.gpgsign=false','-c','core.autocrlf=false',...args],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
const root=path.join(temp,'local'),remote=path.join(temp,'remote.git'),peer=path.join(temp,'peer');fs.mkdirSync(root);git(root,['init','-b','master']);
const save=(cwd,file,value)=>{fs.writeFileSync(path.join(cwd,file),value,'utf8');git(cwd,['add','--',file]);git(cwd,['commit','-m',file]);return git(cwd,['rev-parse','HEAD']);};
const reader=api.create_git_runner({child_process,process}),read=(branches=[],count=100)=>api.read_repository(reader.run,root,api.graph_defaults,count,branches),ranges=state=>api.build_history_model(state).items.flatMap(item=>item.range?[item.range]:[]);
try{
 const base=save(root,'base.md','# base');git(temp,['clone','--bare',root,remote]);git(root,['remote','add','team/origin',remote]);git(root,['push','-u','team/origin','master:renamed']);git(temp,['clone',remote,peer]);git(peer,['checkout','-b','work','origin/renamed']);
 assert.equal(ranges(await read()).length,0);checks.push('同步时没有虚拟差异');
 const first=save(root,'first.md','one'),head=save(root,'second.md','two');let state=await read(),out=ranges(state)[0];assert.equal(out.kind,'outgoing');assert.equal(out.count,2);assert.equal(out.from,base);assert.equal(out.to,head);assert.equal(out.branch,'master');
 assert.deepEqual((await api.compare_files(reader.run,state,out.from,out.to)).map(file=>file.path).sort(),['first.md','second.md']);checks.push('传出汇总多笔提交且使用真实端点');
 const incoming=save(peer,'remote.md','remote');git(peer,['push','origin','work:renamed']);assert.equal(ranges(await read()).length,1);git(root,['fetch','team/origin']);state=await read();const both=ranges(state);assert.equal(both.length,2);const next=both.find(range=>range.kind==='incoming');assert.equal(next.branch,'team/origin/renamed');assert.equal(next.from,base);assert.equal(next.to,incoming);assert.deepEqual((await api.compare_files(reader.run,state,next.from,next.to)).map(file=>file.path),['remote.md']);checks.push('获取后显示分叉和异名远端上游，不混入另一侧文件');
 const model=api.build_history_model(state),ids=model.items.map(item=>item.id);assert.equal(ids[ids.indexOf(head)-1],both.find(item=>item.kind==='outgoing').id);assert.equal(ids[ids.indexOf(base)-1],next.id);assert.equal(model.graph.rows.length,state.commits.length+2);assert(state.commits.find(item=>item.hash===incoming).parents.includes(base));checks.push('图节点位于HEAD和共同祖先边界，原始提交父链不变');
 assert.deepEqual(ranges(await read(['HEAD'])).map(range=>range.kind),['outgoing']);assert.deepEqual(ranges(await read(['refs/remotes/team/origin/renamed'])).map(range=>range.kind),['incoming']);assert.equal(ranges(await read(['AUTO'])).length,2);checks.push('HEAD/远端/自动筛选遵守引用身份');
 assert(!ranges(await read([],1)).some(range=>range.kind==='incoming'));assert(ranges(await read([],100)).some(range=>range.kind==='incoming'));checks.push('共同祖先未分页载入时不误放传入节点');
 git(root,['merge','--no-edit','team/origin/renamed']);state=await read();assert.deepEqual(ranges(state).map(range=>range.kind),['outgoing']);git(root,['push','team/origin','master:renamed']);assert.equal(ranges(await read()).length,0);checks.push('合并后不保留传入，推送后清除传出');
 save(peer,'remote2.md','remote2');git(peer,['fetch','origin']);git(peer,['merge','--no-edit','origin/renamed']);git(peer,['push','origin','work:renamed']);git(root,['fetch','team/origin']);state=await read();assert.deepEqual(ranges(state).map(range=>range.kind),['incoming']);checks.push('仅落后时只有传入');
 git(root,['branch','--unset-upstream']);assert.equal(ranges(await read()).length,0);git(root,['branch','--set-upstream-to=team/origin/renamed']);git(root,['update-ref','-d','refs/remotes/team/origin/renamed']);assert.equal(ranges(await read()).length,0);git(root,['checkout','--detach',head]);assert.equal(ranges(await read()).length,0);checks.push('无上游、已删除上游、分离HEAD不伪造差异');
 // 大量其他分支不改变区间身份；投影仅遍历已加载图，不执行额外Git查询。
 for(const count of [20,100,1000]){const commits=Array.from({length:count},(_,i)=>({hash:(i+1000).toString(16).padStart(40,'0'),parents:i<count-1?[(i+1001).toString(16).padStart(40,'0')]:[],author:'',date:'',subject:''}));const sample={...state,branch:'master',head:commits[0].hash,commits,history_refs:undefined,tracking:{...state.tracking,ahead:count-1,behind:0,upstream_hash:commits.at(-1).hash,merge_base:commits.at(-1).hash}};assert.equal(ranges(sample)[0].count,count-1);assert.equal(api.build_history_model(sample).items.length,count+1);}
 checks.push('20/100/1000提交投影保持计数和拓扑规模');
 console.log(JSON.stringify({status:'PASS',checks,evidence:temp,scope:'真实本地Git与bare远端；图规模为内存模型'}));
}finally{reader.cancel();}
