// 真实Git验收只操作新建临时仓库和本地bare远端。
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import cp from 'node:child_process';import {build} from 'esbuild';
const compiled=await build({stdin:{contents:['git_branch_checkout','git_graph_actions','git_graph_runtime'].map(name=>`export * from './src/${name}.ts'`).join(';'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'typora_checkout_')),root=path.join(temp,'work'),bare=path.join(temp,'remote.git'),config=path.join(temp,'gitconfig');fs.writeFileSync(config,'');fs.mkdirSync(root);
const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0'};
const git=(cwd,args)=>cp.execFileSync('git',['-c','core.hooksPath=.git/no_hooks','-c','commit.gpgsign=false','-c','user.name=Branch QA','-c','user.email=branch@example.invalid',...args],{cwd,env,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
const reader=api.create_git_runner({child_process:cp,process:{env}}),writer=api.create_git_runner({child_process:cp,process:{env}},{writable:true});
const refs=()=>api.read_checkout_refs(reader.run,root),head=()=>git(root,['rev-parse','HEAD']),branch=()=>git(root,['symbolic-ref','HEAD']).replace(/^refs\/heads\//u,'');
const prepare=request=>api.prepare_checkout(reader.run,root,{head:head(),...request}),execute=(plan,allowed=true)=>api.execute_git_action(writer.run,plan,()=>allowed);
const find=async name=>(await refs()).find(ref=>ref.name===name),checks=[];
try{
 git(root,['init','-b','main']);fs.writeFileSync(path.join(root,'file.md'),'base');git(root,['add','.']);git(root,['commit','-m','基线正文']);const first=head();
 git(root,['branch','topic/nested']);git(root,['tag','-a','topic/nested','-m','annotated']);git(temp,['init','--bare',bare]);git(root,['remote','add','team/origin',bare]);git(root,['push','team/origin','main:published/nested']);git(root,['symbolic-ref','refs/remotes/team/origin/HEAD','refs/remotes/team/origin/published/nested']);
 let all=await refs();assert(all.every(ref=>ref.hash===first));assert(!all.some(ref=>ref.name.endsWith('/HEAD')));assert.equal(all.find(ref=>ref.kind==='tag').subject,'基线正文');assert.equal(all.find(ref=>ref.kind==='tag').author,'Branch QA');checks.push('一次读取本地/斜杠remote/剥离标签详情，过滤符号HEAD');
 let plan=await prepare({ref:await find('refs/heads/topic/nested')});await execute(plan);assert.equal(branch(),'topic/nested');checks.push('分支与标签同名仍检出本地分支');
 plan=await prepare({ref:await find('refs/tags/topic/nested')});await execute(plan);assert.equal(head(),first);assert.throws(()=>branch());checks.push('附注标签进入分离HEAD');
 plan=await prepare({ref:await find('refs/remotes/team/origin/published/nested')});await execute(plan);assert.equal(branch(),'published/nested');assert.equal(git(root,['rev-parse','--symbolic-full-name','@{upstream}']),'refs/remotes/team/origin/published/nested');
 git(root,['branch','-m','renamed/tracker']);git(root,['checkout','main']);plan=await prepare({ref:await find('refs/remotes/team/origin/published/nested')});assert.deepEqual(plan.args,['checkout','--no-guess','renamed/tracker','--']);await execute(plan);assert.equal(branch(),'renamed/tracker');checks.push('自动新建跟踪分支，再复用异名本地跟踪分支，无输入确认');
 plan=await prepare({ref:await find('refs/heads/main'),detached:true});await execute(plan);assert.throws(()=>branch());
 plan=await prepare({ref:await find('refs/tags/topic/nested'),branch:'from/tag'});await execute(plan);assert.equal(branch(),'from/tag');assert.equal(head(),first);
 plan=await prepare({branch:'new/current'});await execute(plan);assert.equal(branch(),'new/current');await assert.rejects(prepare({branch:'main'}));await assert.rejects(prepare({branch:'bad..name'}));checks.push('创建并切换/指定来源/分离模式/重名非法拒绝');
 plan=await prepare({ref:await find('refs/heads/main')});const index=git(root,['ls-files','--stage','-z']);await assert.rejects(execute(plan,false));assert.equal(branch(),'new/current');assert.equal(git(root,['ls-files','--stage','-z']),index);checks.push('未保存正文拒绝执行，HEAD/index保持');
 const stale=await find('refs/heads/main');fs.writeFileSync(path.join(root,'file.md'),'changed');git(root,['add','.']);git(root,['commit','-m','new target']);git(root,['branch','-f','main','HEAD']);await assert.rejects(prepare({ref:stale}));checks.push('展示后引用变化拒绝旧目标');
 plan=await prepare({ref:await find('refs/heads/topic/nested')});fs.writeFileSync(path.join(root,'file.md'),'dirty bytes');await assert.rejects(execute(plan));assert.equal(fs.readFileSync(path.join(root,'file.md'),'utf8'),'dirty bytes');
 plan=await prepare({ref:await find('refs/heads/topic/nested')});await assert.rejects(execute(plan));assert.equal(branch(),'new/current');assert.equal(fs.readFileSync(path.join(root,'file.md'),'utf8'),'dirty bytes');checks.push('事务指纹变化/脏工作树冲突拒绝，不stash不强制覆盖');
 git(root,['branch','--unset-upstream','renamed/tracker']);git(root,['branch','published/nested']);await assert.rejects(prepare({ref:await find('refs/remotes/team/origin/published/nested')}));checks.push('远端默认名称碰撞不检出无关同名分支');
 const unborn=path.join(temp,'unborn');fs.mkdirSync(unborn);git(unborn,['init','-b','main']);plan=await api.prepare_checkout(reader.run,unborn,{branch:'first/new',head:''});await execute(plan);assert.equal(git(unborn,['symbolic-ref','--short','HEAD']),'first/new');checks.push('空仓创建未出生分支');
 console.log(JSON.stringify({status:'PASS',checks,evidence:temp},null,2));
}finally{reader.cancel();writer.cancel();}
