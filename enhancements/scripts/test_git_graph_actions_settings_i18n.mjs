import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { build, transform } from 'esbuild';

const compiled = await build({
  stdin: {
    contents: [
      'git_graph_i18n',
      'git_graph_actions',
      'git_graph_settings',
    ].map(name => `export * from './src/${name}.ts';`).join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});

const module_url = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`;
const {
  git_graph_dictionary,
  resolve_git_graph_locale,
  git_graph_text,
  graph_action_choice_label,
  graph_actions_for,
  graph_defaults,
  plan_git_action,
  settings_choice_label,
  settings_choice_labels_for,
  settings_choices,
  settings_labels_for,
  validate_settings,
} = await import(module_url);

assert.equal(resolve_git_graph_locale('zh'), 'zh-cn');
assert.equal(resolve_git_graph_locale('zh-CN'), 'zh-cn');
assert.equal(resolve_git_graph_locale('zh-TW'), 'zh-cn');
assert.equal(resolve_git_graph_locale('zh_Hant'), 'zh-cn');
assert.equal(resolve_git_graph_locale('en-US'), 'en');
assert.equal(resolve_git_graph_locale('de-DE'), 'en');

const zh_actions = graph_actions_for('zh-cn');
const en_actions = graph_actions_for('en');
assert.deepEqual(en_actions.map(item => item.id), zh_actions.map(item => item.id));
assert.equal(zh_actions.find(item => item.id === 'sync').title, '同步更改');
assert.equal(en_actions.find(item => item.id === 'sync').title, 'Sync Changes');
assert.equal(zh_actions.find(item => item.id === 'branch_delete').destructive, '删除所选分支引用。');
assert.equal(en_actions.find(item => item.id === 'branch_delete').destructive, 'Deletes the selected branch ref.');
assert(zh_actions.every(item => /\p{Script=Han}/u.test(item.title)));
assert(en_actions.every(item => !/\p{Script=Han}/u.test(item.title)));
assert(en_actions.flatMap(item => item.fields).every(item => !/\p{Script=Han}/u.test(item.title)));

const raw_action_choices = {
  merge: ['normal', 'no-ff', 'ff-only', 'squash'],
  reset: ['mixed', 'soft', 'hard'],
  pull: ['ff-only', 'merge', 'rebase', 'no-ff', 'squash'],
  sync: ['merge', 'rebase', 'ff-only'],
};
for (const [id, expected] of Object.entries(raw_action_choices)) {
  const field = zh_actions.find(item => item.id === id).fields.find(item => item.type === 'choice');
  assert.deepEqual(field.choices, expected);
}
assert.equal(graph_action_choice_label('no-ff', 'zh-cn'), '创建合并提交');
assert.equal(graph_action_choice_label('no-ff', 'en'), 'Create a Merge Commit');
assert.equal(graph_action_choice_label('future-mode', 'en'), 'future-mode');
assert.equal(zh_actions.find(item => item.id === 'merge').fields.find(item => item.type === 'choice').choice_labels['no-ff'], '创建合并提交');
assert.equal(en_actions.find(item => item.id === 'merge').fields.find(item => item.type === 'choice').choice_labels['no-ff'], 'Create a Merge Commit');

const zh_labels = settings_labels_for('zh-cn');
const en_labels = settings_labels_for('en');
assert.deepEqual(Object.keys(zh_labels).sort(), Object.keys(graph_defaults).sort());
assert.deepEqual(Object.keys(en_labels).sort(), Object.keys(graph_defaults).sort());
assert.equal(zh_labels.repository_order, '仓库排序');
assert.equal(en_labels.repository_order, 'Repository Order');
assert(Object.values(en_labels).every(label => !/\p{Script=Han}/u.test(label)));
assert.deepEqual(settings_choices, {
  graph_style: ['curved', 'straight'],
  order: ['topo', 'date', 'author-date'],
  date_type: ['author', 'committer'],
  date_format: ['local', 'iso', 'relative'],
  file_view: ['tree', 'list'],
  uncommitted_style: ['row', 'connected'],
  new_tab_group: ['active', 'right', 'down'],
  repository_order: ['name', 'path', 'recent'],
});
assert.equal(settings_choice_label('order', 'author-date', 'zh-cn'), '作者时间');
assert.equal(settings_choice_label('order', 'author-date', 'en'), 'Author Date');
assert.equal(settings_choice_label('order', 'future-order', 'en'), 'future-order');
assert.equal(settings_choice_labels_for('zh-cn').order['author-date'], '作者时间');
assert.equal(settings_choice_labels_for('en').order['author-date'], 'Author Date');

assert.deepEqual(Object.keys(git_graph_dictionary('zh-cn')), Object.keys(git_graph_dictionary('en')));
for (const locale of ['zh-cn', 'en']) {
  for (const [key, value] of Object.entries(git_graph_dictionary(locale))) {
    assert.equal(typeof value, 'string', `${locale}:${key} is text`);
    assert(value.length > 0, `${locale}:${key} is nonempty`);
  }
}
for (const key of Object.keys(git_graph_dictionary('zh-cn'))) {
  const placeholders = locale => [...git_graph_dictionary(locale)[key].matchAll(/\{([a-z_]+)\}/giu)].map(match => match[1]).sort();
  assert.deepEqual(placeholders('zh-cn'), placeholders('en'), `${key} keeps the same interpolation contract`);
}
assert.equal(git_graph_text('action.preview.restore_file', {file: '"raw name.md"'}, 'zh-cn'), '  恢复："raw name.md"');
assert.equal(git_graph_text('action.preview.restore_file', {file: '"raw name.md"'}, 'en'), '  Restore: "raw name.md"');

const context = {target: '', hash: '', root: 'repository', operation: ''};
globalThis._options = {displayLang: 'zh-CN'};
assert.throws(() => validate_settings({...graph_defaults, mistyped_setting: true}), /未知设置：mistyped_setting/);
assert.throws(() => validate_settings({...graph_defaults, encoding: 'not-an-encoding'}), /不支持的历史文件编码：not-an-encoding/);
assert.throws(() => validate_settings({...graph_defaults, issue_pattern: '['}), /Issue 正则无效/);
await assert.rejects(plan_git_action(async () => '', 'not_registered', context, {}), /未知 Git 操作/);

globalThis._options = {displayLang: 'en-US'};
assert.throws(() => validate_settings({...graph_defaults, mistyped_setting: true}), /Unknown setting: mistyped_setting/);
assert.throws(() => validate_settings({...graph_defaults, encoding: 'not-an-encoding'}), /Unsupported historical file encoding: not-an-encoding/);
assert.throws(() => validate_settings({...graph_defaults, issue_pattern: '['}), /The Issue pattern is invalid/);
await assert.rejects(plan_git_action(async () => '', 'not_registered', context, {}), /Unknown Git action/);
await assert.rejects(plan_git_action(async () => '', 'merge', context, {mode: 'invalid', no_commit: false}), /Invalid option: Merge Method/);

delete globalThis._options;

const source_files = readdirSync('src').filter(name => /^git_.*\.ts$/u.test(name) && name !== 'git_graph_i18n.ts');
const dictionary_keys = new Set(Object.keys(git_graph_dictionary('zh-cn')));
const referenced_keys = new Map();
for (const name of source_files) {
  const source = readFileSync(join('src', name), 'utf8');
  for (const match of source.matchAll(/["']((?:common|graph|action|settings|view|repository|runtime|ignore|host|diff|history|status|scm|data|icon)\.[a-z0-9_.]+)["']/gu)) {
    if (!referenced_keys.has(match[1])) referenced_keys.set(match[1], new Set());
    referenced_keys.get(match[1]).add(name);
  }
  const transformed = (await transform(source, {loader: 'ts', legalComments: 'none', format: 'esm'})).code;
  const chinese_literals = [...transformed.matchAll(/(["'`])(?:\\.|(?!\1)[\s\S])*?\1/gu)]
    .map(match => match[0])
    .filter(value => /\p{Script=Han}/u.test(value));
  assert.deepEqual(chinese_literals, [], `${name} keeps translated Chinese literals in git_graph_i18n.ts`);
}
for (const [key, names] of referenced_keys) {
  assert(dictionary_keys.has(key), `${key} referenced by ${[...names].join(', ')} exists in both dictionaries`);
}

console.log(`git graph i18n: ${dictionary_keys.size} bilingual keys, ${referenced_keys.size} source references, locale selection, action/settings metadata and validation passed`);
