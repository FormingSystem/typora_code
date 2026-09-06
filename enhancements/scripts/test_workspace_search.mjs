import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import {build_search_test_api} from './search_worker_fixture.mjs';

const {api, matcher_factory, dispose_all} = await build_search_test_api();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_workspace_search_'));
const checks = [];
const git = (root, args) => child_process.execFileSync('git', ['-c', 'core.autocrlf=false', ...args], {cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
const engine = api.create_workspace_search_engine({fs, path_api: path, platform: process.platform, git_run: async (root, args) => git(root, args), matcher_factory});
const make_root = name => { const root = path.join(temp, name); fs.mkdirSync(root); return root; };
const write = (root, relative, text) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); return file; };
const search = (root, query, options = {}, callbacks) => engine.search(root, {query, use_ignore: false, ...options}, callbacks);
const paths = result => result.files.map(file => file.relative_path).sort();
const encode = (text, encoding) => encoding === 'utf8bom' ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]) : Buffer.concat([Buffer.from(encoding === 'utf16be' ? [0xfe, 0xff] : [0xff, 0xfe]), encoding === 'utf16be' ? Buffer.from(text, 'utf16le').swap16() : Buffer.from(text, 'utf16le')]);
try {
  const texts = make_root('texts');
  const source = write(texts, 'source.c', 'needle Needle NEEDLE needlework _needle 中文needle中文\r\n😀 needle\r\nfirst\r\nsecond\r\n');
  write(texts, '.hidden/settings', 'needle\n'); write(texts, 'nested/.secret.json', '{"needle":true}'); write(texts, 'nested/deep/source.c', 'needle\n');
  let result = await search(texts, 'needle');
  assert.equal(result.counts.matches, 10); assert.deepEqual(paths(result), ['.hidden/settings', 'nested/.secret.json', 'nested/deep/source.c', 'source.c']);
  const emoji_match = result.files.find(file => file.relative_path === 'source.c').matches.find(match => match.line === 2);
  assert.equal(emoji_match.column, 4); assert.equal(emoji_match.text, 'needle'); assert.equal(emoji_match.preview.slice(emoji_match.preview_ranges[0].start, emoji_match.preview_ranges[0].end), 'needle');
  assert.equal((await search(texts, 'needle', {case_sensitive: true})).counts.matches, 8);
  assert.equal((await search(texts, 'needle', {whole_word: true})).counts.matches, 7);
  result = await search(texts, 'first\nsecond'); assert.equal(result.counts.matches, 1); assert.equal(result.files[0].matches[0].end_line, 4);
  result = await search(texts, '^', {regex: true, include: './source.c'}); assert(result.counts.matches >= 4 && result.counts.matches < 12);
  for (const file of result.files) for (const match of file.matches) for (const range of match.preview_ranges) assert(range.start >= 0 && range.end <= match.preview.length);
  await assert.rejects(search(texts, '[', {regex: true}), /正则/);
  checks.push('all text extensions, hidden directories, Unicode positions, case, whole words, multiline and zero-width regex work');

  const globs = api.compile_workspace_globs;
  assert(globs('*.{c,json}, config[12].?s')('nested/a.c')); assert(globs('*.{c,json}, config[12].?s')('x/config2.js'));
  assert(!globs('./source.c')('nested/source.c')); assert(globs('./source.c')('source.c'));
  assert(globs('deep/')('nested/deep/source.c')); assert(globs('a[!0-9].txt')('nested/ab.txt')); assert(!globs('a[!0-9].txt')('nested/a1.txt'));
  assert(globs('*.C', false)('nested/a.c')); assert(!globs('*.C', true)('nested/a.c')); assert(!globs('source.c', true, false)('nested/source.c'));
  assert.deepEqual(paths(await search(texts, 'needle', {include: '*.c, *.json', exclude: 'deep'})), ['nested/.secret.json', 'source.c']);
  assert.deepEqual(paths(await search(texts, 'needle', {include: './source.c'})), ['source.c']);
  assert.deepEqual(paths(await search(texts, 'needle', {file_paths: [source, path.join(temp, 'outside.c')]})), ['source.c']);
  assert.equal((await search(texts, 'needle', {file_paths: []})).counts.matches, 0);
  checks.push('VS Code Search glob prefixes, comma/brace/class syntax, root anchors and explicit open-editor scope are enforced');

  const ignored = make_root('ignored'); git(ignored, ['init', '-b', 'main']);
  write(ignored, '.gitignore', '*.log\n!keep.log\ncache/\nsecret\\[1\\].txt\n');
  write(ignored, 'drop.log', 'marker'); write(ignored, 'keep.log', 'marker'); write(ignored, 'tracked.log', 'marker'); git(ignored, ['add', '-f', '--', 'tracked.log']);
  write(ignored, 'cache/nested.txt', 'marker'); write(ignored, 'secret[1].txt', 'marker'); write(ignored, 'secret1.txt', 'marker');
  write(ignored, 'node_modules/pkg/a.js', 'marker'); write(ignored, 'sub/.gitignore', 'nested.txt\n'); write(ignored, 'sub/nested.txt', 'marker'); write(ignored, 'sub/keep.txt', 'marker');
  const index = fs.readFileSync(path.join(ignored, '.git/index'));
  result = await search(ignored, 'marker', {use_ignore: true});
  assert.deepEqual(paths(result), ['keep.log', 'secret1.txt', 'sub/keep.txt', 'tracked.log']); assert(result.counts.skipped.ignored > 0); assert(result.counts.skipped.excluded > 0);
  assert(fs.readFileSync(path.join(ignored, '.git/index')).equals(index));
  result = await search(ignored, 'marker', {use_ignore: false, exclude: 'cache'});
  assert(paths(result).includes('drop.log') && paths(result).includes('node_modules/pkg/a.js')); assert(!paths(result).some(file => file.startsWith('cache/')));
  assert.deepEqual(paths(await search(ignored, 'marker', {use_ignore: true, exclude_settings: '**/.git'})), ['keep.log', 'node_modules/pkg/a.js', 'secret1.txt', 'sub/keep.txt', 'tracked.log']);
  checks.push('real Git ignore negation, nested files, escaped filenames and tracked exceptions work without changing the index');

  const skipped = make_root('skipped'); write(skipped, 'a.txt', 'needle'); write(skipped, 'binary.bin', Buffer.from([0x50, 0x4b, 3, 4, 0, 0])); write(skipped, 'large.txt', 'needle'.repeat(100)); write(skipped, 'bad.txt', Buffer.from([0xff, 0xfd]));
  result = await search(skipped, 'needle', {max_file_bytes: 100});
  assert.equal(result.counts.skipped.binary, 1); assert.equal(result.counts.skipped.large, 1); assert.equal(result.counts.skipped.unreadable, 1); assert.equal(result.counts.matches, 1);
  const controller = new AbortController(); result = await search(texts, 'needle', {}, {signal: controller.signal, on_file: () => controller.abort()}); assert(result.cancelled); await assert.rejects(engine.prepare_replace(result, 'changed'), /搜索未完成/);
  result = await search(texts, 'needle', {max_results: 2}); assert(result.limit_reached); assert.equal(result.counts.matches, 2); await assert.rejects(engine.prepare_replace(result, 'changed'), /上限/);
  assert.equal((await engine.prepare_replace(result, 'changed', {match_ids: [result.files[0].matches[0].id]})).match_count, 1);
  checks.push('binary, large and undecodable counts are explicit; cancellation and caps cannot silently replace incomplete results');

  const replace = make_root('replace'); const first_file = write(replace, 'a.txt', 'needle needle\r\n'); const second_file = write(replace, 'b.txt', 'needle\n');
  result = await search(replace, 'needle'); let plan = await engine.prepare_replace(result, 'new', {match_ids: [result.files.find(file => file.relative_path === 'a.txt').matches[1].id]});
  assert.equal(plan.files[0].after_text, 'needle new\r\n'); assert.equal(fs.readFileSync(first_file, 'utf8'), 'needle needle\r\n');
  // 外部修改公开预览对象不能改变私有执行计划。
  plan.files[0].after_text = 'tampered'; plan.files[0].file_path = second_file;
  await engine.apply_replace(plan, {can_write: () => true}); assert.equal(fs.readFileSync(first_file, 'utf8'), 'needle new\r\n'); assert.equal(fs.readFileSync(second_file, 'utf8'), 'needle\n');
  await assert.rejects(engine.apply_replace(plan), /失效/);
  result = await search(replace, 'needle'); plan = await engine.prepare_replace(result, 'item\nnext', {file_path: first_file}); await engine.apply_replace(plan); assert.equal(fs.readFileSync(first_file, 'utf8'), 'item\r\nnext new\r\n');
  checks.push('single-hit and file replacement preview is read-only, preserves newlines, and public plan edits cannot redirect writes');

  const encodings = make_root('encodings');
  for (const encoding of ['utf8bom', 'utf16le', 'utf16be']) write(encodings, encoding + '.txt', encode('needle\r\n未修改\nneedle\r\n', encoding));
  result = await search(encodings, 'needle'); assert.equal(result.counts.matches, 6); plan = await engine.prepare_replace(result, 'changed'); await engine.apply_replace(plan);
  for (const encoding of ['utf8bom', 'utf16le', 'utf16be']) assert(fs.readFileSync(path.join(encodings, encoding + '.txt')).equals(encode('changed\r\n未修改\nchanged\r\n', encoding)));
  const regular = make_root('regex'); const regular_file = write(regular, 'a.txt', 'Abc abc ABC\nfoo-bar FOO-BAR Foo-Bar\n');
  result = await search(regular, '(?<word>abc)', {regex: true}); plan = await engine.prepare_replace(result, '\\U$<word>\\E-$1-$$-\\u$1');
  assert.equal(plan.files[0].after_text, 'ABC-Abc-$-Abc ABC-abc-$-Abc ABC-ABC-$-ABC\nfoo-bar FOO-BAR Foo-Bar\n');
  result = await search(regular, 'abc', {preserve_case: true}); plan = await engine.prepare_replace(result, 'new'); assert.equal(plan.files[0].after_text, 'New new NEW\nfoo-bar FOO-BAR Foo-Bar\n');
  result = await search(regular, 'foo-bar', {preserve_case: true}); plan = await engine.prepare_replace(result, 'new-item'); assert.equal(plan.files[0].after_text, 'Abc abc ABC\nnew-item NEW-ITEM New-Item\n');
  assert.equal(fs.readFileSync(regular_file, 'utf8'), 'Abc abc ABC\nfoo-bar FOO-BAR Foo-Bar\n');
  checks.push('UTF-8/UTF-16 LE/BE BOMs and mixed untouched newlines survive replacement; captures, case modifiers and preserve-case work');

  const guards = make_root('guards'); const guard_a = write(guards, 'a.txt', 'needle'); const guard_b = write(guards, 'b.txt', 'needle');
  result = await search(guards, 'needle'); plan = await engine.prepare_replace(result, 'changed'); write(guards, 'b.txt', 'external edit');
  await assert.rejects(engine.apply_replace(plan), /已被修改/); assert.equal(fs.readFileSync(guard_a, 'utf8'), 'needle'); assert.equal(fs.readFileSync(guard_b, 'utf8'), 'external edit');
  result = await search(guards, 'needle'); plan = await engine.prepare_replace(result, 'changed'); await assert.rejects(engine.apply_replace(plan, {can_write: () => false}), /未保存/); assert.equal(fs.readFileSync(guard_a, 'utf8'), 'needle');
  let gate_calls = 0; await assert.rejects(engine.apply_replace(plan, {can_write: () => ++gate_calls === 1}), /准备替换/); assert.equal(fs.readFileSync(guard_a, 'utf8'), 'needle'); assert(!fs.readdirSync(guards).some(name => name.startsWith('.typora_search_')));
  result = await search(guards, 'needle'); plan = await engine.prepare_replace(result, 'changed'); fs.renameSync(guard_a, path.join(guards, 'old.txt')); write(guards, 'a.txt', 'needle');
  await assert.rejects(engine.apply_replace(plan), /已被修改或替换/);
  const linked = write(guards, 'linked.txt', 'needle'); fs.linkSync(linked, path.join(guards, 'hard.txt')); result = await search(guards, 'needle', {include: './linked.txt'}); await assert.rejects(engine.prepare_replace(result, 'changed'), /硬链接/);
  const external = make_root('external'); write(external, 'outside.txt', 'needle'); fs.symlinkSync(external, path.join(guards, 'junction'), process.platform === 'win32' ? 'junction' : 'dir');
  result = await search(guards, 'needle'); assert(result.counts.skipped.links >= 1); assert(!paths(result).some(file => file.includes('junction')));
  checks.push('all-target drift checks, unsaved guards, replaced-inode checks, hard-link refusal, symlink scope and temporary cleanup protect files');
  const expansion = make_root('expansion');
  for (const name of ['a.txt', 'b.txt', 'c.txt']) write(expansion, name, 'needle');
  result = await search(expansion, 'needle');
  // 每文件仅 22 MiB，第三个文件使整个预览超过 64 MiB；必须在写任何文件前拒绝。
  await assert.rejects(engine.prepare_replace(result, 'x'.repeat(22 * 1024 * 1024)), /合计超过 64 MiB/);
  for (const name of fs.readdirSync(expansion)) assert.equal(fs.readFileSync(path.join(expansion, name), 'utf8'), 'needle');
  assert.equal(fs.readdirSync(expansion).length, 3);
  checks.push('replacement expansion is capped across the entire plan before any file or temporary output is written');
  console.log(JSON.stringify({status: 'PASS', checks}, null, 2));
} finally {
  await dispose_all();
  assert(path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('typora_workspace_search_'));
  fs.rmSync(temp, {recursive: true, force: true});
}
