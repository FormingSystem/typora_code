import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/scrollbar_visibility.ts',import.meta.url))],bundle:true,format:'esm',write:false});
const {create_scrollbar_visibility}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const iterations=Number(process.env.TYPORA_STRESS_ITERATIONS||20);
for(let i=0;i<iterations;i++){
 let timer,anim,hidden=0,disposed_animations=0;
 const changes=[];
 const state=create_scrollbar_visibility({schedule(fn,delay){assert.equal(delay,500);timer=()=>{timer=undefined;fn();};return()=>{timer=undefined;};},animate(value,duration,done){changes.push([value,duration]);anim=done;return()=>{disposed_animations++;};},hidden(){hidden++;}});
 state.hover(true);assert.deepEqual(changes,[[true,100]]);assert.equal(timer,undefined);
 state.hover(false);assert(timer);state.hover(true);assert.equal(timer,undefined);
 state.hover(false);timer();assert.deepEqual(changes.at(-1),[false,800]);const late=anim;
 state.hover(true);late();assert.equal(hidden,0,'迟到动画不隐藏重新进入的滑块');
 state.drag(true);state.hover(false);assert.equal(timer,undefined,'区域外拖动保持显示');state.drag(false);assert(timer);
 state.pulse();timer();anim();assert.equal(hidden,1);
 state.pulse();const queued=timer;state.dispose();state.dispose();queued();assert.equal(timer,undefined);assert(disposed_animations>0);
 const count=changes.length;state.pulse();state.hover(true);state.drag(true);assert.equal(changes.length,count,'销毁后无动画');
}
console.log(JSON.stringify({status:'PASS',iterations,scope:'显隐、拖动、迟到和销毁状态；虚拟时钟，无真实画面'}));
