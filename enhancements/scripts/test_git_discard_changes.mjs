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
try {
  const mixed = create_repo('mixed'); const before_index = index_bytes(mixed); const before_head = git(mixed, ['rev-parse', 'HEAD']);
  const prepared = await plan(mixed);
  assert(prepared.preview.includes('恢复："tracked.md"') && prepared.preview.includes('回收："new[1].md"'));
  assert(!prepared.preview.includes('folder/unselected.md') && !prepared.preview.includes('clean ')); assert(index_bytes(mixed).equals(before_index));
  assert.equal(read(mixed, 'tracked.md'), 'working\n'); checks.push('preview lists exact restore and recycle targets without changing the index or files');
  const recycled = []; const recycle_root = path.join(temp, 'recycle_adapter');
  // 真实 Git 验证恢复语义；可恢复目录适配器替代系统回收站，保留测试文件以便逐字节核对。
  await api.execute_git_action(writer.run, prepared, () => true, {trash_files: async (root, files) => {
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
  await api.execute_git_action(writer.run, await plan(tracked_only, selected, false), () => true);
  assert.equal(read(tracked_only, 'tracked.md'), 'staged\n'); assert.equal(read(tracked_only, 'new[1].md'), 'chosen new\n'); assert(index_bytes(tracked_only).equals(tracked_index));
  checks.push('tracked-only confirmation leaves untracked files untouched');

  const guards = create_repo('guards'); const stale = await plan(guards); let calls = 0;
  const trash_files = async () => { calls++; };
  await assert.rejects(api.execute_git_action(writer.run, stale, () => false, {trash_files}), /未保存/);
  await assert.rejects(api.execute_git_action(writer.run, stale, () => true), /回收站不可用/);
  assert.equal(read(guards, 'tracked.md'), 'working\n');
  write(guards, 'new[1].md', 'changed since preview\n');
  await assert.rejects(api.execute_git_action(writer.run, stale, () => true, {trash_files}), /未跟踪文件内容已改变/);
  assert.equal(calls, 0); assert.equal(read(guards, 'tracked.md'), 'working\n');
  const changed_worktree = await plan(guards); write(guards, 'tracked.md', 'changed tracked draft\n');
  await assert.rejects(api.execute_git_action(writer.run, changed_worktree, () => true, {trash_files}), /重新预览/); assert.equal(calls, 0);
  const changed_index = await plan(guards); git(guards, ['add', '--', 'tracked.md']);
  await assert.rejects(api.execute_git_action(writer.run, changed_index, () => true, {trash_files}), /重新预览/); assert.equal(calls, 0);
  checks.push('unsaved documents, unavailable recycling, untracked content drift, tracked edits, and index changes stop before discard');

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
