// R006.7：真实全局捕获先于真实 xterm；只替换 PTY 与 Shell 发现，不运行用户命令。
const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const { editor_plugins } = require('./editor_bundle.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_terminal_capture_'));
app.setPath('userData', path.join(evidence, 'profile'));
app.disableHardwareAcceleration();
let test_window;
const checks = [], failures = [];
const input_evidence = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = async source => {
  const result = await test_window.webContents.executeJavaScript('(async()=>{try{return {value:await (0,eval)(' + JSON.stringify(source) + ')}}catch(error){return {error:error.stack}}})()');
  if (result.error) throw new Error(result.error);
  return result.value;
};
const wait = async source => {
  for (let index = 0; index < 160; index++) { if (await evaluate(source)) return; await delay(25); }
  throw new Error('Timed out: ' + source);
};
const check = async (source, label) => {
  const value = await evaluate(source);
  (value ? checks : failures).push(label);
};

app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: {
    nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false,
  } });
  const fixture = path.join(evidence, 'fixture.html');
  fs.writeFileSync(fixture, '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:#fff;color:#333}#titlebar{height:35px;display:flex}.typ-workspace-root{position:absolute;left:250px;right:0;top:35px;bottom:24px}#sidebar-content{position:absolute;left:0;top:35px;bottom:24px;width:250px}.ty-footer{position:absolute;left:250px;right:0;bottom:0;height:24px}.workspace-titlebar-menu{display:flex;width:250px}.workspace-titlebar-popup{position:fixed;z-index:9999}</style><div id="titlebar"></div><aside id="typora-sidebar"><div id="sidebar-content"></div></aside><main class="typ-workspace-root"><input id="editor" value="UNSAVED_DOCUMENT"><section class="linux-note-terminal linux-note-source-file"><textarea id="source-editor"></textarea></section></main><footer class="ty-footer">status</footer>', 'utf8');
  await test_window.loadFile(fixture);
  const pty_mock = `export async function start_terminal_pty(runtime,request,callbacks){
    const record={request,callbacks,writes:[],killed:0};window.pty_starts.push(record);
    return {pid:4000+window.pty_starts.length,write:data=>record.writes.push(data),resize(){},acknowledge(){},kill(){record.killed++;}};
  }`;
  const profile_mock = `export function create_terminal_profile_service(){const profiles=[{id:'cmd',title:'Command Prompt',executable:'cmd.exe',args:[]}];return {profiles:()=>profiles,warnings:()=>[],ready:async()=>profiles,refresh:async()=>profiles,dispose(){}};}`;
  const bundle = await build({
    stdin: { contents: 'export {bind_terminal_workspace} from "./src/terminal_workspace";export {bind_workspace_search} from "./src/workspace_search";export {install_workspace_shortcuts} from "./src/workspace_shortcuts";export {create_workspace_titlebar_menu} from "./src/workspace_titlebar_menu";export {bind_workspace_breadcrumbs} from "./src/workspace_breadcrumbs";', resolveDir: path.join(__dirname, '..') },
    bundle: true, write: false, format: 'iife', globalName: 'capture_qa', loader: { '.css': 'text' },
    plugins: [...editor_plugins(), { name: 'terminal-boundaries', setup(builder) {
      builder.onLoad({ filter: /terminal_pty_client\.ts$/ }, () => ({ contents: pty_mock, loader: 'js' }));
      builder.onLoad({ filter: /terminal_profile_detection\.ts$/ }, () => ({ contents: profile_mock, loader: 'js' }));
    } }],
  });
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`(async()=>{window.pty_starts=[];window.calls=[];window.commands=new Map();window.factories=new Map();window.leaves=[];
    window.reqnode=require;window._options={userDataPath:${JSON.stringify(evidence)}};
    window.sidebar={panels:[],activePanel:undefined,isShown:false,
      addPanel(panel){this.panels.push(panel);panel.containerEl.hidden=true;document.querySelector('#sidebar-content').append(panel.containerEl);return()=>{this.panels=this.panels.filter(item=>item!==panel);panel.containerEl.remove();};},
      switch(type){this.activePanel?.onhide?.();this.activePanel=this.panels.find(panel=>panel instanceof type);this.show();},
      show(){this.isShown=true;if(this.activePanel){this.activePanel.containerEl.hidden=false;this.activePanel.onshow?.();}},
      hide(){this.isShown=false;if(this.activePanel){this.activePanel.containerEl.hidden=true;this.activePanel.onhide?.();}},
      toggle(){calls.push('sidebar-toggle');this.isShown?this.hide():this.show();}};
    window.parent_group={appendChild(leaf){leaves.push(leaf);document.querySelector('.typ-workspace-root').append(leaf.view.containerEl);leaf.view.onOpen();},toggleTab(uri){const leaf=leaves.find(item=>item.state.path===uri);leaf.view.onOpen();return leaf;},removeTab(uri){const index=leaves.findIndex(item=>item.state.path===uri);if(index>=0){const leaf=leaves.splice(index,1)[0];leaf.view.onClose();leaf.view.containerEl.remove();core.app.workspace.activeLeaf=original_leaf;}}};
    window.original_leaf={state:{path:${JSON.stringify(path.join(evidence, 'draft.md'))}},parent:parent_group,view:{containerEl:document.querySelector('.typ-workspace-root')}};
    parent_group.containerEl=document.querySelector('.typ-workspace-root');parent_group.activeLeaf=original_leaf;
    const strip=document.createElement('div');strip.className='workspace-tab-strip';parent_group.containerEl.prepend(strip);
    window.core={WorkspaceView:class{constructor(leaf){this.leaf=leaf;}},SidebarPanel:class{},app:{
      viewManager:{registerView(id,factory){factories.set(id,factory);return()=>factories.delete(id);}},
      commands:{register(command){commands.set(command.id,command);return()=>commands.delete(command.id);},run(id){calls.push(id);commands.get(id)?.callback();}},
      workspace:{activeLeaf:original_leaf,sidebar,eachLeaves(callback){callback(original_leaf);leaves.forEach(callback);},createLeaf({type,state}){const leaf={state,parent:parent_group};leaf.view=factories.get(type)(leaf);return leaf;},on(){return()=>{};},ribbon:{addButton(){return()=>{};}}}}};
    window.files={fs:require('node:fs'),path_api:require('node:path'),context_root:()=>${JSON.stringify(evidence)},current_file:()=>'',open_file:async()=>{},copy:async()=>{}};
    window.host={core,fs:files.fs,path_api:files.path_api,process_api:process,copy:async text=>calls.push('copy:'+text),context_path:files.context_root,workspace_path:files.context_root,runner:()=>({run:async()=>${JSON.stringify(evidence)}})};
    window.search_binding=capture_qa.bind_workspace_search(core,files);
    window.breadcrumb_binding=capture_qa.bind_workspace_breadcrumbs(core,files);
    window.terminal_binding=capture_qa.bind_terminal_workspace(host);
    window.menu_binding=capture_qa.create_workspace_titlebar_menu(document.querySelector('#titlebar'),[{label:'文件',mnemonic:'f',entries:async()=>[{label:'新建',action:()=>calls.push('menu-new')}]}]);
    document.querySelector('#titlebar').append(menu_binding.element);
    window.shortcut_binding=capture_qa.install_workspace_shortcuts(core.app,{ClientCommand:{zoomIn(){},zoomOut(){}}});
    window.first=await terminal_binding.open(${JSON.stringify(evidence)},'cmd');
    window.send=(target,options,type='keydown')=>{const event=new KeyboardEvent(type,{bubbles:true,cancelable:true,...options});target.dispatchEvent(event);return event.defaultPrevented;};
    window.reset_terminal=()=>{menu_binding.close();sidebar.hide();if(document.querySelector('.typora-terminal-panel').hidden)terminal_binding.toggle();first.surface.container.querySelector('.terminal-find').hidden=true;first.surface.focus();calls.length=0;};
    })();`);
  await wait('first.session.state==="running"&&first.surface.term.textarea');
  await delay(80);

  // 合成 renderer 事件能精确回放 Windows 的 229 与 isComposing 两条路径。
  for (const [mode, flags] of [['composition', { isComposing: true }], ['legacy229', { keyCode: 229 }]]) {
    for (const [label, options] of [
      ['workspace search', { key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true }],
      ['terminal visibility', { key: '`', code: 'Backquote', ctrlKey: true }],
      ['terminal split', { key: '%', code: 'Digit5', ctrlKey: true, shiftKey: true }],
      ['titlebar mnemonic', { key: 'f', code: 'KeyF', altKey: true }],
      ['breadcrumb focus', { key: ';', code: 'Semicolon', ctrlKey: true, shiftKey: true }],
    ]) {
      await evaluate('reset_terminal();void 0');
      await check(`(()=>{const count=pty_starts.length;const prevented=send(first.surface.term.textarea,${JSON.stringify({ ...options, ...flags })});return !prevented&&pty_starts.length===count&&!document.querySelector('.typora-terminal-panel').hidden&&!sidebar.isShown&&first.surface.container.querySelector('.terminal-find').hidden&&document.activeElement===first.surface.term.textarea;})()`, mode + ': ' + label + ' preserves terminal event, focus and state');
    }
    await evaluate('menu_binding.close();sidebar.hide();document.querySelector("#editor").focus();calls.length=0;void 0');
    await check(`!send(document.querySelector('#editor'),${JSON.stringify({ key: 'b', code: 'KeyB', ctrlKey: true, ...flags })})&&calls.length===0&&document.activeElement===document.querySelector('#editor')`, mode + ': ordinary workspace shortcut preserves editor composition');
    await evaluate('send(document.querySelector("#editor"),{key:"b",code:"KeyB",ctrlKey:true});first.surface.focus();void 0');
    await check(`!send(first.surface.term.textarea,${JSON.stringify({ key: 'b', code: 'KeyB', ctrlKey: true, ...flags })},'keyup')&&document.activeElement===first.surface.term.textarea`, mode + ': composition keyup after a prior global shortcut is released');
    await evaluate('reset_terminal();menu_binding.element.querySelector("button").click();void 0');
    await wait('Boolean(document.querySelector(".workspace-titlebar-popup"))');
    await evaluate('first.surface.focus();void 0');
    await check(`!send(first.surface.term.textarea,${JSON.stringify({ key: 'ArrowDown', code: 'ArrowDown', ...flags })})&&document.activeElement===first.surface.term.textarea&&Boolean(document.querySelector('.workspace-titlebar-popup'))`, mode + ': opened menu does not capture candidate navigation');
    await check(`!send(first.surface.term.textarea,${JSON.stringify({ key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true, ...flags })})&&document.activeElement===first.surface.term.textarea&&Boolean(document.querySelector('.workspace-titlebar-popup'))`, mode + ': shortcut preflight does not dismiss menu or restore stale focus');
  }
  await evaluate('reset_terminal();void 0');
  for (const code of ['ShiftLeft', 'ShiftRight']) for (const type of ['keydown', 'keyup']) {
    await check(`!send(first.surface.term.textarea,{key:'Shift',code:${JSON.stringify(code)},shiftKey:${type === 'keydown'}},${JSON.stringify(type)})&&document.activeElement===first.surface.term.textarea`, code + ' ' + type + ' retains browser default and terminal focus');
  }
  await check(`send(first.surface.term.textarea,{key:'f',code:'KeyF',ctrlKey:true,shiftKey:true})&&!first.surface.container.querySelector('.terminal-find').hidden&&!sidebar.isShown&&document.activeElement===first.surface.container.querySelector('.terminal-find input')`, 'normal terminal Ctrl+Shift+F reaches terminal find before workspace search');
  await evaluate('reset_terminal();document.querySelector("#source-editor").focus();void 0');
  await check(`send(document.querySelector('#source-editor'),{key:'f',code:'KeyF',ctrlKey:true,shiftKey:true})&&sidebar.isShown&&document.activeElement===search_binding.container.querySelector('textarea')`, 'source-file shared shell is an editor and still opens workspace search');
  await evaluate('sidebar.hide();document.querySelector("#editor").focus();calls.length=0;void 0');
  await check(`send(document.querySelector('#editor'),{key:'b',code:'KeyB',ctrlKey:true})&&calls.filter(value=>value==='sidebar-toggle').length===1`, 'normal Ctrl+B invokes shared workspace action once');
  await check(`send(document.querySelector('#editor'),{key:'b',code:'KeyB',ctrlKey:true},'keyup')`, 'normal consumed shortcut keyup remains paired');
  await evaluate('reset_terminal();void 0');
  await check(`send(first.surface.term.textarea,${JSON.stringify({ key: '`', code: 'Backquote', ctrlKey: true })})&&document.querySelector('.typora-terminal-panel').hidden`, 'normal terminal toggle still executes');
  await evaluate('terminal_binding.toggle();reset_terminal();void 0');

  // Chromium 实际组合与字符输入：完整全局捕获链保持输入法上屏只写入一次。
  test_window.webContents.debugger.attach('1.3');
  await evaluate('pty_starts[0].writes.length=0;first.surface.focus();void 0');
  await test_window.webContents.debugger.sendCommand('Input.imeSetComposition', { text: 'pin', selectionStart: 3, selectionEnd: 3 });
  await delay(30);
  test_window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Shift', modifiers: ['shift'] });
  await test_window.webContents.debugger.sendCommand('Input.insertText', { text: 'pin' });
  test_window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Shift' });
  await delay(30);
  await test_window.webContents.debugger.sendCommand('Input.insertText', { text: 'abc' });
  await delay(60);
  input_evidence.push(await evaluate('({mode:"Chromium IME plus Shift",writes:[...pty_starts[0].writes],terminal_focused:document.activeElement===first.surface.term.textarea})'));
  await check('pty_starts[0].writes.join("")==="pinabc"&&document.activeElement===first.surface.term.textarea', 'Chromium composition, Shift commit and subsequent English reach PTY exactly once');
  test_window.webContents.debugger.detach();
  await evaluate('window.original_surface=first.surface;window.original_process=pty_starts[0];commands.get("linux_note:terminal_move_editor").callback();void 0');
  await wait('Boolean(document.querySelector(".terminal-editor-host"))');
  await evaluate('first.surface.focus();void 0');
  await check('first.surface===original_surface&&pty_starts[0]===original_process&&original_process.killed===0', 'moving terminal to editor keeps surface and PTY identity');
  for (const flags of [{ isComposing: true }, { keyCode: 229 }]) {
    await check(`!send(first.surface.term.textarea,${JSON.stringify({ key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true, ...flags })})&&document.activeElement===first.surface.term.textarea&&!sidebar.isShown`, 'editor terminal IME preserves event and focus ' + JSON.stringify(flags));
  }
  await check(`send(first.surface.term.textarea,{key:'f',code:'KeyF',ctrlKey:true,shiftKey:true})&&!first.surface.container.querySelector('.terminal-find').hidden&&!sidebar.isShown`, 'editor terminal retains local find ownership');
  await evaluate('commands.get("linux_note:terminal_move_panel").callback();void 0');
  await wait('!document.querySelector(".terminal-editor-host")');
  await check('first.surface===original_surface&&original_process.killed===0', 'returning terminal to panel preserves surface and PTY');

  // 销毁全局捕获后保留一个普通输入目标，确认同组快捷键不再执行任何动作。
  await evaluate('menu_binding.dispose();shortcut_binding.dispose();breadcrumb_binding.dispose();search_binding.dispose();terminal_binding.dispose();calls.length=0;document.querySelector("#editor").focus();void 0');
  for (const options of [
    { key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true },
    { key: '`', code: 'Backquote', ctrlKey: true },
    { key: 'b', code: 'KeyB', ctrlKey: true },
    { key: 'f', code: 'KeyF', altKey: true },
    { key: ';', code: 'Semicolon', ctrlKey: true, shiftKey: true },
  ]) await check(`!send(document.querySelector('#editor'),${JSON.stringify(options)})&&calls.length===0`, 'disposed capture releases ' + options.code + JSON.stringify(options));
  await check('commands.size===0&&factories.size===0&&pty_starts.every(record=>record.killed===1)&&!document.querySelector(".typora-terminal-panel,.linux-note-workspace-search,.workspace-titlebar-popup,.workspace-breadcrumbs")', 'disposal releases commands, views, processes and owned DOM');
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ checks, failures, input_evidence }, null, 2), 'utf8');
  assert.deepEqual(failures, [], 'global capture regressions');
  console.log(JSON.stringify({ status: 'PASS', checks, evidence }));
}).catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', checks, failures, error: String(error.stack || error), evidence }));
  process.exitCode = 1;
}).finally(() => { test_window?.destroy(); app.exit(process.exitCode || 0); });
