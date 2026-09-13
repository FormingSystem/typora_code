// 快捷网络动作只使用本脚本创建的本地 bare 远端，不连接用户远端。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:['git_quick_actions','git_remote_data','git_graph_actions','git_graph_repository','git_graph_settings','git_graph_runtime'].map(name=>`export * from './src/${name}.ts'`).join(';'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'typora_git_quick_')),checks=[];
const global_config=path.join(temp,'gitconfig');fs.writeFileSync(global_config,'');
const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:global_config,GIT_TERMINAL_PROMPT:'0'};
const runtime={child_process,process:{env}};
const reader=api.create_git_runner(runtime),writer=api.create_git_runner(runtime,{writable:true});
const git=(cwd,args)=>child_process.execFileSync('git',['-c','core.hooksPath=.git/unused_hooks','-c','core.autocrlf=false',...args],{cwd,env,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
const write=(cwd,file,contents)=>fs.writeFileSync(path.join(cwd,file),contents);
const configure=cwd=>{for(const [key,value]of[['user.name','Quick Actions QA'],['user.email','quick@example.invalid'],['commit.gpgsign','false'],['core.autocrlf','false'],['core.hooksPath','.git/unused_hooks']])git(cwd,['config',key,value]);};
const commit=(cwd,file,contents)=>{write(cwd,file,contents);git(cwd,['add','--',file]);git(cwd,['commit','-m',file]);return git(cwd,['rev-parse','HEAD']);};
const create=name=>{const cwd=path.join(temp,name);fs.mkdirSync(cwd);git(cwd,['init','-b','main']);configure(cwd);commit(cwd,'base.md','base\n');return cwd;};
const bare=name=>{const remote=path.join(temp,name+'.git');git(temp,['init','--bare',remote]);return remote;};
const pair=name=>{const local=create(name),remote=bare(name+'_remote');git(local,['remote','add','team/origin',remote]);git(local,['push','-u','team/origin','main:published']);const other=path.join(temp,name+'_other');git(temp,['clone','-b','published',remote,other]);configure(other);return {local,remote,other};};
const context=local=>({root:local,target:'',hash:git(local,['rev-parse','HEAD']),operation:''});
const prepare=(local,id,choose,options,settings=api.graph_defaults)=>api.prepare_quick_git_action(reader.run,id,context(local),settings,choose,options);
const writes=calls=>calls.filter(args=>['fetch','pull','push'].includes(args[0]));
const execute=(plan,can_change_files=()=>true,calls=[])=>api.execute_git_action((cwd,args,execution)=>{calls.push(args);return writer.run(cwd,args,execution);},plan,can_change_files);
const state=local=>api.read_repository(reader.run,local,api.graph_defaults,100);
try{
  const fetch_pair=pair('fetch_all'),backup=bare('fetch_backup');git(fetch_pair.local,['remote','add','backup',backup]);
  const remote_head=commit(fetch_pair.other,'remote.md','new remote data\n');git(fetch_pair.other,['push']);
  const before=git(fetch_pair.local,['rev-parse','HEAD']);const plan=await prepare(fetch_pair.local,'fetch',()=>{throw new Error('Fetch all must not request selection');});
  assert.deepEqual(plan.args,['fetch','--all']);assert.equal(git(fetch_pair.local,['rev-parse','HEAD']),before);
  const calls=[];await execute(plan,()=>false,calls);assert.deepEqual(writes(calls).map(args=>args[0]),['fetch']);
  assert.equal(git(fetch_pair.local,['rev-parse','refs/remotes/team/origin/published']),remote_head);assert.equal(git(fetch_pair.local,['rev-parse','HEAD']),before);
  const fetched=await state(fetch_pair.local);assert.equal(fetched.tracking.behind,1);assert(fetched.commits.some(item=>item.hash===remote_head));
  const scoped=await prepare(fetch_pair.local,'fetch',undefined,{remote:'team/origin'},{...api.graph_defaults,fetch_prune:true,fetch_prune_tags:true});assert.deepEqual(scoped.args,['fetch','--prune','--prune-tags','team/origin']);
  checks.push('fetch all and explicit-remote fetch read defaults automatically, update refs/counts/history, and require no editable-document or chooser confirmation');

  const pull=await prepare(fetch_pair.local,'pull',()=>{throw new Error('Existing upstream must not request selection');});
  assert.equal(pull.args.at(-2),'team/origin');assert.equal(pull.args.at(-1),'published');const pull_calls=[];await execute(pull,()=>true,pull_calls);
  assert.deepEqual(writes(pull_calls).map(args=>args[0]),['pull']);assert.equal(git(fetch_pair.local,['rev-parse','HEAD']),remote_head);assert.equal((await state(fetch_pair.local)).tracking.behind,0);
  const pushed_head=commit(fetch_pair.local,'local.md','local\n');const push=await prepare(fetch_pair.local,'push',()=>{throw new Error('Existing upstream must not request selection');});
  assert.deepEqual(push.args,['push','team/origin','refs/heads/main:refs/heads/published']);await execute(push);assert.equal(git(fetch_pair.remote,['rev-parse','published']),pushed_head);assert.equal((await state(fetch_pair.local)).tracking.ahead,0);
  checks.push('pull/push use exact slash-containing remote and differently named upstream and refresh the resulting counts');

  const contextual=pair('contextual'),overlap=bare('contextual_overlap');git(contextual.local,['config','remote.team.url',overlap]);
  const scoped_ref=await prepare(contextual.local,'fetch',undefined,{remote_ref:'team/origin/published'});assert.deepEqual(scoped_ref.args,['fetch','team/origin','published']);await execute(scoped_ref);
  git(contextual.local,['symbolic-ref','refs/remotes/team/origin/HEAD','refs/remotes/team/origin/published']);assert.deepEqual((await prepare(contextual.local,'fetch',undefined,{remote_ref:'team/origin/HEAD'})).args,['fetch','team/origin','published']);
  await assert.rejects(prepare(contextual.local,'fetch',undefined,{remote_ref:'missing/main'}));await assert.rejects(prepare(contextual.local,'fetch',undefined,{remote_ref:'team/origin/--upload-pack=unexpected'}));
  assert.deepEqual((await prepare(contextual.local,'fetch',undefined,{remote_ref:'team/origin'})).args,['fetch','team/origin']);
  checks.push('remote-ref shortcuts resolve longest configured remote names, scoped fetch and remote/HEAD without falling back to hand-written target forms');

  git(contextual.other,['checkout','-b','incoming']);const incoming_head=commit(contextual.other,'incoming.md','selected remote branch\n');git(contextual.other,['push','origin','incoming']);
  git(contextual.local,['branch','--unset-upstream']);const selected_pull=await prepare(contextual.local,'pull',undefined,{remote_ref:'team/origin/incoming'});assert.deepEqual(selected_pull.args.slice(-2),['team/origin','incoming']);await execute(selected_pull);
  assert.equal(git(contextual.local,['rev-parse','HEAD']),incoming_head);assert.equal(git(contextual.local,['branch','--show-current']),'main');assert.equal((await state(contextual.local)).tracking.upstream,'');
  git(contextual.local,['branch','other']);await assert.rejects(prepare(contextual.local,'pull',undefined,{branch:'other'}),/切换|Switch/);
  checks.push('selected remote Pull merges that exact source into the current branch without inventing upstream; noncurrent local branch Pull is rejected');

  const selected_branch=pair('selected_branch'),selected_fork=bare('selected_fork');git(selected_branch.local,['remote','add','fork',selected_fork]);git(selected_branch.local,['checkout','-b','topic']);git(selected_branch.local,['push','-u','fork','topic:published-topic']);
  const selected_head=commit(selected_branch.local,'topic.md','selected branch content\n');git(selected_branch.local,['checkout','main']);const main_head=git(selected_branch.local,['rev-parse','HEAD']);git(selected_branch.local,['config','remote.pushDefault','team/origin']);git(selected_branch.local,['config','branch.topic.pushRemote','fork']);
  const branch_push=await prepare(selected_branch.local,'push',()=>{throw new Error('Selected branch has exact push target');},{branch:'topic',target_hash:selected_head});assert.deepEqual(branch_push.args,['push','fork','refs/heads/topic:refs/heads/published-topic']);await execute(branch_push);
  assert.equal(git(selected_fork,['rev-parse','published-topic']),selected_head);assert.equal(git(selected_branch.local,['rev-parse','HEAD']),main_head);assert.equal(git(selected_branch.remote,['rev-parse','published']),main_head);
  await assert.rejects(prepare(selected_branch.local,'push',undefined,{branch:'topic',target_hash:main_head}));await assert.rejects(prepare(selected_branch.local,'push',undefined,{branch:'missing'}));
  git(selected_branch.local,['branch','unpublished-topic']);git(selected_branch.local,['config','--unset','remote.pushDefault']);await assert.rejects(prepare(selected_branch.local,'push',async()=>{git(selected_branch.local,['branch','-f','unpublished-topic','topic']);return 'fork';},{branch:'unpublished-topic'}));
  checks.push('branch Push reads the selected local branch pushRemote and differently named upstream, leaves current HEAD untouched, and rejects missing or stale branch targets');

  const publishing=create('publishing'),publish_remote=bare('publishing');git(publishing,['remote','add','only',publish_remote]);
  const publish=await prepare(publishing,'push',()=>{throw new Error('Sole remote must publish directly');});
  assert.deepEqual(publish.args,['push','--set-upstream','only','refs/heads/main:refs/heads/main']);await execute(publish);assert.equal((await state(publishing)).tracking.upstream,'refs/remotes/only/main');
  const unpublished=create('unpublished'),upstream_remote=bare('upstream'),fork_remote=bare('fork');git(unpublished,['remote','add','upstream',upstream_remote]);git(unpublished,['remote','add','fork',fork_remote]);
  let chooser_calls=0;const cancelled=await prepare(unpublished,'sync',async(items,branch)=>{chooser_calls++;assert.equal(items.length,2);assert.equal(branch,'main');return undefined;});
  assert.equal(cancelled,undefined);assert.equal(chooser_calls,1);assert.equal(git(upstream_remote,['for-each-ref']), '');assert.equal(git(fork_remote,['for-each-ref']), '');assert(!git(unpublished,['config','--local','--list']).split('\n').some(line=>line.startsWith('branch.')));
  const selected=await prepare(unpublished,'sync',async items=>{assert(items.some(item=>item.name==='fork'));return 'fork';});assert(selected.args.includes('--set-upstream'));await execute(selected);assert.equal((await state(unpublished)).tracking.remote,'fork');assert.equal(git(upstream_remote,['for-each-ref']),'');
  await assert.rejects(prepare(unpublished,'push',undefined,{remote:'not-configured'}));
  checks.push('publish is immediate for one remote; ambiguous publication offers known remotes once, cancellation writes nothing, and selection publishes only that destination');

  const triangle=pair('triangle'),fork=bare('triangle_fork'),override=bare('triangle_override');git(triangle.local,['remote','add','fork',fork]);git(triangle.local,['remote','add','override',override]);
  git(triangle.local,['config','remote.pushDefault','fork']);let target=await prepare(triangle.local,'push');assert.deepEqual(target.args,['push','fork','refs/heads/main:refs/heads/main']);await execute(target);
  git(triangle.local,['config','branch.main.pushRemote','override']);const triangle_head=commit(triangle.local,'triangle.md','triangular workflow\n');target=await prepare(triangle.local,'push');assert.deepEqual(target.args,['push','override','refs/heads/main:refs/heads/main']);await execute(target);
  assert.equal(git(override,['rev-parse','main']),triangle_head);assert.notEqual(git(triangle.remote,['rev-parse','published']),triangle_head);assert.equal((await state(triangle.local)).tracking.remote,'team/origin');
  const sync=await prepare(triangle.local,'sync');assert.equal(sync.sync.target.remote,'team/origin');assert.equal(sync.sync.push_args[1],'team/origin');await execute(sync);assert.equal(git(triangle.remote,['rev-parse','published']),triangle_head);
  checks.push('ordinary push respects explicit pushRemote over pushDefault without rewriting pull upstream; sync keeps the selected upstream transaction');

  const settings_pair=pair('pull_settings');git(settings_pair.local,['config','branch.main.rebase','true']);assert((await prepare(settings_pair.local,'pull')).args.includes('--rebase'));
  git(settings_pair.local,['config','branch.main.rebase','merges']);assert((await prepare(settings_pair.local,'pull')).args.includes('--rebase=merges'));
  git(settings_pair.local,['config','branch.main.rebase','false']);assert((await prepare(settings_pair.local,'pull')).args.includes('--no-rebase'));
  git(settings_pair.local,['config','pull.ff','only']);assert((await prepare(settings_pair.local,'pull')).args.includes('--ff-only'));
  git(settings_pair.local,['config','branch.main.rebase','true']);assert((await prepare(settings_pair.local,'pull')).args.includes('--ff-only'));git(settings_pair.local,['config','--unset','pull.ff']);
  git(settings_pair.local,['config','branch.main.rebase','interactive']);await assert.rejects(prepare(settings_pair.local,'pull'),/交互|interactive/);
  git(settings_pair.local,['config','pull.rebase','true']);git(settings_pair.local,['config','branch.main.rebase','']);assert((await prepare(settings_pair.local,'pull')).args.includes('--no-rebase'));
  git(settings_pair.local,['config','--unset','branch.main.rebase']);fs.appendFileSync(path.join(settings_pair.local,'.git','config'),'\n[branch \"main\"]\n\trebase\n');assert((await prepare(settings_pair.local,'pull')).args.includes('--rebase'));
  git(settings_pair.local,['config','branch.main.rebase','invalid']);await assert.rejects(prepare(settings_pair.local,'pull'));
  checks.push('effective branch/pull rebase and fast-forward configuration is applied without displaying parameter fields, with interactive mode kept out of unattended execution');

  const guards=pair('guards');let guarded=await prepare(guards.local,'push');git(guards.local,['config','branch.main.merge','refs/heads/changed']);let guard_calls=[];await assert.rejects(execute(guarded,()=>true,guard_calls));assert.equal(writes(guard_calls).length,0);
  git(guards.local,['config','branch.main.merge','refs/heads/published']);guarded=await prepare(guards.local,'push');git(guards.local,['config','branch.main.pushRemote','team/origin']);guard_calls=[];await assert.rejects(execute(guarded,()=>true,guard_calls));assert.equal(writes(guard_calls).length,0);
  guarded=await prepare(guards.local,'pull');guard_calls=[];await assert.rejects(execute(guarded,()=>false,guard_calls));assert.equal(writes(guard_calls).length,0);
  const untracked_guard=create('chooser_guard'),guard_a=bare('guard_a'),guard_b=bare('guard_b');git(untracked_guard,['remote','add','a',guard_a]);git(untracked_guard,['remote','add','b',guard_b]);
  await assert.rejects(prepare(untracked_guard,'push',async()=>{git(untracked_guard,['config','remote.a.url',guard_b]);return 'a';}));
  await assert.rejects(prepare(untracked_guard,'push',async()=>{commit(untracked_guard,'changed.md','HEAD changed while choosing\n');return 'b';}));
  checks.push('changed upstream, push settings, destination URLs and dirty documents stop before networking; stale picker choices cannot be executed');

  const no_remote=create('no_remote');await assert.rejects(prepare(no_remote,'fetch'));await assert.rejects(prepare(no_remote,'push'));
  const missing=pair('missing_upstream');git(missing.local,['branch','--unset-upstream']);await assert.rejects(prepare(missing.local,'pull'));
  git(missing.local,['checkout','--detach']);await assert.rejects(prepare(missing.local,'push'));await assert.rejects(prepare(missing.local,'pull'));assert((await prepare(missing.local,'fetch')).args.includes('--all'));
  const empty=path.join(temp,'empty');fs.mkdirSync(empty);git(empty,['init','-b','main']);git(empty,['remote','add','origin',guard_a]);await assert.rejects(api.prepare_quick_git_action(reader.run,'push',{root:empty,target:'',hash:'',operation:''},api.graph_defaults));
  const ongoing=pair('ongoing');await assert.rejects(api.prepare_quick_git_action(reader.run,'sync',{...context(ongoing.local),operation:'merge'},api.graph_defaults));
  checks.push('no remote, absent upstream, detached HEAD, unborn branch and ongoing merge have precise non-writing outcomes instead of guessed targets');

  const conflict=pair('conflict');commit(conflict.local,'base.md','local conflict\n');const remote_before=commit(conflict.other,'base.md','remote conflict\n');git(conflict.other,['push']);const conflict_calls=[];
  await assert.rejects(execute(await prepare(conflict.local,'sync'),()=>true,conflict_calls));assert.deepEqual(writes(conflict_calls).map(args=>args[0]),['pull']);assert.equal(git(conflict.remote,['rev-parse','published']),remote_before);assert(git(conflict.local,['ls-files','--unmerged']));
  const failed_fetch=create('failed_fetch');git(failed_fetch,['remote','add','missing',path.join(temp,'does_not_exist.git')]);await assert.rejects(execute(await prepare(failed_fetch,'fetch')));assert.equal(git(failed_fetch,['rev-list','--count','HEAD']),'1');
  checks.push('real pull conflicts stop sync before push, preserve resolution state, and failed fetch never changes the local branch');

  const busy=pair('busy');const busy_plan=await prepare(busy.local,'fetch');let release,started;const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve),busy_calls=[];
  const first=api.execute_git_action(async(cwd,args,execution)=>{busy_calls.push(args);if(args[0]==='fetch'){started();await gate;}return writer.run(cwd,args,execution);},busy_plan,()=>true);
  await entered;await assert.rejects(execute(busy_plan),/执行|busy|operation/i);release();await first;assert.equal(writes(busy_calls).length,1);
  checks.push('the shared repository lock prevents repeated shortcut executions during a running network transaction');
  console.log(JSON.stringify({ok:true,checks},null,2));
}finally{reader.cancel();writer.cancel();if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Unsafe temporary path');fs.rmSync(temp,{recursive:true,force:true});}
