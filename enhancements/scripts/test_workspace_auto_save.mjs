import assert from 'node:assert/strict';import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/workspace_auto_save.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {create_auto_save}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let policy={mode:'off',delay:20},target={dirty:true,busy:false,eligible:true},calls=0,fail=false,release,errors=[];
const auto=create_auto_save({policy:()=>policy,state:item=>item,save:async item=>{calls++;if(release)await new Promise(resolve=>release.resolve=resolve);if(fail)return false;item.dirty=false;return true;},report:(_item,error)=>errors.push(error)});
auto.changed(target);await wait(40);assert.equal(calls,0);
policy.mode='afterDelay';auto.changed(target);await wait(10);auto.changed(target);await wait(12);assert.equal(calls,0);await wait(25);assert.equal(calls,1);assert.equal(target.dirty,false);
target.dirty=true;policy.mode='onFocusChange';auto.changed(target);await wait(35);assert.equal(calls,1);auto.focus_lost(target);await wait(1);assert.equal(calls,2);
target.dirty=true;policy.mode='onWindowChange';auto.changed(target);auto.focus_lost(target);await wait(25);assert.equal(calls,2);auto.window_lost([target]);await wait(1);assert.equal(calls,3);
policy.mode='afterDelay';target.dirty=true;target.busy=true;auto.changed(target);await wait(40);assert.equal(calls,3);target.busy=false;await wait(110);assert.equal(calls,4);
target.dirty=true;fail=true;auto.changed(target);await wait(45);assert.equal(calls,5);assert.equal(errors.length,1);await wait(120);assert.equal(calls,5);assert(target.dirty);fail=false;
target.eligible=false;auto.changed(target);await wait(40);assert.equal(calls,5);target.eligible=true;
auto.changed(target);auto.forget(target);await wait(40);assert.equal(calls,5);
auto.changed(target);auto.dispose();await wait(40);assert.equal(calls,5);
let entered,finish,second_calls=0,current={dirty:true,busy:false,eligible:true};
const second=create_auto_save({policy:()=>({mode:'afterDelay',delay:5}),state:item=>item,save:async item=>{second_calls++;if(second_calls===1){entered=true;await new Promise(resolve=>finish=resolve);}else item.dirty=false;return true;},report:()=>{}});
second.changed(current);while(!entered)await wait(2);second.changed(current);await wait(12);assert.equal(second_calls,1);finish();await wait(30);assert.equal(second_calls,2);second.dispose();
// 同一失败版本不能因反复切换焦点/窗口继续尝试；新的编辑才能重新排队。
for(const mode of ['onFocusChange','onWindowChange']){
  let failed_calls=0;const draft={dirty:true,busy:false,eligible:true};
  const guarded=create_auto_save({policy:()=>({mode,delay:5}),state:item=>item,save:async()=>{failed_calls++;return false;},report:()=>{}});
  guarded.changed(draft);
  for(let i=0;i<3;i++){if(mode==='onFocusChange')guarded.focus_lost(draft);else guarded.window_lost([draft]);await wait(5);}
  assert.equal(failed_calls,1,mode+' does not retry unchanged failed content');
  guarded.changed(draft);if(mode==='onFocusChange')guarded.focus_lost(draft);else guarded.window_lost([draft]);await wait(5);assert.equal(failed_calls,2);guarded.dispose();
}
let stale_finish,stale_calls=0,stale_reports=0;const forgotten={dirty:true,busy:false,eligible:true};
const forgotten_auto=create_auto_save({policy:()=>({mode:'afterDelay',delay:5}),state:item=>item,save:async()=>{stale_calls++;await new Promise(resolve=>stale_finish=resolve);return false;},report:()=>stale_reports++});
forgotten_auto.changed(forgotten);while(!stale_finish)await wait(2);forgotten_auto.forget(forgotten);stale_finish();await wait(30);assert.equal(stale_calls,1);assert.equal(stale_reports,0);forgotten_auto.dispose();
console.log(JSON.stringify({status:'PASS',checks:['four modes','debounce','busy retry','failure preserves draft without retry loop','ineligible and forgotten documents','disposal','changes during save queue one more snapshot','failure retry requires a changed revision in both focus modes','forgotten pending saves cannot report or schedule another save']}));
