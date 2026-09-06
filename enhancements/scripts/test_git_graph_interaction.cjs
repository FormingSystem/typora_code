// 独立 Electron 窗口验证 Chromium 的真实输入；Git 数据与用户数据均位于临时目录。
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const child_process = require('node:child_process');
const { buildSync } = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_graph_ui_'));
const evidence = process.argv[2] || path.join(root, 'evidence'); fs.mkdirSync(evidence, { recursive: true });
app.setPath('userData', path.join(root, 'user_data')); app.disableHardwareAcceleration();
const git = args => child_process.execFileSync('git', ['-c', 'user.name=UI Test', '-c', 'user.email=ui@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=.git/unused_hooks', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
git(['init', '-b', 'main']); fs.writeFileSync(path.join(root, 'example.md'), '# Initial\n'); git(['add', 'example.md']); git(['commit', '-m', '开始 :tada:']);
git(['checkout', '-b', 'feature']); fs.writeFileSync(path.join(root, 'example.md'), '# Initial\n新增内容\n'); git(['add', 'example.md']); git(['commit', '-m', '实现 **对比** #12']);
git(['checkout', 'main']); fs.writeFileSync(path.join(root, 'other.md'), 'main\n'); git(['add', 'other.md']); git(['commit', '-m', '主线更新']); git(['merge', '--no-ff', 'feature', '-m', '合并功能分支']);
const bundle = buildSync({ stdin: { contents: 'export { git_graph_panel } from "./src/git_graph_panel"; export { create_graph_host } from "./src/git_graph_host";', resolveDir: path.join(__dirname, '..') }, bundle: true, format: 'iife', globalName: 'graph_qa', write: false }).outputFiles[0].text;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let test_window;
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => { for (let i = 0; i < 150; i++) { if (await evaluate(source)) return; await delay(50); } throw new Error('Timed out: ' + source); };
const click = async (selector, button = 'left') => {
  // 弹窗的自动获焦在下一任务执行，先让焦点和布局稳定，再读取鼠标位置。
  await delay(120);
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const box = element.getBoundingClientRect(); if (box.top < 0 || box.bottom > innerHeight) element.scrollIntoView({block:'center'}); })()`);
  await delay(80);
  const point = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const box = element.getBoundingClientRect(); const point = {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)}; const hit = document.elementFromPoint(point.x, point.y); return {...point, covered:!element.contains(hit), hit:hit?.outerHTML.slice(0,200), bounds:box.toJSON()}; })()`);
  assert(!point.covered, JSON.stringify({selector,...point}));
  for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) { test_window.webContents.sendInputEvent({ type, x:point.x, y:point.y, button, clickCount: 1 }); await delay(40); }
};
const key = async (key_code, modifiers = []) => { for (const type of ['keyDown', 'keyUp']) test_window.webContents.sendInputEvent({ type, keyCode: key_code, modifiers }); await delay(100); };
const capture = async name => fs.writeFileSync(path.join(evidence, name + '.png'), (await test_window.webContents.capturePage()).toPNG());
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 1280, height: 850, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, offscreen: true } });
  const html = path.join(root, 'test.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden}</style>'); await test_window.loadFile(html);
  await evaluate(bundle);
  await evaluate(`(() => {
    const css = document.createElement('style'); css.textContent = ${JSON.stringify(fs.readFileSync(path.join(__dirname, '../src/git_graph.css'), 'utf8'))}; document.head.append(css);
    window.reqnode = require; window._options = {userDataPath:${JSON.stringify(root)}}; window.File = {changeCounter:{isDocumentEdited:()=>false}};
    window.JSBridge = {invoke: async (command, data) => { window.copied = JSON.parse(data).text; }};
    const factories = new Map(); const leaves = []; const core = { WorkspaceView: class {constructor(leaf){this.leaf=leaf;}}, app: {viewManager:{registerView:(type,factory)=>factories.set(type,factory)}, commands:{run(){}}, workspace:{eachLeaves: callback=>leaves.forEach(callback), activeLeaf:null}}};
    const parent = {appendChild(leaf){leaves.push(leaf);document.body.replaceChildren(leaf.view.containerEl);leaf.view.onOpen();}};
    core.app.workspace.createLeaf = ({type,state}) => {const leaf={state,parent};leaf.view=factories.get(type)(leaf);return leaf;};
    const host = graph_qa.create_graph_host(core); window.panel = new graph_qa.git_graph_panel(host, ${JSON.stringify(root)});
    core.app.workspace.activeLeaf = {view:{containerEl:panel.container},parent}; document.body.append(panel.container);panel.open();
  })()`);
  await wait('panel.container.dataset.state === "ready"');
  await click('.git-graph-row:not(.git-graph-worktree)'); await wait('!!document.querySelector(".git-graph-file")'); await click('.git-graph-file'); await wait('document.querySelector(".git-graph-patch").textContent.includes("新增内容")'); await capture('history');
  await key('f', ['control']); assert(await evaluate('document.activeElement === panel.search'));
  await key('Escape');
  await click('.git-graph-row:not(.git-graph-worktree)', 'right'); await capture('context_menu'); await click('[data-action="branch_create"]');
  await click('[data-field="branch"]'); test_window.webContents.insertText('ui-created'); await click('[data-git-preview]'); await wait('!document.querySelector("[data-git-execute]").disabled');
  assert(!git(['branch', '--list', 'ui-created']).trim()); await capture('action_preview'); await click('[data-git-execute]'); await wait('!panel.writing && document.querySelector(".git-graph-action-preview").textContent.includes("操作完成")'); assert(git(['branch', '--list', 'ui-created']).includes('ui-created')); await key('Escape');
  await evaluate('panel.settings_dialog()'); await capture('settings');
  await evaluate('document.querySelector("[data-setting=details_location]").value = "bottom"');
  await click('.git-graph-dialog-footer button'); await wait('panel.container.dataset.state === "ready" && panel.container.dataset.details === "bottom"');
  assert(await evaluate('localStorage.getItem("linux-note-git-graph:v2:settings:" + panel.root).includes("bottom")'));
  await evaluate('panel.select_commit(panel.state.commits[0])'); await wait('!!document.querySelector(".git-graph-file")');
  await evaluate('panel.open_diff(panel.files[0])'); await wait('!!document.querySelector(".git-graph-document")'); assert(await evaluate('document.querySelectorAll(".git-graph-document pre").length === 2 && !!document.querySelector(".git-graph-document .git-diff-add")')); await capture('side_by_side_diff');
  console.log(JSON.stringify({status:'PASS',checks:['real pointer context menu','keyboard find and escape','preview has no mutation','execution creates branch','settings and focus','colored two-column history'],evidence}));
}).catch(async error => { console.error(error); if (test_window) { console.error(await evaluate('document.body.innerText')); await capture('failure'); } process.exitCode = 1; }).finally(() => { if (test_window && !test_window.isDestroyed()) test_window.destroy(); app.quit(); });
