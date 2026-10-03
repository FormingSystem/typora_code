import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export {create_reading_code_fold_state} from "./src/reading_code_fold_state";',resolveDir:process.cwd()},bundle:true,format:'esm',write:false});
const {create_reading_code_fold_state}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const state=create_reading_code_fold_state(),entry=(owner,text)=>{const value={text};return{element:{},owner,read_text:()=>value.text,value};};
let a=entry('a','same'),duplicate=entry('a','same'),b=entry('b','same');
state.reconcile([a,duplicate]);assert.equal(state.take_restore(a.element),false);assert.equal(state.take_restore(a.element),undefined);
state.remember(a.element,true);assert.equal(state.expanded(duplicate.element),undefined);
state.reconcile([b]);assert.equal(state.take_restore(b.element),false);
a=entry('a','same');duplicate=entry('a','same');state.reconcile([a,duplicate]);assert.equal(state.take_restore(a.element),true);assert.equal(state.take_restore(duplicate.element),false);
state.remember(duplicate.element,true);a.value.text='changed';state.checkpoint();state.reconcile([b]);
a=entry('a','changed');duplicate=entry('a','same');state.reconcile([a,duplicate]);assert.equal(state.take_restore(a.element),true);assert.equal(state.take_restore(duplicate.element),true);
state.remember(a.element,false);state.reconcile([]);a=entry('a','changed');state.reconcile([a]);assert.equal(state.take_restore(a.element),false);
state.remember(a.element,true);a.value.text='short';state.checkpoint();state.reconcile([]);a=entry('a','short');state.reconcile([a]);assert.equal(state.take_restore(a.element),true);
const draft1={},draft2={};let draft=entry(draft1,'same');state.reconcile([draft]);state.remember(draft.element,true);draft=entry(draft2,'same');state.reconcile([draft]);assert.equal(state.take_restore(draft.element),false);
for(const count of [20,100,1000]){const start=performance.now();for(let i=0;i<count;i++){a=entry('a','short');state.reconcile([a]);assert.equal(state.take_restore(a.element),true);state.reconcile([entry('b','same')]);}console.log('round trips',count,'ms',performance.now()-start);}
a=entry('a','short');state.reconcile([a]);state.clear();state.reconcile([a]);assert.equal(state.take_restore(a.element),false);state.clear();state.clear();
console.log('PASS code fold choices: duplicates, edits, collapse, drafts, replacement, clear and 1120 round trips');
