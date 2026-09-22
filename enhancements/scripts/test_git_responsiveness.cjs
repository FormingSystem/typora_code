// 独立 Electron 窗口验证 Chromium 的真实输入；Git 数据与用户数据均位于临时目录。
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const child_process = require('node:child_process');
const { build } = require('esbuild');
const { editor_plugins } = require('./editor_bundle.cjs');
// 几何核对固定Git Graph v1.30.0提交881a9e6的main.css/findWidget.css；含边框总高度。
// 本测试没有复制扩展源码、样式或资源。详情高度是本项目的固定展示高度，窄组宽度用于验证响应性。
const CLASSIC_GIT_GRAPH_METRICS = Object.freeze({
  toolbar_height: 41,
  header_height: 31,
  row_height: 24,
  ref_height: 20, // 上游18px内容盒另加上下各1px边框。
  ref_radius: 5,
  toolbar_action_size: 20,
  toolbar_icon_size: 18,
  refresh_icon_size: 16,
  detail_controls_width: 32,
  detail_action_size: 24,
  detail_icon_size: 20,
  columns: ['提交图', '说明', '日期', '作者', '提交编号']
});
const INLINE_DETAIL_HEIGHT = 300;
const RESPONSIVE_EDITOR_WIDTHS = Object.freeze([640, 360]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_git_responsive_'));
const evidence = process.argv[2] || path.join(root, 'evidence'); fs.mkdirSync(evidence, { recursive: true });
app.setPath('userData', path.join(root, 'user_data')); app.disableHardwareAcceleration();
const git = args => child_process.execFileSync('git', ['-c', 'user.name=UI Test', '-c', 'user.email=ui@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=.git/unused_hooks', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
git(['init', '-b', 'main']); fs.writeFileSync(path.join(root, '.git/info/exclude'), 'user_data/\ntest.html\nevidence/\n');
git(['remote','add','origin',path.join(root,'remote.git')]);
const original_code = Array.from({length:80}, (_,i) => 'int value_' + i + ' = ' + i + ';').join('\n') + '\n'; fs.writeFileSync(path.join(root,'sample.c'), original_code);
const nested_history_path = 'z_docs/nested/history.md'; fs.mkdirSync(path.dirname(path.join(root, nested_history_path)), {recursive:true});
fs.writeFileSync(path.join(root, nested_history_path), '# Nested initial\n');
fs.writeFileSync(path.join(root, 'example.md'), '# Initial\n'); git(['add', 'example.md', 'sample.c', nested_history_path]); git(['commit', '-m', '开始 :tada:']);
git(['checkout', '-b', 'feature']); fs.writeFileSync(path.join(root, 'example.md'), '# Initial\n新增内容\n'); fs.writeFileSync(path.join(root, nested_history_path), '# Nested initial\n嵌套目录中的真实修改\n'); git(['add', 'example.md', nested_history_path]); git(['commit', '-m', '实现 **对比** #12']);
git(['checkout', 'main']); fs.writeFileSync(path.join(root, 'other.md'), 'main\n'); git(['add', 'other.md']); git(['commit', '-m', '主线更新']); git(['merge', '--no-ff', 'feature', '-m', '合并功能分支']); git(['-c','tag.gpgsign=false','tag','v-ui']);
const modified_code = original_code.split('\n'); modified_code[9]='int value_9 = 900;'; modified_code.splice(20,0,'// 新增一行'); modified_code.splice(36,1); fs.writeFileSync(path.join(root,'sample.c'),modified_code.join('\n'));
const bundle = build({ plugins: editor_plugins(), stdin: { contents: 'export { git_graph_panel } from "./src/git_graph_panel"; export { create_graph_host } from "./src/git_graph_host"; export { GRAPH_SETTINGS_KEY } from "./src/git_graph_settings"; export { terminal_surface } from "./src/terminal_surface"; export { terminal_defaults } from "./src/terminal_settings";', resolveDir: path.join(__dirname, '..') }, bundle: true, loader: {'.css':'text'}, format: 'iife', globalName: 'graph_qa', write: false }).then(result => result.outputFiles[0].text);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let test_window;
const evaluate = async source => { try { return await test_window.webContents.executeJavaScript(source); } catch (error) { console.error('Evaluation failed:', source); throw error; } };
const wait = async source => { for (let i = 0; i < 150; i++) { if (await evaluate(source)) return; await delay(50); } throw new Error('Timed out: ' + source); };
const click = async (selector, button = 'left') => {
  // 弹窗的自动获焦在下一任务执行，先让焦点和布局稳定，再读取鼠标位置。
  await delay(120);
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const box = element.getBoundingClientRect(), menu=element.closest('.git-graph-menu')?.getBoundingClientRect(); if (box.top < 0 || box.bottom > innerHeight || menu && (box.top<menu.top || box.bottom>menu.bottom)) element.scrollIntoView({block:'nearest'}); })()`);
  await delay(80);
  const point = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const box = element.getBoundingClientRect(); const point = {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)}; const hit = document.elementFromPoint(point.x, point.y); return {...point, covered:!element.contains(hit), hit:hit?.outerHTML.slice(0,200), bounds:box.toJSON()}; })()`);
  assert(!point.covered, JSON.stringify({selector,...point}));
  for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) { test_window.webContents.sendInputEvent({ type, x:point.x, y:point.y, button, clickCount: 1 }); await delay(40); }
};
const hover = async selector => {
  const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  test_window.webContents.sendInputEvent({type:'mouseMove',...point}); await delay(100);
  return evaluate(`(() => {const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return {background:s.backgroundColor,color:s.color};})()`);
};
const check_disclosure = async (selector, expanded, visible = true) => {
  const metric = await evaluate(`(() => {const root=document.querySelector(${JSON.stringify(selector)}),icon=root.querySelector('.git-disclosure-icon'),matrix=new DOMMatrixReadOnly(getComputedStyle(icon).transform);return {icon:icon.dataset.gitIcon,text:icon.textContent.trim(),matrix:[matrix.a,matrix.b,matrix.c,matrix.d],before:getComputedStyle(root,'::before').content,parent_display:getComputedStyle(icon.parentElement).display};})()`);
  assert.equal(metric.icon,'chevron-right'); assert.equal(metric.text,'');
  if (visible) { const expected = expanded ? [0,1,-1,0] : [1,0,0,1]; metric.matrix.forEach((value,index)=>assert(Math.abs(value-expected[index])<0.001,selector+' rotates the SVG chevron with its open state: '+JSON.stringify(metric))); }
  else assert.equal(metric.parent_display,'none',selector+' keeps its decorative disclosure hidden');
  assert(['none','normal','""'].includes(metric.before),selector+' does not render a text chevron');
};
const key = async (key_code, modifiers = []) => {
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:key_code,modifiers});
  // Electron 低层输入不自动生成 WM_CHAR；普通回车需包含真实字符输入阶段。
  if (key_code === 'Enter' && !modifiers.length) test_window.webContents.sendInputEvent({type:'char',keyCode:'\r'});
  test_window.webContents.sendInputEvent({type:'keyUp',keyCode:key_code,modifiers}); await delay(100);
};
const capture = async name => fs.writeFileSync(path.join(evidence, name + '.png'), (await test_window.webContents.capturePage()).toPNG());
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 1280, height: 850, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, offscreen: true } });
  test_window.webContents.on('console-message', (_event, _level, message) => console.error(message));
  const html = path.join(root, 'test.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden}body{display:flex}#sidebar-content{width:260px;flex:none}#editors{flex:1;min-width:0;height:100%}</style><div id=sidebar-content></div><div id=editors></div>'); await test_window.loadFile(html);test_window.webContents.debugger.attach();await test_window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  await evaluate('window._options = {displayLang:"zh-CN"}');
  await evaluate(await bundle);
  await evaluate(`(() => {
    const css = document.createElement('style'); css.textContent = ${JSON.stringify(fs.readFileSync(path.join(__dirname, '../src/git_graph.css'), 'utf8'))}; document.head.append(css);
    window.reqnode = require; window._options = {userDataPath:${JSON.stringify(root)},displayLang:'zh-CN'}; window.File = {changeCounter:{isDocumentEdited:()=>false}};
    window.JSBridge = {invoke: async (command, data) => { window.copied = JSON.parse(data).text; }};
    const factories = new Map(); const leaves = []; const core = { WorkspaceView: class {constructor(leaf){this.leaf=leaf;}}, app: {viewManager:{registerView:(type,factory)=>factories.set(type,factory)}, commands:{run(){},register(){}}, workspace:{sidebar:{toggle(){}},on(){},ribbon:{addButton(){}},eachLeaves: callback=>leaves.forEach(callback), activeLeaf:null}}};
    const editors=document.querySelector('#editors'),strip=document.createElement('div'),header=document.createElement('div'),editor_body=document.createElement('div');strip.className='workspace-tab-strip';header.className='typ-workspace-tab-header';strip.style.cssText='display:flex;height:35px;min-width:0';header.style.cssText='flex:1;min-width:0';strip.append(header);editor_body.style.cssText='height:calc(100% - 35px);min-height:0';editors.append(strip,editor_body);
    const activate=leaf=>{core.app.workspace.activeLeaf?.view.onClose?.();editor_body.replaceChildren(leaf.view.containerEl);leaf.view.onOpen?.();};
    window.core=core; const parent = {containerEl:editors,appendChild(leaf){leaves.push(leaf);activate(leaf);},toggleTab(uri){const leaf=leaves.find(item=>item.state.path===uri);activate(leaf);return leaf;}};
    core.app.workspace.createLeaf = ({type,state}) => {const leaf={state,parent};leaf.view=factories.get(type)(leaf);return leaf;};
    const host = graph_qa.create_graph_host(core); window.panel = new graph_qa.git_graph_panel(host, ${JSON.stringify(root)});
    window.graph_leaf = {state:{path:'graph'},view:{containerEl:panel.container},parent}; leaves.push(graph_leaf); core.app.workspace.activeLeaf = graph_leaf;
    editor_body.append(panel.container); const sidebar=document.querySelector('#sidebar-content');sidebar.className='linux-note-git-source-control'; sidebar.append(panel.workbench.sidebar);panel.open();
  })()`);
  await wait('panel.container.dataset.state === "ready"');
  const results = [];
  const record = (name, value) => {assert(value, name);results.push(name);};
  await evaluate(`window.independent=document.createElement('input');independent.id='independent';independent.style.cssText='position:fixed;top:5px;right:10px;width:180px;z-index:10';document.body.append(independent);
    window.independent_clicks=0;independent.addEventListener('click',()=>independent_clicks++);
    window.saved_run=panel.writer.run;window.release_write=null;
    panel.writer.run=async (...args)=>{const result=await saved_run(...args);if(args[1][0]==='branch')await new Promise(resolve=>release_write=resolve);return result;};
    panel.action_dialog('branch_create','commit','',panel.state.head,{branch:'responsive-branch',checkout:false});`);
  await click('[data-git-execute]');await wait('panel.writing && !!release_write');
  record('accepted Git action releases modal before command completes',await evaluate('!document.querySelector(".git-graph-dialog-shade")'));
  await click('#independent');test_window.webContents.sendInputEvent({type:'char',keyCode:'x'});await delay(40);
  record('real mouse and keyboard work outside pending Git',await evaluate('independent_clicks===1&&independent.value==="x"&&panel.writing'));
  await evaluate('release_write()');await wait('!panel.writing&&!panel.pending');await evaluate('void (panel.writer.run=saved_run)');
  record('real branch command completes once',git(['branch','--list','responsive-branch']).trim()==='responsive-branch');
  const metrics = await evaluate(`(async()=>{
    const intervals=[];let last=performance.now();const timer=setInterval(()=>{const now=performance.now();intervals.push(now-last);last=now;},8);
    const saved=panel.workbench.groups_state;const files=Array.from({length:50000},(_,index)=>({path:'folder/file-'+String(index).padStart(5,'0')+'.md',status:'??'}));
    const wait=()=>new Promise(resolve=>setTimeout(resolve,25));await wait();
    const started=performance.now();panel.workbench.groups_state=[{id:'changes',title:'更改',from:'INDEX',to:'WORKTREE',files}];panel.workbench.render_groups();await wait();
    const render_ms=performance.now()-started;
    const nodes=panel.workbench.groups.querySelectorAll('[data-file]').length;
    panel.workbench.groups.scrollTop=panel.workbench.groups.scrollHeight;await wait();
    const last_visible=!!panel.workbench.groups.querySelector('[data-file="folder/file-49999.md"]');
    panel.workbench.groups.scrollTop=0;await wait();const row=panel.workbench.groups.querySelector('[data-file]');row.focus();row.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));await wait();
    const keyboard_last=document.activeElement.dataset.file==='folder/file-49999.md';
    panel.workbench.tree=true;panel.workbench.groups.scrollTop=0;panel.workbench.render_groups();await wait();
    const directory=panel.workbench.groups.querySelector('.git-scm-virtual-directory');directory.click();await wait();const collapsed=panel.workbench.groups.querySelectorAll('[data-file]').length===0;directory.click();await wait();
    panel.workbench.tree=false;
    let peak_nodes=0;
    for(let i=0;i<20;i++){panel.workbench.render_groups();await wait();peak_nodes=Math.max(peak_nodes,panel.workbench.groups.querySelectorAll('[data-file]').length);}
    panel.files=files;panel.from='INDEX';panel.to='WORKTREE';const detail=document.createElement('div');detail.style.cssText='height:240px;overflow:auto';document.querySelector('#editors').prepend(detail);panel.render_files(detail);await wait();const detail_nodes=detail.querySelectorAll('[data-file]').length;detail.scrollTop=detail.scrollHeight;await wait();const detail_last=!!detail.querySelector('[data-file="folder/file-49999.md"]');panel.close_details();detail.remove();
    const history_target=document.createElement('div');panel.workbench.history.list.replaceChildren(history_target);panel.workbench.history.render_files(history_target,panel.state.commits[0],files);await wait();const history_nodes=history_target.querySelectorAll('[data-history-file]').length;panel.workbench.history.list.scrollTop=panel.workbench.history.list.scrollHeight;await wait();const history_last=!!history_target.querySelector('[data-history-file="folder/file-49999.md"]');panel.workbench.history.reset();
    panel.workbench.groups_state=saved;panel.workbench.render_groups();await wait();clearInterval(timer);
    intervals.sort((a,b)=>a-b);return {render_ms,nodes,last_visible,keyboard_last,collapsed,peak_nodes,detail_nodes,detail_last,history_nodes,history_last,max_ms:intervals.at(-1),p95_ms:intervals[Math.floor(intervals.length*.95)],samples:intervals.length};
  })()`);
  record('50k SCM rows bounded without truncating last file',metrics.nodes>0&&metrics.nodes<150&&metrics.last_visible);
  record('keyboard can reach final row',metrics.keyboard_last);
  record('large tree collapses without dropping source data',metrics.collapsed);
  record('20 refreshes keep DOM bounded',metrics.peak_nodes<150);
  record('Graph details share bounded list and retain last file',metrics.detail_nodes>0&&metrics.detail_nodes<150&&metrics.detail_last);
  record('history file expansion shares bounded list and retains final file',metrics.history_nodes>0&&metrics.history_nodes<150&&metrics.history_last);
  record('50k workload event-loop P95 under 100ms and max under 500ms',metrics.p95_ms<100&&metrics.max_ms<500);
  const empty=fs.mkdtempSync(path.join(os.tmpdir(),'typora_git_empty_'));
  try {
    await evaluate(`panel.switch_repo(${JSON.stringify(empty)})`);await wait('!panel.pending');
    record('empty folder clears previous repository and exposes initialize',await evaluate('!panel.state&&panel.container.dataset.state==="empty"&&panel.workbench.groups.childElementCount===0&&[...panel.workbench.sidebar.querySelectorAll("button")].some(button=>button.textContent==="初始化仓库"&&!button.closest("[hidden]"))'));
    record('welcome remains exclusive when section preferences change',await evaluate(`(()=>{panel.workbench.show_repositories=true;panel.workbench.apply_history_layout();return panel.workbench.sections.hidden&&panel.workbench.repositories_view.hidden&&getComputedStyle(panel.workbench.sections).display==='none';})()`));
    await evaluate(`window.init_run=panel.writer.run;window.fail_init=null;panel.writer.run=async(...args)=>{if(args[1][0]==='init')await new Promise((resolve,reject)=>fail_init=()=>reject(Error('fixture init permission denied')));return init_run(...args);};void 0;`);
    await click('.git-scm-welcome button[data-workspace-interaction="primary"]');await wait('panel.writing&&!!fail_init');
    record('initialization progress visible in SCM title with duplicate action disabled',await evaluate(`panel.workbench.title.getAttribute('aria-busy')==='true'&&!panel.workbench.title.querySelector('[role=progressbar]').hidden&&panel.workbench.sidebar.querySelector('.git-scm-welcome button').disabled&&!document.querySelector('.git-graph-dialog-shade')`));
    await click('#independent');test_window.webContents.sendInputEvent({type:'char',keyCode:'y'});await delay(40);
    record('slow initialization leaves other module interactive',await evaluate('independent.value.length===2&&independent.value.includes("x")&&independent.value.includes("y")&&document.activeElement===independent&&panel.writing'));
    await evaluate('fail_init()');await wait('!panel.writing');
    record('initialization error visible and retry available',await evaluate(`panel.workbench.notice.closest('.git-scm-welcome')&&!panel.workbench.notice.closest('[hidden]')&&panel.workbench.notice.textContent.includes('fixture init permission denied')&&!panel.workbench.sidebar.querySelector('.git-scm-welcome button').disabled`));
    const geometry=await evaluate(`(()=>{const view=panel.workbench.sidebar.querySelector('.git-scm-welcome'),button=view.querySelector('button'),styles=getComputedStyle(view),b=getComputedStyle(button);return {padding:styles.paddingLeft,opacity:styles.opacity,button_width:button.getBoundingClientRect().width,view_width:view.clientWidth,font_size:b.fontSize,line_height:b.lineHeight};})()`);
    console.log('welcome geometry',JSON.stringify(geometry));
    record('welcome uses upstream inset and undimmed primary button',geometry.padding==='20px'&&geometry.opacity==='1'&&geometry.button_width<=300&&geometry.button_width<=geometry.view_width-40&&geometry.font_size==='12px'&&geometry.line_height==='16px');
    record('initialize and commit share primary theme role',await evaluate(`(()=>{const init=panel.workbench.sidebar.querySelector('.git-scm-welcome button'),commit=panel.workbench.sidebar.querySelector('.git-scm-commit');return getComputedStyle(init).backgroundColor==='rgb(0, 120, 212)'&&getComputedStyle(init).backgroundColor===getComputedStyle(commit).backgroundColor&&getComputedStyle(init).color===getComputedStyle(commit).color;})()`));
    await capture('welcome-init-failed');
    for (const theme of ['light','dark']) for (const width of [180,260,480]) {
      await evaluate(`document.documentElement.dataset.workspaceFileIconTheme=${JSON.stringify(theme)};document.querySelector('#sidebar-content').style.width=${JSON.stringify(width+'px')};`);
      for (const zoom of [.8,1.25]) {
        test_window.webContents.setZoomFactor(zoom);await delay(40);
        record('welcome fits '+theme+'/'+width+'/'+zoom,await evaluate(`(()=>{const root=panel.workbench.sidebar.querySelector('.git-scm-welcome'),button=root.querySelector('button'),b=button.getBoundingClientRect(),r=root.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&root.scrollWidth<=root.clientWidth+1&&button.scrollWidth<=button.clientWidth+1&&getComputedStyle(button).opacity==='1'&&getComputedStyle(button).borderRadius==='4px';})()`));
      }
      if(width===180)await capture('welcome-'+theme+'-narrow');
    }
    test_window.webContents.setZoomFactor(1);
    await evaluate(`document.documentElement.dataset.workspaceFileIconTheme='light';document.querySelector('#sidebar-content').style.width='260px';`);
    await evaluate('void (panel.writer.run=init_run)');
    // 已连接到真实Chromium焦点，Enter必须走按钮默认click而非直接调用初始化方法。
    await evaluate(`panel.workbench.sidebar.querySelector('.git-scm-welcome button').focus()`);await key('Enter');await wait('panel.loaded&&!panel.pending&&!panel.writing');
    record('UI initialize creates empty real repository',fs.existsSync(path.join(empty,'.git'))&&await evaluate('!panel.state.head&&panel.container.dataset.state==="ready"'));
    record('ready restores original notice owner and sections',await evaluate(`panel.workbench.notice.parentElement===panel.workbench.changes_body&&!panel.workbench.sections.hidden&&panel.workbench.sidebar.querySelector('.git-scm-welcome').hidden`));
    await evaluate(`window.read_run=panel.runner.run;panel.runner.run=async()=>{throw Error('fixture git executable unavailable');};void 0;`);
    await evaluate('panel.refresh()');await wait('!panel.pending');
    record('read error has retry but never initializes over a failure',await evaluate(`panel.workbench.sidebar.dataset.repositoryState==='error'&&panel.workbench.sections.hidden&&panel.workbench.notice.textContent.includes('fixture git executable unavailable')&&[...panel.workbench.sidebar.querySelectorAll('.git-scm-welcome button')].filter(button=>!button.hidden).map(button=>button.textContent).join()==='重试'`));
    await evaluate('void (panel.runner.run=read_run)');await click('.git-scm-welcome button:not([hidden])');await wait('panel.loaded&&!panel.pending');
    record('read retry restores real repository',await evaluate(`panel.workbench.sidebar.dataset.repositoryState==='ready'`));
    await evaluate(`panel.switch_repo(${JSON.stringify(root)})`);await wait('panel.loaded&&!panel.pending');
  } finally {assert(path.dirname(empty)===path.resolve(os.tmpdir())&&path.basename(empty).startsWith('typora_git_empty_'));fs.rmSync(empty,{recursive:true,force:true});}
  await evaluate('panel.dispose()');
  console.log(JSON.stringify({status:'PASS',results,metrics},null,2));
  fs.writeFileSync(path.join(evidence,'responsiveness.json'),JSON.stringify({status:'PASS',results,metrics},null,2));
  test_window.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
