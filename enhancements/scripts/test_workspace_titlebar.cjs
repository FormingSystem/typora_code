// 真实 Electron 验证只恢复原生窗口设置，不创建菜单或替换窗口节点。
const {app,BrowserWindow}=require('electron');const {build}=require('esbuild');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_native_titlebar_'));app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();let win;
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,webPreferences:{contextIsolation:false,offscreen:true}});await win.loadURL('data:text/html,<div id="top-titlebar"><button id="w-close">original close</button></div>');
 const run=source=>win.webContents.executeJavaScript(source);
 const bundle=await build({stdin:{contents:'export {install_workspace_titlebar} from "./src/workspace_titlebar";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa'});await run(bundle.outputFiles[0].text);
 await run(`window.calls=[];window.replies=[];window.errors=[];console.error=(...args)=>errors.push(String(args));window.File={isNode:true,isMac:false,option:{framelessWindow:false}};window.reqnode=name=>name==='process'?{platform:'win32'}:{ipcRenderer:{invoke:(...args)=>{calls.push(args);return new Promise((resolve,reject)=>replies.push({resolve,reject}))}}};window.original=document.querySelector('#top-titlebar').outerHTML;window.original_button=document.querySelector('#w-close');window.clicks=0;original_button.onclick=()=>clicks++;window.keys=0;document.addEventListener('keydown',()=>keys++);window.binding=qa.install_workspace_titlebar();void 0`);
 assert.equal(await run('calls.length'),0);assert(await run('qa.install_workspace_titlebar()===binding&&document.documentElement.dataset.linuxNoteTitlebar==="native"'));
 await run('binding.dispose();File.option.framelessWindow=true;window.binding=qa.install_workspace_titlebar();window.second=qa.install_workspace_titlebar();void 0');
 assert(await run('binding===second'));assert.deepEqual(await run('calls'),[['setting.put','framelessWindow',false]]);
 await run('replies[0].reject(new Error("fixture failure"));void 0');await run('Promise.resolve()');
 assert(await run('document.documentElement.dataset.linuxNoteTitlebar==="setting-failed"&&errors.length===1'));assert(await run('qa.install_workspace_titlebar()===binding&&calls.length===1'));
 await run('binding.dispose();window.binding=qa.install_workspace_titlebar();void 0');assert.equal(await run('calls.length'),2);
 await run('binding.dispose();binding.dispose();document.documentElement.dataset.linuxNoteTitlebar="external";replies[1].resolve();void 0');await run('Promise.resolve()');
 assert.equal(await run('document.documentElement.dataset.linuxNoteTitlebar'),'external');
 await run('window.binding=qa.install_workspace_titlebar();void 0');await run('Promise.resolve()');assert.equal(await run('calls.length'),2);assert.equal(await run('document.documentElement.dataset.linuxNoteTitlebar'),'next-window');
 await run('original_button.click();window.shortcut=new KeyboardEvent("keydown",{key:"e",altKey:true,bubbles:true,cancelable:true});document.dispatchEvent(shortcut);void 0');
 assert(await run('clicks===1&&keys===1&&!shortcut.defaultPrevented&&document.querySelector("#w-close")===original_button&&document.querySelector("#top-titlebar").outerHTML===original&&!document.querySelector(".workspace-titlebar-menu,.workspace-window-icon,[data-workspace-titlebar-style]")'));
 await run('binding.dispose();void 0');assert.equal(await run('document.documentElement.dataset.linuxNoteTitlebar'),'external');
 console.log(JSON.stringify({status:'PASS',checks:['native mode performs no setting write','concurrent bindings share one restoration write','failure is observable and explicit rebind retries','disposed late callback does not change host state','successful restore is not written again','original window nodes and shortcuts remain untouched'],evidence}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);win?.destroy();app.exit(1)});
