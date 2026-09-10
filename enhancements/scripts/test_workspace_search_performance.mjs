import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {build_search_test_api} from './search_worker_fixture.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_search_performance_'));
const baseline=process.argv.find(value=>value.startsWith('--baseline='))?.slice('--baseline='.length);
const read_delay=Number(process.argv.find(value=>value.startsWith('--read-delay='))?.slice('--read-delay='.length)||0);
assert(Number.isInteger(read_delay)&&read_delay>=0&&read_delay<=20);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const metrics=[];
try {
  for(let index=0;index<1200;index++)fs.writeFileSync(path.join(root,`file_${String(index).padStart(4,'0')}.txt`),'Needle 中文 content\n'+'plain content without a match\n'.repeat(8));
  for(const source_ref of baseline?[baseline,undefined]:[undefined]){
    const {api,matcher_factory,dispose_all}=await build_search_test_api(source_ref);
    try {
      let active=0,peak=0,ticks=0,max_gap=0,last=performance.now(),first_result=0,worker_queries=0;
      const measured_fs={...fs,promises:{...fs.promises,readFile:async(...args)=>{active++;peak=Math.max(peak,active);try{if(read_delay)await delay(read_delay);return await fs.promises.readFile(...args);}finally{active--;}}}};
      const measured_factory=()=>{const worker=matcher_factory(),post=worker.postMessage;worker.postMessage=value=>{worker_queries++;post(value);};return worker;};
      const engine=api.create_workspace_search_engine({fs:measured_fs,path_api:path,matcher_factory:measured_factory});
      const timer=setInterval(()=>{const now=performance.now();max_gap=Math.max(max_gap,now-last);last=now;ticks++;},5);
      const start=performance.now();
      const result=await engine.search(root,{query:'needle',use_ignore:false},{on_file:()=>{first_result ||= performance.now()-start;}});
      const elapsed=performance.now()-start;clearInterval(timer);
      assert.equal(result.files.length,1200);assert.equal(result.counts.matches,1200);
      const selected=await engine.prepare_replace(result,'replacement',{match_ids:[result.files[0].matches[0].id]});assert(selected.files[0].after_text.startsWith('replacement 中文 content'));
      if(!source_ref){assert(peak>1&&peak<=4,'read concurrency is bounded and greater than serial');assert.equal(worker_queries,1200,'ordinary matching runs in the real worker too');assert(ticks>2,'filesystem/worker processing keeps the event loop responsive');}
      metrics.push({revision:source_ref||'working_tree',files:1200,injected_read_delay_ms:read_delay,elapsed_ms:Math.round(elapsed),first_result_ms:Math.round(first_result),max_timer_gap_ms:Math.round(max_gap),peak_reads:peak,worker_queries});
      if(!source_ref){
        const controller=new AbortController();let read_calls=0,callbacks=0;
        const slow_fs={...fs,promises:{...fs.promises,readFile:async(...args)=>{read_calls++;await delay(15);return fs.promises.readFile(...args);}}};
        const slow=api.create_workspace_search_engine({fs:slow_fs,path_api:path,matcher_factory});
        const cancelled=await slow.search(root,{query:'needle',use_ignore:false},{signal:controller.signal,on_file:()=>{callbacks++;controller.abort();}});
        assert(cancelled.cancelled);const stopped_callbacks=callbacks,stopped_reads=read_calls;await delay(50);
        assert.equal(callbacks,stopped_callbacks,'cancelled prefetch cannot publish late matches');assert.equal(read_calls,stopped_reads,'cancelled prefetch does not launch more reads');assert(read_calls<=8,'the whole tree was not eagerly queued');
        await assert.rejects(slow.prepare_replace(cancelled,'changed'),/搜索未完成/);
        assert.equal(fs.readFileSync(path.join(root,'file_0000.txt'),'utf8').startsWith('Needle'),true,'benchmark and replacement preview never write documents');
        const staged_root=path.join(root,'slow_directories');fs.mkdirSync(staged_root);fs.writeFileSync(path.join(staged_root,'a.txt'),'needle');fs.mkdirSync(path.join(staged_root,'nested'));fs.writeFileSync(path.join(staged_root,'nested','late.txt'),'needle');
        let release_directory;let first_file;const first_visible=new Promise(resolve=>{first_file=resolve;});
        const staged_fs={...fs,promises:{...fs.promises,readdir:async(...args)=>{if(args[0]===path.join(staged_root,'nested'))await new Promise(resolve=>{release_directory=resolve;});return fs.promises.readdir(...args);}}};
        const staged_engine=api.create_workspace_search_engine({fs:staged_fs,path_api:path,matcher_factory});
        const completed=staged_engine.search(staged_root,{query:'needle',use_ignore:false},{on_file:file=>first_file(file.relative_path)});
        assert.equal(await Promise.race([first_visible,delay(1000).then(()=>{throw new Error('Prefetch waited for a slow directory before publishing the first file');})]),'a.txt');
        while(!release_directory)await delay(5);release_directory();assert.equal((await completed).files.length,2);
      }
    } finally {await dispose_all();}
  }
  console.log(JSON.stringify({status:'PASS',checks:['real filesystem throughput and first-result timing','at most four concurrent reads','ordinary queries use an isolated worker','progressive results preserve replacement snapshots','cancellation stops bounded prefetch without late callbacks or writes'],metrics},null,2));
} finally {
  assert(path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('typora_search_performance_'));
  fs.rmSync(root,{recursive:true,force:true});
}
