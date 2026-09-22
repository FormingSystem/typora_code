// 隔离复制端口，避免测试替换用户系统剪贴板。
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_code_copy_'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let win;
const pause=ms=>new Promise(r=>setTimeout(r,ms));const evaluate=s=>win.webContents.executeJavaScript(s);
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});
 await win.loadURL('data:text/html,<html><body><input id="focus"><div id="viewport" style="margin:60px;height:300px;overflow:auto"><pre id="first" style="height:60px">visible only</pre><pre id="second" style="height:60px">other</pre><div style="height:1200px"></div></div></body></html>');
 const bundle=await build({stdin:{contents:'export {bind_reading_code_copy} from "./src/reading_code_copy";',resolveDir:path.join(__dirname,'..')},loader:{'.css':'text'},bundle:true,format:'iife',globalName:'copy_api',write:false});await evaluate(bundle.outputFiles[0].text);
 await evaluate(`window.values=['  中文\\tcode\\n'+Array.from({length:1000},(_,i)=>'line '+i).join('\\n')+'\\n',''];window.copied=[];window.copy_failure=false;window.binding=copy_api.bind_reading_code_copy(document.body,text=>{if(window.copy_failure)throw Error('denied');copied.push(text);});window.reconcile=()=>binding.reconcile(['first','second'].map((id,i)=>({element:document.getElementById(id),read_text:()=>values[i]})));reconcile();document.querySelector('#focus').focus();window.buttons=()=>[...document.querySelectorAll('.reading-code-copy')];void 0`);await pause(150);
 const height=await evaluate(`document.querySelector('#first').offsetHeight`);
 assert.equal(await evaluate('buttons().length'),2);assert.equal(await evaluate(`buttons()[0].getBoundingClientRect().width`),24);assert.equal(await evaluate(`buttons()[0].querySelector('svg').getBoundingClientRect().width`),16);
 await evaluate(`buttons()[0].click();void 0`);assert.equal(await evaluate('copied[0]'),await evaluate('values[0]'));assert.equal(await evaluate('buttons()[0].title'),'已复制');
 assert.equal(await evaluate(`document.querySelector('.reading-copy-feedback').offsetHeight`),24,'feedback stays on one line');assert.equal(await evaluate('getComputedStyle(buttons()[0]).opacity'),'1','result icon stays visible after activation');
 await evaluate(`values[0]='changed unsaved\\t正文';buttons()[0].click();buttons()[1].click();void 0`);assert.deepEqual(await evaluate('copied.slice(-2)'),['changed unsaved\t正文','']);
 await evaluate(`window.copy_failure=true;buttons()[0].click();void 0`);assert.equal(await evaluate('buttons()[0].title'),'复制失败，请重试');assert.equal(await evaluate('copied.length'),3);
 await evaluate(`window.copy_failure=false;buttons()[0].click();void 0`);assert.equal(await evaluate('buttons()[0].title'),'已复制');
 await evaluate(`for(let i=0;i<100;i++){buttons()[i%2].click();reconcile();}void 0`);assert.equal(await evaluate('copied.length'),104);assert.equal(await evaluate('buttons().length'),2);
 await evaluate(`buttons()[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));buttons()[1].dispatchEvent(new KeyboardEvent('keyup',{key:' ',bubbles:true}));void 0`);assert.equal(await evaluate('copied.length'),106);
 assert.equal(await evaluate('document.activeElement.id'),'focus');assert.equal(await evaluate(`document.querySelector('#first').offsetHeight`),height);assert.equal(await evaluate(`document.querySelector('#first').textContent`),'visible only');
 await evaluate(`document.querySelector('#first').dispatchEvent(new PointerEvent('pointerenter'));void 0`);assert.equal(await evaluate('getComputedStyle(buttons()[0]).opacity'),'1');
 for(const zoom of [1,1.5,1.8]){await evaluate(`document.body.style.zoom='${zoom}';document.body.style.background='${zoom===1?'white':'#222'}';document.body.style.color='${zoom===1?'black':'white'}';window.dispatchEvent(new Event('resize'));void 0`);await pause(80);assert.equal(await evaluate('buttons()[0].hidden'),false);}
 await evaluate(`document.querySelector('#viewport').scrollTop=900;void 0`);await pause(80);assert.equal(await evaluate('buttons()[0].hidden'),true);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reading-copy-feedback')).display`),'none');
 await evaluate(`binding.reconcile([]);void 0`);assert.equal(await evaluate('buttons().length'),0);await pause(1900);assert.equal(await evaluate('buttons().length'),0);
 await evaluate(`binding.dispose();void 0`);assert.equal(await evaluate(`document.querySelectorAll('.reading-media-entries').length`),0);
 console.log(JSON.stringify({status:'PASS',cycles:100,checks:['full text','unsaved whitespace Unicode','empty','failure retry','keyboard','focus geometry','hover','zoom','clipping','cleanup'],evidence:root}));win.destroy();app.exit(0);
}).catch(e=>{console.error(e);win?.destroy();app.exit(1);});
