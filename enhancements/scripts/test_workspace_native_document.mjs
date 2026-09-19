import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/workspace_native_document.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {prepare_deleted_native_document:prepare}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const make=()=>{
 let text='saved document',dirty=false,resets=0,clears=0;
 const File={bundle:{filePath:'C:/fixture/last.md'},changeCounter:{isDocumentEdited:()=>dirty},ChangeType:{NSChangeCleared:0},
 async loadFile(path,switch_document){assert.equal(path,'');assert.equal(switch_document,true);resets++;this.bundle.filePath='';text='';dirty=true;},
 updateChangeCount(value){assert.equal(value,0);clears++;dirty=false;}};
 return {File,read:()=>text,write:value=>text=value,dirty:value=>dirty=value,resets:()=>resets,clears:()=>clears};
};
const capture=state=>prepare(state,path=>path==='C:/fixture/last.md',state.read);
for(const cycles of [20,100,1000]){
 for(let i=0;i<cycles;i++){
  const state=make(),release=capture(state);state.File.bundle.filePath='';state.dirty(true);await release();assert.equal(state.resets(),1);assert.equal(state.clears(),1);assert.equal(state.read(),'');assert.equal(state.File.changeCounter.isDocumentEdited(),false);
 }
 console.log('PASS deleted native cache lifecycle: '+cycles);
}
{
 const state=make();state.dirty(true);assert.throws(()=>capture(state),/编辑/);assert.equal(state.read(),'saved document');assert.equal(state.resets(),0);
}
{
 const state=make(),release=capture(state);state.write('new draft while trash pending');await assert.rejects(release(),/另存为/);assert.equal(state.read(),'new draft while trash pending');assert.equal(state.resets(),0);
}
{
 const state=make(),release=capture(state);state.File.bundle.filePath='C:/fixture/other.md';state.write('another document');await release();assert.equal(state.read(),'another document');assert.equal(state.resets(),0);
}
{
 const state=make();state.File.loadFile=async()=>{throw Error('native load rejected')};const release=capture(state);await assert.rejects(release(),/rejected/);assert.equal(state.clears(),0);assert.equal(state.read(),'saved document');
}
{
 const state=make();state.File.loadFile=async()=>{state.File.bundle.filePath='';state.write('unexpected draft')};await assert.rejects(capture(state)(),/未能释放/);assert.equal(state.clears(),0);assert.equal(state.read(),'unexpected draft');
}
{
 const state=make();delete state.File.loadFile;assert.throws(()=>capture(state),/已保留/);assert.equal(state.resets(),0);
}
console.log('PASS dirty, concurrent edits, switched identity, failed native reset and unavailable host preserve content');

{
 const state=make();state.File.loadFile=async()=>{state.File.bundle.filePath='';state.write(' ')};await assert.rejects(capture(state)(),/未能释放/);assert.equal(state.clears(),0);assert.equal(state.read(),' ');
}
{
 const state=make();delete state.File.changeCounter;assert.throws(()=>capture(state),/无法确认/);assert.equal(state.resets(),0);
}
