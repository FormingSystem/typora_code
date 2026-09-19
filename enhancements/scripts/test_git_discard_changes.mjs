import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import { build } from 'esbuild';

const compiled = await build({stdin: {contents: ["export * from './src/git_graph_actions.ts';", "export * from './src/git_graph_runtime.ts';"].join('\n'), resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_git_discard_'));
const reader = api.create_git_runner({child_process, process}); const writer = api.create_git_runner({child_process, process}, {writable: true});
const checks = [];
const git = (root, args) => child_process.execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.hooksPath=.git/unused_hooks', ...args], {cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']}).trim();
const write = (root, file, content) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), content); };
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
const create_repo = name => {
  const root = path.join(temp, name); fs.mkdirSync(root); git(root, ['init', '-b', 'main']);
  for (const [key, value] of [['user.name', 'Discard Test'], ['user.email', 'discard@example.invalid'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false'], ['core.hooksPath', '.git/unused_hooks']]) git(root, ['config', key, value]);
  for (const file of ['tracked.md', 'deleted.md', 'staged_only.md', 'unselected.md', 'literal[1].md', 'literal1.md']) write(root, file, 'base\n');
  write(root, '.gitignore', 'ignored/\n'); git(root, ['add', '--all']); git(root, ['commit', '-m', 'base']);
  write(root, 'tracked.md', 'staged\n'); write(root, 'staged_only.md', 'staged only\n'); git(root, ['add', '--', 'tracked.md', 'staged_only.md']);
  write(root, 'tracked.md', 'working\n'); write(root, 'unselected.md', 'unselected working\n'); fs.unlinkSync(path.join(root, 'deleted.md'));
  write(root, 'literal[1].md', 'selected literal\n'); write(root, 'literal1.md', 'unselected literal\n');
  write(root, 'new[1].md', 'chosen new\n'); write(root, 'new1.md', 'unselected new\n');
  write(root, 'folder/chosen.md', 'chosen nested\n'); write(root, 'folder/unselected.md', 'unselected nested\n'); write(root, 'ignored/file.md', 'ignored\n');
  return root;
};
const selected = ['tracked.md', 'deleted.md', 'literal[1].md', 'new[1].md', 'folder/chosen.md'];
const plan = (root, files = selected, include_untracked = true) => api.plan_git_action(reader.run, 'discard_changes', {root, target: '', hash: git(root, ['rev-parse', 'HEAD']), operation: '', paths: files}, {include_untracked});
const index_bytes = root => fs.readFileSync(path.join(root, '.git/index'));
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
try {
  const mixed = create_repo('mixed'); const before_index = index_bytes(mixed); const before_head = git(mixed, ['rev-parse', 'HEAD']);
  const prepared = await plan(mixed);
  assert.deepEqual(prepared.discard.deleted_paths, ['deleted.md']);
  const original_plan = structuredClone(prepared);
  const all_scope = api.select_discard_scope(prepared, 'all');
  const tracked_scope = api.select_discard_scope(prepared, 'tracked');
  assert.equal(all_scope.fingerprint, prepared.fingerprint); assert.equal(tracked_scope.fingerprint, prepared.fingerprint);
  assert.deepEqual(all_scope.args, prepared.args); assert.deepEqual(tracked_scope.args, prepared.args);
  assert.deepEqual(all_scope.discard, prepared.discard);
  assert.deepEqual(tracked_scope.discard, {restore_paths: ['tracked.md', 'deleted.md', 'literal[1].md'], deleted_paths: ['deleted.md'], untracked_paths: [], untracked_guards: []});
  assert(tracked_scope.preview.includes('（3 个文件）') && tracked_scope.preview.includes('（0 个未跟踪文件）'));
  assert(!tracked_scope.preview.includes('new[1].md') && !tracked_scope.preview.includes('folder/chosen.md'));
  assert.deepEqual(api.select_discard_scope(tracked_scope, 'all').discard, tracked_scope.discard);
  assert.deepEqual(prepared, original_plan);
  assert.equal(git(mixed, ['rev-parse', 'HEAD']), before_head); assert.equal(read(mixed, 'new[1].md'), 'chosen new\n');
  assert(!fs.existsSync(path.join(mixed, 'deleted.md')));
  checks.push('choosing either confirmation scope uses the original snapshot without expanding targets or changing the prepared plan; cancelling before execution writes nothing');
  assert(prepared.preview.includes('恢复："tracked.md"') && prepared.preview.includes('回收："new[1].md"'));
  assert(!prepared.preview.includes('folder/unselected.md') && !prepared.preview.includes('clean ')); assert(index_bytes(mixed).equals(before_index));
  assert.equal(read(mixed, 'tracked.md'), 'working\n'); checks.push('preview lists exact restore and recycle targets without changing the index or files');
  const recycled = []; const recycle_root = path.join(temp, 'recycle_adapter');
  // 真实 Git 验证恢复语义；可恢复目录适配器替代系统回收站，保留测试文件以便逐字节核对。
  await api.execute_git_action(writer.run, all_scope, () => true, {trash_files: async (root, files) => {
    assert.equal(root, mixed);
    for (const file of files) { const target = path.join(recycle_root, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.renameSync(path.join(root, file), target); recycled.push(file); }
  }});
  assert.deepEqual(recycled, ['new[1].md', 'folder/chosen.md']); assert.equal(read(recycle_root, 'new[1].md'), 'chosen new\n');
  assert.equal(read(mixed, 'tracked.md'), 'staged\n'); assert.equal(read(mixed, 'deleted.md'), 'base\n'); assert(index_bytes(mixed).equals(before_index));
  assert.equal(git(mixed, ['rev-parse', 'HEAD']), before_head); assert.equal(read(mixed, 'staged_only.md'), 'staged only\n');
  assert.equal(read(mixed, 'literal[1].md'), 'base\n'); assert.equal(read(mixed, 'literal1.md'), 'unselected literal\n');
  assert.equal(read(mixed, 'unselected.md'), 'unselected working\n'); assert.equal(read(mixed, 'new1.md'), 'unselected new\n');
  assert.equal(read(mixed, 'folder/unselected.md'), 'unselected nested\n'); assert.equal(read(mixed, 'ignored/file.md'), 'ignored\n');
  checks.push('group discard restores tracked files from index, recycles only named untracked files, and preserves staged bytes and all unselected paths');

  const tracked_only = create_repo('tracked_only'); const tracked_index = index_bytes(tracked_only);
  const tracked_prepared = await plan(tracked_only);
  const selected_tracked = api.select_discard_scope(tracked_prepared, 'tracked');
  assert.deepEqual((await plan(tracked_only, selected, false)).discard, selected_tracked.discard);
  // 仅改未跟踪文件字节不会改变 porcelain 名单；tracked 选择不再校验或回收它们。
  write(tracked_only, 'new[1].md', 'new user draft after preview\n');
  await api.execute_git_action(writer.run, selected_tracked, () => true);
  assert.equal(read(tracked_only, 'tracked.md'), 'staged\n'); assert.equal(read(tracked_only, 'new[1].md'), 'new user draft after preview\n'); assert(index_bytes(tracked_only).equals(tracked_index));
  assert.equal(read(tracked_only, 'folder/chosen.md'), 'chosen nested\n');
  checks.push('tracked-only selection needs no recycle adapter and leaves later untracked drafts untouched');

  const untracked_only = create_repo('untracked_only'); const untracked_index = index_bytes(untracked_only);
  const untracked_prepared = await plan(untracked_only, ['new[1].md', 'new[1].md']);
  assert.deepEqual(untracked_prepared.discard.restore_paths, []); assert.deepEqual(untracked_prepared.discard.deleted_paths, []);
  assert.deepEqual(untracked_prepared.discard.untracked_paths, ['new[1].md']); assert.deepEqual(untracked_prepared.args, []);
  assert.throws(() => api.select_discard_scope(untracked_prepared, 'tracked'), /没有所选类型/);
  assert.throws(() => api.select_discard_scope(untracked_prepared, 'invalid'), /未知 Git 操作/);
  const untracked_scope = api.select_discard_scope(untracked_prepared, 'all');
  assert(untracked_scope.preview.includes('（0 个文件）') && untracked_scope.preview.includes('（1 个未跟踪文件）'));
  const only_recycle = path.join(temp, 'only_recycle'); fs.mkdirSync(only_recycle);
  await api.execute_git_action(writer.run, untracked_scope, () => true, {trash_files: async (root, files) => {
    assert.equal(root, untracked_only); assert.deepEqual(files, ['new[1].md']);
    fs.renameSync(path.join(root, files[0]), path.join(only_recycle, files[0]));
  }});
  assert.equal(read(only_recycle, 'new[1].md'), 'chosen new\n'); assert.equal(read(untracked_only, 'tracked.md'), 'working\n'); assert(index_bytes(untracked_only).equals(untracked_index));
  checks.push('untracked-only selection rejects an empty tracked scope and recycles one deduplicated target without restoring tracked files');

  const deleted = create_repo('deleted'); fs.unlinkSync(path.join(deleted, 'literal[1].md'));
  const deleted_prepared = await plan(deleted, ['deleted.md', 'literal[1].md']);
  assert.deepEqual(deleted_prepared.discard.deleted_paths, deleted_prepared.discard.restore_paths);
  assert.deepEqual(deleted_prepared.discard.deleted_paths, ['deleted.md', 'literal[1].md']);
  assert.deepEqual((await plan(deleted, ['deleted.md', 'tracked.md'])).discard.deleted_paths, ['deleted.md']);
  checks.push('name-status records distinguish all-deleted restore confirmations from mixed deleted and modified files, including literal bracket paths');

  const scope_drift = create_repo('scope_drift'); const scope_snapshot = await plan(scope_drift);
  write(scope_drift, 'tracked.md', 'tracked draft after confirmation preparation\n');
  const old_tracked = api.select_discard_scope(scope_snapshot, 'tracked');
  assert.equal(old_tracked.fingerprint, scope_snapshot.fingerprint);
  await assert.rejects(api.execute_git_action(writer.run, old_tracked, () => true), /刷新后重试/);
  assert.equal(read(scope_drift, 'tracked.md'), 'tracked draft after confirmation preparation\n');
  checks.push('scope selection after repository drift keeps the old fingerprint and rejects execution instead of silently preparing a new snapshot');

  const guards = create_repo('guards'); const stale = await plan(guards); let calls = 0;
  const trash_files = async () => { calls++; };
  await assert.rejects(api.execute_git_action(writer.run, stale, () => false, {trash_files}), /未保存/);
  await assert.rejects(api.execute_git_action(writer.run, stale, () => true), /回收站不可用/);
  assert.equal(read(guards, 'tracked.md'), 'working\n');
  write(guards, 'new[1].md', 'changed since preview\n');
  await assert.rejects(api.execute_git_action(writer.run, stale, () => true, {trash_files}), /未跟踪文件内容已改变/);
  assert.equal(calls, 0); assert.equal(read(guards, 'tracked.md'), 'working\n');
  const changed_worktree = await plan(guards); write(guards, 'tracked.md', 'changed tracked draft\n');
  await assert.rejects(api.execute_git_action(writer.run, changed_worktree, () => true, {trash_files}), /刷新后重试/); assert.equal(calls, 0);
  const changed_index = await plan(guards); git(guards, ['add', '--', 'tracked.md']);
  await assert.rejects(api.execute_git_action(writer.run, changed_index, () => true, {trash_files}), /刷新后重试/); assert.equal(calls, 0);
  checks.push('unsaved documents, unavailable recycling, untracked content drift, tracked edits, and index changes stop before discard');

  for (const checkpoint of ['fingerprint', 'untracked_hash']) {
    const delayed = create_repo('dirty_' + checkpoint); const delayed_index = index_bytes(delayed); const delayed_plan = await plan(delayed);
    const entered = gate(), release = gate(); let waiting = false, editable = true, restores = 0, recycling = 0;
    const delayed_run = async (root, args, options) => {
      if (args[0] === 'checkout-index') restores++;
      const result = await writer.run(root, args, options);
      if (!waiting && (checkpoint === 'fingerprint' ? args[0] === 'remote' && args[1] === '-v' : args[0] === 'hash-object')) {
        waiting = true; entered.resolve(); await release.promise;
      }
      return result;
    };
    // 先让真实 Git 完成读取，再挂起返回，精确模拟校验等待期间编辑器出现未保存草稿。
    const execution = api.execute_git_action(delayed_run, delayed_plan, () => editable, {trash_files: async () => { recycling++; }});
    const rejected = assert.rejects(execution, /未保存/);
    await entered.promise; editable = false; release.resolve(); await rejected;
    assert.equal(restores, 0); assert.equal(recycling, 0); assert.equal(read(delayed, 'tracked.md'), 'working\n');
    assert.equal(read(delayed, 'new[1].md'), 'chosen new\n'); assert(index_bytes(delayed).equals(delayed_index));
  }
  checks.push('editor drafts appearing during fingerprint or untracked-hash reads stop all writes after the asynchronous checks');

  const dirty_after_restore = create_repo('dirty_after_restore'); let editable = true, recycling = 0;
  const restore_then_dirty = async (root, args, options) => {
    const result = await writer.run(root, args, options);
    if (args[0] === 'checkout-index') editable = false;
    return result;
  };
  await assert.rejects(api.execute_git_action(restore_then_dirty, await plan(dirty_after_restore), () => editable, {trash_files: async () => { recycling++; }}), /未保存/);
  assert.equal(read(dirty_after_restore, 'tracked.md'), 'staged\n'); assert.equal(read(dirty_after_restore, 'new[1].md'), 'chosen new\n'); assert.equal(recycling, 0);
  checks.push('a new editor draft after tracked restoration stops recycling and reports partial completion');

  const invalid = create_repo('invalid');
  for (const files of [[], ['.'], ['..'], ['folder'], ['ignored/file.md'], ['staged_only.md'], ['.git/config']]) await assert.rejects(plan(invalid, files));
  assert.equal(read(invalid, 'tracked.md'), 'working\n'); checks.push('empty scope, directories, traversal, ignored files, staged-only files, and Git internals cannot expand a discard request');

  const failed_recycle = create_repo('failed_recycle'); const failed_index = index_bytes(failed_recycle);
  await assert.rejects(api.execute_git_action(writer.run, await plan(failed_recycle), () => true, {trash_files: async () => { throw new Error('test recycle failure'); }}), /未执行永久删除/);
  assert.equal(read(failed_recycle, 'new[1].md'), 'chosen new\n'); assert.equal(read(failed_recycle, 'tracked.md'), 'staged\n'); assert(index_bytes(failed_recycle).equals(failed_index));
  checks.push('recycle failures report partial completion and never fall back to permanent deletion');
  console.log(JSON.stringify({status: 'PASS', checks}, null, 2));
} finally {
  reader.cancel(); writer.cancel();
  assert(path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('typora_git_discard_'));
  fs.rmSync(temp, {recursive: true, force: true});
}
