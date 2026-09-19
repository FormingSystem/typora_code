import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transform} from 'esbuild';
const compiled=await transform(fs.readFileSync('src/workspace_context.ts','utf8'),{loader:'ts',format:'esm'});
globalThis.window=new EventTarget();
const context=await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
let notifications=0;window.addEventListener('linux-note-workspace-context-changed',()=>notifications++);
for(const count of [20,100,1000]){
 const before=notifications;
 for(let index=0;index<count;index++){
  const epoch=context.workspace_context_epoch();
  const release=context.register_workspace_context_guard(()=> 'operation in progress');
  assert.throws(context.begin_workspace_context_switch,/operation in progress/);
  assert.equal(context.workspace_context_epoch(),epoch);assert.equal(context.workspace_context_switching(),false);
  release();context.begin_workspace_context_switch();
  assert.equal(context.workspace_context_epoch(),epoch+1);assert.equal(context.workspace_context_switching(),true);
  assert.throws(context.begin_workspace_context_switch);
  context.cancel_workspace_context_switch();assert.equal(context.workspace_context_switching(),false);
  assert.equal(notifications,before+index,'aborted transition must not publish a new root');
  context.begin_workspace_context_switch();context.finish_workspace_context_switch();
  assert.equal(context.workspace_context_switching(),false);
 }
 assert.equal(notifications-before,count);
 console.log(`workspace context: ${count} guarded, cancelled and committed transitions passed`);
}
