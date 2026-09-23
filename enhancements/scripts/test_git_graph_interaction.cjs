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
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_graph_ui_'));
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
  // 底部终端保留中央 Graph 的活动叶子；真实窗口捕获必须按事件目标归还输入。
  const keyboard_ownership = await evaluate(`(() => {
    const results=[],record=(name,passed,detail={})=>results.push({name,passed,...detail});
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname, '../node_modules/@xterm/xterm/css/xterm.css'), 'utf8'))};document.head.append(style);
    const writes=[],surface=new graph_qa.terminal_surface(graph_qa.terminal_defaults,{input:data=>writes.push(data),resize(){},copy:async()=>{},active(){},error:error=>{throw error;}});
    surface.container.style.cssText='position:fixed;left:260px;right:0;bottom:0;height:180px;z-index:100;background:white';surface.viewport.style.cssText='height:140px;width:100%';document.body.append(surface.container);surface.mount();
    const original_tabindex=panel.container.getAttribute('tabindex');panel.container.tabIndex=-1;
    let target_reached=0,default_before_target=false;
    const observe=event=>{target_reached++;default_before_target=event.defaultPrevented;};document.addEventListener('keydown',observe,true);
    const send=(target,key,options={})=>{target_reached=0;default_before_target=false;const key_code=key==='Escape'?27:key==='Enter'?13:key.toUpperCase().charCodeAt(0);const event=new KeyboardEvent('keydown',{key,keyCode:key_code,bubbles:true,cancelable:true,...options});target.dispatchEvent(event);return {reached:target_reached===1,default_before_target,default_prevented:event.defaultPrevented};};
    try{
      surface.focus();record('底部终端获焦时中央 Graph 仍为活动叶子',core.app.workspace.activeLeaf===graph_leaf&&panel.active&&document.activeElement===surface.term.textarea);
      panel.close_find();surface.focus();let event=send(surface.term.textarea,'f',{code:'KeyF',ctrlKey:true});
      record('终端 Ctrl+F 到达 xterm 且不打开 Graph 查找',event.reached&&!event.default_before_target&&panel.find_widget.dataset.open==='false'&&document.activeElement===surface.term.textarea&&writes.at(-1)==='\u0006',{event,find_open:panel.find_widget.dataset.open,focused:document.activeElement.className,writes:[...writes]});
      panel.open_find();surface.focus();event=send(surface.term.textarea,'Escape',{code:'Escape'});
      record('终端 Escape 到达 xterm 且不关闭 Graph 查找',event.reached&&!event.default_before_target&&panel.find_widget.dataset.open==='true'&&document.activeElement===surface.term.textarea&&writes.at(-1)==='\u001b',{event,find_open:panel.find_widget.dataset.open,writes:[...writes]});
      panel.open_find();surface.find();const find_input=surface.container.querySelector('.terminal-find input');event=send(find_input,'Enter',{code:'Enter'});
      record('终端查找 Enter 保留 Graph 和当前输入焦点',event.reached&&panel.find_widget.dataset.open==='true'&&document.activeElement===find_input);
      event=send(find_input,'Escape',{code:'Escape'});record('终端查找 Escape 只关闭自己的查找',event.reached&&panel.find_widget.dataset.open==='true'&&surface.container.querySelector('.terminal-find').hidden&&document.activeElement===surface.term.textarea);
      for(const flags of [{isComposing:true},{keyCode:229}]){
        for(const key of ['f','r','Escape']){
          panel.close_find();panel.container.focus();const epoch=panel.epoch;event=send(panel.container,key,{code:key==='Escape'?'Escape':'Key'+key.toUpperCase(),ctrlKey:key!=='Escape',...flags});
          record('Graph 输入法事件不执行 '+key+' '+JSON.stringify(flags),event.reached&&!event.default_prevented&&panel.find_widget.dataset.open==='false'&&panel.epoch===epoch&&document.activeElement===panel.container,{event,epoch_before:epoch,epoch_after:panel.epoch});
        }
      }
      panel.close_find();panel.container.focus();event=send(panel.container,'f',{code:'KeyF',ctrlKey:true});record('Graph 自己的 Ctrl+F 正常打开并聚焦查找',event.default_prevented&&panel.find_widget.dataset.open==='true'&&document.activeElement===panel.search);
      event=send(panel.search,'Escape',{code:'Escape'});record('Graph 自己的 Escape 正常关闭查找',event.default_prevented&&panel.find_widget.dataset.open==='false');
      return results;
    }finally{document.removeEventListener('keydown',observe,true);surface.dispose();style.remove();panel.close_find();if(original_tabindex===null)panel.container.removeAttribute('tabindex');else panel.container.setAttribute('tabindex',original_tabindex);}
  })()`);
  fs.writeFileSync(path.join(evidence,'keyboard_ownership.json'),JSON.stringify(keyboard_ownership,null,2),'utf8');
  assert(keyboard_ownership.every(item=>item.passed),'Graph/终端捕获输入归属失败：'+JSON.stringify(keyboard_ownership.filter(item=>!item.passed)));
  await wait('!panel.pending');
  // 仓库选择器只在存在多个仓库时出现；刷新不得恢复关闭的详情。
  assert(await evaluate('panel.repo_select.closest("label").hidden'));
  await evaluate('panel.save_repos([panel.root,panel.root+"/second"]);panel.refresh(false)');
  assert(await evaluate('!panel.repo_select.closest("label").hidden && panel.repo_select.options.length === 3'));
  await evaluate('panel.save_repos([panel.root]);panel.refresh(false)');
  assert(await evaluate('panel.repo_select.closest("label").hidden'));
  const assert_closed = async () => assert(await evaluate('!panel.selected && !panel.to && panel.from === "EMPTY" && panel.files.length === 0 && !panel.details.isConnected && [...panel.list.querySelectorAll("[data-hash]")].every(row=>row.getAttribute("aria-pressed") === "false")'));
  for (const selector of ['.git-graph-row:not(.git-graph-worktree)', '.git-graph-worktree']) {
    for (const activation of ['click','Enter','Space']) {
      const activate = async () => { if (activation === 'click') await click(selector); else { await evaluate('document.querySelector('+JSON.stringify(selector)+').focus()'); await key(activation); } };
      await activate(); await wait('panel.details.isConnected && panel.files.length > 0');
      await activate(); await assert_closed();
      await activate(); await wait('panel.details.isConnected && panel.files.length > 0');
      await activate(); await assert_closed();
    }
  }
  // 使用可控延迟的真实 Git 响应验证关闭后旧比较不会写回文件状态。
  await evaluate(`window.real_graph_run=panel.runner.run;window.delayed_graph_release=null;window.delayed_graph_done=false;
    panel.runner.run=async (...args)=>{const output=await window.real_graph_run(...args);if(args[1][0]==='diff'){await new Promise(resolve=>window.delayed_graph_release=resolve);}return output;};
    panel.selected=panel.state.commits[0].hash;void panel.show_comparison(panel.state.commits[0].parents[0],panel.selected).finally(()=>window.delayed_graph_done=true);`);
  await wait('!!window.delayed_graph_release'); await evaluate('panel.close_details();window.delayed_graph_release()');
  await wait('window.delayed_graph_done'); await assert_closed(); await evaluate('void (panel.runner.run=window.real_graph_run)');
  // Ctrl/Meta 比较不得收起，键盘激活与鼠标采用相同状态转换。
  for (const modifier of ['ctrlKey','metaKey']) {
    await evaluate(`panel.select_commit(panel.state.commits[0]);document.querySelectorAll('.git-graph-row:not(.git-graph-worktree)')[1].dispatchEvent(new MouseEvent('click',{bubbles:true,${modifier}:true}))`);
    await wait('panel.files.length > 0');
    assert(await evaluate('panel.from === panel.state.commits[0].hash && panel.to === panel.state.commits[1].hash && panel.details.isConnected'));
    await evaluate(`document.querySelector('.git-graph-worktree').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,${modifier}:true}))`);
    await wait('panel.to === "WORKTREE" && panel.files.length > 0');
    await evaluate('panel.close_details()'); await assert_closed();
  }
  assert(await evaluate('panel.workbench.title.querySelectorAll("button").length===1&&!!panel.workbench.history.header.querySelector(".git-scm-history-more-menu")'));
  assert(await evaluate('!panel.workbench.title.querySelector(".git-scm-title-graph")&&!!panel.workbench.history.header.querySelector(".git-scm-history-refresh")'));
  await click('.git-scm-title','right'); assert(await evaluate('!!document.querySelector("[data-action=show_history]")')); await key('Escape');
  const date_metrics = await evaluate('(() => {const commit={date:new Date(Date.now()-300000).toISOString()};panel.settings.date_format="relative";const relative=panel.date(commit);panel.settings.date_format="iso_date";const iso=panel.date(commit);panel.settings.date_format="local";return {relative,iso};})()');
  assert(date_metrics.relative.includes('5') && date_metrics.relative.includes('分钟')); assert(/^\d{4}-\d{2}-\d{2}$/.test(date_metrics.iso));
  const ui_metrics = await evaluate(`(() => {document.documentElement.style.setProperty('--linux-note-ui-font-size','15px');document.documentElement.style.setProperty('--linux-note-ui-font-family','Verdana');const graph=getComputedStyle(panel.container),scm=getComputedStyle(document.querySelector('#sidebar-content'));const result={graph_size:graph.fontSize,graph_family:graph.fontFamily,scm_size:scm.fontSize,scm_family:scm.fontFamily};document.documentElement.style.removeProperty('--linux-note-ui-font-size');document.documentElement.style.removeProperty('--linux-note-ui-font-family');return result;})()`);
  assert.deepEqual(ui_metrics,{graph_size:'15px',graph_family:'Verdana',scm_size:'15px',scm_family:'Verdana'});
  const icon_metrics = await evaluate(`(() => {
    const icons=[...panel.workbench.sidebar.querySelectorAll('svg.git-standard-icon')].map(icon=>({name:icon.dataset.gitIcon,width:getComputedStyle(icon).width,height:getComputedStyle(icon).height,view_box:icon.getAttribute('viewBox'),aria_hidden:icon.getAttribute('aria-hidden'),text:icon.textContent.trim(),paths:icon.querySelectorAll('path').length}));
    const controls=[...panel.workbench.sidebar.querySelectorAll('button.git-icon-button')].map(button=>({text:button.textContent.trim(),title:button.title,label:button.getAttribute('aria-label'),history_action:button.dataset.historyAction,icon:button.querySelector('svg.git-standard-icon')?.dataset.gitIcon}));
    const graph_controls=[...panel.toolbar.querySelectorAll('.git-graph-toolbar-actions > button')].map(button=>{const box=button.getBoundingClientRect(),icon=button.querySelector('svg');return {width:box.width,height:box.height,text:button.textContent.trim(),title:button.title,label:button.getAttribute('aria-label'),icon:icon?.dataset.gitIcon,icon_width:getComputedStyle(icon).width,icon_height:getComputedStyle(icon).height};});
    return {icons,controls,graph_controls};
  })()`);
  assert(icon_metrics.icons.length>=20); assert(icon_metrics.controls.length>=15);
  for (const icon of icon_metrics.icons) { assert(['12px','16px'].includes(icon.width)); assert(['12px','16px'].includes(icon.height)); assert(['0 0 16 16','0 0 24 24'].includes(icon.view_box)); assert.equal(icon.aria_hidden,'true'); assert.equal(icon.text,''); assert(icon.paths>0); }
  for (const control of icon_metrics.controls) { if(control.history_action==='branches')assert.equal(control.text,'全部');else assert.equal(control.text,''); assert.equal(control.label,control.title); assert(/[\u3400-\u9fff]/u.test(control.title)); assert(control.icon); }
  assert.deepEqual(icon_metrics.graph_controls.map(control=>control.icon),['search','terminal','settings-gear','git-fetch','refresh']);
  for (const control of icon_metrics.graph_controls) { const icon_size=control.icon==='refresh'?CLASSIC_GIT_GRAPH_METRICS.refresh_icon_size:CLASSIC_GIT_GRAPH_METRICS.toolbar_icon_size; assert.equal(control.width,CLASSIC_GIT_GRAPH_METRICS.toolbar_action_size); assert.equal(control.height,CLASSIC_GIT_GRAPH_METRICS.toolbar_action_size); assert.equal(control.text,''); assert.equal(control.title,control.label); assert.equal(control.icon_width,icon_size+'px'); assert.equal(control.icon_height,icon_size+'px'); }
  for (const [selector,name] of [['.git-scm-view-menu','more'],['.git-scm-operation-menu','more'],['.git-scm-commit-options','chevron-down'],['.git-scm-history-branches','git-branch'],['.git-scm-history-head','target'],['.git-scm-history-refresh','refresh'],['[data-history-action=fetch]','git-fetch'],['[data-history-action=pull]','repo-pull'],['[data-history-action=push]','cloud-upload'],['[data-scm-group=changes] > summary .git-scm-inline-action','diff-multiple']]) {
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').querySelector("[data-git-icon]").dataset.gitIcon'),name);
  }
  // 顶部菜单控制三个真实视图；隐藏后的布局必须能从持久化状态恢复。
  const saved_layout = () => evaluate('JSON.parse(localStorage.getItem(panel.workbench.storage_key("layout")))');
  const toggle_view = async name => { await click('.git-scm-view-menu'); await click('[data-action="'+name+'"]'); };
  assert(await evaluate('panel.workbench.repositories_view.hidden && !panel.workbench.changes_pane.hidden && !panel.workbench.history.container.hidden'));
  await toggle_view('show_repositories');
  assert(await evaluate('!panel.workbench.repositories_view.hidden && panel.workbench.repositories.container.querySelector("[data-active=true]").dataset.root === panel.root'));
  await toggle_view('show_changes'); await toggle_view('show_history');
  assert(await evaluate('panel.workbench.sections.hidden && panel.workbench.changes_pane.hidden && panel.workbench.history.container.hidden'));
  assert.deepEqual(Object.fromEntries(Object.entries(await saved_layout()).filter(([name])=>name.startsWith('show_'))), {show_repositories:true,show_changes:false,show_history:false});
  await click('.git-scm-view-menu'); assert(await evaluate('document.querySelector("[data-action=show_repositories]").disabled'));
  assert(await evaluate('document.querySelector("[data-action=show_repositories] .git-menu-check [data-git-icon=check]") && [...document.querySelectorAll(".git-graph-menu button")].every(button=>button.textContent.trim()===button.querySelector(".git-menu-label").textContent.trim())'));
  await capture('source_control_views'); await key('Escape');
  await evaluate('panel.workbench.show_repositories=false;panel.workbench.show_changes=true;panel.workbench.show_history=true;panel.workbench.load_layout()');
  assert(await evaluate('panel.workbench.show_repositories && !panel.workbench.show_changes && !panel.workbench.show_history && panel.workbench.sections.hidden'));
  await toggle_view('show_changes'); await toggle_view('show_history'); await toggle_view('show_repositories');
  assert.deepEqual(Object.fromEntries(Object.entries(await saved_layout()).filter(([name])=>name.startsWith('show_'))), {show_repositories:false,show_changes:true,show_history:true});
  // 输入区折叠不隐藏 Git 操作入口；提交下拉传递草稿和 amend 状态，不提前执行 Git。
  assert.equal(await evaluate('panel.workbench.message.getBoundingClientRect().height'),30);
  await check_disclosure('.git-scm-input-heading',true);
  await click('.git-scm-input-title'); await wait('!panel.workbench.input_section.open');
  await check_disclosure('.git-scm-input-heading',false);
  assert.equal((await saved_layout()).input_open,false);
  assert(await evaluate('document.querySelector(".git-scm-operation-menu").getBoundingClientRect().height > 0'));
  await evaluate('panel.workbench.load_layout()'); assert(!await evaluate('panel.workbench.input_section.open'));
  await click('.git-scm-input-title'); await wait('panel.workbench.input_section.open'); assert.equal((await saved_layout()).input_open,true);
  await check_disclosure('.git-scm-input-heading',true);
  await check_disclosure('[data-scm-group=changes] > summary',true);
  await click('[data-scm-group=changes] .git-scm-group-label'); await check_disclosure('[data-scm-group=changes] > summary',false);
  await click('[data-scm-group=changes] .git-scm-group-label'); await check_disclosure('[data-scm-group=changes] > summary',true);
  const hover_metrics = {};
  for (const selector of ['.git-scm-commit','.git-scm-commit-options']) {
    const colors = await hover(selector); assert.equal(colors.background,'rgb(0, 108, 190)'); assert.equal(colors.color,'rgb(255, 255, 255)'); hover_metrics[selector]=colors;
  }
  const before_options = git(['rev-parse','HEAD']);
  await click('.git-scm-message'); await test_window.webContents.insertText('下拉菜单草稿'); await key('Enter'); await test_window.webContents.insertText('第二行');
  assert(await evaluate('panel.workbench.message.getBoundingClientRect().height > 30'));
  await click('.git-scm-commit-options'); await capture('source_control_commit_options'); await click('[data-action=commit_options]');
  assert.equal(await evaluate('document.querySelector("[data-field=message]").value'),'下拉菜单草稿\n第二行');
  assert(!await evaluate('document.querySelector("[data-field=amend]").checked')); await key('Escape');
  await click('.git-scm-commit-options'); await click('[data-action=commit_amend]');
  assert(await evaluate('document.querySelector("[data-field=amend]").checked')); await key('Escape');
  assert.equal(git(['rev-parse','HEAD']),before_options);
  assert.equal(await evaluate('panel.workbench.message.value'),'下拉菜单草稿\n第二行');
  await evaluate('panel.workbench.message.value="";panel.workbench.message.dispatchEvent(new Event("input",{bubbles:true}));panel.workbench.refresh()');
  await evaluate('panel.remotes_dialog()');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".git-graph-repo-entry button")].map(button=>button.textContent)'),['修改获取地址','修改推送地址','获取远端更新','清理过期引用','删除']); await key('Escape');
  await click('.git-graph-show-remote-input'); await wait('!panel.pending && panel.settings.show_remotes === false');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(graph_qa.GRAPH_SETTINGS_KEY + "settings:" + panel.root)).show_remotes'),false);
  await click('.git-graph-show-remote-input'); await wait('!panel.pending && panel.settings.show_remotes === true');
  await evaluate('panel.branch_select.value="__multiple__";panel.branch_select.dispatchEvent(new Event("change",{bubbles:true}))');
  assert(await evaluate('document.querySelector("[data-linux-note-git-ref-picker=ready]").getAttribute("aria-label") === "选择一个或多个分支" && document.querySelector(".git-scm-ref-list").getAttribute("aria-multiselectable")==="true" && document.querySelectorAll(".git-scm-ref-list [role=option][data-git-ref^=refs]").length >= 3')); await key('Escape');await wait('!document.querySelector("[data-linux-note-git-ref-picker=ready]")');
  const classic_metrics = await evaluate(`(() => {
    const toolbar=panel.toolbar.getBoundingClientRect(),header=panel.header.getBoundingClientRect(),rows=[...panel.list.querySelectorAll('.git-graph-row')],columns=[...panel.header.children].map(column=>column.firstChild.textContent),actions=[...panel.toolbar.querySelectorAll('.git-graph-toolbar-actions > button')].map(button=>button.getBoundingClientRect().toJSON());
    const referenced=rows.find(row=>row.querySelector('.git-graph-refs'));
    const ref=referenced?.querySelector('.git-graph-refs'),ref_style=ref?getComputedStyle(ref):null;
    return {toolbar_height:toolbar.height,header_height:header.height,columns,row_heights:rows.map(row=>row.getBoundingClientRect().height),ref_height:ref?.getBoundingClientRect().height,ref_radius:ref_style?parseFloat(ref_style.borderRadius):null,actions,body_children:[...panel.body.children].map(node=>node.className),referenced_head:referenced?.dataset.head==="true",referenced_order:referenced?[...referenced.querySelector('.git-graph-subject').children].map(node=>node.className):[],legacy_controls:[...panel.toolbar.querySelectorAll('button')].map(button=>button.textContent.trim()).filter(Boolean)};
  })()`);
  assert.equal(classic_metrics.toolbar_height,CLASSIC_GIT_GRAPH_METRICS.toolbar_height); assert.equal(classic_metrics.header_height,CLASSIC_GIT_GRAPH_METRICS.header_height); assert.deepEqual(classic_metrics.columns,CLASSIC_GIT_GRAPH_METRICS.columns);
  assert(classic_metrics.row_heights.length>=4 && classic_metrics.row_heights.every(height=>height===CLASSIC_GIT_GRAPH_METRICS.row_height)); assert.equal(classic_metrics.ref_height,CLASSIC_GIT_GRAPH_METRICS.ref_height); assert.equal(classic_metrics.ref_radius,CLASSIC_GIT_GRAPH_METRICS.ref_radius); assert.deepEqual(classic_metrics.body_children,['git-graph-list']);
  assert.deepEqual(classic_metrics.referenced_order,[...(classic_metrics.referenced_head?['git-graph-head-dot']:[]),'git-graph-labels','git-graph-subject-text']); assert.deepEqual(classic_metrics.legacy_controls,[]);
  assert(classic_metrics.actions.every(box=>box.width===CLASSIC_GIT_GRAPH_METRICS.toolbar_action_size && box.height===CLASSIC_GIT_GRAPH_METRICS.toolbar_action_size && box.y===classic_metrics.actions[0].y));

  assert(await evaluate('(()=>{const rows=[...panel.list.querySelectorAll(".git-graph-row")];return rows.every((row,index)=>{const svg=row.querySelector(":scope>svg,:scope>.git-graph-cell>svg"),dot=svg?.querySelector("circle");return svg?.getBoundingClientRect().height===24&&dot?.getAttribute("cy")==="12"&&(!index||row.getBoundingClientRect().top-rows[index-1].getBoundingClientRect().top===24)})})()'),'24px graph SVGs share row boundaries and put nodes on the 12px centerline');
  assert(classic_metrics.actions.every((box,index)=>!index||box.x-classic_metrics.actions[index-1].x===30),'20px toolbar hitboxes retain upstream 30px horizontal spacing');
  await click('.git-graph-row:not(.git-graph-worktree)'); await wait('!!document.querySelector(".git-graph-file")');
  const file_geometry = await evaluate('(() => {const file=panel.details.querySelector(".git-graph-file"),style=getComputedStyle(file);return {height:file.getBoundingClientRect().height,border:style.borderTopWidth,radius:style.borderRadius,margin:style.marginTop};})()');
  assert.deepEqual(file_geometry,{height:18,border:'0px',radius:'4px',margin:'4px'});
  const inline_metrics = await evaluate(`(() => {const node=panel.details,details=node.getBoundingClientRect(),summary=node.querySelector('.git-graph-detail-summary').getBoundingClientRect(),files=node.querySelector('.git-graph-detail-files').getBoundingClientRect(),controls_node=node.querySelector('.git-graph-detail-controls'),controls=controls_node.getBoundingClientRect(),buttons=[...controls_node.querySelectorAll('button')].map(button=>button.getBoundingClientRect().toJSON()),icons=[...controls_node.querySelectorAll('[data-git-icon]')];return {previous:node.previousElementSibling?.dataset.hash,selected:panel.selected,width:details.width,height:details.height,summary:summary.width,files:files.width,controls:controls.width,button_sizes:buttons.map(box=>[box.width,box.height]),icon_sizes:icons.map(icon=>[parseFloat(getComputedStyle(icon).width),parseFloat(getComputedStyle(icon).height)]),body_sash:!!panel.body.querySelector('.linux-note-workspace-sash'),icons:icons.map(icon=>icon.dataset.gitIcon)};})()`);
  assert.equal(inline_metrics.previous,inline_metrics.selected); assert.equal(inline_metrics.height,INLINE_DETAIL_HEIGHT); assert(Math.abs(inline_metrics.summary-inline_metrics.files)<2); assert.equal(inline_metrics.controls,CLASSIC_GIT_GRAPH_METRICS.detail_controls_width); assert(inline_metrics.button_sizes.every(size=>size[0]===CLASSIC_GIT_GRAPH_METRICS.detail_action_size&&size[1]===CLASSIC_GIT_GRAPH_METRICS.detail_action_size)); assert(inline_metrics.icon_sizes.every(size=>size[0]===CLASSIC_GIT_GRAPH_METRICS.detail_icon_size&&size[1]===CLASSIC_GIT_GRAPH_METRICS.detail_icon_size)); assert(!inline_metrics.body_sash); assert(inline_metrics.icons.includes('close') && inline_metrics.icons.includes('list-tree') && inline_metrics.icons.includes('list-flat'));
  await wait('panel.details.querySelector(".git-graph-message")?.textContent.includes(panel.state.commits.find(c=>c.hash===panel.to).subject)');
  const detail_topology = await evaluate(`(() => {const node=panel.details,row=node.previousElementSibling,next=node.nextElementSibling,rail=node.querySelector('.git-graph-detail-rail'),svg=row.querySelector('.git-graph-cell>svg,:scope>svg'),box=rail.getBoundingClientRect(),paths=[...rail.querySelectorAll('path')],outgoing=[...svg.querySelectorAll('path')].filter(path=>path.getPointAtLength(path.getTotalLength()).y===24);return {background:getComputedStyle(node).backgroundColor,aligned:Math.abs(node.querySelector('.git-graph-detail-content').getBoundingClientRect().left-row.querySelector('.git-graph-subject').getBoundingClientRect().left)<1,rail_top:box.top,row_bottom:row.getBoundingClientRect().bottom,rail_bottom:box.bottom,next_top:next.getBoundingClientRect().top,continuity:outgoing.every(edge=>paths.some(path=>path.getAttribute('stroke')===edge.getAttribute('stroke')&&path.getPointAtLength(0).x===edge.getPointAtLength(edge.getTotalLength()).x)),no_duplicate:!node.querySelector('.git-graph-commit-title,.git-graph-full-hash'),file_icons:[...node.querySelectorAll('[data-graph-file-icon]')].map(icon=>({name:icon.dataset.graphFileIcon,width:icon.getBoundingClientRect().width,height:icon.getBoundingClientRect().height,opacity:getComputedStyle(icon).opacity,source:icon.outerHTML.includes('Font Awesome Free')}))};})()`);
  assert.equal(detail_topology.background,'rgba(128, 128, 128, 0.1)'); assert(detail_topology.aligned && detail_topology.continuity && detail_topology.no_duplicate);
  assert.equal(detail_topology.rail_top,detail_topology.row_bottom); assert.equal(detail_topology.rail_bottom,detail_topology.next_top);
  assert(detail_topology.file_icons.every(icon=>icon.width===13&&icon.height===13&&icon.opacity==='0.6'&&icon.source));
  assert(await evaluate(`panel.details.querySelectorAll('.git-graph-file').length>0&&[...panel.details.querySelectorAll('.git-graph-file')].every(row=>{const icon=row.querySelector('.workspace-file-theme-icon');return icon&&icon.dataset.fileIconPath===row.dataset.file&&icon.getBoundingClientRect().width===16&&getComputedStyle(icon).opacity==='1'})`),'Changed Files uses Explorer file identity and full theme color');
  assert.deepEqual(await evaluate('(()=>{const style=getComputedStyle(panel.details.querySelector(".git-graph-parent"));return [style.height,style.paddingTop,style.paddingBottom,style.borderTopWidth]})()'),['18px','0px','0px','0px'],'parent comparison remains legible within its 18px metadata line');
  const detail_selected = await evaluate('panel.selected');
  await click('.git-graph-detail-divider'); await key('Right'); assert.equal(await evaluate('panel.selected'),detail_selected); assert.equal(await evaluate('panel.detail_summary_ratio'),.55); await key('Left');
  await evaluate('panel.list.scrollLeft=40;panel.list.scrollTop=30');
  assert(await evaluate('Math.abs(panel.details.querySelector(".git-graph-detail-rail").getBoundingClientRect().left-panel.details.previousElementSibling.querySelector(".git-graph-cell>svg").getBoundingClientRect().left)<1'));
  await evaluate('panel.list.scrollLeft=0;panel.list.scrollTop=0');
  await click('.git-graph-details + .git-graph-row'); await wait('panel.details.dataset.to === panel.selected && panel.files.length>0');
  assert.notEqual(await evaluate('panel.selected'),detail_selected); assert(await evaluate('panel.details.previousElementSibling.dataset.hash===panel.selected'));
  await click('.git-graph-list > [data-hash="'+detail_selected+'"]'); await wait('panel.details.dataset.to === panel.selected && panel.files.length>0');
  await evaluate('panel.refresh()'); await wait('panel.details.isConnected && panel.files.length>0'); assert.equal(await evaluate('panel.selected'),detail_selected);
  await evaluate('panel.branch_select.value="refs/heads/feature";panel.branch_select.dispatchEvent(new Event("change"))');
  await wait('!panel.pending && !panel.details.isConnected'); await assert_closed();
  await evaluate('panel.branch_select.value="";panel.branch_select.dispatchEvent(new Event("change"))');
  await wait('!panel.pending && panel.state.commits.length===4');
  await click('.git-graph-list > [data-hash="'+detail_selected+'"]'); await wait('panel.details.isConnected && panel.files.length>0');
  const responsive_metrics = [];
  for (const target_width of RESPONSIVE_EDITOR_WIDTHS) {
    await evaluate(`(() => {const editors=document.querySelector('#editors');editors.style.flex='0 0 ${target_width}px';editors.style.width='${target_width}px';})()`); await delay(80);
    responsive_metrics.push(await evaluate(`(() => {const editors=document.querySelector('#editors'),root=panel.container,list=panel.list,details=panel.details,content=details.querySelector('.git-graph-detail-content'),editor_box=editors.getBoundingClientRect(),root_box=root.getBoundingClientRect(),list_box=list.getBoundingClientRect(),detail_box=details.getBoundingClientRect();return {target_width:${target_width},editor_width:editor_box.width,editor_client_width:editors.clientWidth,editor_scroll_width:editors.scrollWidth,root_width:root_box.width,root_client_width:root.clientWidth,root_scroll_width:root.scrollWidth,list_width:list_box.width,list_client_width:list.clientWidth,list_scroll_width:list.scrollWidth,detail_width:detail_box.width,detail_right:detail_box.right,editor_right:editor_box.right,content_client_width:content.clientWidth,content_scroll_width:content.scrollWidth};})()`));
    await capture("git_graph_width_"+target_width);
  }
  for (const metric of responsive_metrics) { assert.equal(metric.editor_width,metric.target_width); assert.equal(metric.root_width,metric.target_width); assert.equal(metric.detail_width,metric.list_client_width); assert(metric.detail_right<=metric.editor_right+0.5); assert.equal(metric.editor_scroll_width,metric.editor_client_width); assert.equal(metric.root_scroll_width,metric.root_client_width); assert(metric.list_scroll_width>=metric.list_client_width); }
  assert.equal(responsive_metrics[0].content_scroll_width,responsive_metrics[0].content_client_width);
  assert.equal(responsive_metrics[1].content_scroll_width,responsive_metrics[1].content_client_width);
  await evaluate(`(() => {const editors=document.querySelector('#editors');editors.style.removeProperty('flex');editors.style.removeProperty('width');})()`); await delay(80);
  // 设置须改变实际列布局、标签排序和详情落点，而不只是保存字段。
  for (const column of ['date','author','hash']) {
    await click('.git-graph-columns','right'); await click('[data-action=show_'+column+']');
    assert(await evaluate('getComputedStyle(document.querySelector(".git-graph-'+column+'")).display === "none"'));
    await click('.git-graph-columns','right'); await click('[data-action=show_'+column+']');
    assert(await evaluate('getComputedStyle(document.querySelector(".git-graph-'+column+'")).display !== "none"'));
  }
  await evaluate('panel.settings.label_alignment="split";panel.render_history()');
  assert(await evaluate('!!panel.list.querySelector(".git-graph-subject > .git-graph-tag-labels .git-ref-tag")'));
  await evaluate('panel.settings.uncommitted_style="head";panel.render_history()');
  assert(await evaluate('getComputedStyle(panel.list.querySelector(".git-graph-worktree path")).strokeDasharray !== "none" && !!panel.list.querySelector(".git-graph-open-head circle")'));
  await evaluate('panel.settings.uncommitted_style="connected";panel.settings.details_location="docked";panel.render_history()');
  assert(await evaluate('panel.details.parentElement === panel.body && panel.details.getBoundingClientRect().bottom <= panel.body.getBoundingClientRect().bottom + 1'));
  await evaluate('panel.settings.details_location="inline";panel.settings.label_alignment="graph";panel.render_history()');
  assert(await evaluate('panel.details.previousElementSibling.dataset.hash === panel.selected && !!panel.list.querySelector(".git-graph-cell .git-graph-labels")'));
  await evaluate('panel.settings.label_alignment="normal";panel.render_history()'); await delay(120);
  await capture('classic_git_graph_inline_details');
  await click('.git-graph-file'); await wait('!!document.querySelector("[data-diff-ready=true]")'); await capture('default_diff'); await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"))'); await capture('history');
  const drag = async (selector, dx, dy) => {
    const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    test_window.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
    test_window.webContents.sendInputEvent({type:'mouseMove',x:point.x+dx,y:point.y+dy,button:'left'});
    test_window.webContents.sendInputEvent({type:'mouseUp',x:point.x+dx,y:point.y+dy,button:'left',clickCount:1}); await delay(200);
  };
  assert(!await evaluate('!!panel.body.querySelector(".linux-note-workspace-sash")'));
  assert.equal(await evaluate('document.querySelectorAll(".git-scm-history-commit").length'),4);
  assert.equal(await evaluate('document.querySelector(".git-scm-history-toggle").getAttribute("aria-expanded")'),'true');
  assert.equal(await evaluate('document.querySelectorAll(".git-scm-history-commit .git-scm-history-topology circle").length'),4);
  await check_disclosure('.git-scm-history-toggle',true); await check_disclosure('.git-scm-history-commit',false,false);
  hover_metrics.history_closed = await hover('.git-scm-history-commit'); assert.equal(hover_metrics.history_closed.background,'rgba(0, 0, 0, 0.08)');
  const changes_height = await evaluate('panel.workbench.changes_pane.clientHeight'); await drag('.git-scm-history-sash',0,-70);
  assert(await evaluate('panel.workbench.changes_pane.clientHeight') < changes_height-40);
  await click('.git-scm-history-toggle'); assert.equal(await evaluate('panel.workbench.sections.dataset.historyOpen'),'false');
  await check_disclosure('.git-scm-history-toggle',false);
  await click('.git-scm-history-toggle');
  if (!await evaluate('!!document.querySelector(".git-scm-history-commit[aria-expanded=true]")')) await click('.git-scm-history-commit');
  await wait('!!document.querySelector("[data-history-file]")'); await delay(150);
  await check_disclosure('.git-scm-history-toggle',true); await check_disclosure('.git-scm-history-commit[aria-expanded=true]',true,false);
  await click('[data-history-file]'); await wait('!!document.querySelector("[data-diff-ready=true]")');
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.models[1].getValue()'),git(['show','HEAD:example.md']));
  const selected_background = await evaluate('getComputedStyle(document.querySelector(".git-scm-history-commit[aria-expanded=true]")).backgroundColor');
  hover_metrics.history_selected = await hover('.git-scm-history-commit[aria-expanded=true]'); assert.equal(selected_background,'rgba(0, 0, 0, 0)'); assert.notEqual(hover_metrics.history_selected.background,selected_background);
  const file_background=await evaluate('getComputedStyle(document.querySelector("[data-history-file]")).backgroundColor'); hover_metrics.history_file = await hover('[data-history-file]'); assert.equal(hover_metrics.history_file.background,file_background,'selected source keeps its colour on hover');
  await click('.git-scm-history-more-menu'); await click('[data-action=history_tree]');
  await wait('document.querySelectorAll("[data-history-directory]").length === 2'); assert.equal((await saved_layout()).history_tree,true);
  const nested_directory = '[data-history-directory="z_docs/nested"]';
  await check_disclosure(nested_directory+' > summary',true);
  await click(nested_directory+' > summary'); assert(!await evaluate('document.querySelector('+JSON.stringify(nested_directory)+').open'));
  await check_disclosure(nested_directory+' > summary',false);
  await click(nested_directory+' > summary');
  await check_disclosure(nested_directory+' > summary',true);
  await click('[data-history-file="'+nested_history_path+'"]'); await wait('!!document.querySelector("[data-diff-ready=true]") && core.app.workspace.activeLeaf.view.editor.models[0].getValue().startsWith("# Nested initial")');
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.models[0].getValue()'),git(['show','HEAD^:'+nested_history_path]));
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.models[1].getValue()'),git(['show','HEAD:'+nested_history_path]));
  await capture('source_control_history_tree');
  await click('.git-scm-history-more-menu'); await click('[data-action=history_list]');
  await wait('!document.querySelector("[data-history-directory]")'); assert.equal((await saved_layout()).history_tree,false);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify('[data-history-file="'+nested_history_path+'"] .git-scm-file-directory')+').textContent'),'z_docs/nested');
  await click('.git-scm-history-commit','right'); assert(await evaluate('!!document.querySelector("[data-action=branch_create]")')); await key('Escape');
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"))');
  // 源代码管理的提交图仍可独立调节，不再复用主 Git Graph 的详情分界线。
  await drag('.git-scm-history-sash',0,70);
  await click('.git-graph-columns', 'right'); assert.deepEqual(await evaluate('[...document.querySelectorAll(".git-graph-menu .git-menu-label")].map(label=>label.textContent)'),['日期','作者','提交编号','重置列宽','全部设置']); assert(await evaluate('document.querySelectorAll("[role=menuitemcheckbox]").length === 3')); await key('Escape');
  await click('.git-graph-row:not(.git-graph-worktree)', 'right'); await click('[data-action="configure_menu"]');
  await click('[data-action-id="branch_create"]'); await click('.git-graph-dialog-footer button');
  await click('.git-graph-row:not(.git-graph-worktree)', 'right'); assert(!await evaluate('!!document.querySelector("[data-action=branch_create]")')); await click('[data-action="configure_menu"]');
  await click('[data-action-id="branch_create"]'); await click('.git-graph-dialog-footer button');
  await key('f', ['control']); assert(await evaluate('document.activeElement === panel.search && panel.find_widget.dataset.open === "true"'));
  await evaluate('panel.close_details();void 0');
  assert(await evaluate('!panel.finder.case_sensitive&&!panel.finder.regex&&!panel.finder.open_details'));
  await wait('Math.abs(panel.find_widget.getBoundingClientRect().top-panel.container.getBoundingClientRect().top)<0.01');
  const find_geometry=await evaluate('(()=>{const root=panel.container.getBoundingClientRect(),widget=panel.find_widget.getBoundingClientRect(),input=panel.search.getBoundingClientRect();return{height:widget.height,top:widget.top-root.top,right:root.right-widget.right,input_height:input.height,buttons:[...panel.find_widget.querySelectorAll(":scope>button")].map(button=>{const box=button.getBoundingClientRect();return[box.width,box.height,box.top-widget.top]})}})()');
  assert.deepEqual(find_geometry,{height:34,top:0,right:28,input_height:26,buttons:Array.from({length:6},()=>[20,20,7])},'Find keeps the fixed upstream 34px shell, 26px input and 20px hitboxes at the top of its editor pane');
  await evaluate('document.querySelector("#editors").style.cssText="flex:0 0 360px;width:360px"');await delay(80);
  assert(await evaluate('(()=>{const root=panel.container.getBoundingClientRect(),widget=panel.find_widget.getBoundingClientRect();return widget.left>=root.left&&widget.right<=root.right&&widget.height===34&&panel.find_widget.scrollWidth===panel.find_widget.clientWidth})()'),'360px editor keeps Find inside the pane without a second toolbar row');await capture('graph_find_360');
  await evaluate('document.querySelector("#editors").style.removeProperty("flex");document.querySelector("#editors").style.removeProperty("width")');await delay(80);
  // 真正缩小 Electron 视口覆盖媒体规则；隐藏侧栏模拟窄窗口的编辑布局。
  const find_window_size = test_window.getSize();
  await evaluate('document.querySelector("#sidebar-content").style.display="none"');
  test_window.setSize(500, 700);
  await wait('window.innerWidth<=520'); await delay(80);
  const narrow_find = await evaluate('(()=>{const widget=panel.find_widget.getBoundingClientRect(),root=panel.container.getBoundingClientRect();return{viewport:innerWidth,height:widget.height,bounded:widget.left>=root.left&&widget.right<=root.right,controls:[panel.search,...panel.find_widget.querySelectorAll(":scope>button")].every(control=>{const box=control.getBoundingClientRect();return box.left>=widget.left&&box.right<=widget.right&&box.top>=widget.top&&box.bottom<=widget.bottom}),overflow:panel.find_widget.scrollWidth-panel.find_widget.clientWidth}})()');
  assert(narrow_find.viewport<=520);
  assert.deepEqual({...narrow_find,viewport:500},{viewport:500,height:34,bounded:true,controls:true,overflow:0},'real narrow viewport retains one 34px Find row and bounded input/action hitboxes');
  await capture('graph_find_window_500');
  test_window.setSize(...find_window_size);
  await evaluate('document.querySelector("#sidebar-content").style.removeProperty("display")');
  await wait('window.innerWidth>520');
  const find_input = async value => { await click('.git-graph-search'); await key('a',['control']); await test_window.webContents.insertText(value); };
  await find_input('ui test'); await wait('panel.finder.matches.length===panel.state.commits.length');
  assert(await evaluate('!panel.selected&&panel.list.querySelectorAll("mark.git-graph-find-match").length>0&&panel.find_position.textContent.includes("4")'));
  const first_find = await evaluate('panel.finder.current'); await key('Enter'); assert.notEqual(await evaluate('panel.finder.current'),first_find); await key('Enter',['shift']); assert.equal(await evaluate('panel.finder.current'),first_find);
  assert(await evaluate('!panel.selected'));
  await click('[aria-label="区分大小写"]'); await wait('panel.finder.matches.length===0'); assert.equal(await evaluate('panel.finder.case_button.getAttribute("aria-pressed")'),'true');
  await find_input('UI Test'); await wait('panel.finder.matches.length===4');
  await click('[aria-label="使用正则表达式"]'); await find_input('['); await wait('panel.search.getAttribute("aria-invalid")==="true"');
  assert(await evaluate('!!panel.finder.error.textContent&&panel.finder.next.disabled&&panel.list.querySelectorAll("mark.git-graph-find-match").length===0'));
  await find_input('^'); await wait('panel.finder.error.textContent.includes("零长度")');
  await find_input('UI\\s+Test'); await wait('panel.finder.matches.length===4&&!panel.search.hasAttribute("aria-invalid")');
  await click('[aria-label="为当前匹配打开提交详情"]'); await wait('panel.selected===panel.finder.current&&panel.files.length>0');
  await key('Enter'); await wait('panel.selected===panel.finder.current');
  await click('[aria-label="为当前匹配打开提交详情"]'); const unchanged_details=await evaluate('panel.selected'); await key('Enter'); assert.equal(await evaluate('panel.selected'),unchanged_details);
  // 真正Git diff完成后暂扣旧响应，输入另一hash让最新详情先完成。
  await evaluate('window.find_run=panel.runner.run;window.find_release=null;window.find_gate_once=true;panel.runner.run=async(...args)=>{const output=await find_run(...args);if(args[1][0]==="diff"&&find_gate_once){find_gate_once=false;await new Promise(resolve=>find_release=resolve);}return output;};void 0');
  await click('[aria-label="为当前匹配打开提交详情"]'); await wait('!!find_release');
  const latest_find_hash=await evaluate('panel.state.commits.find(commit=>commit.hash!==panel.selected).hash');
  await find_input(latest_find_hash); await wait('panel.selected==='+JSON.stringify(latest_find_hash)+'&&panel.files.length>0');
  const latest_find_files=await evaluate('JSON.stringify(panel.files)'); await evaluate('find_release();void 0'); await delay(80);
  assert.equal(await evaluate('panel.selected'),latest_find_hash); assert.equal(await evaluate('JSON.stringify(panel.files)'),latest_find_files);
  await evaluate('panel.runner.run=find_run;void 0');
  await capture('graph_find_regex');
  await key('Escape'); assert.equal(await evaluate('panel.list.querySelectorAll("mark.git-graph-find-match").length'),0); assert.equal(await evaluate('panel.search.value'),'');
  await key('f',['control']); assert(await evaluate('panel.find_widget.dataset.open==="true"&&panel.finder.regex&&panel.finder.case_sensitive&&panel.finder.open_details'));
  await click('[aria-label="区分大小写"]'); await click('[aria-label="使用正则表达式"]'); await click('[aria-label="为当前匹配打开提交详情"]');
  await key('Escape'); assert.equal(await evaluate('panel.find_widget.dataset.open'),'false');
  await click('.git-graph-row:not(.git-graph-worktree)', 'right'); await capture('context_menu'); await click('[data-action="branch_create"]');
  await click('[data-field="branch"]'); await test_window.webContents.insertText('ui-created'); assert(!await evaluate('document.querySelector("[data-git-preview]")'));
  assert(!git(['branch', '--list', 'ui-created']).trim()); await capture('action_preview'); await click('[data-git-execute]'); await wait('!panel.writing && !document.querySelector(".git-graph-dialog-shade")'); assert(git(['branch', '--list', 'ui-created']).includes('ui-created')); await key('Escape');
  await click('.git-graph-refs[data-ref="refs/heads/main"]','right');
  assert(await evaluate('!!document.querySelector("[data-action=branch_fetch]") && !!document.querySelector("[data-action=pull]")'));
  await key('Escape');
  for (const [id,field,value] of [['merge','mode','no-ff'],['rebase','ignore_date',true],['stash_create','untracked',true],['tag_add','tag_type','annotated']]) {
    await evaluate('panel.action_dialog('+JSON.stringify(id)+',"commit","",panel.state.head)');
    assert.equal(await evaluate('(() => {const input=document.querySelector("[data-field='+field+']");return input.type === "checkbox" ? input.checked : input.value;})()'),value);
    await key('Escape');
  }
  await evaluate('panel.settings_dialog()');await click('[data-setting="history_always_show_actions"]');await click('[data-settings-action="save"]');await wait('!panel.pending&&panel.settings.history_always_show_actions===true');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(graph_qa.GRAPH_SETTINGS_KEY+"settings:"+panel.root)).history_always_show_actions'),true);
  await evaluate('panel.settings_dialog()');assert(await evaluate('document.querySelector("[data-setting=history_always_show_actions]").checked'));await click('[data-setting="history_always_show_actions"]');await click('[data-settings-action="save"]');await wait('!panel.pending&&panel.settings.history_always_show_actions===false');
  await evaluate('panel.settings_dialog()'); await capture('settings');
  assert(await evaluate('["details_location","show_date","show_author","show_hash","label_alignment"].every(name=>Object.hasOwn(panel.settings,name)&&document.querySelector("[data-setting="+name+"]"))')); await key('Escape');
  await evaluate('panel.select_commit(panel.state.commits[0])'); await wait('panel.details.isConnected && !!document.querySelector(".git-graph-file")');
  assert(await evaluate('panel.details.previousElementSibling?.dataset.hash === panel.selected && !panel.body.querySelector(".linux-note-workspace-sash")'));
  await click('.git-graph-detail-close'); assert(await evaluate('panel.details.parentElement === null && panel.selected === "" && panel.to === ""'));
  await evaluate('panel.select_commit(panel.state.commits[0])'); await wait('!!document.querySelector(".git-graph-file")');
  await evaluate('panel.open_diff(panel.files[0])'); await wait('!!document.querySelector(".git-graph-document")'); await wait('!!document.querySelector("[data-diff-ready=true]")'); assert(await evaluate('document.querySelectorAll(".monaco-diff-editor .monaco-editor").length >= 2')); await capture('side_by_side_diff');
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"))');
  await click('[data-scm-group=changes] [data-file="sample.c"]'); await wait('!!document.querySelector("[data-diff-ready=true]")');
  await wait('document.querySelectorAll(".mtk6,.mtk7,.mtk8").length > 0');
  const metrics = await evaluate(`(() => {const view=core.app.workspace.activeLeaf.view;const editor=view.editor.editor;const left=editor.getOriginalEditor(),right=editor.getModifiedEditor();return {changes:editor.getLineChanges().length,width:view.containerEl.clientWidth,height:document.querySelector('.git-monaco-body').clientHeight,aligned:Math.abs(left.getTopForLineNumber(23)-right.getTopForLineNumber(24)),language:left.getModel().getLanguageId(),left:left.getValue(),right:right.getValue(),tokens:document.querySelectorAll('.mtk6,.mtk7,.mtk8').length};})()`);
  assert.equal(metrics.changes,3); assert(metrics.width>700 && metrics.height>500); assert(metrics.aligned<1); assert.equal(metrics.language,'c'); assert.equal(metrics.left,original_code); assert.equal(metrics.right,modified_code.join('\n'));
  const scroll_metrics = await evaluate(`(() => {const editor=core.app.workspace.activeLeaf.view.editor.editor;const left=editor.getOriginalEditor(),right=editor.getModifiedEditor();return {left:left.getLayoutInfo().verticalScrollbarWidth,right:right.getLayoutInfo().verticalScrollbarWidth,left_map:left.getLayoutInfo().minimap.minimapWidth,right_map:right.getLayoutInfo().minimap.minimapWidth,overview:!!document.querySelector('.diffOverview')};})()`);
  assert.equal(scroll_metrics.left,8); assert.equal(scroll_metrics.right,8); assert.equal(scroll_metrics.left_map,0); assert.equal(scroll_metrics.right_map,0); assert(scroll_metrics.overview);
  await delay(250);
  const overview_metrics = await evaluate(`(() => {
    const overview=document.querySelector('.diffOverview');
    const scan=selector=>{const canvas=overview.querySelector(selector),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let red=0,green=0;const red_rows=new Set(),green_rows=new Set();for(let offset=0;offset<pixels.length;offset+=4){if(!pixels[offset+3])continue;const row=Math.floor(offset/4/canvas.width);if(pixels[offset]>pixels[offset+1]+30&&pixels[offset]>pixels[offset+2]+30){red++;red_rows.add(row);}if(pixels[offset+1]>pixels[offset]+20&&pixels[offset+1]>pixels[offset+2]+30){green++;green_rows.add(row);}}return {width:canvas.getBoundingClientRect().width,red,green,red_rows:[...red_rows],green_rows:[...green_rows]};};
    return {width:overview.getBoundingClientRect().width,height:overview.getBoundingClientRect().height,original:scan('.original.diffOverviewRuler'),modified:scan('.modified.diffOverviewRuler')};
  })()`);
  assert.equal(overview_metrics.width,30); assert(overview_metrics.height>400); assert.equal(overview_metrics.original.width,15); assert.equal(overview_metrics.modified.width,15);
  assert(overview_metrics.original.red>0 && overview_metrics.modified.green>0); assert.equal(overview_metrics.original.green,0); assert.equal(overview_metrics.modified.red,0);
  overview_metrics.clicks=[];
  for (const [selector,row] of [['.diffOverview .original.diffOverviewRuler',overview_metrics.original.red_rows[0]],['.diffOverview .modified.diffOverviewRuler',overview_metrics.modified.green_rows.at(-1)]]) {
    await evaluate('core.app.workspace.activeLeaf.view.editor.editor.getModifiedEditor().setScrollTop(100000)'); await delay(120);
    const before=await evaluate('core.app.workspace.activeLeaf.view.editor.editor.getModifiedEditor().getScrollTop()');
    const point=await evaluate(`(() => {const canvas=document.querySelector(${JSON.stringify(selector)}),box=canvas.getBoundingClientRect();return {x:Math.round(box.x+box.width/2),y:Math.round(box.y+(${row}+.5)/canvas.height*box.height)};})()`);
    for (const type of ['mouseMove','mouseDown','mouseUp']) { test_window.webContents.sendInputEvent({type,...point,button:'left',clickCount:1}); await delay(40); } await delay(150);
    const after=await evaluate('({left:core.app.workspace.activeLeaf.view.editor.editor.getOriginalEditor().getScrollTop(),right:core.app.workspace.activeLeaf.view.editor.editor.getModifiedEditor().getScrollTop()})');
    assert(after.right<before-100,selector+' jumps to its change marker'); assert(Math.abs(after.left-after.right)<2); overview_metrics.clicks.push({selector,before,...after});
  }
  await capture('diff_overview_markers');
  const diff_sash = '.monaco-diff-editor > .monaco-sash.vertical';
  const left_width = await evaluate('core.app.workspace.activeLeaf.view.editor.editor.getOriginalEditor().getLayoutInfo().width'); await drag(diff_sash,-60,0);
  assert(await evaluate('core.app.workspace.activeLeaf.view.editor.editor.getOriginalEditor().getLayoutInfo().width') < left_width - 30);
  const wheel = async selector => { const point=await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);test_window.webContents.sendInputEvent({type:'mouseMove',...point});await delay(80);test_window.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:-260,deltaX:0,wheelTicksY:-3,wheelTicksX:0});await delay(350); };
  await evaluate('core.app.workspace.activeLeaf.view.editor.editor.getModifiedEditor().setScrollTop(0)');
  await wheel('.editor.original .overflow-guard');
  assert(await evaluate('core.app.workspace.activeLeaf.view.editor.editor.getModifiedEditor().getScrollTop()')>100);
  await wheel('.editor.modified .overflow-guard');
  assert(await evaluate('Math.abs(core.app.workspace.activeLeaf.view.editor.editor.getOriginalEditor().getScrollTop()-core.app.workspace.activeLeaf.view.editor.editor.getModifiedEditor().getScrollTop())')<2);
  await evaluate('core.app.workspace.activeLeaf.view.editor.editor.updateOptions({wordWrap:"on"})');
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.editor.getModifiedEditor().getLayoutInfo().minimap.minimapWidth'),0);
  assert(!await evaluate('core.app.workspace.activeLeaf.view.editor.editor.getModifiedEditor().getRawOptions().minimap.enabled'));
  await evaluate('core.app.workspace.activeLeaf.view.editor.editor.updateOptions({wordWrap:"off"})');
  await capture('source_control_diff');
  await click('[data-scm-group=changes] [data-file="sample.c"]','right'); await click('[data-action=copy_relative]'); assert.equal(await evaluate('copied'),'sample.c');
  await click('[data-scm-group=changes] [data-file="sample.c"]','right'); await click('[data-action=stage]'); await wait('!panel.writing && !!document.querySelector("[data-scm-group=staged] .git-scm-file")'); assert(git(['diff','--cached','--name-only']).includes('sample.c')); assert(!await evaluate('!!document.querySelector(".git-graph-dialog-shade")'));
  await click('[data-scm-group=staged] [data-file="sample.c"]','right'); await click('[data-action=unstage]'); await wait('!panel.writing && !!document.querySelector("[data-scm-group=changes] .git-scm-file")'); assert(!git(['diff','--cached','--name-only']).trim());
  // Tab 按打开文件、放弃更改、暂存的次序前进；Enter/Space 不被父行当作打开差异。
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"));document.querySelector("[data-scm-group=changes] [data-file=\\"sample.c\\"]").focus()'); await key('Tab');
  assert(await evaluate('document.activeElement.matches(".git-scm-inline-action")'));
  assert.equal(await evaluate('document.activeElement.dataset.scmFileAction'),'open');
  await key('Tab'); assert.equal(await evaluate('document.activeElement.dataset.scmFileAction'),'discard');
  await key('Tab'); assert.equal(await evaluate('document.activeElement.dataset.scmFileAction'),'stage');
  const before_inline_leaf = await evaluate('core.app.workspace.activeLeaf.state.path'); await key('Enter');
  await wait('!panel.writing && !!document.querySelector("[data-scm-group=staged] [data-file=\\"sample.c\\"]")');
  assert(git(['diff','--cached','--name-only']).includes('sample.c')); assert.equal(await evaluate('core.app.workspace.activeLeaf.state.path'),before_inline_leaf);
  await evaluate('document.querySelector("[data-scm-group=staged] [data-file=\\"sample.c\\"]").focus()'); await key('Tab');
  assert.equal(await evaluate('document.activeElement.dataset.scmFileAction'),'open'); await key('Tab');
  assert.equal(await evaluate('document.activeElement.dataset.scmFileAction'),'unstage'); await key('Space');
  await wait('!panel.writing && !document.querySelector("[data-scm-group=staged] .git-scm-file")'); assert(!git(['diff','--cached','--name-only']).trim());
  assert.equal(await evaluate('core.app.workspace.activeLeaf.state.path'),before_inline_leaf);
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"));document.querySelector("[data-scm-group=changes] [data-file=\\"sample.c\\"]").focus()'); await key('Enter');
  await wait('!!document.querySelector("[data-diff-ready=true]")'); assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.models[1].getValue()'),modified_code.join('\n'));
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"))');
  for (const selector of ['.git-scm-message','.git-graph-search']) {
    if (selector === '.git-graph-search') await evaluate('panel.open_find()');
    await evaluate(`window.edit_context_prevented=null;document.querySelector(${JSON.stringify(selector)}).addEventListener('contextmenu',event=>setTimeout(()=>window.edit_context_prevented=event.defaultPrevented,0),{once:true})`);
    await click(selector,'right'); assert.equal(await evaluate('window.edit_context_prevented'),false, selector+' keeps the native edit context menu');
    assert(!await evaluate('!!document.querySelector(".git-graph-menu")')); await key('Escape'); if (selector === '.git-graph-search') await evaluate('panel.close_find()');
  }
  await click('.git-scm-title','right'); assert(await evaluate('!!document.querySelector(".git-graph-menu")')); await key('Escape');
  await click('.git-scm-operation-menu'); await capture('source_control_menu');
  await evaluate(`[...document.querySelectorAll('.git-graph-menu button')].find(item=>item.querySelector('.git-menu-label').textContent==='更改').focus()`);
  assert(await evaluate('document.activeElement.querySelector(".git-menu-arrow [data-git-icon=chevron-right]") && document.activeElement.textContent.trim()==="更改"'));
  await key('Right'); assert(await evaluate('document.querySelectorAll(".git-graph-menu").length === 2 && !!document.querySelectorAll(".git-graph-menu")[1].querySelector("[data-action=stage_all]")')); await key('Left'); assert(!await evaluate('document.querySelectorAll(".git-graph-menu").length > 1')); await key('Escape');
  await click('[data-scm-group=changes] [data-file="sample.c"]','right'); await click('[data-action=file_history]'); await wait('!!document.querySelector(".git-file-history-row")'); await click('.git-file-history-row'); await wait('!!document.querySelector("[data-diff-ready=true]")'); assert(await evaluate('core.app.workspace.activeLeaf.view.editor.models[0].getValue()')==='');
  await evaluate('(async()=>{const pending=panel.refresh(false);panel.close();await pending;})()'); assert(!await evaluate('panel.pending')); await evaluate('panel.refresh(false)'); assert(await evaluate('panel.container.dataset.state === "ready"'));
  fs.writeFileSync(path.join(root,'new-track.txt'),'track without staging\n'); fs.writeFileSync(path.join(root,'scratch.tmp'),'ignore this file\n');
  const long_file_path = 'z_docs/nested/a_very_long_changed_filename_to_verify_ellipsis.txt'; fs.writeFileSync(path.join(root,long_file_path),'a long untracked filename\n');
  await evaluate('panel.refresh(false)');
  assert.equal(await evaluate('document.querySelectorAll(".git-scm-group").length'),2); assert(!await evaluate('!!document.querySelector("[data-scm-group=untracked]")'));
  await click('[data-scm-group=changes] [data-file="new-track.txt"]','right');
  assert(!await evaluate('!!document.querySelector("[data-action=intent_to_add]")'));
  await click('[data-action=stage]'); await wait('!panel.writing && !!document.querySelector("[data-scm-group=staged] [data-file=\\"new-track.txt\\"]")');
  assert(git(['diff','--cached','--name-only']).includes('new-track.txt'));
  await click('[data-scm-group=staged] [data-file="new-track.txt"]','right'); await click('[data-action=unstage]'); await wait('!panel.writing && !panel.pending');
  await click('[data-scm-group=changes] [data-file="scratch.tmp"]','right'); await click('[data-action=ignore_file]'); await wait('!panel.writing && !document.querySelector("[data-file=\\"scratch.tmp\\"]")');
  assert.equal(git(['check-ignore','scratch.tmp']).trim(),'scratch.tmp'); assert(fs.existsSync(path.join(root,'scratch.tmp'))); assert(!git(['diff','--cached','--name-only']).trim());
  // Enter 保留多行消息；Ctrl+Enter 提交暂存快照，不带入工作区的另一份修改。
  git(['add','--','sample.c']); const staged_code = fs.readFileSync(path.join(root,'sample.c'),'utf8'); fs.appendFileSync(path.join(root,'sample.c'),'// keep unstaged\n');
  await evaluate('panel.refresh(false)'); const before_manual = git(['rev-parse','HEAD']);
  const file_columns = () => evaluate(`(() => {
    const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
    return {rows:[...panel.workbench.groups.querySelectorAll('.git-scm-file')].map(row=>({path:row.dataset.file,status:box(row.querySelector('.git-scm-file-status')).left,action:box(row.querySelector('.git-scm-row-actions button:last-child')).left,action_id:row.querySelector('.git-scm-row-actions button:last-child').dataset.scmFileAction,right:box(row).right})),
      headers:[...panel.workbench.groups.querySelectorAll('.git-scm-group > summary')].map(row=>box(row.querySelector('.git-scm-row-actions button:last-child')).left),
      history:[...panel.workbench.history.list.querySelectorAll('.git-scm-history-file')].map(row=>box(row.querySelector('.git-scm-file-status')).left),sidebar:box(panel.workbench.sidebar),overflow:panel.workbench.groups.scrollWidth-panel.workbench.groups.clientWidth};
  })()`);
  if (!await evaluate('document.querySelector(".git-scm-history-commit").getAttribute("aria-expanded") === "true"')) await click('.git-scm-history-commit');
  await wait('document.querySelectorAll(".git-scm-history-file").length === 2');
  const column_metrics = [];
  for (const width of [260,220]) {
    await evaluate('document.querySelector("#sidebar-content").style.width="'+width+'px"'); await delay(180);
    test_window.webContents.sendInputEvent({type:'mouseMove',x:1100,y:30}); await delay(80);
    const before_hover = await file_columns();
    const hover_point = await evaluate(`(() => {const r=panel.workbench.groups.querySelector('.git-scm-file').getBoundingClientRect();return {x:Math.round(r.left+30),y:Math.round(r.top+r.height/2)};})()`);
    test_window.webContents.sendInputEvent({type:'mouseMove',...hover_point}); await delay(100);
    const after_hover = await file_columns();
    assert(after_hover.rows.every(row=>row.action_id==='stage'||row.action_id==='unstage'),width+': final file action remains Stage or Unstage regardless of optional Open/Discard controls');
    for (const column of ['status','action']) {
      assert(Math.max(...after_hover.rows.map(row=>row[column]))-Math.min(...after_hover.rows.map(row=>row[column]))<1, width+': '+column+' aligns across all file rows');
      after_hover.rows.forEach((row,index)=>assert.equal(row[column],before_hover.rows[index][column],width+': '+column+' does not shift on hover'));
    }
    // Fixed VS Code scm.css: group actions are display:none until that group is hovered/focused.
    // Its count badge follows the toolbar; its variable width does not define the file action column.
    assert(after_hover.headers.every(x=>x===0),width+': group actions remain hidden while a file row is hovered');
    const header_count=await evaluate('panel.workbench.groups.querySelectorAll(".git-scm-group > summary").length');
    for(let index=0;index<header_count;index++){
      const selector='.git-scm-group:nth-child('+(index+1)+') > summary';
      const header_point=await evaluate(`(()=>{const node=panel.workbench.groups.querySelector(${JSON.stringify(selector)}),r=node.getBoundingClientRect();return{x:Math.round(r.left+30),y:Math.round(r.top+r.height/2)}})()`);
      test_window.webContents.sendInputEvent({type:'mouseMove',...header_point});await delay(80);
      const header_geometry=await evaluate(`(()=>{const node=panel.workbench.groups.querySelector(${JSON.stringify(selector)}),box=element=>{const r=element.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,height:r.height}};return{header:box(node),badge:box(node.querySelector('.git-scm-badge')),actions:[...node.querySelectorAll('.git-scm-row-actions button')].map(box)}})()`);
      assert(header_geometry.actions.length>0,width+': hovered group exposes its real actions');
      for(const action of header_geometry.actions){assert.equal(action.width,22,width+': SCM action target remains22');assert.equal(action.height,22);assert(action.left>=header_geometry.header.left&&action.right<=header_geometry.badge.left,width+': group actions stay within heading without overlapping count');}
      assert(header_geometry.badge.right<=header_geometry.header.right,width+': count remains within heading');
    }

    after_hover.history.forEach(x=>assert(Math.abs(x-after_hover.rows[0].status)<1,width+': history and changed-file status columns align'));
    assert(after_hover.overflow<1,width+': changes do not acquire a horizontal scrollbar');
    after_hover.rows.forEach(row=>assert(row.right<=after_hover.sidebar.right+1,width+': file remains within the sidebar'));
    const long_label = await evaluate(`(() => {const label=document.querySelector(${JSON.stringify('[data-file="'+long_file_path+'"] .git-scm-file-text')});return {width:label.clientWidth,scroll:label.scrollWidth,overflow:getComputedStyle(label).textOverflow};})()`);
    assert(long_label.width>0 && long_label.scroll>long_label.width); assert.equal(long_label.overflow,'ellipsis');
    column_metrics.push({width,...after_hover}); await capture('source_control_columns_'+width);
  }
  await evaluate('document.querySelector("#sidebar-content").style.width="260px"'); await delay(180);
  await capture('source_control_columns');
  await click('.git-scm-message'); await test_window.webContents.insertText('manual first'); await key('Enter');
  assert.equal(await evaluate('panel.workbench.message.value'),'manual first\n'); await test_window.webContents.insertText('manual second'); await key('Enter'); await test_window.webContents.insertText('manual third');
  await evaluate('panel.workbench.message.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",ctrlKey:true,isComposing:true,bubbles:true,cancelable:true}))');
  assert.equal(git(['rev-parse','HEAD']),before_manual); assert.equal(await evaluate('panel.workbench.message.value'),'manual first\nmanual second\nmanual third');
  await key('Enter',['control']); await wait('!panel.writing && panel.workbench.message.value === ""');
  assert.notEqual(git(['rev-parse','HEAD']),before_manual); assert.equal(git(['show','HEAD:sample.c']),staged_code); assert.equal(git(['show','--pretty=format:','--name-only','HEAD']).trim(),'sample.c');
  assert(git(['diff','--name-only']).includes('sample.c')); assert(git(['ls-files','--others','--exclude-standard']).includes('new-track.txt'));
  const after_manual = git(['rev-parse','HEAD']); await click('.git-scm-message'); await test_window.webContents.insertText('keep failed draft'); await click('.git-scm-commit'); await wait('!panel.writing && !!panel.workbench.notice.textContent');
  assert.equal(git(['rev-parse','HEAD']),after_manual); assert.equal(await evaluate('panel.workbench.message.value'),'keep failed draft');
  git(['add','--','sample.c']); await evaluate('panel.refresh(false)'); await evaluate('panel.action_dialog("commit","changes")');
  await click('[data-field=message]'); await test_window.webContents.insertText('dialog first'); await key('Enter'); await test_window.webContents.insertText('dialog second');
  assert(!await evaluate('document.querySelector("[data-git-preview]")'));
  assert.equal(git(['rev-parse','HEAD']),after_manual); await click('[data-git-execute]'); await wait('!panel.writing && !document.querySelector(".git-graph-dialog-shade")'); assert.notEqual(git(['rev-parse','HEAD']),after_manual); await key('Escape');
  // 保留 A 仓库的真实 Monaco 比较，再切换 B；旧按钮和已生成菜单不得使用 B 的同名路径。
  const other_repository=fs.mkdtempSync(path.join(os.tmpdir(),'typora_graph_other_'));
  const other_git=args=>child_process.execFileSync('git',['-c','user.name=UI Test','-c','user.email=ui@example.invalid','-c','commit.gpgsign=false','-c','core.autocrlf=false','-c','core.hooksPath=.git/unused_hooks',...args],{cwd:other_repository,encoding:'utf8',windowsHide:true});
  other_git(['init','-b','main']);fs.writeFileSync(path.join(other_repository,'sample.c'),'int other_repository = 17;\n');other_git(['add','sample.c']);other_git(['commit','-m','其他仓库']);
  fs.appendFileSync(path.join(other_repository,'sample.c'),'// preserve B working file\n');fs.writeFileSync(path.join(other_repository,'new-track.txt'),'preserve B untracked\n');
  fs.appendFileSync(path.join(root,'sample.c'),'// preserve A comparison\n');
  await evaluate(`panel.workbench.open_file({path:'sample.c',status:'M'},'INDEX','WORKTREE',[{path:'sample.c',status:'M'},{path:'new-track.txt',status:'??'}])`);
  await wait('!!document.querySelector("[data-diff-ready=true]")');
  await evaluate(`window.retained_diff=core.app.workspace.activeLeaf;window.retained_actions=retained_diff.view.document.options;window.retained_menu=retained_actions.menu();window.retained_untracked_menu=panel.workbench.file_entries({path:'new-track.txt',status:'??'},'INDEX','WORKTREE',[{path:'new-track.txt',status:'??'}]);window.retained_text=retained_diff.view.editor.models.map(model=>model.getValue());void 0`);
  const repository_snapshot=(directory,run)=>({head:run(['rev-parse','HEAD']),status:run(['status','--porcelain=v1']),index:fs.readFileSync(path.join(directory,'.git','index')).toString('base64'),files:['sample.c','new-track.txt','.gitignore'].map(file=>{const target=path.join(directory,file);return fs.existsSync(target)?fs.readFileSync(target).toString('base64'):null;})});
  const before_repository_a=repository_snapshot(root,git),before_repository_b=repository_snapshot(other_repository,other_git);
  await evaluate(`panel.switch_repo(${JSON.stringify(other_repository)});void 0`);await wait('!panel.pending && panel.container.dataset.state === "ready"');
  await evaluate('core.app.workspace.activeLeaf=retained_diff.parent.toggleTab(retained_diff.state.path);void 0');
  for(const action of ['previous_file','next_file','refresh_diff']){
    await evaluate(`retained_diff.view.editor.toolbar.querySelector('[data-git-icon=more]').closest('button').id='retained-diff-action';void 0`);
    await click('#retained-diff-action');await click('.git-graph-menu [data-action='+action+']');await evaluate('document.querySelector("#retained-diff-action").removeAttribute("id")');
  }
  await click('[data-diff-open-file=true]');
  await evaluate(`retained_diff.view.editor.toolbar.querySelector('[data-git-icon=more]').closest('button').id='retained-diff-menu';void 0`);
  for(const action of ['open_file','stage']){await click('#retained-diff-menu');await click('.git-graph-menu [data-action='+action+']');}
  await click('#retained-diff-menu');assert(await evaluate('!document.querySelector(".git-diff-title-menu [data-action=discard_file]")&&retained_menu.some(entry=>entry.id==="discard_file")'),'title menu excludes file discard while the captured file action remains covered by the stale-action guard');await key('Escape');
  await evaluate(`for(const entry of [...retained_menu,...retained_untracked_menu])entry.action?.();void 0`);await delay(150);
  assert(await evaluate('core.app.workspace.activeLeaf===retained_diff && !panel.writing && !document.querySelector(".git-graph-dialog-shade")'),'stale diff cannot open B or create a write dialog');
  assert(await evaluate('panel.workbench.notice.textContent.includes("仓库已变化") && panel.workbench.notice.textContent.includes("重新打开")'));
  assert.deepEqual(await evaluate('retained_diff.view.editor.models.map(model=>model.getValue())'),await evaluate('retained_text'),'both original comparison buffers survive rejected actions');
  assert.deepEqual(repository_snapshot(root,git),before_repository_a,'A HEAD, index and working files remain unchanged');
  assert.deepEqual(repository_snapshot(other_repository,other_git),before_repository_b,'B HEAD, index and same-named files remain unchanged');
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"));panel.writing=true'); assert(await evaluate('(() => {try{panel.dispose();return false;}catch{return !panel.disposed && panel.container.isConnected;}})()'));
  await evaluate('panel.writing=false;panel.dispose();panel.dispose();panel.open();panel.refresh()');
  assert(await evaluate('panel.disposed && !panel.container.isConnected && !panel.workbench.sidebar.isConnected && !panel.active && !panel.state'));
  console.log(JSON.stringify({status:'PASS',checks:[
    'Graph active leaf preserves real bottom xterm Ctrl+F/Escape and terminal find input; IME/229 cannot invoke Graph shortcuts while normal Graph find remains available',
    'retained repository A diff rejects refresh, adjacent, Open Current and prebuilt menu writes after switching to B while preserving both repositories and buffers',
    'real pointer context menu','Graph Find case/regex, invalid and zero-width errors, live highlights, match cycling, optional details and stale async protection','preview has no mutation','execution creates branch','settings and focus','SCM history and diff sashes remain draggable','per-context menu checkbox persistence','classic single-line Git Graph controls','fixed Graph Description Date Author Commit columns','24px rows place refs before descriptions','selected commit opens inline details with 32px controls','inline details stay bounded at 640px and 360px editor widths','optional bottom dock and column visibility work','remote toggle persists and multiple reference QuickPick opens','source sidebar correct index/worktree comparison','three aligned hunks and C syntax','one-click stage and unstage','nested menu keyboard navigation','file timeline opens original revision','sidebar refresh survives closing busy graph','two file sections including new files','new file stages directly','ignore keeps disk file and index','Enter inserts newline and Ctrl Enter commits','shortcut commits staged content only','failed commit retains draft','commit dialog preserves multiline message','thin scrollbars on both sides','both panes wheel scroll together','diff center remains draggable','diff minimaps stay disabled after option changes','sidebar renders real commit graph','sidebar history expands actual files and opens revision diff','sidebar graph supports commit context menu','sidebar history collapses and resizes',
    'view menu persists repositories changes and history visibility','last visible view remains recoverable','message section collapse persists','single line message grows with input','commit dropdown preserves draft and amend choice without mutation','history list and collapsible nested tree open correct revisions','narrow sidebar retains filename ellipsis and aligned columns','hover never shifts file status or action slots','group stage button aligns with file stage buttons','history status aligns with change status','inline action keyboard stages and unstages without opening diff','file row keyboard opens diff','editable fields preserve native context menus','blank sidebar retains Git context menu','remote configuration actions are Chinese','commit buttons retain blue contrast on hover','history hover feedback preserves selected state',
    'Graph and SCM follow appearance font variables','SCM controls use 16px official SVG shapes and Chinese accessible names','icon controls contain no text stand-ins','summary and history disclosure SVG follows open state','menus use SVG checks and submenu arrows','topology circles are independent of control SVGs','standard overview shows 15px red and green lanes','both overview marker lanes accept real clicks and synchronize panes'
  ],keyboard_ownership,classic_metrics,inline_metrics,responsive_metrics,ui_metrics,scroll_metrics,column_metrics,hover_metrics,icon_metrics,overview_metrics,evidence}));
}).catch(async error => { console.error(error); if (test_window) { console.error(await evaluate('document.body.innerText')); await capture('failure'); } process.exitCode = 1; }).finally(() => { if (test_window && !test_window.isDestroyed()) test_window.destroy(); app.exit(process.exitCode || 0); });
