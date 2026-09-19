import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const compiled = await build({stdin: {contents: "export * from './src/git_diff_ranges.ts'; export * from './src/git_graph_actions.ts'; export * from './src/git_graph_runtime.ts'; export {DefaultLinesDiffComputer} from './node_modules/monaco-editor/esm/vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';", resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false});
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_git_ranges_'));
const module_path = path.join(evidence, 'range_test_module.mjs'); fs.writeFileSync(module_path, compiled.outputFiles[0].text);
const api = await import(pathToFileURL(module_path).href);
const reader = api.create_git_runner({child_process, process});
const writer = api.create_git_runner({child_process, process}, {writable: true});
const checks = [];
const git = (root, args, input) => child_process.execFileSync('git', ['--literal-pathspecs', '-c', 'core.autocrlf=false', ...args], {cwd: root, input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
const write = (root, file, body) => {const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, body);};
const content = (root, file = 'chosen.md') => fs.readFileSync(path.join(root, file));
const index_content = (root, file = 'chosen.md') => child_process.execFileSync('git', ['show', ':' + file], {cwd: root, windowsHide: true});
const fixture = (name, original, modified, file = 'chosen.md') => {
  const root = path.join(evidence, name); fs.mkdirSync(root); git(root, ['init', '-b', 'main']);
  for (const [key, value] of [['user.name', 'Range QA'], ['user.email', 'ranges@example.invalid'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false'], ['core.hooksPath', '.git/unused_hooks']]) git(root, ['config', key, value]);
  write(root, file, original); write(root, 'other.md', 'other base\n'); write(root, 'staged.md', 'base\n'); git(root, ['add', '--all']); git(root, ['commit', '-m', 'base']);
  write(root, 'staged.md', 'staged only\n'); git(root, ['add', '--', 'staged.md']); write(root, 'other.md', 'other working\n'); write(root, file, modified);
  return {root, file};
};
const model_text = value => value.toString('utf8').replace(/^\ufeff/u, '').replace(/\r\n/g, '\n');
// 使用随产品分发的真实 Monaco 算法；只把公开 LineRangeMapping 转成 getLineChanges 的相同边界格式。
const line_changes = (original, modified, ignore_whitespace = false) => new api.DefaultLinesDiffComputer().computeDiff(original.split('\n'), modified.split('\n'), {ignoreTrimWhitespace: ignore_whitespace, computeMoves: false, maxComputationTimeMs: 0}).changes.map(change => ({
  originalStartLineNumber: change.original.isEmpty ? change.original.startLineNumber - 1 : change.original.startLineNumber,
  originalEndLineNumber: change.original.isEmpty ? 0 : change.original.endLineNumberExclusive - 1,
  modifiedStartLineNumber: change.modified.isEmpty ? change.modified.startLineNumber - 1 : change.modified.startLineNumber,
  modifiedEndLineNumber: change.modified.isEmpty ? 0 : change.modified.endLineNumberExclusive - 1,
}));
const line = (number, length = 1) => ({startLineNumber: number, startColumn: 1, endLineNumber: number, endColumn: length + 1});
const request = (repo, action, selections, overrides = {}) => {
  const original_text = model_text(index_content(repo.root, repo.file)), worktree_bytes = content(repo.root, repo.file), modified_text = model_text(worktree_bytes);
  return {action, root: repo.root, file: repo.file, original_revision: 'INDEX', modified_revision: 'WORKTREE', original_text, modified_text, worktree_bytes, line_changes: line_changes(original_text, modified_text), selections, ...overrides};
};
const prepare = (repo, action, selections, overrides) => api.plan_git_diff_ranges(reader.run, request(repo, action, selections, overrides));
const protect = repo => ({head: git(repo.root, ['rev-parse', 'HEAD']), other_work: content(repo.root, 'other.md'), staged: index_content(repo.root, 'staged.md'), other_index: index_content(repo.root, 'other.md')});
const assert_protected = (repo, before) => assert.deepEqual(protect(repo), before);
const transform = async (name, original, modified, selections, staged, reverted, file) => {
  for (const action of ['stage', 'revert']) {
    console.log(name + ' ' + action);
    const repo = fixture(name + '_' + action, original, modified, file), before = protect(repo), source_index = index_content(repo.root, repo.file), source_work = content(repo.root, repo.file);
    const plan = await prepare(repo, action, selections);
    assert.equal(plan.file_guard, await reader.run(repo.root, ['hash-object', '--no-filters', '--', repo.file]));
    assert(index_content(repo.root, repo.file).equals(source_index)); assert(content(repo.root, repo.file).equals(source_work));
    await api.execute_git_action(writer.run, plan, () => true);
    assert.equal(index_content(repo.root, repo.file).toString('utf8'), action === 'stage' ? staged : original, name + ' ' + action + ' index');
    assert.equal(content(repo.root, repo.file).toString('utf8'), action === 'revert' ? reverted : modified, name + ' ' + action + ' worktree');
    assert_protected(repo, before);
  }
  checks.push(name + ': actual Monaco line mapping stages/reverts only selected changes and preserves the other surface, HEAD, other working changes and staged paths');
};
const gate = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {resolve, promise};};
try {
  await transform('middle_of_one_hunk', 'a\nold1\nold2\nold3\nz\n', 'a\nnew1\nnew2\nnew3\nz\n', [line(3)], 'a\nold1\nnew2\nold3\nz\n', 'a\nnew1\nold2\nnew3\nz\n');
  await transform('disjoint_overlapping_selections', 'a\nold1\nold2\nold3\nz\n', 'a\nnew1\nnew2\nnew3\nz\n', [line(2), line(4), line(2, 2)], 'a\nnew1\nold2\nnew3\nz\n', 'a\nold1\nnew2\nold3\nz\n');
  await transform('selection_excludes_next_line_column_one', 'old1\nold2\nend\n', 'new1\nnew2\nend\n', [{startLineNumber: 1, startColumn: 2, endLineNumber: 2, endColumn: 1}], 'new1\nold2\nend\n', 'old1\nnew2\nend\n');
  await transform('partial_insert_block', 'start\nend\n', 'start\nnew1\nnew2\nnew3\nend\n', [line(3)], 'start\nnew2\nend\n', 'start\nnew1\nnew3\nend\n');
  await transform('pure_delete_anchor', 'start\nremove1\nremove2\nend\n', 'start\nend\n', [line(1)], 'start\nend\n', 'start\nremove1\nremove2\nend\n');
  await transform('unequal_replacement_insert_tail', 'start\nold\nend\n', 'start\nnew1\nnew2\nnew3\nend\n', [line(3)], 'start\nold\nnew2\nend\n', 'start\nnew1\nnew3\nend\n');
  await transform('unequal_replacement_delete_tail', 'start\nold1\nold2\nold3\nend\n', 'start\nnew\nend\n', [line(2)], 'start\nnew\nend\n', 'start\nold1\nold2\nold3\nend\n');
  await transform('crlf_worktree_lf_index', 'start\nold1\nold2\nend\n', 'start\r\nnew1\r\nnew2\r\nend\r\n', [line(2)], 'start\nnew1\nold2\nend\n', 'start\r\nold1\r\nnew2\r\nend\r\n');
  await transform('mixed_line_endings_and_bom', '\ufeffstart\r\nold1\nold2\r\nend', '\ufeffstart\r\nnew1\nnew2\r\nend', [line(2)], '\ufeffstart\r\nnew1\nold2\r\nend', '\ufeffstart\r\nold1\nnew2\r\nend');
  await transform('bom_first_line_replacement', '\ufeffold\r\nend\r\n', '\ufeffnew\r\nend\r\n', [line(1)], '\ufeffnew\r\nend\r\n', '\ufeffold\r\nend\r\n');
  await transform('bom_first_line_insertion', '\ufeffold\nend\n', '\ufeffnew\nold\nend\n', [line(1)], '\ufeffnew\nold\nend\n', '\ufeffold\nend\n');
  await transform('bom_first_line_deletion', '\ufeffremove\nold\nend\n', '\ufeffold\nend\n', [line(1)], '\ufeffold\nend\n', '\ufeffremove\nold\nend\n');
  await transform('no_final_newline', 'start\nold', 'start\nnew', [line(2)], 'start\nnew', 'start\nold');
  await transform('append_after_unterminated_line', 'old', 'old\nnew', [line(2)], 'old\nnew', 'old\n');
  await transform('restore_after_unterminated_line', 'a\nremove', 'a', [line(1)], 'a\n', 'a\nremove');
  await transform('final_newline_added', 'old', 'new\n', [line(1)], 'new\n', 'old');
  await transform('final_newline_removed', 'old\n', 'new', [line(1)], 'new', 'old\n');
  await transform('empty_tracked_file', '', 'new\n', [line(1)], 'new\n', '');
  await transform('literal_unicode_quotes_path', 'start\nold\nend\n', 'start\nnew\nend\n', [line(2)], 'start\nnew\nend\n', 'start\nold\nend\n', 'docs/中文 文件[1].md');

  const safe = fixture('read_guards', 'a\nold\nz\n', 'a\nnew\nz\n'), safe_before = protect(safe), safe_index = index_content(safe.root), safe_work = content(safe.root);
  for (const overrides of [
    {original_revision: 'HEAD'}, {modified_revision: 'HEAD'}, {selections: []}, {selections: [{startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 2}]},
    {selections: [line(9)]}, {original_text: 'old snapshot\n'}, {modified_text: 'changed model\n'}, {line_changes: []}, {file: '../outside.md'}, {encoding: 'utf-16le'},
  ]) await assert.rejects(prepare(safe, 'stage', [line(2)], overrides));
  assert(index_content(safe.root).equals(safe_index)); assert(content(safe.root).equals(safe_work)); assert_protected(safe, safe_before);
  checks.push('history, empty/invalid selections, stale model/mappings, traversal and unsupported encoding all fail without writes');

  for (const mutation of ['worktree', 'index']) {
    const repo = fixture('stale_' + mutation, 'a\nold\nz\n', 'a\nnew\nz\n'), plan = await prepare(repo, 'stage', [line(2)]);
    if (mutation === 'worktree') write(repo.root, repo.file, 'a\nchanged after prepare\nz\n');
    else {write(repo.root, repo.file, 'a\nchanged index\nz\n'); git(repo.root, ['add', '--', repo.file]); write(repo.root, repo.file, 'a\nnew\nz\n');}
    const changed_index = index_content(repo.root), changed_work = content(repo.root);
    await assert.rejects(api.execute_git_action(writer.run, plan, () => true));
    assert(index_content(repo.root).equals(changed_index)); assert(content(repo.root).equals(changed_work));
  }
  checks.push('index and worktree changes after preparation reject old selection transactions');

  for (const action of ['stage', 'revert']) {
    const repo = fixture('dirty_' + action, 'a\nold\nz\n', 'a\nnew\nz\n'), plan = await prepare(repo, action, [line(2)]), old_index = index_content(repo.root), old_work = content(repo.root);
    let editable = false;
    await assert.rejects(api.execute_git_action(writer.run, plan, () => editable), /未保存/);
    editable = true; const entered = gate(), release = gate();
    const waiting_run = async (root, args, execution) => {const result = await writer.run(root, args, execution); if (args[0] === 'hash-object' && args.includes('--no-filters') && !args.includes('--stdin')) {entered.resolve(); await release.promise;} return result;};
    const pending = api.execute_git_action(waiting_run, plan, () => editable); await entered.promise; editable = false; release.resolve(); await assert.rejects(pending, /未保存/);
    assert(index_content(repo.root).equals(old_index)); assert(content(repo.root).equals(old_work));
  }
  checks.push('dirty or cancelled owner both before execution and during the last asynchronous validation blocks stage and revert');

  for (const action of ['stage', 'revert']) {
    const repo = fixture('late_index_' + action, 'a\nold\nend\n', 'a\nnew\nend\n'), plan = await prepare(repo, action, [line(2)]), entered = gate(), release = gate();
    const waiting_run = async (root, args, execution) => {const result = await writer.run(root, args, execution); if (args[0] === 'hash-object') {entered.resolve(); await release.promise;} return result;};
    const pending = api.execute_git_action(waiting_run, plan, () => true); await entered.promise;
    const changed_oid = git(repo.root, ['hash-object', '-w', '--stdin'], 'a\nold\nlater staged tail\n').trim();
    git(repo.root, ['update-index', '--cacheinfo', '100644', changed_oid, repo.file]);
    release.resolve(); await assert.rejects(pending, /刷新后重试/);
    assert.equal(content(repo.root).toString(), 'a\nnew\nend\n'); assert.equal(index_content(repo.root).toString(), 'a\nold\nlater staged tail\n');
  }
  checks.push('index changes after the repository fingerprint but during the final file validation reject both stage and revert without touching the new staged tail');
  const concurrent = fixture('single_transaction', 'a\nold\nz\n', 'a\nnew\nz\n'), concurrent_plan = await prepare(concurrent, 'stage', [line(2)]), entered = gate(), release = gate(); let apply_count = 0;
  const delayed_writer = async (root, args, options) => {if (args[0] === 'apply') {apply_count++; entered.resolve(); await release.promise;} return writer.run(root, args, options);};
  const pending = api.execute_git_action(delayed_writer, concurrent_plan, () => true); await entered.promise;
  await assert.rejects(api.execute_git_action(writer.run, concurrent_plan, () => true), /已有操作在执行/); release.resolve(); await pending;
  await assert.rejects(api.execute_git_action(writer.run, concurrent_plan, () => true)); assert.equal(apply_count, 1);
  checks.push('existing repository lock rejects duplicate confirmation and a completed old plan cannot apply twice');

  for (const [name, raw] of [['binary', Buffer.from([97, 0, 98])], ['invalid_utf8', Buffer.from([0xff, 0xfe, 97])]]) {
    const repo = fixture(name, 'old\n', raw);
    await assert.rejects(prepare(repo, 'stage', [line(1)])); assert(content(repo.root).equals(raw)); assert.equal(index_content(repo.root).toString(), 'old\n');
  }
  const filtered = fixture('filter_guard', 'old\n', 'new\n'); write(filtered.root, '.gitattributes', 'chosen.md filter=custom\n');
  await assert.rejects(prepare(filtered, 'stage', [line(1)]), /过滤/);
  checks.push('binary, lossy UTF-8 and configured content filters cannot produce a transaction');
  for (const action of ['stage', 'revert']) {
    const whitespace = fixture('hidden_whitespace_' + action, 'alpha\nold\n', ' alpha\nnew\n');
    const ignored = request(whitespace, action, [line(2)]); ignored.line_changes = line_changes(ignored.original_text, ignored.modified_text, true);
    const plan = await api.plan_git_diff_ranges(reader.run, ignored); await api.execute_git_action(writer.run, plan, () => true);
    assert.equal(index_content(whitespace.root).toString(), action === 'stage' ? 'alpha\nnew\n' : 'alpha\nold\n');
    assert.equal(content(whitespace.root).toString(), action === 'revert' ? ' alpha\nold\n' : ' alpha\nnew\n');
  }
  checks.push('ignoreTrimWhitespace keeps hidden unselected whitespace bytes on their original surface while applying the visible selected change');

  fs.writeFileSync(path.join(evidence, 'checks.json'), JSON.stringify(checks, null, 2));
  console.log(JSON.stringify({checks, evidence}, null, 2));
} finally {reader.cancel(); writer.cancel();}
