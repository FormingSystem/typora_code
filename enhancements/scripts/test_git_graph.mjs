import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import { transform } from 'esbuild';

const import_ts = async file => {
  const compiled = await transform(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
};
const { read_git_snapshot, read_git_files, read_git_patch, read_git_message, build_git_graph, GIT_PAGE_SIZE } = await import_ts('src/git_graph_data.ts');
const { create_git_runner } = await import_ts('src/git_graph_runtime.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_git_graph_'));
const runner = create_git_runner({ child_process, process });
const git = args => child_process.execFileSync('git', ['-c', 'user.name=Graph Test', '-c', 'user.email=graph@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const commit = message => { git(['add', '--all']); git(['commit', '-m', message]); return git(['rev-parse', 'HEAD']).trim(); };
try {
  git(['init', '-b', 'main']);
  assert.deepEqual((await read_git_snapshot(runner.run, root)).commits, []);
  const unusual = '中文 空格 #%.md';
  write(unusual, 'base\n'); const first = commit('起点 <img src=x onerror=alert(1)>');
  git(['checkout', '-b', 'feature']); write('feature.md', 'branch\n'); const feature = commit('分支');
  git(['checkout', 'main']); write(unusual, 'base\n新增一行\n'); const main = commit('主线');
  git(['merge', '--no-ff', 'feature', '-m', '合并']); const merge = git(['rev-parse', 'HEAD']).trim();
  git(['-c', 'tag.gpgsign=false', 'tag', '-a', 'v1', '-m', '版本']);
  git(['update-ref', 'refs/remotes/origin/main', merge]);
  const snapshot = await read_git_snapshot(runner.run, root);
  assert.equal(snapshot.commits[0].hash, merge);
  assert.deepEqual(snapshot.commits[0].parents, [main, feature]);
  assert.equal(snapshot.commits.length, 4);
  assert(snapshot.refs.some(ref => ref.name === 'refs/tags/v1' && ref.hash === merge));
  assert(snapshot.refs.some(ref => ref.name === 'refs/remotes/origin/main'));
  const graph = build_git_graph(snapshot.commits);
  assert.equal(graph.width, 2);
  assert.deepEqual(graph.rows[0].edges.filter(edge => !edge.upper).map(edge => edge.to), [0, 1]);
  assert(graph.rows.at(-1).edges.some(edge => edge.upper));
  assert.equal(graph.rows.at(-1).edges.filter(edge => !edge.upper).length, 0);
  assert.deepEqual(await read_git_files(runner.run, root, first), [{ status: 'A', path: unusual }]);
  assert.deepEqual(await read_git_files(runner.run, root, merge, main), [{ status: 'A', path: 'feature.md' }]);
  assert.deepEqual(await read_git_files(runner.run, root, merge, feature), [{ status: 'M', path: unusual }]);
  assert((await read_git_patch(runner.run, root, merge, feature, unusual)).includes('+新增一行'));
  assert((await read_git_message(runner.run, root, first)).includes('<img src=x onerror=alert(1)>'));
  assert.deepEqual((await read_git_snapshot(runner.run, root, 200, feature)).commits.map(item => item.hash), [feature, first]);
  // 以 Git 实际返回的顺序检查分页边界，不能只断言参数字符串。
  const history_lines = [];
  for (let index = 0; index < GIT_PAGE_SIZE; index++) {
    const message = `history ${index}`;
    history_lines.push(`commit refs/heads/long\ncommitter Graph Test <graph@example.invalid> ${1700000000 + index} +0000\ndata ${message.length}\n${message}\n${index === 0 ? `from ${first}\n` : ''}\n`);
  }
  child_process.execFileSync('git', ['fast-import', '--quiet'], { cwd: root, input: history_lines.join(''), windowsHide: true });
  const page = await read_git_snapshot(runner.run, root);
  assert.equal(page.commits.length, 200); assert.equal(page.more, true);
  const next = await read_git_snapshot(runner.run, root, 400);
  assert.equal(next.commits.length, 204); assert.equal(next.more, false);
  assert.deepEqual(next.commits.slice(0, 200), page.commits);
  // 未提交正文和索引必须保持原字节；读取操作不得触发外部 diff。
  write(unusual, 'dirty\n'); write('untracked.md', 'not staged\n');
  git(['config', 'diff.external', 'must-never-execute-this']);
  const status = git(['status', '--porcelain=v1']); const index_before = fs.readFileSync(path.join(root, '.git/index'));
  await read_git_snapshot(runner.run, root);
  await read_git_patch(runner.run, root, merge, feature, unusual);
  assert.equal(fs.readFileSync(path.join(root, unusual), 'utf8'), 'dirty\n');
  assert.deepEqual(fs.readFileSync(path.join(root, '.git/index')), index_before);
  assert.equal(git(['status', '--porcelain=v1']), status);
  await assert.rejects(read_git_snapshot(runner.run, os.tmpdir()), /not a git repository/i);
  await assert.rejects(read_git_snapshot(runner.run, root, 200, '--all'), /提交编号无效/);
  const worktree = path.join(root, 'linked'); git(['worktree', 'add', '--detach', worktree, feature]);
  const linked = await read_git_snapshot(runner.run, worktree);
  assert.equal(path.resolve(linked.root), path.resolve(worktree)); assert.equal(linked.head, feature);
  const recorded = [];
  const missing = create_git_runner({ process, child_process: { execFile(file, args, options, callback) {
    recorded.push({ file, args, options }); queueMicrotask(() => callback(Object.assign(new Error('missing'), { code: 'ENOENT' }), '', '')); return { kill() {} };
  } } });
  await assert.rejects(missing.run(root, ['log']), /未找到 Git/);
  assert.equal(recorded[0].options.shell, false); assert.equal(recorded[0].options.windowsHide, true);
  assert.equal(recorded[0].options.env.GIT_OPTIONAL_LOCKS, '0');
  assert(recorded[0].args.includes('--literal-pathspecs'));
  console.log('git graph: real branches, merge parents, annotated tags, remote refs, pagination, linked worktree, empty/error states and read-only checks passed');
} finally {
  runner.cancel();
  assert(path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('typora_git_graph_'));
  fs.rmSync(root, { recursive: true, force: true });
}
