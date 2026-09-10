// 真实生产设置页 + Chromium 输入；Git、存储与导出全部隔离在临时目录。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const child_process=require('node:child_process');
const {build}=require('esbuild');
const {editor_plugins}=require('./editor_bundle.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_graph_settings_'));
const repo=path.join(root,'repository'),other_repo=path.join(root,'other_repository');
for(const folder of [repo,other_repo]){fs.mkdirSync(folder);child_process.execFileSync('git',['init','-b','main'],{cwd:folder,windowsHide:true,stdio:'ignore'});}
const evidence=path.join(root,'evidence');fs.mkdirSync(evidence);
app.setPath('userData',path.join(root,'user_data'));app.disableHardwareAcceleration();
let test_window;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=async source=>{try{return await test_window.webContents.executeJavaScript(source)}catch(error){console.error("Renderer evaluation:",source.slice(0,500));throw error}};
const wait=async source=>{for(let index=0;index<160;index++){if(await evaluate(source))return;await delay(30);}throw new Error('Timed out: '+source);};
const key=async(key_code,modifiers=[])=>{test_window.webContents.sendInputEvent({type:'keyDown',keyCode:key_code,modifiers});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:key_code,modifiers});await delay(60);};
const click=async selector=>{
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`);await delay(50);
  const point=await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),box=node.getBoundingClientRect();const x=Math.round(box.left+box.width/2),y=Math.round(box.top+box.height/2);return {x,y,visible:box.width>0&&box.height>0,hit:node.contains(document.elementFromPoint(x,y))}})()`);
  assert(point.visible&&point.hit,'reachable control '+selector+' '+JSON.stringify(point));
  for(const type of ['mouseMove','mouseDown','mouseUp'])test_window.webContents.sendInputEvent({type,x:point.x,y:point.y,button:'left',clickCount:1});await delay(70);
};
const type_text=async(selector,value)=>{await click(selector);await key('a',['control']);await test_window.webContents.insertText(value);await delay(100);};
const search=async value=>{await type_text('[data-settings-search]',value);await delay(120);};
const shown_keys=()=>evaluate(`[...document.querySelectorAll('[data-settings-entry]')].filter(node=>node.getBoundingClientRect().height>0&&getComputedStyle(node).visibility!=='hidden').map(node=>node.dataset.settingsEntry)`);
const open=async()=>{await evaluate('panel.settings_dialog()');await wait('!!document.querySelector(".git-graph-settings-form")');await delay(70);};
const save=()=>click('[data-settings-action="save"]');
const snapshot=()=>evaluate('JSON.stringify(panel.settings)');
const capture=async name=>fs.writeFileSync(path.join(evidence,name+'.png'),(await test_window.webContents.capturePage()).toPNG());
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:1100,height:780,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const page=path.join(root,'test.html');fs.writeFileSync(page,'<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden}#editors{height:100%}</style><button id="opener">设置测试</button><div id="editors"></div>','utf8');await test_window.loadFile(page);
  await evaluate(`(()=>{window._options={displayLang:'zh-CN'};const handlers=new Map();const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);window.addEventListener=(type,callback,options)=>{const entries=handlers.get(type)||new Set();entries.add(callback);handlers.set(type,entries);if(options?.signal)options.signal.addEventListener('abort',()=>entries.delete(callback),{once:true});return add(type,callback,options)};window.removeEventListener=(type,callback,options)=>{handlers.get(type)?.delete(callback);return remove(type,callback,options)};window.settings_handler_count=()=>[...handlers.values()].reduce((sum,entries)=>sum+entries.size,0)})()`);
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {git_graph_panel} from "./src/git_graph_panel";export {create_graph_host} from "./src/git_graph_host";export {graph_defaults,GRAPH_SETTINGS_KEY} from "./src/git_graph_settings";export {graph_actions_for} from "./src/git_graph_actions";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(`(()=>{
    const css=document.createElement('style');css.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(css);
    window.native_file_constructor=window.File;window.reqnode=require;window._options={displayLang:'zh-CN',userDataPath:${JSON.stringify(root)}};window.File={changeCounter:{isDocumentEdited:()=>false}};window.JSBridge={invoke:async()=>{}};
    const core={WorkspaceView:class{},app:{viewManager:{registerView(){}},commands:{register(){return()=>{}},run(){}},workspace:{on(){return()=>{}},sidebar:{toggle(){}},ribbon:{addButton(){}},eachLeaves(){},activeLeaf:null}}};
    window.host=qa.create_graph_host(core);window.runner_calls=0;const runner=host.runner.bind(host);host.runner=(...args)=>{runner_calls++;return runner(...args)};
    window.exports_seen=[];host.export_file=async(root,name,content)=>{exports_seen.push({root,name,content})};
    const initial_settings=structuredClone(qa.graph_defaults);initial_settings.dialog_defaults.tag_add={push:false,message:""};initial_settings.dialog_defaults.fetch={prune:false};initial_settings.dialog_defaults.reset={mode:"hard"};localStorage.setItem(qa.GRAPH_SETTINGS_KEY+"settings:"+${JSON.stringify(repo.split(path.sep).join('/'))},JSON.stringify(initial_settings));
    window.panel=new qa.git_graph_panel(host,${JSON.stringify(repo.split(path.sep).join('/'))});core.app.workspace.activeLeaf={view:{containerEl:panel.container},state:{path:'graph'}};document.querySelector('#editors').append(panel.container);panel.open();
  })()`);await wait('panel.container.dataset.state==="ready"');const closed_handlers=await evaluate('settings_handler_count()');const closed_styles=await evaluate('document.head.querySelectorAll("style").length');await open();
  assert.deepEqual((await evaluate('[...document.querySelectorAll("[data-setting]")].map(node=>node.dataset.setting)')).sort(),await evaluate('Object.keys(qa.graph_defaults).sort()'));
  assert(!await evaluate('!!document.querySelector("[data-settings-search],[data-settings-category]")'));
  const before=await snapshot();await save();await wait('!document.querySelector(".git-graph-settings-form")&&!panel.pending');assert.equal(await snapshot(),before);
  await open();await type_text('[data-setting="initial_count"]','123');const runners=await evaluate('runner_calls');await save();await wait('!document.querySelector(".git-graph-settings-form")&&!panel.pending');assert.equal(await evaluate('panel.settings.initial_count'),123);assert.equal(await evaluate('runner_calls'),runners+2);
  await open();await type_text('[data-setting="colors"]','{');await save();assert(await evaluate('!!document.querySelector(".git-graph-settings-form")'));assert.equal(await evaluate('document.activeElement.dataset.setting'),'colors');
  await type_text('[data-setting="colors"]','["#123456"]');const original=await snapshot();await evaluate('window.original_set=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error("storage failure")};true');await save();assert.equal(await snapshot(),original);assert(await evaluate('document.querySelector(".git-graph-settings-form").nextElementSibling.textContent.includes("storage failure")'));await evaluate('Storage.prototype.setItem=original_set;true');
  await save();await wait('!document.querySelector(".git-graph-settings-form")&&!panel.pending');assert.deepEqual(await evaluate('panel.settings.colors'),['#123456']);
  await open();await evaluate('panel.writing=true');await save();assert(await evaluate('!!document.querySelector(".git-graph-settings-form")'));await evaluate('panel.writing=false');await key('Escape');
  await evaluate('panel.dispose()');console.log(JSON.stringify({status:'PASS',checks:['simple fields','no-edit roundtrip','real input and two runners','JSON error focus','storage rollback','writing guard'],evidence}));test_window.destroy();app.exit(0);
}).catch(error=>{console.error(error);test_window?.destroy();app.exit(1)});
