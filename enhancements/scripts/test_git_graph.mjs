import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: ['git_graph_pull_request', 'git_graph_data', 'git_graph_repository', 'git_graph_settings', 'git_graph_runtime'].map(name => `export * from './src/${name}.ts';`).join('\n'), resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const { create_pull_request_url, pull_request_remote, pull_request_defaults, validate_pull_request_providers, read_repository, compare_files, compare_patch, EMPTY, build_git_graph, graph_defaults, GRAPH_SETTINGS_KEY, load_graph_settings, validate_settings, create_git_runner } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const graph_fixture = entries => build_git_graph(entries.map(([hash,parents])=>({hash,parents,author:'',date:'',subject:hash})));
const branch_graph = graph_fixture([['main',['base']],['feature',['base']],['between',['older']],['base',['older']],['older',[]]]);
const feature_color = branch_graph.rows[1].color;
assert.notEqual(feature_color, branch_graph.rows[0].color);
assert(branch_graph.rows[1].edges.some(edge=>!edge.upper&&edge.from===branch_graph.rows[1].lane&&edge.color===feature_color));
assert(branch_graph.rows[2].edges.some(edge=>edge.upper&&edge.color===feature_color));
assert(branch_graph.rows[3].edges.some(edge=>edge.upper&&edge.to===branch_graph.rows[3].lane&&edge.color===feature_color));
const stash_graph = graph_fixture([['main',['base']],['stash1',['base']],['stash2',['base']],['base',[]]]);
assert.equal(new Set(stash_graph.rows.slice(0,3).map(row=>row.color)).size,3);
for (const row of stash_graph.rows.slice(0,3)) assert(stash_graph.rows[3].edges.some(edge=>edge.upper&&edge.to===stash_graph.rows[3].lane&&edge.color===row.color));
const merge_graph = graph_fixture([['merge',['main','feature']],['main',['base']],['feature',['base']],['base',[]]]);
assert.deepEqual(merge_graph.rows[0].edges.filter(edge=>!edge.upper).map(edge=>edge.color),[merge_graph.rows[1].color,merge_graph.rows[2].color]);
for(const graph of [branch_graph,stash_graph,merge_graph]) for(let index=0;index<graph.rows.length-1;index++) for(const edge of graph.rows[index].edges.filter(edge=>!edge.upper)) {
  assert(graph.rows[index+1].edges.some(next=>next.upper&&next.from===edge.to&&next.color===edge.color),'row boundary retains branch colour');
  assert(edge.from>=0&&edge.to>=0);
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_git_graph_'));
const runner = create_git_runner({ child_process, process });
const git = args => child_process.execFileSync('git', ['-c', 'user.name=Graph Test', '-c', 'user.email=graph@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const commit = message => { git(['add', '--all']); git(['commit', '-m', message]); return git(['rev-parse', 'HEAD']).trim(); };
try {
  const legacy_settings = { ...graph_defaults, initial_count: 75, details_location: 'docked', panel_ratio: 72, scm_integration: "more", show_date: false, show_author: false, show_hash: false, label_alignment: 'graph' };
  const migrated_settings = load_graph_settings({ getItem: key => key === GRAPH_SETTINGS_KEY + 'settings:legacy' ? JSON.stringify(legacy_settings) : null }, 'legacy');
  assert.equal(migrated_settings.initial_count, 75);
  assert(!Object.hasOwn(migrated_settings, 'panel_ratio')); assert(!Object.hasOwn(migrated_settings, 'scm_integration'));
  assert.equal(migrated_settings.details_location, 'docked'); assert.equal(migrated_settings.label_alignment, 'graph'); assert.equal(migrated_settings.show_date, false);
  assert.throws(() => validate_settings({ ...graph_defaults, mistyped_setting: true }), /未知设置：mistyped_setting/);
  assert.throws(() => validate_settings({ ...graph_defaults, initial_count: '75' }), /设置类型不正确：initial_count/);
  assert.deepEqual(pull_request_remote('git@github.com:fork/code.git'),{host:'https://github.com',owner:'fork',repository:'code',provider:'GitHub'});
  assert.deepEqual(pull_request_remote('ssh://git@gitlab.example/group/nested/repo.git'),{host:'https://gitlab.example',owner:'group/nested',repository:'repo',provider:'GitLab'});
  const pr={...pull_request_defaults,provider:'GitHub',host:'https://github.com',source_owner:'fork',source_repository:'code',destination_owner:'upstream',destination_repository:'code',destination_branch:'release/中文'};
  const github=new URL(create_pull_request_url(pr,'feature/a&b#%',[]));assert.equal(decodeURIComponent(github.pathname),'/upstream/code/compare/release/中文...fork:feature/a&b#%');assert.equal(github.search,'?expand=1');
  const gitlab=new URL(create_pull_request_url({...pr,provider:'GitLab',host:'https://gitlab.example',destination_project:'314'},'feature/a&b',[]));assert.equal(gitlab.searchParams.get('merge_request[source_branch]'),'feature/a&b');assert.equal(gitlab.searchParams.get('merge_request[target_project_id]'),'314');
  const bitbucket=new URL(create_pull_request_url({...pr,provider:'Bitbucket',host:'https://bitbucket.org'},'feature/a',[]));assert.equal(bitbucket.searchParams.get('source'),'fork/code::feature/a');assert.equal(bitbucket.searchParams.get('dest'),'upstream/code::release/中文');
  const providers=[{name:'Enterprise A',template_url:'$1/$5/$6/new?source=$2/$3/$4&target=$8&id=$7'},{name:'Enterprise B',template_url:'https://review.example/new?head=$4&base=$8'}];validate_pull_request_providers(providers);
  assert.equal(new URL(create_pull_request_url({...pr,provider:'Enterprise A',destination_project:'42'},'a&b',providers)).searchParams.get('source'),'fork/code/a&b');
  assert.equal(new URL(create_pull_request_url({...pr,provider:'Enterprise B'},'topic',providers)).hostname,'review.example');
  assert.throws(()=>validate_pull_request_providers([...providers,providers[0]]));assert.throws(()=>validate_pull_request_providers([{name:'Bad',template_url:'javascript:alert($4)'}]));assert.throws(()=>create_pull_request_url({...pr,host:'https://user:secret@example.com'},'topic',[]));
  const stored_pr=validate_settings({...graph_defaults,pr_config:pr,pr_providers:providers,tab_icon_theme:'grey'});assert.deepEqual(load_graph_settings({getItem:()=>JSON.stringify(stored_pr)},root),stored_pr);
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
  // 两个真实三父stash只显示两个节点，保留普通引用可达的辅助对象。
  const stash_hashes=[];const helper_hashes=[];
  for(let index=0;index<2;index++) {
    write(unusual,'stash tracked '+index);write('untracked_'+index+'.txt','stash extra');git(['stash','push','-u','-m','fixture '+index]);
    const hash=git(['rev-parse','refs/stash']).trim();stash_hashes.push(hash);helper_hashes.push(...git(['show','-s','--format=%P',hash]).trim().split(' ').slice(1));
  }
  const stash_state=await read_repository(runner.run,root,graph_defaults,200);
  assert.equal(stash_state.commits.length,snapshot.commits.length+2);
  for(const hash of stash_hashes) assert.deepEqual(stash_state.commits.find(commit=>commit.hash===hash).parents,[merge]);
  assert(helper_hashes.every(hash=>!stash_state.commits.some(commit=>commit.hash===hash)));
  const stash_page=await read_repository(runner.run,root,graph_defaults,3);assert.equal(stash_page.commits.length,3);assert(stash_page.more);
  git(['branch','retained-helper',helper_hashes[0]]);
  assert((await read_repository(runner.run,root,graph_defaults,200)).commits.some(commit=>commit.hash===helper_hashes[0]));
  git(['branch','-D','retained-helper']);git(['stash','clear']);
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
  const missing = create_git_runner({ process:{env:{},platform:'linux'}, child_process: { execFile(file, args, options, callback) {
    recorded.push({ file, args, options }); queueMicrotask(() => callback(Object.assign(new Error('missing'), { code: 'ENOENT' }), '', '')); return { kill() {} };
  } } });
  await assert.rejects(missing.run(root, ['log']), error=>error.code==='GIT_NOT_FOUND');
  assert.equal(recorded[0].options.shell, false); assert.equal(recorded[0].options.windowsHide, true);
  assert.deepEqual(recorded[0].args,['--version']);
  console.log('git graph: real branches, merge parents, annotated tags, remote refs, pagination, linked worktree, empty/error states and read-only checks passed');
} finally {
  runner.cancel();
  assert(path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('typora_git_graph_'));
  fs.rmSync(root, { recursive: true, force: true });
}
