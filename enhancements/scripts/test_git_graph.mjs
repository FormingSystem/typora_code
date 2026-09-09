import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: ['git_graph_data', 'git_graph_repository', 'git_graph_settings', 'git_graph_runtime'].map(name => `export * from './src/${name}.ts';`).join('\n'), resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const { read_repository, compare_files, compare_patch, EMPTY, build_git_graph, graph_defaults, GRAPH_SETTINGS_KEY, load_graph_settings, validate_settings, create_git_runner } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_git_graph_'));
const runner = create_git_runner({ child_process, process });
const git = args => child_process.execFileSync('git', ['-c', 'user.name=Graph Test', '-c', 'user.email=graph@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const commit = message => { git(['add', '--all']); git(['commit', '-m', message]); return git(['rev-parse', 'HEAD']).trim(); };
try {
  const legacy_settings = { ...graph_defaults, initial_count: 75, details_location: 'right', panel_ratio: 72, show_date: false, show_author: false, show_hash: false, label_alignment: 'graph' };
  const migrated_settings = load_graph_settings({ getItem: key => key === GRAPH_SETTINGS_KEY + 'settings:legacy' ? JSON.stringify(legacy_settings) : null }, 'legacy');
  assert.equal(migrated_settings.initial_count, 75);
  for (const key of ['details_location', 'panel_ratio', 'show_date', 'show_author', 'show_hash', 'label_alignment']) assert(!Object.hasOwn(migrated_settings, key));
  assert.throws(() => validate_settings({ ...graph_defaults, mistyped_setting: true }), /未知设置：mistyped_setting/);
  assert.throws(() => validate_settings({ ...graph_defaults, initial_count: '75' }), /设置类型不正确：initial_count/);
  git(['init', '-b', 'main']);
  assert.deepEqual((await read_repository(runner.run, root, graph_defaults, 200)).commits, []);
  const unusual = '中文 空格 #%.md';
  write(unusual, 'base\n'); const first = commit('起点 <img src=x onerror=alert(1)>');
  git(['checkout', '-b', 'feature']); write('feature.md', 'branch\n'); const feature = commit('分支');
  git(['checkout', 'main']); write(unusual, 'base\n新增一行\n'); const main = commit('主线');
  git(['merge', '--no-ff', 'feature', '-m', '合并']); const merge = git(['rev-parse', 'HEAD']).trim();
  git(['-c', 'tag.gpgsign=false', 'tag', '-a', 'v1', '-m', '版本']);
  git(['update-ref', 'refs/remotes/origin/main', merge]);
  const snapshot = await read_repository(runner.run, root, graph_defaults, 200);
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
  assert.deepEqual(await compare_files(runner.run, snapshot, EMPTY, first), [{ status: 'A', path: unusual }]);
  assert.deepEqual(await compare_files(runner.run, snapshot, main, merge), [{ status: 'A', path: 'feature.md' }]);
  assert.deepEqual(await compare_files(runner.run, snapshot, feature, merge), [{ status: 'M', path: unusual }]);
  assert((await compare_patch(runner.run, snapshot, feature, merge, {status:'M',path:unusual})).includes('+新增一行'));
  assert((await runner.run(root, ['show', '-s', '--format=%B', first])).includes('<img src=x onerror=alert(1)>'));
  assert.deepEqual((await read_repository(runner.run, root, graph_defaults, 200, ['refs/heads/feature'])).commits.map(item => item.hash), [feature, first]);
  // 以 Git 实际返回的顺序检查分页边界，不能只断言参数字符串。
  const history_lines = [];
  for (let index = 0; index < 200; index++) {
    const message = `history ${index}`;
    history_lines.push(`commit refs/heads/long\ncommitter Graph Test <graph@example.invalid> ${1700000000 + index} +0000\ndata ${message.length}\n${message}\n${index === 0 ? `from ${first}\n` : ''}\n`);
  }
  child_process.execFileSync('git', ['fast-import', '--quiet'], { cwd: root, input: history_lines.join(''), windowsHide: true });
  const page = await read_repository(runner.run, root, graph_defaults, 200);
  assert.equal(page.commits.length, 200); assert.equal(page.more, true);
  const next = await read_repository(runner.run, root, graph_defaults, 400);
  assert.equal(next.commits.length, 204); assert.equal(next.more, false);
  assert.deepEqual(next.commits.slice(0, 200), page.commits);
  // 未提交正文和索引必须保持原字节；读取操作不得触发外部 diff。
  write(unusual, 'dirty\n'); write('untracked.md', 'not staged\n');
  git(['config', 'diff.external', 'must-never-execute-this']);
  const status = git(['status', '--porcelain=v1']); const index_before = fs.readFileSync(path.join(root, '.git/index'));
  await read_repository(runner.run, root, graph_defaults, 200);
  await compare_patch(runner.run, snapshot, feature, merge, {status:'M',path:unusual});
  assert.equal(fs.readFileSync(path.join(root, unusual), 'utf8'), 'dirty\n');
  assert.deepEqual(fs.readFileSync(path.join(root, '.git/index')), index_before);
  assert.equal(git(['status', '--porcelain=v1']), status);
  await assert.rejects(read_repository(runner.run, os.tmpdir(), graph_defaults, 200), /not a git repository/i);
  const worktree = path.join(root, 'linked'); git(['worktree', 'add', '--detach', worktree, feature]);
  const linked = await read_repository(runner.run, worktree, graph_defaults, 200);
  assert.equal(path.resolve(linked.root), path.resolve(worktree)); assert.equal(linked.head, feature);
  const recorded = [];
  const missing = create_git_runner({ process, child_process: { execFile(file, args, options, callback) {
    recorded.push({ file, args, options }); queueMicrotask(() => callback(Object.assign(new Error('missing'), { code: 'ENOENT' }), '', '')); return { kill() {} };
  } } });
  await assert.rejects(missing.run(root, ['log']), /未找到 Git/);
  assert.equal(recorded[0].options.shell, false); assert.equal(recorded[0].options.windowsHide, true);
  assert.equal(recorded[0].options.env.GIT_OPTIONAL_LOCKS, '0');
  assert(!recorded[0].args.includes('--literal-pathspecs'));
  await assert.rejects(missing.run(root, ['diff', '--', '*.md']));
  assert(recorded[1].args.includes('--literal-pathspecs'));
  console.log('git graph: real branches, merge parents, annotated tags, remote refs, pagination, linked worktree, empty/error states and read-only checks passed');
} finally {
  runner.cancel();
  assert(path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('typora_git_graph_'));
  fs.rmSync(root, { recursive: true, force: true });
}
