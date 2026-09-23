import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
const baseline=process.env.TYPORA_SESSION_BASELINE;
const plugins=baseline?[{name:'session-baseline',setup(builder){builder.onLoad({filter:/[\\/]workspace_sessions\.ts$/},()=>({contents:execFileSync('git',['show',baseline+':enhancements/src/workspace_sessions.ts'],{encoding:'utf8'}),loader:'ts'}));}}]:[];
const compiled=await build({stdin:{contents:'export {bind_workspace_sessions} from "./src/workspace_sessions"; export {create_workspace_session_store} from "./src/workspace_session_store";',resolveDir:process.cwd()},plugins,bundle:true,platform:'node',format:'esm',write:false});
const {bind_workspace_sessions:bind,create_workspace_session_store:create}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
let checks=0;
const fixture=({size=20,empty=false,delay=false,loading=false}={})=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'typora_restore_')),root=path.join(dir,'root');
 const initial={state:{path:empty?'':path.join(root,'current.md')},dirty:false};let leaves=[initial],opens=0,restores=0,release;
 const entries=Array.from({length:size},(_,i)=>({path:path.join(root,i+'.md'),source:!!(i%2),pinned:false}));
 const store=create(fs,path,crypto,path.join(dir,'typora_code/state/workspace_sessions'));store.write(root,entries,0);
 const runtime=globalThis.window=new EventTarget();globalThis.document={documentElement:{dataset:{linuxNoteTyporaEnhancements:loading?'loading':'ready'}}};
 Object.assign(runtime,{_options:{userDataPath:dir},reqnode:()=>crypto,JSBridge:{invoke:()=>delay?new Promise(r=>release=()=>r({restoreWhenLaunch:2})):Promise.resolve({restoreWhenLaunch:2})}});
 const workspace={activeLeaf:initial,eachLeaves(fn){for(const leaf of leaves)fn(leaf);},on(){return()=>{};}};
 const notices=[];
 const files={fs,path_api:path,core:{app:{workspace},Notice:class{constructor(message){notices.push(message);}}},context_root:()=>root,editor_state:leaf=>({file_path:leaf.state.path,kind:'markdown',dirty:leaf.dirty,busy:false}),restore_files:async(list,signal)=>{if(signal.aborted)return;restores++;leaves.push(...list.map(x=>({state:{path:x.path},dirty:false})));},open_file:async(p,options)=>{if(options.signal?.aborted)return;opens++;workspace.activeLeaf=leaves.find(x=>x.state.path===p);}};
 return{bind:()=>bind(files),runtime,workspace,initial,notices,release:()=>release(),get opens(){return opens;},get restores(){return restores;},cleanup(){fs.rmSync(dir,{recursive:true,force:true});}};
};
for(const size of [20,100,1000]){
 const f=fixture({size}),session=f.bind();await session.ready;
 assert.equal(f.opens,0);assert.equal(f.restores,1);assert.equal(f.workspace.activeLeaf,f.initial);checks+=3;session.dispose();f.cleanup();
}
for(const event of ['pointerdown','keydown','wheel','beforeinput','workspace-file-open-intent']){
 const f=fixture({empty:true,delay:true}),session=f.bind();f.runtime.dispatchEvent(new Event(event));f.release();await session.ready;
 assert.equal(f.opens,0);assert.equal(f.restores,1);assert.deepEqual(f.notices,[]);checks+=3;session.dispose();f.cleanup();
}
for(const action of ['normal','dirty','dispose','active','loading']){
 const f=fixture({empty:true,delay:action!=='loading',loading:action==='loading'}),session=f.bind();
 if(action==='dirty')f.initial.dirty=true;
 if(action==='dispose')session.dispose();
 if(action==='active')f.workspace.activeLeaf={state:{path:'user.md'}};
 if(action==='loading'){f.runtime.dispatchEvent(new Event('pointerdown'));document.documentElement.dataset.linuxNoteTyporaEnhancements='ready';}else f.release();
 await session.ready;assert.equal(f.opens,action==='normal'?1:0);checks++;
 if(action!=='dispose')session.dispose();f.cleanup();
}
console.log('PASS session restore priority: '+checks+' assertions, 20/100/1000 identities, late preferences, user intent, dirty and disposal');
