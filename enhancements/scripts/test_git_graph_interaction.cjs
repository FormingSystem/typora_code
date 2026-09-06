// 独立 Electron 窗口验证 Chromium 的真实输入；Git 数据与用户数据均位于临时目录。
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const child_process = require('node:child_process');
const { build } = require('esbuild');
const { editor_plugins } = require('./editor_bundle.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_graph_ui_'));
const evidence = process.argv[2] || path.join(root, 'evidence'); fs.mkdirSync(evidence, { recursive: true });
app.setPath('userData', path.join(root, 'user_data')); app.disableHardwareAcceleration();
const git = args => child_process.execFileSync('git', ['-c', 'user.name=UI Test', '-c', 'user.email=ui@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=.git/unused_hooks', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
git(['init', '-b', 'main']); fs.writeFileSync(path.join(root, '.git/info/exclude'), 'user_data/\ntest.html\n');
git(['remote','add','origin',path.join(root,'remote.git')]);
const original_code = Array.from({length:80}, (_,i) => 'int value_' + i + ' = ' + i + ';').join('\n') + '\n'; fs.writeFileSync(path.join(root,'sample.c'), original_code);
const nested_history_path = 'z_docs/nested/history.md'; fs.mkdirSync(path.dirname(path.join(root, nested_history_path)), {recursive:true});
fs.writeFileSync(path.join(root, nested_history_path), '# Nested initial\n');
fs.writeFileSync(path.join(root, 'example.md'), '# Initial\n'); git(['add', 'example.md', 'sample.c', nested_history_path]); git(['commit', '-m', '开始 :tada:']);
git(['checkout', '-b', 'feature']); fs.writeFileSync(path.join(root, 'example.md'), '# Initial\n新增内容\n'); fs.writeFileSync(path.join(root, nested_history_path), '# Nested initial\n嵌套目录中的真实修改\n'); git(['add', 'example.md', nested_history_path]); git(['commit', '-m', '实现 **对比** #12']);
git(['checkout', 'main']); fs.writeFileSync(path.join(root, 'other.md'), 'main\n'); git(['add', 'other.md']); git(['commit', '-m', '主线更新']); git(['merge', '--no-ff', 'feature', '-m', '合并功能分支']);
const modified_code = original_code.split('\n'); modified_code[9]='int value_9 = 900;'; modified_code.splice(20,0,'// 新增一行'); modified_code.splice(36,1); fs.writeFileSync(path.join(root,'sample.c'),modified_code.join('\n'));
const bundle = build({ plugins: editor_plugins(), stdin: { contents: 'export { git_graph_panel } from "./src/git_graph_panel"; export { create_graph_host } from "./src/git_graph_host";', resolveDir: path.join(__dirname, '..') }, bundle: true, loader: {'.css':'text'}, format: 'iife', globalName: 'graph_qa', write: false }).then(result => result.outputFiles[0].text);
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
const hover = async selector => {
  const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  test_window.webContents.sendInputEvent({type:'mouseMove',...point}); await delay(100);
  return evaluate(`(() => {const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return {background:s.backgroundColor,color:s.color};})()`);
};
const check_disclosure = async (selector, expanded) => {
  const metric = await evaluate(`(() => {const root=document.querySelector(${JSON.stringify(selector)}),icon=root.querySelector('.git-disclosure-icon'),matrix=new DOMMatrixReadOnly(getComputedStyle(icon).transform);return {icon:icon.dataset.gitIcon,text:icon.textContent.trim(),matrix:[matrix.a,matrix.b,matrix.c,matrix.d],before:getComputedStyle(root,'::before').content};})()`);
  assert.equal(metric.icon,'chevron-right'); assert.equal(metric.text,'');
  const expected = expanded ? [0,1,-1,0] : [1,0,0,1]; metric.matrix.forEach((value,index)=>assert(Math.abs(value-expected[index])<0.001,selector+' rotates the SVG chevron with its open state'));
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
  const html = path.join(root, 'test.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden}body{display:flex}#sidebar-content{width:260px;flex:none}#editors{flex:1;min-width:0;height:100%}</style><div id=sidebar-content></div><div id=editors></div>'); await test_window.loadFile(html);
  await evaluate(await bundle);
  await evaluate(`(() => {
    const css = document.createElement('style'); css.textContent = ${JSON.stringify(fs.readFileSync(path.join(__dirname, '../src/git_graph.css'), 'utf8'))}; document.head.append(css);
    window.reqnode = require; window._options = {userDataPath:${JSON.stringify(root)}}; window.File = {changeCounter:{isDocumentEdited:()=>false}};
    window.JSBridge = {invoke: async (command, data) => { window.copied = JSON.parse(data).text; }};
    const factories = new Map(); const leaves = []; const core = { WorkspaceView: class {constructor(leaf){this.leaf=leaf;}}, app: {viewManager:{registerView:(type,factory)=>factories.set(type,factory)}, commands:{run(){},register(){}}, workspace:{sidebar:{toggle(){}},on(){},ribbon:{addButton(){}},eachLeaves: callback=>leaves.forEach(callback), activeLeaf:null}}};
    window.core=core; const parent = {appendChild(leaf){leaves.push(leaf);document.querySelector('#editors').replaceChildren(leaf.view.containerEl);leaf.view.onOpen();},toggleTab(uri){const leaf=leaves.find(item=>item.state.path===uri);document.querySelector('#editors').replaceChildren(leaf.view.containerEl);leaf.view.onOpen?.();return leaf;}};
    core.app.workspace.createLeaf = ({type,state}) => {const leaf={state,parent};leaf.view=factories.get(type)(leaf);return leaf;};
    const host = graph_qa.create_graph_host(core); window.panel = new graph_qa.git_graph_panel(host, ${JSON.stringify(root)});
    window.graph_leaf = {state:{path:'graph'},view:{containerEl:panel.container},parent}; leaves.push(graph_leaf); core.app.workspace.activeLeaf = graph_leaf;
    document.querySelector('#editors').append(panel.container); const sidebar=document.querySelector('#sidebar-content');sidebar.className='linux-note-git-source-control'; sidebar.append(panel.workbench.sidebar);panel.settings.details_location="right";panel.open();
  })()`);
  await wait('panel.container.dataset.state === "ready"'); await evaluate('panel.settings.details_location="right";panel.render_history();');
  const icon_metrics = await evaluate(`(() => {
    const icons=[...panel.workbench.sidebar.querySelectorAll('svg.git-standard-icon')].map(icon=>({name:icon.dataset.gitIcon,width:getComputedStyle(icon).width,height:getComputedStyle(icon).height,view_box:icon.getAttribute('viewBox'),aria_hidden:icon.getAttribute('aria-hidden'),text:icon.textContent.trim(),paths:icon.querySelectorAll('path').length}));
    const controls=[...panel.workbench.sidebar.querySelectorAll('button.git-icon-button')].map(button=>({text:button.textContent.trim(),title:button.title,label:button.getAttribute('aria-label'),icon:button.querySelector('svg.git-standard-icon')?.dataset.gitIcon}));
    return {icons,controls};
  })()`);
  assert(icon_metrics.icons.length>=20); assert(icon_metrics.controls.length>=15);
  for (const icon of icon_metrics.icons) { assert.equal(icon.width,'16px'); assert.equal(icon.height,'16px'); assert.equal(icon.view_box,'0 0 16 16'); assert.equal(icon.aria_hidden,'true'); assert.equal(icon.text,''); assert(icon.paths>0); }
  for (const control of icon_metrics.controls) { assert.equal(control.text,''); assert.equal(control.label,control.title); assert(/[\u3400-\u9fff]/u.test(control.title)); assert(control.icon); }
  for (const [selector,name] of [['.git-scm-view-menu','more'],['.git-scm-operation-menu','more'],['.git-scm-commit-options','chevron-down'],['.git-scm-history-branches','git-branch'],['.git-scm-history-head','target'],['.git-scm-history-refresh','refresh'],['[data-history-action=fetch]','git-fetch'],['[data-history-action=pull]','repo-pull'],['[data-history-action=push]','repo-push'],['[data-scm-group=changes] > summary .git-scm-inline-action','diff-multiple']]) {
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').querySelector("[data-git-icon]").dataset.gitIcon'),name);
  }
  // 顶部菜单控制三个真实视图；隐藏后的布局必须能从持久化状态恢复。
  const saved_layout = () => evaluate('JSON.parse(localStorage.getItem(panel.workbench.storage_key("layout")))');
  const toggle_view = async name => { await click('.git-scm-view-menu'); await click('[data-action="'+name+'"]'); };
  assert(await evaluate('panel.workbench.repositories_view.hidden && !panel.workbench.changes_pane.hidden && !panel.workbench.history.container.hidden'));
  await toggle_view('show_repositories');
  assert(await evaluate('!panel.workbench.repositories_view.hidden && panel.workbench.repo_select.value === panel.root'));
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
  await click('.git-scm-message'); test_window.webContents.insertText('下拉菜单草稿'); await key('Enter'); test_window.webContents.insertText('第二行');
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
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".git-graph-repo-entry button")].map(button=>button.textContent)'),['修改获取地址','修改推送地址','获取','清理过期引用','删除']); await key('Escape');
  await click('.git-graph-row:not(.git-graph-worktree)'); await wait('!!document.querySelector(".git-graph-file")'); await click('.git-graph-file'); await wait('!!document.querySelector("[data-diff-ready=true]")'); await capture('default_diff'); await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"))'); await capture('history');
  const sash = '.git-graph-body > .linux-note-workspace-sash';
  const drag = async (selector, dx, dy) => {
    const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    test_window.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
    test_window.webContents.sendInputEvent({type:'mouseMove',x:point.x+dx,y:point.y+dy,button:'left'});
    test_window.webContents.sendInputEvent({type:'mouseUp',x:point.x+dx,y:point.y+dy,button:'left',clickCount:1}); await delay(200);
  };
  const first_width = await evaluate('panel.list.clientWidth'); await drag(sash, -140, 0); assert(await evaluate('panel.list.clientWidth') < first_width - 80);
  assert.equal(await evaluate('document.querySelectorAll(".git-scm-history-commit").length'),4);
  assert.equal(await evaluate('document.querySelector(".git-scm-history-toggle").getAttribute("aria-expanded")'),'true');
  assert.equal(await evaluate('document.querySelectorAll(".git-scm-history-commit .git-scm-history-topology circle").length'),4);
  await check_disclosure('.git-scm-history-toggle',true); await check_disclosure('.git-scm-history-commit',false);
  hover_metrics.history_closed = await hover('.git-scm-history-commit'); assert.equal(hover_metrics.history_closed.background,'rgba(136, 136, 136, 0.133)');
  const changes_height = await evaluate('panel.workbench.changes_pane.clientHeight'); await drag('.git-scm-history-sash',0,-70);
  assert(await evaluate('panel.workbench.changes_pane.clientHeight') < changes_height-40);
  await click('.git-scm-history-toggle'); assert.equal(await evaluate('panel.workbench.sections.dataset.historyOpen'),'false');
  await check_disclosure('.git-scm-history-toggle',false);
  await click('.git-scm-history-toggle'); await click('.git-scm-history-commit'); await wait('!!document.querySelector("[data-history-file]")');
  await check_disclosure('.git-scm-history-toggle',true); await check_disclosure('.git-scm-history-commit',true);
  await click('[data-history-file]'); await wait('!!document.querySelector("[data-diff-ready=true]")');
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.models[1].getValue()'),git(['show','HEAD:example.md']));
  const selected_background = await evaluate('getComputedStyle(document.querySelector(".git-scm-history-commit[aria-expanded=true]")).backgroundColor');
  hover_metrics.history_selected = await hover('.git-scm-history-commit[aria-expanded=true]'); assert.equal(hover_metrics.history_selected.background,selected_background); assert.notEqual(selected_background,hover_metrics.history_closed.background);
  hover_metrics.history_file = await hover('[data-history-file]'); assert.equal(hover_metrics.history_file.background,'rgba(136, 136, 136, 0.133)');
  await click('.git-scm-history-more-menu'); await click('[data-action=history_tree]');
  await wait('document.querySelectorAll("[data-history-directory]").length === 2'); assert.equal((await saved_layout()).history_tree,true);
  const nested_directory = '[data-history-directory="z_docs/nested"]';
  await check_disclosure(nested_directory+' > summary',true);
  await click(nested_directory+' > summary'); assert(!await evaluate('document.querySelector('+JSON.stringify(nested_directory)+').open'));
  await check_disclosure(nested_directory+' > summary',false);
  await click(nested_directory+' > summary');
  await check_disclosure(nested_directory+' > summary',true);
  await click('[data-history-file="'+nested_history_path+'"]'); await wait('!!document.querySelector("[data-diff-ready=true]")');
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.models[0].getValue()'),git(['show','HEAD^:'+nested_history_path]));
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.models[1].getValue()'),git(['show','HEAD:'+nested_history_path]));
  await capture('source_control_history_tree');
  await click('.git-scm-history-more-menu'); await click('[data-action=history_list]');
  await wait('!document.querySelector("[data-history-directory]")'); assert.equal((await saved_layout()).history_tree,false);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify('[data-history-file="'+nested_history_path+'"] .git-scm-file-directory')+').textContent'),'z_docs/nested');
  await click('.git-scm-history-commit','right'); assert(await evaluate('!!document.querySelector("[data-action=branch_create]")')); await key('Escape');
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"))');
  // 下方提交图调小后，上方测试文件仍可滚动访问。
  await drag('.git-scm-history-sash',0,70);
  assert(await evaluate('JSON.parse(localStorage.getItem("linux-note-git-graph:v2:settings:"+panel.root)).panel_ratio') < 55);
  await click('.git-graph-columns', 'right'); assert(await evaluate('document.querySelectorAll("[role=menuitemcheckbox]").length') >= 6); await key('Escape');
  await click('.git-graph-row:not(.git-graph-worktree)', 'right'); await click('[data-action="configure_menu"]');
  await click('[data-action-id="branch_create"]'); await click('.git-graph-dialog-footer button');
  await click('.git-graph-row:not(.git-graph-worktree)', 'right'); assert(!await evaluate('!!document.querySelector("[data-action=branch_create]")')); await click('[data-action="configure_menu"]');
  await click('[data-action-id="branch_create"]'); await click('.git-graph-dialog-footer button');
  await key('f', ['control']); assert(await evaluate('document.activeElement === panel.search'));
  await key('Escape');
  await click('.git-graph-row:not(.git-graph-worktree)', 'right'); await capture('context_menu'); await click('[data-action="branch_create"]');
  await click('[data-field="branch"]'); test_window.webContents.insertText('ui-created'); await click('[data-git-preview]'); await wait('!document.querySelector("[data-git-execute]").disabled');
  assert(!git(['branch', '--list', 'ui-created']).trim()); await capture('action_preview'); await click('[data-git-execute]'); await wait('!panel.writing && document.querySelector(".git-graph-action-preview").textContent.includes("操作完成")'); assert(git(['branch', '--list', 'ui-created']).includes('ui-created')); await key('Escape');
  await evaluate('panel.settings_dialog()'); await capture('settings');
  await evaluate('document.querySelector("[data-setting=details_location]").value = "bottom"');
  await click('.git-graph-dialog-footer button'); await wait('panel.container.dataset.state === "ready" && panel.container.dataset.details === "bottom"');
  await evaluate('panel.select_commit(panel.state.commits[0])'); await wait('panel.container.dataset.detailVisible === "true" && !!document.querySelector(".git-graph-file")');
  const first_height = await evaluate('panel.list.clientHeight'); await drag(sash, 0, -80); assert(await evaluate('panel.list.clientHeight') < first_height - 40);
  assert(await evaluate('localStorage.getItem("linux-note-git-graph:v2:settings:" + panel.root).includes("bottom")'));
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
  // Tab 进入行内按钮后，Enter/Space 必须只操作暂存，不被父行当作打开差异。
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"));document.querySelector("[data-scm-group=changes] [data-file=\\"sample.c\\"]").focus()'); await key('Tab');
  assert(await evaluate('document.activeElement.matches(".git-scm-inline-action")'));
  const before_inline_leaf = await evaluate('core.app.workspace.activeLeaf.state.path'); await key('Enter');
  await wait('!panel.writing && !!document.querySelector("[data-scm-group=staged] [data-file=\\"sample.c\\"]")');
  assert(git(['diff','--cached','--name-only']).includes('sample.c')); assert.equal(await evaluate('core.app.workspace.activeLeaf.state.path'),before_inline_leaf);
  await evaluate('document.querySelector("[data-scm-group=staged] [data-file=\\"sample.c\\"]").focus()'); await key('Tab'); await key('Space');
  await wait('!panel.writing && !document.querySelector("[data-scm-group=staged] .git-scm-file")'); assert(!git(['diff','--cached','--name-only']).trim());
  assert.equal(await evaluate('core.app.workspace.activeLeaf.state.path'),before_inline_leaf);
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"));document.querySelector("[data-scm-group=changes] [data-file=\\"sample.c\\"]").focus()'); await key('Enter');
  await wait('!!document.querySelector("[data-diff-ready=true]")'); assert.equal(await evaluate('core.app.workspace.activeLeaf.view.editor.models[1].getValue()'),modified_code.join('\n'));
  await evaluate('void (core.app.workspace.activeLeaf=graph_leaf.parent.toggleTab("graph"))');
  for (const selector of ['.git-scm-message','.git-scm-filter','.git-graph-search']) {
    await evaluate(`window.edit_context_prevented=null;document.querySelector(${JSON.stringify(selector)}).addEventListener('contextmenu',event=>setTimeout(()=>window.edit_context_prevented=event.defaultPrevented,0),{once:true})`);
    await click(selector,'right'); assert.equal(await evaluate('window.edit_context_prevented'),false, selector+' keeps the native edit context menu');
    assert(!await evaluate('!!document.querySelector(".git-graph-menu")')); await key('Escape');
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
  await click('[data-scm-group=staged] [data-file="new-track.txt"]','right'); await click('[data-action=unstage]'); await wait('!panel.writing');
  await click('[data-scm-group=changes] [data-file="scratch.tmp"]','right'); await click('[data-action=ignore_file]'); await wait('!panel.writing && !document.querySelector("[data-file=\\"scratch.tmp\\"]")');
  assert.equal(git(['check-ignore','scratch.tmp']).trim(),'scratch.tmp'); assert(fs.existsSync(path.join(root,'scratch.tmp'))); assert(!git(['diff','--cached','--name-only']).trim());
  // Enter 保留多行消息；Ctrl+Enter 提交暂存快照，不带入工作区的另一份修改。
  git(['add','--','sample.c']); const staged_code = fs.readFileSync(path.join(root,'sample.c'),'utf8'); fs.appendFileSync(path.join(root,'sample.c'),'// keep unstaged\n');
  await evaluate('panel.refresh(false)'); const before_manual = git(['rev-parse','HEAD']);
  const file_columns = () => evaluate(`(() => {
    const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
    return {rows:[...panel.workbench.groups.querySelectorAll('.git-scm-file')].map(row=>({path:row.dataset.file,status:box(row.querySelector('.git-scm-file-status')).left,action:box(row.querySelector('.git-scm-inline-action')).left,right:box(row).right})),
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
    for (const column of ['status','action']) {
      assert(Math.max(...after_hover.rows.map(row=>row[column]))-Math.min(...after_hover.rows.map(row=>row[column]))<1, width+': '+column+' aligns across all file rows');
      after_hover.rows.forEach((row,index)=>assert.equal(row[column],before_hover.rows[index][column],width+': '+column+' does not shift on hover'));
    }
    after_hover.headers.forEach(x=>assert(Math.abs(x-after_hover.rows[0].action)<1,width+': group and file stage buttons align'));
    after_hover.history.forEach(x=>assert(Math.abs(x-after_hover.rows[0].status)<1,width+': history and changed-file status columns align'));
    assert(after_hover.overflow<1,width+': changes do not acquire a horizontal scrollbar');
    after_hover.rows.forEach(row=>assert(row.right<=after_hover.sidebar.right+1,width+': file remains within the sidebar'));
    const long_label = await evaluate(`(() => {const label=document.querySelector(${JSON.stringify('[data-file="'+long_file_path+'"] .git-scm-file-name')});return {width:label.clientWidth,scroll:label.scrollWidth,overflow:getComputedStyle(label).textOverflow};})()`);
    assert(long_label.width>0 && long_label.scroll>long_label.width); assert.equal(long_label.overflow,'ellipsis');
    column_metrics.push({width,...after_hover}); await capture('source_control_columns_'+width);
  }
  await evaluate('document.querySelector("#sidebar-content").style.width="260px"'); await delay(180);
  await capture('source_control_columns');
  await click('.git-scm-message'); test_window.webContents.insertText('manual first'); await key('Enter');
  assert.equal(await evaluate('panel.workbench.message.value'),'manual first\n'); test_window.webContents.insertText('manual second'); await key('Enter'); test_window.webContents.insertText('manual third');
  await evaluate('panel.workbench.message.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",ctrlKey:true,isComposing:true,bubbles:true,cancelable:true}))');
  assert.equal(git(['rev-parse','HEAD']),before_manual); assert.equal(await evaluate('panel.workbench.message.value'),'manual first\nmanual second\nmanual third');
  await key('Enter',['control']); await wait('!panel.writing && panel.workbench.message.value === ""');
  assert.notEqual(git(['rev-parse','HEAD']),before_manual); assert.equal(git(['show','HEAD:sample.c']),staged_code); assert.equal(git(['show','--pretty=format:','--name-only','HEAD']).trim(),'sample.c');
  assert(git(['diff','--name-only']).includes('sample.c')); assert(git(['ls-files','--others','--exclude-standard']).includes('new-track.txt'));
  const after_manual = git(['rev-parse','HEAD']); await click('.git-scm-message'); test_window.webContents.insertText('keep failed draft'); await click('.git-scm-commit'); await wait('!panel.writing && !!panel.workbench.notice.textContent');
  assert.equal(git(['rev-parse','HEAD']),after_manual); assert.equal(await evaluate('panel.workbench.message.value'),'keep failed draft');
  git(['add','--','sample.c']); await evaluate('panel.refresh(false)'); await evaluate('panel.action_dialog("commit","changes")');
  await click('[data-field=message]'); test_window.webContents.insertText('dialog first'); await key('Enter'); test_window.webContents.insertText('dialog second');
  await click('[data-git-preview]'); await wait('!document.querySelector("[data-git-execute]").disabled');
  assert.equal(git(['rev-parse','HEAD']),after_manual); await click('[data-git-execute]'); await wait('!panel.writing && document.querySelector("[data-git-execute]").disabled'); assert.notEqual(git(['rev-parse','HEAD']),after_manual); await key('Escape');
  console.log(JSON.stringify({status:'PASS',checks:[
    'real pointer context menu','keyboard find and escape','preview has no mutation','execution creates branch','settings and focus','horizontal and vertical mouse sash','per-context menu checkbox persistence','column checkbox menu','colored two-column history','source sidebar correct index/worktree comparison','three aligned hunks and C syntax','one-click stage and unstage','nested menu keyboard navigation','file timeline opens original revision','sidebar refresh survives closing busy graph','two file sections including new files','new file stages directly','ignore keeps disk file and index','Enter inserts newline and Ctrl Enter commits','shortcut commits staged content only','failed commit retains draft','commit dialog preserves multiline message','thin scrollbars on both sides','both panes wheel scroll together','diff center remains draggable','diff minimaps stay disabled after option changes','sidebar renders real commit graph','sidebar history expands actual files and opens revision diff','sidebar graph supports commit context menu','sidebar history collapses and resizes',
    'view menu persists repositories changes and history visibility','last visible view remains recoverable','message section collapse persists','single line message grows with input','commit dropdown preserves draft and amend choice without mutation','history list and collapsible nested tree open correct revisions','narrow sidebar retains filename ellipsis and aligned columns','hover never shifts file status or action slots','group stage button aligns with file stage buttons','history status aligns with change status','inline action keyboard stages and unstages without opening diff','file row keyboard opens diff','editable fields preserve native context menus','blank sidebar retains Git context menu','remote configuration actions are Chinese','commit buttons retain blue contrast on hover','history hover feedback preserves selected state',
    'SCM controls use 16px official SVG shapes and Chinese accessible names','icon controls contain no text stand-ins','summary and history disclosure SVG follows open state','menus use SVG checks and submenu arrows','topology circles are independent of control SVGs','standard overview shows 15px red and green lanes','both overview marker lanes accept real clicks and synchronize panes'
  ],scroll_metrics,column_metrics,hover_metrics,icon_metrics,overview_metrics,evidence}));
}).catch(async error => { console.error(error); if (test_window) { console.error(await evaluate('document.body.innerText')); await capture('failure'); } process.exitCode = 1; }).finally(() => { if (test_window && !test_window.isDestroyed()) test_window.destroy(); app.exit(process.exitCode || 0); });
