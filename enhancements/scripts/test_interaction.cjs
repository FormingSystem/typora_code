// 用 Electron 执行本文件；窗口保持隐藏，通过 Chromium 输入事件测试真实鼠标和键盘行为。
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {build} = require('esbuild');
const {editor_plugins} = require('./editor_bundle.cjs');

app.disableHardwareAcceleration();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let test_window;

async function evaluate(source) {
  try { return await test_window.webContents.executeJavaScript(source); } catch(error) { throw new Error(source.slice(0,500), {cause:error}); }
}

async function click(selector, hold_ms = 0) {
  const point = await evaluate(`(async () => {
    const element = document.querySelector(${JSON.stringify(selector)});
    element.scrollIntoView({ block: 'center' });
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const bounds = element.getBoundingClientRect();
    return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) };
  })()`);
  for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) {
    if (type === 'mouseUp' && hold_ms) await delay(hold_ms);
    test_window.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
    await delay(30);
  }
}

async function expanded() {
  return evaluate(`document.querySelector('.md-fences').classList.contains('is-code-expanded')`);
}

app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const fixture_root = fs.mkdtempSync(path.join(os.tmpdir(),'typora_reading_interaction_'));
  const {static_workspace_css_plugin} = await import('./build_workspace_styles.mjs');
  const script_path = path.join(fixture_root,'startup.js');
  await build({preserveSymlinks:true,stdin:{contents:'export {start_typora_code,shutdown_typora_code} from "./src/workspace_startup"; import "./src/workspace_entry";',resolveDir:path.join(__dirname,'..')},bundle:true,plugins:[static_workspace_css_plugin(),...editor_plugins()],format:'iife',globalName:'reading_startup',platform:'browser',target:['chrome120'],loader:{'.css':'text','.wasm':'binary'},outfile:script_path});
  const fixture_path = path.join(fixture_root,'index.html');
  const original = fs.readFileSync(path.join(__dirname,'../fixtures/interaction_test.html'),'utf8');
  fs.writeFileSync(fixture_path,original.replace('<meta charset="utf-8">','<meta charset="utf-8"><base href="'+pathToFileURL(path.join(__dirname,'../fixtures/')).href+'">').replace('../dist/workbench.js',pathToFileURL(script_path).href),'utf8');
  await test_window.loadFile(fixture_path);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await evaluate(`document.documentElement.getAttribute('data-linux-note-typora-enhancements') === 'ready'`)) break;
    await delay(100);
  }
  assert.equal(await evaluate(`document.documentElement.getAttribute('data-linux-note-typora-enhancements')`), 'ready');
  assert.equal(await expanded(), false);
  await evaluate(`(() => {const fence=document.createElement('div');fence.id='diagram-fixture';fence.style.marginTop='50px';fence.className='md-fences';fence.setAttribute('lang','mermaid');fence.innerHTML='<div class="md-diagram-panel-preview"><svg width="400" height="150" viewBox="0 0 400 150"><defs><marker id="arrow"><path d="M 0 0 L 10 5 L 0 10"/></marker></defs><path d="M10 50L300 50" stroke="blue" marker-end="url(#arrow)"/></svg></div>';document.querySelector('#write').prepend(fence)})()`);
  await delay(900);await evaluate(`document.querySelector('#diagram-fixture').scrollIntoView({block:'center'});document.querySelector('.md-diagram-panel-preview').dispatchEvent(new PointerEvent('pointerenter'))`);await delay(120);await click('.linux-note-mermaid-open');
  assert(await evaluate(`Boolean(document.querySelector('.reading-media-viewer svg'))`),'Mermaid button opens shared viewer on first click');
  assert(await evaluate(`document.querySelector('.reading-media-viewer marker').id!=='arrow'&&document.querySelector('#diagram-fixture marker').id==='arrow'`),'Mermaid SVG IDs remain isolated');
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(80);
  assert(!await evaluate(`Boolean(document.querySelector('.reading-media-viewer'))`));await evaluate(`document.querySelector('#diagram-fixture').remove()`);

  await click('#outside');
  const host_events = await evaluate('window.test_host_events');
  assert.ok(host_events > 0, '正文鼠标事件仍然进入宿主');
  await click('.linux-note-code-toggle span:last-child', 240);
  assert.equal(await expanded(), true, '正文获焦时首次点击展开');
  assert.equal(await evaluate('window.test_host_events'), host_events, '按钮事件不能进入正文选区处理');
  await click('#outside');
  await click('.linux-note-code-toggle');
  assert.equal(await expanded(), false, '正文获焦时首次点击收起');

  // 模拟编辑器复制或重建按钮，原生 addEventListener 不会随 cloneNode 复制。
  await evaluate(`(() => {
    const toolbar = document.querySelector('.linux-note-code-toolbar');
    toolbar.replaceWith(toolbar.cloneNode(true));
  })()`);
  await click('.linux-note-code-toggle');
  assert.equal(await expanded(), true, '重建后的按钮仍能直接操作');

  await evaluate(`document.querySelector('.linux-note-code-toggle').focus()`);
  for (const key_code of ['Enter', 'Space']) {
    const before = await expanded();
    test_window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key_code });
    test_window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key_code });
    await delay(100);
    assert.equal(await expanded(), !before, `${key_code} 只切换一次`);
  }
  await delay(200);
  const mutation_count = await evaluate(`new Promise((resolve) => {
    let count = 0;
    const observer = new MutationObserver((records) => { count += records.length; });
    observer.observe(document.querySelector('#write'), { subtree: true, childList: true, attributes: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 400);
  })`);
  assert.equal(mutation_count, 0, '空闲时不能因按钮渲染反复触发扫描');
  const colors = await evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('.CodeMirror-line span'))
    .filter((span) => ['do', 'unsigned', 'typecheck', 'arch_local_irq_save', '='].includes(span.textContent))
    .map((span) => [span.textContent, getComputedStyle(span).color]))`);
  assert.equal(colors.do, 'rgb(215, 58, 73)');
  assert.equal(colors.unsigned, 'rgb(215, 58, 73)');
  assert.equal(colors.typecheck, 'rgb(111, 66, 193)');
  assert.equal(colors.arch_local_irq_save, 'rgb(111, 66, 193)');
  assert.equal(colors['='], 'rgb(36, 41, 46)');
  assert.equal(await evaluate(`document.documentElement.getAttribute('data-linux-note-reading-navigation')`), 'ready');
  async function navigate(key_code) {
    test_window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key_code, modifiers: ['alt'] });
    test_window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key_code, modifiers: ['alt'] });
    await delay(650);
  }
  await click('#outside');
  await click('#reading_link');
  await delay(350);
  const anchor_scroll = await evaluate(`document.querySelector('content').scrollTop`);
  assert.ok(anchor_scroll > 100);
  await navigate('Left');
  const origin_scroll = await evaluate(`document.querySelector('content').scrollTop`);
  assert.ok(origin_scroll < anchor_scroll, `Alt+左方向键回到链接来源: ${JSON.stringify({ origin_scroll, anchor_scroll })}`);
  assert.equal(await evaluate(`File.editor.selection.buildUndo().id`), 'outside');
  await navigate('Right');
  assert.equal(await evaluate(`document.querySelector('content').scrollTop`), anchor_scroll);
  assert.equal(await evaluate(`File.editor.selection.buildUndo().id`), 'reading_target');
  await click('#file_link');
  await delay(900);
  assert.equal(await evaluate('File.bundle.filePath'), 'chapter_b.md');
  await navigate('Left');
  assert.equal(await evaluate('File.bundle.filePath'), 'chapter_a.md', '跨文件后退复用宿主打开接口');
  await navigate('Right');
  assert.equal(await evaluate('File.bundle.filePath'), 'chapter_b.md', '跨文件前进');
  for(let cycle=0;cycle<2;cycle++){
    await evaluate('reading_startup.shutdown_typora_code();void 0');await delay(100);
    assert.equal(await evaluate('!!document.querySelector("#typora-code-workspace-styles").sheet'),true,'window cleanup preserves preloaded static CSS');
    assert.deepEqual(await evaluate('({ready:document.documentElement.hasAttribute("data-linux-note-typora-enhancements"),navigation:document.documentElement.hasAttribute("data-linux-note-reading-navigation"),toolbars:document.querySelectorAll(".linux-note-code-toolbar,.reading-media-entry").length,url:File.editor.tryOpenUrl===test_native_open_url,file:File.editor.library.openFile===test_native_open_file})'),{ready:false,navigation:false,toolbars:0,url:true,file:true});
    await evaluate('reading_startup.start_typora_code();void 0');
    for(let attempt=0;attempt<60;attempt++){if(await evaluate('document.documentElement.getAttribute("data-linux-note-typora-enhancements")==="ready"'))break;await delay(50);}
    assert.equal(await evaluate('document.documentElement.getAttribute("data-linux-note-typora-enhancements")'),'ready');
    assert.equal(await evaluate('document.querySelectorAll("#typora-code-workspace-styles").length'),1);
    assert.equal(await evaluate('document.documentElement.getAttribute("data-linux-note-reading-navigation")'),'ready');
  }
  console.log(JSON.stringify({ first_click_expand: true, first_click_collapse: true, rebuilt_button: true,
    keyboard: true, idle_mutations: mutation_count, macro_colors: colors, anchor_history: true, file_history: true }, null, 2));
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
