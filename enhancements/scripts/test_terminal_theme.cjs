// 隔离的隐藏 Electron 使用真实 xterm，仅注入已有输出，不创建 PTY 或执行 Shell。
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const assert = require('node:assert/strict');
const {build} = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_terminal_theme_'));
const evidence = process.argv[2] || root; fs.mkdirSync(evidence, {recursive: true});
app.setPath('userData', path.join(root, 'isolated_data')); app.disableHardwareAcceleration();
let test_window; const checks = []; const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => { for (let index = 0; index < 120; index++) { if (await evaluate(source)) return; await delay(50); } throw new Error('Timed out: ' + source); };
const light = 'html{background:#fff}body{background:#fff;color:#333}';
const dark = 'html{background:#1e1e1e}body{background:#1e1e1e;color:#d4d4d4}';
const assert_palette = async (background, foreground, red, selection) => {
  await wait(`view.term.options.theme.background === ${JSON.stringify(background)}`);
  const actual = await evaluate('({theme:view.term.options.theme, ansi:view.term._core._themeService.colors.ansi.slice(0,16).map(color=>color.css), cursor:view.term._core._themeService.colors.cursor.css, selection:view.term._core._themeService.colors.selectionBackgroundOpaque.css})');
  assert.equal(actual.theme.foreground, foreground); assert.equal(actual.theme.cursor, foreground); assert.equal(actual.theme.cursorAccent, background); assert.equal(actual.theme.red, red); assert.equal(actual.theme.selectionBackground, selection);
  assert.equal(actual.ansi[1].toLowerCase(), red); assert.equal(actual.ansi.length, 16);
  const ansi_keys = ['black','red','green','yellow','blue','magenta','cyan','white','brightBlack','brightRed','brightGreen','brightYellow','brightBlue','brightMagenta','brightCyan','brightWhite'];
  assert.deepEqual(actual.ansi.map(color=>color.toLowerCase().replace(/^(#[0-9a-f]{6})ff$/, '$1')), ansi_keys.map(key=>actual.theme[key]));
  assert.equal(actual.selection.toLowerCase().replace(/^(#[0-9a-f]{6})ff$/, '$1'), selection);
  assert.equal(actual.cursor.toLowerCase().replace(/^(#[0-9a-f]{6})ff$/, '$1'), /^rgb/.test(foreground) ? '#'+foreground.match(/\d+/g).map(value=>Number(value).toString(16).padStart(2,'0')).join('') : foreground);
  await delay(100);
};
app.whenReady().then(async () => {
  test_window = new BrowserWindow({show: false, width: 1100, height: 700, webPreferences: {nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false}});
  const html = path.join(root, 'fixture.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden}#host{height:100%}</style><style id="fixture-theme">'+light+'</style><main id="host"></main>'); await test_window.loadFile(html);
  const bundle = (await build({stdin: {contents: 'export { bind_terminal_workspace } from "./src/terminal_workspace"; export { terminal_theme, observe_terminal_theme } from "./src/terminal_theme";', resolveDir: path.join(__dirname, '..')}, bundle: true, loader: {'.css':'text'}, format: 'iife', globalName: 'terminal_qa', write: false})).outputFiles[0].text;
  await evaluate(bundle);
  await evaluate(`(() => {
    window.reqnode=()=>{throw new Error('No PTY or node launch allowed');}; window._options={userDataPath:${JSON.stringify(root)}};
    const factories=new Map(); const leaves=[];
    const core={WorkspaceView:class{constructor(leaf){this.leaf=leaf;}},app:{viewManager:{registerView:(type,factory)=>factories.set(type,factory)},commands:{run(){},register(){}},workspace:{activeLeaf:null,eachLeaves:callback=>leaves.forEach(callback),on(){},ribbon:{addButton(){}}}}};
    const parent={appendChild(leaf){leaves.push(leaf);document.querySelector('#host').append(leaf.view.containerEl);leaf.view.start=()=>{leaf.view.status.textContent='现有终端输出';};leaf.view.onOpen();}};
    core.app.workspace.activeLeaf={parent};core.app.workspace.createLeaf=({type,state})=>{const leaf={state,parent};leaf.view=factories.get(type)(leaf);window.view=leaf.view;return leaf;};
    const host={core,fs:require('node:fs'),path_api:require('node:path'),process_api:process,context_path:()=>${JSON.stringify(root)}};
    localStorage.setItem('linux-note-terminal:v1:',JSON.stringify({profile:'cmd',location:'active'}));terminal_qa.bind_terminal_workspace(host).open(${JSON.stringify(root)},'cmd','active');
    window.output_text=()=>Array.from({length:view.term.buffer.active.length},(_,index)=>view.term.buffer.active.getLine(index)?.translateToString()).join('\\n');
    view.term.write('PRESERVED_OUTPUT\\r\\n\\x1b[31mANSI_RED\\x1b[0m \\x1b[92mANSI_BRIGHT_GREEN\\x1b[0m\\r\\nREADING_POSITION',()=>{window.output_ready=true;});
  })()`);
  await wait('window.output_ready === true'); await assert_palette('rgb(255, 255, 255)', 'rgb(51, 51, 51)', '#a31515', '#add6ff');
  const baseline = await evaluate('output_text()'); const rows = await evaluate('view.term.rows');
  assert(baseline.includes('ANSI_RED') && baseline.includes('READING_POSITION'));
  await evaluate('view.term.select(0,0,16);view.term.focus()'); await delay(100);
  assert.equal(await evaluate('view.term.getSelection()'), 'PRESERVED_OUTPUT');
  checks.push('light theme initializes real xterm foreground, ANSI palette, cursor and selection without a PTY');

  await evaluate(`document.querySelector('#fixture-theme').textContent=${JSON.stringify(dark)}`);
  await assert_palette('rgb(30, 30, 30)', 'rgb(212, 212, 212)', '#cd3131', '#264f78');
  assert.equal(await evaluate('output_text()'), baseline); assert.equal(await evaluate('view.term.getSelection()'), 'PRESERVED_OUTPUT'); assert.equal(await evaluate('view.term.rows'), rows);
  const dark_surface = await evaluate('({container:getComputedStyle(view.containerEl).backgroundColor,toolbar:getComputedStyle(view.containerEl.querySelector(".linux-note-terminal-toolbar")).backgroundColor,text:getComputedStyle(view.containerEl).color})');
  assert(!['rgb(255, 255, 255)', 'rgb(51, 51, 51)'].includes(dark_surface.container), 'terminal container remains light on a dark body: '+JSON.stringify(dark_surface));
  assert.notEqual(dark_surface.toolbar, 'rgb(255, 255, 255)', 'toolbar remains white on a dark body');
  checks.push('stylesheet content changes recolor existing output and preserve buffer, selection and dimensions');

  await evaluate(`document.querySelector('#fixture-theme').textContent='html{background:#fff}body{background:#fff;color:#333}body.night{background:#202020;color:#eeeeee}html.night body{background:#202020;color:#eeeeee}';document.body.classList.add('night')`);
  await assert_palette('rgb(32, 32, 32)', 'rgb(238, 238, 238)', '#cd3131', '#264f78');
  await evaluate("document.body.classList.remove('night')"); await assert_palette('rgb(255, 255, 255)', 'rgb(51, 51, 51)', '#a31515', '#add6ff');
  await evaluate("document.documentElement.classList.add('night')"); await assert_palette('rgb(32, 32, 32)', 'rgb(238, 238, 238)', '#cd3131', '#264f78');
  await evaluate("document.documentElement.classList.remove('night')"); await assert_palette('rgb(255, 255, 255)', 'rgb(51, 51, 51)', '#a31515', '#add6ff');
  checks.push('body and root class changes switch themes in both directions');

  await evaluate(`window.theme_link=document.createElement('link');theme_link.rel='stylesheet';theme_link.href='data:text/css,'+encodeURIComponent(${JSON.stringify(dark)});document.head.append(theme_link)`);
  await assert_palette('rgb(30, 30, 30)', 'rgb(212, 212, 212)', '#cd3131', '#264f78');
  await evaluate(`theme_link.href='data:text/css,'+encodeURIComponent(${JSON.stringify(light)})`); await assert_palette('rgb(255, 255, 255)', 'rgb(51, 51, 51)', '#a31515', '#add6ff');
  await evaluate(`theme_link.href='data:text/css,'+encodeURIComponent(${JSON.stringify(dark)})`); await assert_palette('rgb(30, 30, 30)', 'rgb(212, 212, 212)', '#cd3131', '#264f78');
  await evaluate('theme_link.remove()'); await assert_palette('rgb(255, 255, 255)', 'rgb(51, 51, 51)', '#a31515', '#add6ff');
  checks.push('new and replaced external stylesheets update after their actual load event');

  await evaluate("document.querySelector('#fixture-theme').textContent='html{background:#101010}body{background:rgba(255,255,255,0);color:#eeeeee}'");
  await assert_palette('rgb(16, 16, 16)', 'rgb(238, 238, 238)', '#cd3131', '#264f78');
  await evaluate("document.body.style.backgroundColor='rgba(255,255,255,0.5)'");
  await assert_palette('rgb(136, 136, 136)', 'rgb(238, 238, 238)', '#a31515', '#add6ff');
  await evaluate("document.body.style.backgroundColor='rgba(255,255,255,0)'");
  await assert_palette('rgb(16, 16, 16)', 'rgb(238, 238, 238)', '#cd3131', '#264f78');
  checks.push('transparent and translucent backgrounds use the actual root/body composite rather than the hidden RGB channels');
  assert.equal(await evaluate('output_text()'), baseline);
  fs.writeFileSync(path.join(evidence,'terminal_theme_dark.png'),(await test_window.webContents.capturePage()).toPNG());
  await evaluate('view.dispose()'); console.log(JSON.stringify({status:'PASS',checks,evidence},null,2));
}).catch(async error => { console.error(error); process.exitCode=1; if(test_window){fs.writeFileSync(path.join(evidence,'terminal_theme_failure.png'),(await test_window.webContents.capturePage()).toPNG());await evaluate('window.view?.dispose()');} }).finally(()=>{if(test_window&&!test_window.isDestroyed())test_window.destroy();app.exit(process.exitCode||0);});
