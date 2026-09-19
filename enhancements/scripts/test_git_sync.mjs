import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: ["export * from './src/git_graph_actions.ts';", "export * from './src/git_graph_runtime.ts';"].join('\n'), resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_git_sync_'));
const reader = api.create_git_runner({child_process, process});
const writer = api.create_git_runner({child_process, process}, {writable: true});
const checks = [];
const git = (root, args) => child_process.execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.hooksPath=.git/unused_hooks', ...args], {cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']}).trim();
const write = (root, file, value) => fs.writeFileSync(path.join(root, file), value);
const configure = root => {
  for (const [key, value] of [['user.name', 'Sync Test'], ['user.email', 'sync@example.invalid'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false'], ['core.hooksPath', '.git/unused_hooks']]) git(root, ['config', key, value]);
};
const commit = (root, file, content) => { write(root, file, content); git(root, ['add', '--', file]); git(root, ['commit', '-m', file]); };
const pair = name => {
  const root = path.join(temp, name); fs.mkdirSync(root);
  const local = path.join(root, 'local'); fs.mkdirSync(local); git(local, ['init', '-b', 'main']); configure(local);
  commit(local, 'shared.md', 'base\n'); commit(local, 'draft.md', 'draft\n'); commit(local, 'working.md', 'working\n');
  const remote = path.join(root, 'remote.git'); git(root, ['init', '--bare', remote]);
  // 含斜杠的远端名、与本地不同的上游分支名，覆盖不能拆分 origin/main 的情况。
  git(local, ['remote', 'add', 'team/origin', remote]); git(local, ['push', '-u', 'team/origin', 'main:published']);
  const other = path.join(root, 'other'); git(root, ['clone', '-b', 'published', remote, other]); configure(other);
  return {local, remote, other};
};
const plan = (local, mode = 'merge') => api.plan_git_action(reader.run, 'sync', {root: local, target: '', hash: git(local, ['rev-parse', 'HEAD']), operation: ''}, {mode});
const record_run = calls => (root, args, execution) => { calls.push(args); return writer.run(root, args, execution); };
const writes = calls => calls.filter(args => ['pull', 'push'].includes(args[0]));
try {
  const merged = pair('diverged');
  commit(merged.local, 'local.md', 'local\n'); commit(merged.other, 'remote.md', 'remote\n'); git(merged.other, ['push']);
  const before_index = fs.readFileSync(path.join(merged.local, '.git/index'));
  const before_head = git(merged.local, ['rev-parse', 'HEAD']); const before_remote = git(merged.remote, ['rev-parse', 'published']);
  const prepared = await plan(merged.local);
  assert(prepared.preview.includes('team/origin/published') && prepared.preview.includes('refs/heads/main:refs/heads/published'));
  assert.equal(git(merged.local, ['rev-parse', 'HEAD']), before_head); assert.equal(git(merged.remote, ['rev-parse', 'published']), before_remote);
  assert(fs.readFileSync(path.join(merged.local, '.git/index')).equals(before_index));
  checks.push('preview names the exact upstream and both steps without changing HEAD, index, or remote');
  const merged_calls = []; await api.execute_git_action(record_run(merged_calls), prepared, () => true);
  assert.deepEqual(writes(merged_calls).map(args => args[0]), ['pull', 'push']);
  assert.equal(git(merged.remote, ['rev-parse', 'published']), git(merged.local, ['rev-parse', 'HEAD']));
  assert.equal(git(merged.local, ['show', '-s', '--format=%P', 'HEAD']).split(' ').length, 2);
  checks.push('default synchronization integrates divergent commits before pushing to the configured upstream branch');

  const guarded = pair('guards'); const guarded_plan = await plan(guarded.local); let calls = [];
  await assert.rejects(api.execute_git_action(record_run(calls), guarded_plan, () => false), /未保存/); assert.equal(writes(calls).length, 0);
  write(guarded.local, 'working.md', 'new draft\n'); calls = [];
  await assert.rejects(api.execute_git_action(record_run(calls), guarded_plan, () => true), /刷新后重试/); assert.equal(writes(calls).length, 0);
  const changed_upstream = await plan(guarded.local); git(guarded.local, ['config', 'branch.main.merge', 'refs/heads/elsewhere']); calls = [];
  await assert.rejects(api.execute_git_action(record_run(calls), changed_upstream, () => true), /上游|刷新后重试/); assert.equal(writes(calls).length, 0);
  checks.push('unsaved documents, changed repository contents, and changed upstream invalidate the preview before networking');

  const late_dirty = pair('late_dirty'); commit(late_dirty.other, 'remote.md', 'remote content awaiting pull\n'); git(late_dirty.other, ['push']);
  const late_plan = await plan(late_dirty.local), late_calls = [], late_head = git(late_dirty.local, ['rev-parse', 'HEAD']);
  const late_index = fs.readFileSync(path.join(late_dirty.local, '.git/index')), late_remote = git(late_dirty.remote, ['rev-parse', 'published']);
  let editable = true, entered, release;
  const entered_promise = new Promise(resolve => {entered = resolve;}), release_promise = new Promise(resolve => {release = resolve;});
  const waiting_run = async (root, args, execution) => {
    late_calls.push(args); const result = await writer.run(root, args, execution);
    if (args[0] === 'remote' && args[1] === 'get-url' && args.includes('--push')) {entered(); await release_promise;}
    return result;
  };
  const late_pending = api.execute_git_action(waiting_run, late_plan, () => editable);
  await entered_promise; editable = false; release();
  await assert.rejects(late_pending, /未保存/); assert.equal(writes(late_calls).length, 0);
  assert.equal(git(late_dirty.local, ['rev-parse', 'HEAD']), late_head); assert(fs.readFileSync(path.join(late_dirty.local, '.git/index')).equals(late_index));
  assert.equal(fs.readFileSync(path.join(late_dirty.local, 'shared.md'), 'utf8'), 'base\n'); assert(!fs.existsSync(path.join(late_dirty.local, 'remote.md')));
  assert.equal(git(late_dirty.remote, ['rev-parse', 'published']), late_remote);
  checks.push('a draft created while the final upstream lookup is pending prevents both pull and push and preserves the index, worktree, HEAD and remote');

  const staged = pair('staged'); commit(staged.local, 'local.md', 'publish this commit\n');
  write(staged.local, 'draft.md', 'staged but uncommitted\n'); git(staged.local, ['add', '--', 'draft.md']); write(staged.local, 'working.md', 'uncommitted working draft\n');
  const staged_before = git(staged.local, ['diff', '--cached', '--binary']); const working_before = git(staged.local, ['diff', '--binary']);
  await api.execute_git_action(writer.run, await plan(staged.local), () => true);
  assert.equal(git(staged.local, ['diff', '--cached', '--binary']), staged_before); assert.equal(git(staged.local, ['diff', '--binary']), working_before);
  assert.equal(git(staged.remote, ['show', 'published:draft.md']), 'draft');
  assert.equal(git(staged.remote, ['show', 'published:working.md']), 'working');
  checks.push('synchronization publishes existing commits without staging or committing pending index and working changes');
  calls = []; await api.execute_git_action(record_run(calls), await plan(staged.local), () => true);
  assert.deepEqual(writes(calls).map(args => args[0]), ['pull']); checks.push('an up-to-date branch skips the push step');

  const conflict = pair('conflict'); commit(conflict.local, 'shared.md', 'local replacement\n'); commit(conflict.other, 'shared.md', 'remote replacement\n'); git(conflict.other, ['push']);
  const remote_before = git(conflict.remote, ['rev-parse', 'published']); calls = [];
  await assert.rejects(api.execute_git_action(record_run(calls), await plan(conflict.local), () => true));
  assert.deepEqual(writes(calls).map(args => args[0]), ['pull']); assert.equal(git(conflict.remote, ['rev-parse', 'published']), remote_before);
  assert(git(conflict.local, ['ls-files', '--unmerged']).includes('shared.md'));
  checks.push('a real pull conflict stops before push and leaves the conflict available for user resolution');

  const fast_only = pair('fast_only'); commit(fast_only.local, 'local.md', 'local\n'); commit(fast_only.other, 'remote.md', 'remote\n'); git(fast_only.other, ['push']); calls = [];
  await assert.rejects(api.execute_git_action(record_run(calls), await plan(fast_only.local, 'ff-only'), () => true));
  assert.deepEqual(writes(calls).map(args => args[0]), ['pull']); checks.push('fast-forward-only synchronization refuses divergence without pushing');

  const rebased = pair('rebase'); commit(rebased.local, 'local.md', 'local\n'); commit(rebased.other, 'remote.md', 'remote\n'); git(rebased.other, ['push']);
  await api.execute_git_action(writer.run, await plan(rebased.local, 'rebase'), () => true);
  assert.equal(git(rebased.local, ['show', '-s', '--format=%P', 'HEAD']).split(' ').length, 1);
  assert.equal(git(rebased.remote, ['rev-parse', 'published']), git(rebased.local, ['rev-parse', 'HEAD'])); checks.push('rebase mode replays local commits and then publishes the resulting branch');

  const rejected = pair('push_rejected'); commit(rejected.local, 'local.md', 'local\n'); commit(rejected.other, 'remote.md', 'remote\n'); git(rejected.other, ['push']);
  const rejected_remote = git(rejected.remote, ['rev-parse', 'published']);
  // 使用隔离裸仓库的真实接收钩子拒绝推送，验证拉取已完成的状态说明。
  const reject_hook = path.join(rejected.remote, 'hooks', 'pre-receive'); fs.writeFileSync(reject_hook, '#!/bin/sh\nexit 1\n'); fs.chmodSync(reject_hook, 0o755);
  calls = []; await assert.rejects(api.execute_git_action(record_run(calls), await plan(rejected.local), () => true), /已完成拉取，但推送失败/);
  assert.deepEqual(writes(calls).map(args => args[0]), ['pull', 'push']); assert.equal(git(rejected.remote, ['rev-parse', 'published']), rejected_remote);
  assert.equal(fs.readFileSync(path.join(rejected.local, 'remote.md'), 'utf8'), 'remote\n');
  checks.push('a real remote push rejection reports that pull completed and preserves the integrated local branch');
  console.log(JSON.stringify({status: 'PASS', checks}, null, 2));
} finally {
  reader.cancel(); writer.cancel();
  assert(path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('typora_git_sync_'));
  fs.rmSync(temp, {recursive: true, force: true});
}
