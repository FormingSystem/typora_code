const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_code_geometry_'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let win;
const pause=ms=>new Promise(r=>setTimeout(r,ms));const evaluate=s=>win.webContents.executeJavaScript(s);
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});
 await win.loadURL('data:text/html,<html><body><input id="focus"><div id="viewport" style="height:350px;width:600px;overflow:auto"><div id="long" class="fence"><div class="CodeMirror" style="height:80px">long</div></div><div id="short" class="fence"><div class="CodeMirror" style="height:150px">short</div></div><div style="height:1500px"></div><div id="off" class="fence"><div class="CodeMirror" style="height:150px">offscreen</div></div></div></body></html>');
 const bundle=await build({stdin:{contents:'export {bind_reading_code_geometry} from "./src/reading_code_geometry";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'geometry',write:false});await evaluate(bundle.outputFiles[0].text);
 await evaluate(`window.counts={long:0,short:0,off:0};for(const f of document.querySelectorAll('.fence'))f.firstElementChild.CodeMirror={refresh(){counts[f.id]++;f.firstElementChild.style.height=f.id==='long'?'80px':'24px';}};window.binding=geometry.bind_reading_code_geometry();binding.reconcile(document.querySelectorAll('.fence'));document.querySelector('#focus').focus();void 0`);await pause(150);
 assert.equal(await evaluate(`document.querySelector('#short .CodeMirror').offsetHeight`),24);assert.equal(await evaluate('counts.off'),0,'offscreen measurement deferred');
 const counts=await evaluate('({...counts})');await pause(200);assert.deepEqual(await evaluate('({...counts})'),counts,'height changes do not cause refresh loop');
 for(let i=0;i<20;i++){await evaluate(`binding.refresh(document.querySelector('#long'));binding.refresh(document.querySelector('#long'));void 0`);await pause(25);}
 assert.equal(await evaluate('counts.short'),counts.short,'another block toggle does not refresh unrelated visible blocks');assert.equal(await evaluate('counts.long'),counts.long+20,'one refresh per frame');
 await evaluate(`document.querySelector('#off').scrollIntoView();void 0`);await pause(150);assert.equal(await evaluate(`document.querySelector('#off .CodeMirror').offsetHeight`),24,'entering view corrects stale height without click');
 await evaluate(`document.querySelector('#viewport').style.width='400px';void 0`);await pause(100);const changed=await evaluate('counts.off');assert(changed>=2,'width change refreshes visible block');
 await evaluate(`document.querySelector('#off .CodeMirror').CodeMirror={refresh(){counts.off++;}};binding.reconcile(document.querySelectorAll('.fence'));void 0`);await pause(100);assert((await evaluate('counts.off'))>changed,'same node new editor registered');
 await evaluate(`binding.refresh(document.querySelector('#off'));binding.dispose();void 0`);const disposed=await evaluate('({...counts})');await pause(100);assert.deepEqual(await evaluate('({...counts})'),disposed,'pending frame cancelled on dispose');
 assert.equal(await evaluate('document.activeElement.id'),'focus','measurement preserves focus');
 console.log(JSON.stringify({status:'PASS',cycles:20,checks:['visible measurement','offscreen deferred','height no loop','per-block isolation','frame coalescing','width change','editor replacement','dispose','focus'],evidence:root}));win.destroy();app.exit(0);
}).catch(e=>{console.error(e);win?.destroy();app.exit(1);});
