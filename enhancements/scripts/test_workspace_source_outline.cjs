const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');const {editor_plugins}=require('./editor_bundle.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_source_outline_'));
app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();
let win;const checks=[];const evaluate=source=>win.webContents.executeJavaScript(source);const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async source=>{for(let i=0;i<200;i++){if(await evaluate(source))return;await delay(30);}throw Error('Timed out '+source+' '+await evaluate('document.querySelector(".workspace-source-outline").textContent'));};
app.whenReady().then(async()=>{
  await (await import('./build_source_symbol_assets.mjs')).build_source_symbol_assets(path.join(evidence,'typora_code'));
  win=new BrowserWindow({show:false,width:1000,height:650,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const html=path.join(evidence,'test.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>body{margin:0;display:flex;height:640px;font:13px sans-serif}#typora-sidebar{width:300px;flex:none}#sidebar-content{height:100%;display:flex;flex-direction:column}#editor{width:680px;height:640px}</style><div id="typora-sidebar" class="open active-tab-outline"><div id="sidebar-content"><div id="outline-content"><div class="outline-label">Native heading</div></div></div></div><div id="editor"></div>');await win.loadFile(html);
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {install_workspace_outline} from "./src/workspace_outline";export * as monaco from "monaco-editor/editor/editor.api";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(`window.reqnode=require;window._options={userDataPath:${JSON.stringify(evidence)}};window.native_node=document.querySelector('#outline-content');window.workspace={activeLeaf:null,on(){return ()=>{};}};window[Symbol.for('typora-code:workspace')]={app:{workspace}};window.editor=qa.monaco.editor.create(document.querySelector('#editor'),{automaticLayout:true});window.parse_requests=0;window.NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.last_worker=this;}set onmessage(handler){super.onmessage=event=>setTimeout(()=>handler(event),80)}postMessage(message,...args){if(message.language)parse_requests++;return super.postMessage(message,...args)}};window.binding=qa.install_workspace_outline({document_active:()=>!workspace.activeLeaf});window.set_source=(language,text)=>{if(!qa.monaco.languages.getLanguages().some(x=>x.id===language))qa.monaco.languages.register({id:language});const model=qa.monaco.editor.createModel(text,language);editor.setModel(model);workspace.activeLeaf={state:{path:'typ://linux_note.source_file/'+language},view:{editor:{focused_editor:()=>editor}}};binding.refresh();return model;};window.names=()=>[...document.querySelectorAll('[data-symbol-name]')].map(x=>x.dataset.symbolName);void 0;`);
  const samples=[
    ['c','// 中文 😀 fake(void) {}\nint global;\nint prototype(int arg);\nint real(int arg) { int local; return arg; }\nint (*callback)(int);\nextern int external;',['global','prototype','real','local','callback','external']],
    ['cpp','namespace engine { class Device { int state; void reset(); }; }',['engine','Device','state','reset']],
    ['typescript','interface Shape { width: number; }\nconst run = () => { const local = 2; };',['Shape','width','run','local']],
    ['javascript','function run() { let local = 2; }\nconst note = "function fake() {}";',['run','local','note']],
    ['python','class Device:\n    def reset(self):\n        count = 1\n',['Device','reset','count']],
    ['cmake','function(build_target NAME)\nset(local 1)\nendfunction()\nset(PROJECT_NAME demo)',['build_target','local','PROJECT_NAME']],
    ['yaml','board:\n  name: demo\n  ports:\n    - pin: 1\n',['board','name','ports','[0]','pin']]
  ];
  for(const [language,text,expected] of samples){await evaluate(`set_source(${JSON.stringify(language)},${JSON.stringify(text)});void 0`);await wait(`names().includes(${JSON.stringify(expected[expected.length-1])})`);const actual=await evaluate('names()');for(const name of expected)assert(actual.includes(name),language+' '+name);assert(!actual.includes('fake'));checks.push(language+' actual grammar symbols');}
  // 同一 grammar / Worker / Monaco 路径验证声明分类与新增符号精确定位。
  for(const language of ['c','cpp']){
    await evaluate(`window.declaration_request=parse_requests;set_source(${JSON.stringify(language)},"int (*factory(void))(int);\\nint (*callback)(int);\\nint *plain(void);");void 0`);await wait('parse_requests>declaration_request&&names().includes("plain")');
    assert.equal(await evaluate(`document.querySelector('[data-symbol-name="factory"]').title`),'函数声明');
    assert.equal(await evaluate(`document.querySelector('[data-symbol-name="callback"]').title`),'变量/字段');
    assert.equal(await evaluate(`document.querySelector('[data-symbol-name="plain"]').title`),'函数声明');
    await evaluate(`document.querySelector('[data-symbol-name="factory"]').click()`);
    assert.equal(await evaluate('editor.getModel().getValueInRange(editor.getSelection())'),'factory');
  }
  checks.push('C and C++ functions returning function pointers remain declarations, callback stays a variable');
  await evaluate(`set_source("typescript","enum Color { Red, Blue = 1, Green }");void 0`);await wait('names().includes("Green")');
  assert.deepEqual(await evaluate('names()'),['Color','Red','Blue','Green']);
  await evaluate(`document.querySelector('[data-symbol-name="Red"]').click()`);assert.equal(await evaluate('editor.getModel().getValueInRange(editor.getSelection())'),'Red');
  checks.push('TypeScript bare and initialized enum members remain siblings with exact selection');
  await evaluate(`set_source("python","a = b = c = 1");void 0`);await wait('names().includes("c")');
  assert.deepEqual(await evaluate('names()'),['a','b','c']);
  await evaluate(`document.querySelector('[data-symbol-name="b"]').click()`);assert.equal(await evaluate('editor.getModel().getValueInRange(editor.getSelection())'),'b');
  assert.equal(await evaluate('editor.getModel().getValue()'),'a = b = c = 1');
  checks.push('Python chained assignment lists every target without changing source');
  await evaluate(`window.model=set_source('c',${JSON.stringify(samples[0][1])});void 0`);await wait('names().includes("prototype")');
  await evaluate(`document.querySelector('[data-symbol-name="real"]').click()`);
  assert.deepEqual(await evaluate('({line:editor.getSelection().startLineNumber,column:editor.getSelection().startColumn,text:model.getValueInRange(editor.getSelection())})'),{line:4,column:5,text:'real'});checks.push('real Monaco selection navigates exact definition after astral text');
  assert.equal(await evaluate(`document.querySelector('[data-symbol="prototype"] .workspace-source-disclosure svg')===null`),true);assert.equal(await evaluate(`document.querySelector('[data-symbol="real"]').getAttribute("aria-expanded")`),'true');
  await evaluate(`document.querySelector('[data-symbol="real"] .workspace-source-disclosure').click()`);assert.equal(await evaluate(`document.querySelector('[data-symbol="real"]').nextElementSibling.hidden`),true);checks.push('parent collapses, leaf has no arrow');assert.equal(await evaluate(`document.querySelector('[data-symbol-name="prototype"]').title`),'函数声明');assert.equal(await evaluate(`document.querySelector('[data-symbol-name="callback"]').title`),'变量/字段');assert.equal(await evaluate(`document.querySelector('[data-symbol="real"]').nextElementSibling.querySelector('[data-symbol="local"]')!==null`),true);
  await evaluate('model.setValue("int changed(void) { return 1; }")');await wait('names().includes("changed")&&!names().includes("real")');assert.equal(await evaluate(`document.querySelector('[data-symbol="changed"] .workspace-source-disclosure svg')===null`),true);checks.push('edit updates syntax and removes empty disclosure');
  await evaluate('window.previous_requests=parse_requests;model.setValue("int obsolete;");void 0');await wait('parse_requests>previous_requests');await evaluate('model.setValue("int latest;")');await wait('names().includes("latest")');await delay(150);assert.deepEqual(await evaluate('names()'),['latest']);checks.push('delayed worker response cannot replace a newer model version');
  await evaluate('window.previous_requests=parse_requests;model.setValue("int stale;");void 0');await wait('parse_requests>previous_requests');await evaluate('set_source("python","fresh = 1");void 0');await wait('names().includes("fresh")');await delay(350);assert.deepEqual(await evaluate('names()'),['fresh']);checks.push('old model parse cannot repopulate new file');
  await evaluate('workspace.activeLeaf=null;binding.refresh()');assert.equal(await evaluate('document.querySelector("#outline-content")===native_node&&!document.querySelector(".workspace-source-outline").offsetHeight'),true);checks.push('Markdown restores same native heading tree');
  await evaluate('set_source("yaml","root:\\n  item: 1");void 0');await wait('names().includes("item")');fs.writeFileSync(path.join(evidence,'source_outline.png'),(await win.webContents.capturePage()).toPNG());
  await evaluate('set_source("plaintext","not code");void 0');await wait('document.querySelector(".workspace-source-outline").textContent.includes("此语言尚未")');checks.push('unsupported language shows an explicit boundary without fallback guessing');
  await evaluate('last_worker.dispatchEvent(new ErrorEvent("error",{message:"fixture parser failure"}));set_source("c","int safe;");void 0');await wait('document.querySelector(".workspace-source-outline").textContent.includes("fixture parser failure")');checks.push('worker fatal error rejects future parse immediately instead of remaining loading');
  await evaluate('binding.dispose();editor.getModel().setValue("late: 1")');await delay(300);assert.equal(await evaluate('document.querySelector(".workspace-source-outline")'),null);checks.push('dispose removes pane and cancels updates');
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({ok:true,checks,evidence}));win.destroy();app.quit();
}).catch(error=>{console.error(error);console.error('Evidence '+evidence);if(win&&!win.isDestroyed())win.destroy();app.exit(1);});
