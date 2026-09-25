import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import {build} from 'esbuild';
const bundle = await build({stdin:{contents:['git_graph_repository','git_graph_runtime','git_graph_settings','git_repository_discovery','workspace_tree_rows','git_repository_operation'].map(name=>`export * from './src/${name}.ts';`).join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const root = fs.mkdtempSync(path.join(os.tmpdir(),'typora_git_lifecycle_'));
const runner = api.create_git_runner({child_process,process},{writable:true});
const git = (cwd,args)=>runner.run(cwd,['-c','user.name=Lifecycle','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=.unused-hooks',...args]);
const read = cwd=>api.read_repository(runner.run,cwd,api.graph_defaults,20);
const checks=[]; const check=(value,name)=>{assert(value,name);checks.push(name);};
try {
  await assert.rejects(read(root),error=>api.is_missing_repository(error)); checks.push('empty directory is distinct from operational error');
  await api.initialize_repository(runner.run,root);
  let state=await read(root);check(!state.head&&!state.commits.length&&!state.changes.length,'initialized empty repository has unborn HEAD');
  await api.initialize_repository(runner.run,root);check(!(await read(root)).head,'repeat initialize is harmless');
  fs.writeFileSync(path.join(root,'first.md'),'first');state=await read(root);check(state.changes[0].status==='??','untracked before first commit');
  await git(root,['add','first.md']);state=await read(root);check((await api.compare_files(runner.run,state,api.EMPTY,api.INDEX)).length===1,'staged before first commit');
  await git(root,['commit','-m','first']);state=await read(root);check(state.commits.length===1&&state.changes.length===0,'first commit refresh');
  const nested=path.join(root,'nested'), child=path.join(nested,'child');fs.mkdirSync(child,{recursive:true});
  check(path.normalize((await read(child)).root)===root,'ordinary descendant resolves actual parent');
  // Explicitly create a nested repository; initialize_repository would correctly reuse its existing parent.
  await git(nested,['init']);check(path.normalize((await read(child)).root)===nested,'new nested repository supersedes previous parent identity');
  const worktree=path.join(root,'worktree');await git(root,['worktree','add','-b','lifecycle-worktree',worktree]);check(fs.statSync(path.join(worktree,'.git')).isFile(),'worktree uses .git file');
  check(path.normalize((await read(worktree)).root)===worktree,'worktree resolves independent working root');
  const false_root=path.join(root,'false');fs.mkdirSync(false_root);fs.writeFileSync(path.join(false_root,'.git'),'invalid');
  const found=await api.discover_git_repositories({root,depth:4,run:runner.run,fs,path});
  assert.deepEqual(new Set(found.roots.map(item=>path.normalize(item))),new Set([root,nested,worktree]));check(found.errors.length>0,'invalid .git is reported, not treated as a repository');
  const complete=await api.discover_git_repositories({root,depth:5,run:runner.run,fs,path});check(complete.visited>1&&complete.roots.length>=1,'discovery walks the selected depth without count truncation');
  const abort=new AbortController();abort.abort();await assert.rejects(api.discover_git_repositories({root,depth:3,run:runner.run,fs,path,signal:abort.signal}),/取消/);checks.push('discovery cancellation');
  let writes=0;await assert.rejects(api.initialize_repository(async()=>{writes++;throw Object.assign(Error('permission denied'),{code:128});},root),/permission/);check(writes===1,'permission error cannot trigger init');
  await assert.rejects(api.initialize_repository(async()=>{throw Object.assign(Error('missing executable'),{code:'ENOENT'});},root),/missing executable/);checks.push('missing Git does not show initialize');
  fs.renameSync(path.join(nested,'.git'),path.join(nested,'git-backup'));check(path.normalize((await read(child)).root)===root,'removed nested marker returns to actual parent');
  const missing=path.join(root,'gone');await assert.rejects(read(missing),error=>!api.is_missing_repository(error));checks.push('missing directory is not an empty repository');
  const owner={},release=api.acquire_git_repository_operation(owner,root,path.normalize);
  assert.throws(()=>api.acquire_git_repository_operation(owner,root,path.normalize),/正在执行/);
  const other=api.acquire_git_repository_operation(owner,nested,path.normalize);other();release();release();api.acquire_git_repository_operation(owner,root,path.normalize)();checks.push('same repository serializes writers while independent repository remains usable');
  const changes=Array.from({length:50000},(_,i)=>({path:`folder/file-${i}.md`,status:'??'}));
  const started=performance.now();const merged=await api.compare_files(async()=> 'M\0folder/file-0.md\0',{...state,changes},api.INDEX,api.WORKTREE);const merge_ms=performance.now()-started;
  check(merged.length===50000&&new Set(merged.map(file=>file.path)).size===50000,'50k changes merged without duplication');check(merge_ms<500,'50k merge stays below 500ms regression ceiling');
  const rows=api.workspace_tree_rows([{path:'a/x'},{path:'b/y'},{path:'a/z'}],item=>item.path,new Set());
  assert.deepEqual(rows.filter(row=>row.item).map(row=>row.item.path),['a/x','a/z','b/y']);
  check(api.workspace_tree_rows(changes,item=>item.path,new Set(['folder'])).length===1,'collapsed 50k tree projects only its directory');
  console.log(JSON.stringify({status:'PASS',checks,merge_ms},null,2));
} finally {
  runner.cancel();assert(path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('typora_git_lifecycle_'));fs.rmSync(root,{recursive:true,force:true});
}
