// Trusted Electron key events; an in-memory clipboard keeps the user's clipboard untouched.
const {app,BrowserWindow,Menu}=require('electron'),{build}=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'typora_clipboard_keys_'));
app.setPath('userData',path.join(base,'profile'));app.disableHardwareAcceleration();let view;
const pause=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
const evaluate=code=>view.webContents.executeJavaScript(code);
const check=async(code,label)=>{assert(await evaluate(code),label);checks.push(label);};
const key=async(key,modifiers=['control'])=>{view.webContents.sendInputEvent({type:'keyDown',keyCode:key,modifiers});view.webContents.sendInputEvent({type:'keyUp',keyCode:key,modifiers});await pause(25);};
app.whenReady().then(async()=>{
 Menu.setApplicationMenu(null);
 view=new BrowserWindow({show:false,width:800,height:600,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
 const page=path.join(base,'test.html');fs.writeFileSync(page,'<div id="editor" style="width:750px;height:450px"></div><input id="search"><div id="write" contenteditable="true">Markdown</div>');await view.loadFile(page);
 view.webContents.debugger.attach();await view.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 const bundle=await build({plugins:require('./editor_bundle.cjs').editor_plugins(),stdin:{contents:'import * as monaco from "monaco-editor/editor/editor.api";import "monaco-editor/editor/browser/coreCommands";export {monaco};export * from "./src/monaco_source_command";export * from "./src/monaco_text_input";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});
 await evaluate(bundle.outputFiles[0].text);
 await evaluate(`window.addEventListener('paste',e=>{const d=new DataTransfer();d.setData('text/plain','native_paste_fixture');Object.defineProperty(e,'clipboardData',{value:d});},true);window.clip={text:'中文\\nsecond',reads:0,writes:0,readText(){this.reads++;return this.text;},writeText(value){this.writes++;this.text=value;}};window.reqnode=()=>({clipboard:clip});window.editor=qa.monaco.editor.create(document.querySelector('#editor'),{value:'original',language:'plaintext',automaticLayout:true});editor.getModel().setEOL(0);editor.focus();editor.setSelection(editor.getModel().getFullModelRange());window.trusted=[];editor.getDomNode().addEventListener('keydown',e=>trusted.push(e.isTrusted));`);
 await key('v');await check(`editor.getValue()==='original'&&clip.reads===0`,'baseline native Monaco consumes Ctrl+V without clipboard service');
 await evaluate(`window.binding=qa.bind_monaco_source_clipboard(editor);void 0;`);
 await key('v');await check(`editor.getValue()==='中文\\nsecond'&&clip.reads===1`,'Ctrl+V pastes once through shared host command');
 await key('z');await check(`editor.getValue()==='original'`,'Ctrl+Z undoes paste');
 await key('y');await check(`editor.getValue()==='中文\\nsecond'`,'Ctrl+Y redoes paste');
 await evaluate(`editor.setSelection(editor.getModel().getFullModelRange());`);await key('c');await check(`clip.text.replaceAll(String.fromCharCode(13),'')==='中文\\nsecond'&&clip.writes===1`,'Ctrl+C copies current selection once');
 await key('x');await check(`editor.getValue()===''&&clip.writes===2`,'Ctrl+X cuts once');await key('z');
 await evaluate(`editor.updateOptions({readOnly:true});window.before=editor.getValue();window.reads=clip.reads;editor.setSelection(editor.getModel().getFullModelRange());`);await key('v');await key('x');await check(`editor.getValue()===before&&clip.reads===reads`,'readonly blocks paste and cut');await key('c');await check(`clip.text.replaceAll(String.fromCharCode(13),'')===before`,'readonly remains copyable');
 await evaluate(`editor.updateOptions({readOnly:false});editor.setValue('first\\nsecond');editor.setPosition({lineNumber:1,column:2});`);await key('c');await evaluate(`editor.setPosition({lineNumber:2,column:2});`);await key('v');await check(`editor.getValue()==='first\\nfirst\\nsecond'`,'whole-line metadata retained');
 await evaluate(`editor.setValue('alpha\\nbeta');editor.setSelections([new qa.monaco.Selection(1,1,1,6),new qa.monaco.Selection(2,1,2,5)]);`);await key('c');await evaluate(`editor.setValue('x\\ny');editor.setSelections([new qa.monaco.Selection(1,1,1,2),new qa.monaco.Selection(2,1,2,2)]);`);await key('v');await check(`editor.getValue()==='alpha\\nbeta'`,'multiple cursors preserve separate clipboard fragments');
 for(let i=0;i<20;i++){await evaluate(`editor.setValue('');clip.text='cycle_${i}';`);await key('v');await check(`editor.getValue()==='cycle_${i}'`,'trusted paste cycle '+i);}
 await evaluate(`document.querySelector('#search').focus();window.reads=clip.reads;window.before=editor.getValue();`);await key('v');await check(`clip.reads===reads&&editor.getValue()===before`,'ordinary search input cannot paste into source');
 await evaluate(`document.querySelector('#write').focus();`);await key('v');await check(`clip.reads===reads&&editor.getValue()===before`,'Markdown focus cannot invoke source clipboard');
 await evaluate(`editor.focus();binding.dispose();`);await key('v');await check(`clip.reads===reads`,'disposed registration no longer consumes command');
 await check(`trusted.length>=20&&trusted.every(Boolean)`,'Electron delivered trusted keyboard events');
 const cycles=await evaluate(`(()=>{const result=[];for(const size of [100,1000]){for(let i=0;i<size;i++){const b=qa.bind_monaco_source_clipboard(editor);b.dispose();}result.push(size);}return result;})()`);
 await key('v');await check(`clip.reads===reads`,'100 and 1000 registration/disposal cycles leave no handlers');
 fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,cycles,clipboard:'in-memory adapter; system clipboard untouched'},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,cycles,evidence:base}));view.destroy();app.exit(0);
}).catch(error=>{console.error(error);view?.destroy();app.exit(1);});
