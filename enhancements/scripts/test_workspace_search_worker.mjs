import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build_search_test_api} from './search_worker_fixture.mjs';

const {api, matcher_factory, dispose_all} = await build_search_test_api();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_search_worker_'));
const engine = api.create_workspace_search_engine({fs, path_api: path, matcher_factory});
const checks = [];
let timer;
try {
  fs.writeFileSync(path.join(root, 'a_slow.txt'), 'a'.repeat(40)+'!'); fs.writeFileSync(path.join(root, 'z_fast.txt'), 'aaaa');
  let ticks = 0; timer = setInterval(() => ticks++, 10);
  const controller = new AbortController(); const cancelled_start = Date.now();
  const cancel_timer = setTimeout(() => controller.abort(), 100);
  const cancelled = await engine.search(root, {query: '(a+)+$', regex: true, use_ignore: false}, {signal: controller.signal}); clearTimeout(cancel_timer);
  assert(cancelled.cancelled); assert(Date.now()-cancelled_start < 1500); assert(ticks >= 3);
  checks.push('AbortSignal terminates catastrophic regex in a real worker while the main event loop remains responsive');

  ticks=0;const extended=new AbortController(),extended_start=Date.now();
  const extended_timer=setTimeout(()=>extended.abort(),2300);
  const extended_result=await engine.search(root,{query:'(a+)+$',regex:true,use_ignore:false},{signal:extended.signal});clearTimeout(extended_timer);
  const elapsed_ms=Date.now()-extended_start;
  assert(elapsed_ms>=2200&&elapsed_ms<5000);assert(ticks>50);assert(extended_result.cancelled);
  assert(!extended_result.notices.some(message=>message.includes('超过 2 秒')));
  await assert.rejects(engine.prepare_replace(extended_result,'changed'),/搜索未完成/);
  checks.push('slow matching continues beyond former two-second cutoff until explicitly cancelled; event loop and replacement guard remain intact');

  fs.writeFileSync(path.join(root, 'a_slow.txt'), '😀 Foo\r\nFOO foo\r\n');
  const result = await engine.search(root, {query: '(?<word>foo)', regex: true, case_sensitive: false, whole_word: true, include: './a_slow.txt', use_ignore: false});
  assert.equal(result.counts.matches, 3); assert.equal(result.files[0].matches[0].column, 4);
  const plan = await engine.prepare_replace(result, '\\U$<word>-$1'); assert.equal(plan.files[0].after_text, '😀 FOO-FOO\r\nFOO-FOO FOO-FOO\r\n');
  checks.push('normal worker matches preserve Unicode positions, whole words, named and numbered replacement captures');
  const paths=api.create_search_matcher(matcher_factory);
  assert.deepEqual(await paths.match_paths(['sub/目标.md','other.txt','a\nb.md'],{query:'[.]md$',regex:true}),[{index:0,start:6,end:9},{index:2,start:3,end:6}]);
  await assert.rejects(paths.match_paths(['x'],{query:'[',regex:true}),/正则表达式无效/);
  const path_cancel=new AbortController(),path_timer=setTimeout(()=>path_cancel.abort(),80),path_start=Date.now();
  await assert.rejects(paths.match_paths(['a'.repeat(40)+'!'],{query:'(a+)+$',regex:true},path_cancel.signal),/搜索已取消/);clearTimeout(path_timer);
  assert(Date.now()-path_start<1500);
  assert.equal((await paths.match_paths(['ok.md'],{query:'md$',regex:true})).length,1);paths.dispose();
  checks.push('path batches retain Unicode/newline filename boundaries, reject invalid regex, cancel expensive patterns and restart cleanly');

  const isolated_missing = api.create_workspace_search_engine({fs, path_api: path});
  await assert.rejects(isolated_missing.search(root, {query: '(a+)+$', regex: true, use_ignore: false}), /没有可隔离运行/);
  assert.equal((await isolated_missing.search(root, {query: 'foo', use_ignore: false})).counts.matches, 3);
  checks.push('an environment without a worker rejects regex explicitly and keeps ordinary text search available');
  console.log(JSON.stringify({status: 'PASS', checks, timeout_elapsed_ms: elapsed_ms}, null, 2));
} finally {
  clearInterval(timer); await dispose_all();
  assert(path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('typora_search_worker_'));
  fs.rmSync(root, {recursive: true, force: true});
}
