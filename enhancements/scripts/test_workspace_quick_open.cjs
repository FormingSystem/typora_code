// 临时真实文件系统 + Chromium，验证完整查询/选择/打开链路，不读写用户工程。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('esbuild');
const baseline=process.argv.find(value=>value.startsWith('--baseline='))?.slice(11);
const baseline_plugin={name:'baseline-quick-open',setup(builder){if(baseline)builder.onLoad({filter:/[\\/]workspace_quick_open\.ts$/},()=>({contents:require('node:child_process').execFileSync('git',['show',baseline+':enhancements/src/workspace_quick_open.ts'],{cwd:path.join(__dirname,'..'),encoding:'utf8',windowsHide:true}),loader:'ts'}));}};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_quick_open_'));
const fixture=['samples/bringup/prj.conf','samples/bringup/README.md','samples/bringup/src/main.c','samples/bringup/tests.yaml','samples/bringup/CMakeLists.txt','samples/boards/st/bluetooth/interactive_gui/prj.conf','node_modules/known.js','学习/教程/文件.md','src/readModel.ts'];
for(const name of fixture){const file=path.join(root,'workspace',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture '+name,'utf8');}
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
let win;const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));const evaluate=source=>win.webContents.executeJavaScript(source);
const wait=async source=>{for(let index=0;index<500;index++){if(await evaluate(source))return;await pause(10);}throw Error('timeout '+source);};
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,...details)=>{if(baseline)console.log('renderer:',...details)});
  fs.writeFileSync(path.join(root,'page.html'),'<!doctype html><meta charset="utf-8"><button id="editor">原文档</button>');await win.loadFile(path.join(root,'page.html'));
  const bundle=await build({plugins:[baseline_plugin,...require('./editor_bundle.cjs').editor_plugins()],stdin:{contents:'export {create_workspace_quick_open} from "./src/workspace_quick_open";export {begin_workspace_context_switch,finish_workspace_context_switch} from "./src/workspace_context";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'quick_test',write:false,loader:{'.css':'text'}});
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`window.opened=[];window.current_root=${JSON.stringify(path.join(root,'workspace'))};window.host={fs:require('fs'),path_api:require('path'),context_root:()=>current_root,open_file:async file=>{if(window.fail_open)throw Error('权限不足');opened.push({file,text:await require('fs').promises.readFile(file,'utf8')});}};window.picker=quick_test.create_workspace_quick_open(host);document.querySelector('#editor').focus();picker.open();void 0`);
  const query=async value=>{await evaluate(`picker.input.value=${JSON.stringify(value)};picker.input.dispatchEvent(new Event('input'));void 0`);await wait(`!picker.root.querySelector('.workspace-quick-open-status').textContent.includes('正在')`);};
  await wait(`picker.root.querySelectorAll('.workspace-quick-open-result').length===8`);
  assert(await evaluate('picker.root.querySelector("[aria-label=使用正则表达式]").getAttribute("aria-pressed")==="true"'));
  await query('main[.]c$');assert.equal(await evaluate('picker.root.querySelector(".workspace-quick-open-name").textContent'),'main.c');
  await query('[');assert(await evaluate('picker.root.textContent.includes("正则表达式无效")'));
  await evaluate('picker.root.querySelector("[aria-label=使用正则表达式]").click();void 0');
  await query('samples/bringup');
  assert.deepEqual(await evaluate(`[...picker.root.querySelectorAll('.workspace-quick-open-name')].slice(0,5).map(n=>n.textContent)`),['prj.conf','README.md','main.c','tests.yaml','CMakeLists.txt']);
  assert.equal(await evaluate(`picker.root.querySelector('.workspace-quick-open-path .workspace-quick-open-highlight')?.textContent`),'samples/bringup');
  assert.equal(await evaluate(`getComputedStyle(picker.root.querySelector('.workspace-quick-open-highlight')).fontWeight`),'700');
  assert.equal(await evaluate(`getComputedStyle(picker.root.querySelector('.workspace-quick-open-result')).height`),'22px');
  await query('samples\\bringup');assert.equal(await evaluate(`picker.root.querySelectorAll('.workspace-quick-open-result').length`),6);
  await query('main bringup');assert.equal(await evaluate(`picker.root.querySelector('.workspace-quick-open-name').textContent`),'main.c');
  assert.equal(await evaluate(`picker.root.querySelector('.workspace-quick-open-name .workspace-quick-open-highlight').textContent`),'main');
  await evaluate(`picker.input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));picker.input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));void 0`);
  await wait('picker.root.hidden');assert.equal(await evaluate('opened.length'),1);assert.equal(await evaluate('opened[0].text'),'fixture samples/bringup/src/main.c');
  await evaluate('picker.open();void 0');await wait(`picker.root.querySelectorAll('.workspace-quick-open-result').length===8`);
  // stat变慢不能阻塞已经枚举的文件；旧路径完成不能覆盖新查询。
  await evaluate(`window.native_fs=host.fs;window.release_stat=null;host.fs={promises:{...native_fs.promises,stat:async target=>{await new Promise(resolve=>release_stat=resolve);return native_fs.promises.stat(target);}}};picker.input.value='samples/bringup/prj.conf';picker.input.dispatchEvent(new Event('input'));void 0`);
  await wait(`!!release_stat&&picker.root.querySelector('.workspace-quick-open-name')?.textContent==='prj.conf'`);
  await query('readModel');await evaluate(`release_stat();host.fs=native_fs;void 0`);await pause(120);
  assert.equal(await evaluate(`picker.root.querySelector('.workspace-quick-open-name').textContent`),'readModel.ts');
  await query('node_modules/known.js');assert.equal(await evaluate(`picker.root.querySelector('.workspace-quick-open-name').textContent`),'known.js');
  await evaluate(`window.release_stat=null;host.fs={promises:{...native_fs.promises,stat:async target=>{await new Promise(resolve=>release_stat=resolve);return native_fs.promises.stat(target);}}};picker.input.value='node_modules/known.js';picker.input.dispatchEvent(new Event('input'));void 0`);
  // 新查询使显式探测重新开始，排除目录中的文件不在普通枚举中。
  await query('readModel');await evaluate(`picker.input.value='node_modules/known.js';picker.input.dispatchEvent(new Event('input'));void 0`);
  await wait(`!!release_stat&&picker.root.querySelector('.workspace-quick-open-status').textContent.includes('正在核对')`);
  assert(await evaluate(`picker.root.querySelector('.workspace-quick-open-status').classList.contains('is-visible')`),'pending path status is visible');
  await evaluate(`picker.close();release_stat();host.fs=native_fs;void 0`);await pause(120);
  assert(await evaluate(`picker.root.hidden&&!picker.root.querySelector('.workspace-quick-open-result')`),'late stat cannot reopen a closed picker');
  await evaluate(`picker.open();void 0`);await wait(`picker.root.querySelectorAll('.workspace-quick-open-result').length===8`);
  await query('no such file xyz');assert(await evaluate(`picker.root.querySelector('.workspace-quick-open-status').classList.contains('is-visible')&&picker.root.querySelector('.workspace-quick-open-status').textContent.includes(current_root)`));
  await query('README');await evaluate(`window.fail_open=true;picker.input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));void 0`);await wait(`picker.root.querySelector('.workspace-quick-open-status').textContent.includes('权限不足')`);assert.equal(await evaluate('picker.root.hidden'),false);
  await evaluate(`window.fail_open=false;quick_test.begin_workspace_context_switch();picker.input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));quick_test.finish_workspace_context_switch();void 0`);assert.equal(await evaluate('opened.length'),1);assert(await evaluate('picker.root.hidden'));
  // 在非选中行、暗色与缩放下，高亮保持可见，文件名仍是原文文本。
  await evaluate('picker.open();void 0');await wait(`picker.root.querySelectorAll('.workspace-quick-open-result').length===8`);await query('samples/bringup');
  for(const theme of ['light','dark']){await evaluate(`document.documentElement.dataset.workspaceFileIconTheme='${theme}';void 0`);for(const scale of [1,1.25]){win.webContents.setZoomFactor(scale);assert.equal(await evaluate(`getComputedStyle(picker.root.querySelectorAll('.workspace-quick-open-result')[1].querySelector('.workspace-quick-open-highlight')).color`),theme==='dark'?'rgb(42, 170, 255)':'rgb(0, 102, 191)');}}
  win.webContents.setZoomFactor(1);await win.webContents.capturePage().then(image=>fs.writeFileSync(path.join(root,'quick_open.png'),image.toPNG()));
  // 超过旧扫描上限的文件仍能找到；仅512个最优候选进入显示列表。
  await evaluate(`picker.close();host.fs={promises:{readdir:async()=>[{name:'last-target.md',isFile:()=>true,isDirectory:()=>false},...Array.from({length:51000},(_,i)=>({name:'item-'+i+'.md',isFile:()=>true,isDirectory:()=>false}))]}};picker.open();void 0`);
  await wait(`picker.root.querySelector('.workspace-quick-open-status').textContent.startsWith('51001')&&!picker.root.querySelector('.workspace-quick-open-status').textContent.includes('正在')`);
  assert(await evaluate(`picker.root.querySelectorAll('.workspace-quick-open-result').length<50`),'large results only mount visible rows');
  await evaluate(`picker.input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp'}));void 0`);assert.equal(await evaluate(`document.getElementById(picker.input.getAttribute('aria-activedescendant')).getAttribute('aria-posinset')`),'512');
  await query('last-target');assert.equal(await evaluate(`picker.root.querySelector('.workspace-quick-open-name').textContent`),'last-target.md');
  await evaluate(`picker.close();host.fs={promises:{readdir:async()=>{throw Error('denied')}}};picker.open();void 0`);await wait(`picker.root.querySelector('.workspace-quick-open-status').textContent.includes('不完整')`);
  await evaluate('picker.dispose();void 0');assert.equal(await evaluate(`document.querySelectorAll('.workspace-quick-open').length`),0);
  console.log(JSON.stringify({status:'PASS',checks:['delayed stat does not block indexed results','late stat/query/close isolation','visible pending path status','real filesystem path open','upstream ordering and highlights','slash/multiword','explicit excluded path','visible scope/empty/error','single execution','workspace switch safety','light/dark/zoom','51001 files','dispose'],evidence:root},null,2));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);win?.destroy();app.exit(1);});
