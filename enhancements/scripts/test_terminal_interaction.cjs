// 隔离 Electron 中使用真实键盘和鼠标；仅加载已校验的终端运行文件。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_terminal_ui_'));
const evidence = process.argv[2] || root; fs.mkdirSync(evidence, { recursive: true });
const runtime_data = process.env.TYPORA_TEST_USER_DATA || path.join(process.env.APPDATA, 'Typora');
app.setPath('userData', path.join(root, 'isolated_data')); app.disableHardwareAcceleration();
let test_window;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => { for (let i = 0; i < 200; i++) { if (await evaluate(source)) return; await delay(50); } throw new Error('Timed out: ' + source); };
const key = async (key_code, modifiers = []) => { for (const type of ['keyDown', 'keyUp']) test_window.webContents.sendInputEvent({ type, keyCode: key_code, modifiers }); await delay(150); };
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 1200, height: 750, webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false } });
  test_window.webContents.on('console-message', (_event, _level, message) => console.error(message));
  const html = path.join(root, 'fixture.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden}</style>'); await test_window.loadFile(html);
  const bundle = buildSync({ stdin: { contents: 'export { create_graph_host } from "./src/git_graph_host";', resolveDir: path.join(__dirname, '..') }, bundle: true, loader: { '.css':'text' }, format: 'iife', globalName: 'terminal_qa', write: false }).outputFiles[0].text;
  await evaluate(bundle);
  await evaluate(`(() => {
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    window.reqnode=require; window._options={userDataPath:${JSON.stringify(runtime_data)}};
    window.JSBridge={invoke:async(command,value)=>{window.copied=JSON.parse(value).text;}};
    const factories=new Map(); const leaves=[];
    const core={WorkspaceView:class{constructor(leaf){this.leaf=leaf;}},app:{viewManager:{registerView:(type,factory)=>factories.set(type,factory)},commands:{run(){},register(){}},workspace:{activeLeaf:null,eachLeaves:callback=>leaves.forEach(callback),on(){},ribbon:{addButton(){}}}}};
    const parent={appendChild(leaf){leaves.push(leaf);document.body.replaceChildren(leaf.view.containerEl);leaf.view.onOpen();}};
    core.app.workspace.activeLeaf={parent}; core.app.workspace.createLeaf=({type,state})=>{const leaf={state,parent};leaf.view=factories.get(type)(leaf);window.view=leaf.view;return leaf;};
    localStorage.setItem('linux-note-terminal:v1:',JSON.stringify({profile:'cmd',location:'active'}));
    terminal_qa.create_graph_host(core).terminal(${JSON.stringify(root)},'cmd');
    window.output_text=()=>{let text='';for(let index=0;index<view.term.buffer.active.length;index++)text+=view.term.buffer.active.getLine(index)?.translateToString()+'\\n';return text;};
  })()`);
  await wait('view.containerEl.dataset.state === "running" && output_text().includes("Microsoft Windows")');
  await evaluate('view.term.focus()');
  test_window.webContents.insertText('echo INPUT_'); await delay(100);
  for (const letter of 'KEYS') await key(letter);
  await key('Enter'); await wait('(output_text().match(/INPUT_keys/g)||[]).length>=2');
  await key('Up'); await key('Enter'); await wait('(output_text().match(/INPUT_keys/g)||[]).length>=4');
  test_window.webContents.insertText('ping -t 127.0.0.1'); await key('Enter'); await delay(500); await key('c',['control']);
  test_window.webContents.insertText('echo AFTER_INTERRUPT'); await key('Enter'); await wait('(output_text().match(/AFTER_INTERRUPT/g)||[]).length>=2');
  await evaluate('view.term.selectAll()'); await key('c',['control','shift']); assert((await evaluate('window.copied')).includes('AFTER_INTERRUPT'));
  await key('f',['control','shift']); await wait('!!document.querySelector(".git-graph-dialog-shade")'); await key('Escape');
  const point=await evaluate('(()=>{const r=view.viewport.getBoundingClientRect();return {x:Math.round(r.x+120),y:Math.round(r.y+120)}})()');
  for(const type of ['mouseMove','mouseDown','mouseUp']) { test_window.webContents.sendInputEvent({type,...point,button:'right',clickCount:1}); await delay(50); }
  await wait('!!document.querySelector("[data-action=terminal_admin]")');
  fs.writeFileSync(path.join(evidence,'terminal.png'),(await test_window.webContents.capturePage()).toPNG()); await key('Escape');
  const before=await evaluate('view.term.cols'); test_window.setSize(750,600); await delay(500); assert(await evaluate('view.term.cols')<before);
  await evaluate('view.dispose()');
  console.log(JSON.stringify({status:'PASS',checks:['typed input','arrow-key command history','Ctrl+C interrupt','Ctrl+Shift+C copy','find shortcut and Escape','real right-click terminal menu','window resize'],evidence}));
}).catch(async error=>{console.error(error);if(test_window){console.error(await evaluate('document.body.innerText'));await evaluate('window.view?.dispose()');}process.exitCode=1;}).finally(()=>{if(test_window&&!test_window.isDestroyed())test_window.destroy();app.quit();});
