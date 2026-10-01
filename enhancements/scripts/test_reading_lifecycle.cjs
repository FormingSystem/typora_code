// Isolate Electron verify reading / path module uninstall, reload and async cancel, no real Typora file writing.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { editor_plugins } = require('./editor_bundle.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_reading_lifecycle_'));
app.setPath('userData', path.join(root, 'user_data')); app.disableHardwareAcceleration();
let test_window;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => test_window.webContents.executeJavaScript(source);
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 900, height: 600, webPreferences: { contextIsolation: false, backgroundThrottling: false, offscreen: true } });
  const filename = path.join(root, 'test.html');
  fs.writeFileSync(filename, '<!doctype html><meta charset="utf-8"><style>content{display:block;height:300px;overflow:auto}#write{height:3000px}#menu{display:block}</style><content><div id="write"><p>Reading content</p></div></content><ul id="menu"></ul>');
  await test_window.loadFile(filename);
  const bundle = await build({ plugins:editor_plugins(), stdin:{contents:'export { bind_reading_native_scroll } from "./src/reading_native_scroll"; export { bind_reading_minimap } from "./src/reading_minimap"; export { bind_file_path_actions } from "./src/file_path_actions"; export { bind_reading_navigation, navigate_reading_target } from "./src/reading_navigation"; export { register_navigation_editor, notify_navigation_selection } from "./src/reading_navigation_ports"; export { create_reading_workspace } from "./src/reading_workspace"; export { reveal_markdown_location } from "./src/workspace_markdown_location";', resolveDir:path.join(__dirname,'..')}, bundle:true, loader:{'.css':'text'}, format:'iife', globalName:'qa', write:false });
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`window.navigation_sample={};window.addEventListener('keydown',function measure(event){if(window.measure_navigation&&event.altKey&&event.key==='ArrowLeft'){window.removeEventListener('keydown',measure,true);const started=performance.now();const sample=()=>{if(document.querySelector('content').scrollTop===120&&!navigation_sample.first_frame_ms)navigation_sample.first_frame_ms=performance.now()-started;if(document.documentElement.dataset.linuxNoteHistoryForward==='true'){navigation_sample.ready_ms=performance.now()-started;return}requestAnimationFrame(sample)};requestAnimationFrame(sample)}},true);void 0`);
  await evaluate(`(() => {
    window.subscriptions=new Map(); window.commands=new Map(); window.notices=[]; window.copy_count=0;
    const on=(name,callback)=>{let set=subscriptions.get(name);if(!set)subscriptions.set(name,set=new Set());set.add(callback);return()=>set.delete(callback)};
    window.emit=(name,data)=>{for(const callback of subscriptions.get(name)||[])callback(data)};
    class View { onOpen(){} getState(){return {original:true}} setState(){} isEditor(){return true} }
    const leaf={state:{path:'/test/project-docs/P01.md'},containerEl:document.querySelector('content'),view:new View()};leaf.containerEl.classList.add('mod-active');leaf.view.leaf=leaf;leaf.view.containerEl=document.querySelector('#write');leaf.parent={activeLeaf:leaf,toggleTab(){return leaf}};
    window.leaf=leaf;window.original_methods={onOpen:View.prototype.onOpen,getState:View.prototype.getState,setState:View.prototype.setState};
    window.opened_paths=[];window.host={openFile(path){opened_paths.push(path)},commands:{register(command){commands.set(command.id,command);return()=>commands.delete(command.id)},run(){}},workspace:{activeLeaf:leaf,eachLeaves(callback){callback(leaf)},rootSplit:{on},on,activeEditor:{openFile(){}}}};
    window[Symbol.for('typora-code:workspace')]={app:host,Notice:class{constructor(message){notices.push(message)}}};
    window.File={bundle:{filePath:'/test/project-docs/P01.md'},getMountFolder(){return '/test'},editor:{tryOpenUrl(){},library:{openFile(path){opened_paths.push(path)}},selection:{buildUndo(){return null}},sourceView:{inSourceMode:false}}};
    window.reqnode=name=>name==='fs'?{statSync(path){if(path.endsWith('/missing.md'))throw Error('ENOENT');return{isFile:()=>true}}}:({normalize:p=>p,isAbsolute:p=>p.startsWith('/'),resolve:(...p)=>p.join('/'),dirname:p=>p.substring(0,p.lastIndexOf('/')),relative:(base,p)=>p.slice(base.length+1),basename:p=>p.split('/').pop(),sep:'/'});
    window.JSBridge={invoke(){copy_count++;return new Promise(resolve=>window.finish_copy=resolve)}};
    window.original_url=File.editor.tryOpenUrl;window.original_file=File.editor.library.openFile;window.original_app=host.openFile;window.original_editor=host.workspace.activeEditor.openFile;
  })()`);
  const layout_checks=await evaluate(`(() => {
    const owner=document.querySelector('content'),root=document.querySelector('#write');
    owner.classList.add('typ-workspace-binding');
    let count=0;
    for(let index=0;index<100;index++){
      const original=function(){owner.scrollTop=20;File.inBusyMode=!File.inBusyMode;return 7;};
      const editor={writingArea:root,sourceView:{inSourceMode:false},tryEnterBusyMode:original};
      const release=qa.bind_reading_native_scroll(editor,{File});
      owner.scrollTop=300; if(editor.tryEnterBusyMode()!==7||owner.scrollTop!==300)throw Error('passive focus jump');count++;
      editor.sourceView.inSourceMode=true;editor.tryEnterBusyMode();if(owner.scrollTop!==20)throw Error('source owner intercepted');count++;
      editor.sourceView.inSourceMode=false;File._onInitParse=true;owner.scrollTop=300;editor.tryEnterBusyMode();if(owner.scrollTop!==20)throw Error('initialization intercepted');count++;
      File._onInitParse=false;release();if(editor.tryEnterBusyMode!==original)throw Error('method not restored');count++;
    }
    const failing={writingArea:root,sourceView:{},tryEnterBusyMode(){owner.scrollTop=25;throw Error('native failure');}};
    const release=qa.bind_reading_native_scroll(failing,{File});owner.scrollTop=400;
    try{failing.tryEnterBusyMode();throw Error('missing failure');}catch(error){if(error.message!=='native failure'||owner.scrollTop!==400)throw error;}count++;
    const replacement=()=>{};failing.tryEnterBusyMode=replacement;release();if(failing.tryEnterBusyMode!==replacement)throw Error('later owner replaced');count++;
    owner.scrollTop=0;return count;
  })()`);
  assert.equal(layout_checks,402,'100 passive-layout binding cycles, ownership boundaries and failure cleanup');
  await evaluate('window.dispose_nav=qa.bind_reading_navigation(); window.dispose_paths=qa.bind_file_path_actions();window.dispose_map=qa.bind_reading_minimap();void 0;');
  assert(await evaluate('dispose_nav===qa.bind_reading_navigation()&&dispose_paths===qa.bind_file_path_actions()&&dispose_map===qa.bind_reading_minimap()'));
  assert.equal(await evaluate('commands.size'),2);
  await evaluate(`host.openFile('hardware.md')`);
  assert.equal(await evaluate('opened_paths.pop()'),'/test/project-docs/hardware.md','relative Markdown links use the source document directory');
  const missing_before=await evaluate('({html:document.querySelector("#write").innerHTML,path:File.bundle.filePath,leaf:leaf.state.path,scroll:document.querySelector("content").scrollTop,opens:opened_paths.length})');
  assert(await evaluate(`qa.navigate_reading_target('missing.md').then(()=>false,()=>true)`));
  assert.deepEqual(await evaluate('({html:document.querySelector("#write").innerHTML,path:File.bundle.filePath,leaf:leaf.state.path,scroll:document.querySelector("content").scrollTop,opens:opened_paths.length})'),missing_before,'missing target cannot clear or switch the current Markdown before failing');

  // Single cancel takes effect before native open, cannot open already canceled transfer target after other navigation is completed.
  await evaluate(`window.cancelled_open=new AbortController();cancelled_open.abort();window.cancelled_result=qa.navigate_reading_target('/test/cancelled.md',{signal:cancelled_open.signal}).then(()=>false,error=>/取消/.test(error.message));void 0;`);
  assert(await evaluate('cancelled_result'));
  assert.equal(await evaluate('opened_paths.length'),missing_before.opens,'pre-aborted navigation never enters the native opener');
  await evaluate(`window.blocking_open=new AbortController();window.blocking_result=qa.navigate_reading_target('/test/blocking.md',{signal:blocking_open.signal}).then(()=>false,error=>/取消/.test(error.message));window.queued_open=new AbortController();window.queued_result=qa.navigate_reading_target('/test/queued.md',{signal:queued_open.signal}).then(()=>false,error=>/取消/.test(error.message));void 0;`);
  await delay(70);
  assert.deepEqual(await evaluate('opened_paths.slice(-1)'),['/test/blocking.md']);
  await evaluate('queued_open.abort();void 0;');
  assert(await evaluate('queued_result'),'queued cancellation settles while the earlier native load is still pending');
  await evaluate('blocking_open.abort();void 0;');
  assert(await evaluate('blocking_result'));
  await delay(100);
  assert(!await evaluate(`opened_paths.includes('/test/queued.md')`),'cancelled queued target cannot open late');
  assert.deepEqual(await evaluate('({html:document.querySelector("#write").innerHTML,path:File.bundle.filePath,leaf:leaf.state.path,scroll:document.querySelector("content").scrollTop})'),{html:missing_before.html,path:missing_before.path,leaf:missing_before.leaf,scroll:missing_before.scroll},'cancelled transfer preserves current text, file identity and scroll');
  await evaluate(`window.locate_abort=new AbortController();window.locate_signal=null;window.locate_finished=false;window.locate_result=qa.navigate_reading_target('/test/project-docs/P01.md',{signal:locate_abort.signal,locate:signal=>{locate_signal=signal;return new Promise(resolve=>signal.addEventListener('abort',()=>{locate_finished=true;resolve()},{once:true}))}}).then(()=>false,error=>/取消/.test(error.message));void 0;`);
  for(let attempt=0;attempt<50&&!await evaluate('Boolean(locate_signal)');attempt++)await delay(20);
  assert(await evaluate('Boolean(locate_signal)'));
  await evaluate('locate_abort.abort();void 0;');
  assert(await evaluate('locate_result'));assert(await evaluate('locate_signal.aborted&&locate_finished'),'per-operation cancellation reaches the location callback');
  await evaluate(`document.querySelector('content').scrollTop=360;window.restore_abort=new AbortController();window.transfer_restore=qa.navigate_reading_target('/test/project-docs/P01.md',{signal:restore_abort.signal}).then(()=>false,error=>/取消/.test(error.message));void 0;`);
  await delay(160);
  await evaluate(`restore_abort.abort();document.querySelector('content').scrollTop=740;void 0;`);
  assert(await evaluate('transfer_restore'));await delay(100);
  assert.equal(await evaluate(`document.querySelector('content').scrollTop`),740,'cancelled operation cannot continue the target position restoration loop');

  await evaluate(`emit('file-menu',{menu:{containerEl:document.querySelector('#menu')},path:'/test/project-docs/P01.md'});commands.values().next().value.callback();`);
  await delay(30);
  assert.equal(await evaluate('copy_count'),1);
  assert.equal(await evaluate('document.querySelectorAll(".linux-note-path-item").length'),3);
  await evaluate(`window.pending_navigation=qa.navigate_reading_target('/test/b.md').then(()=>false,()=>true);dispose_nav();dispose_nav();dispose_paths();dispose_paths();dispose_map();dispose_map();finish_copy();`);
  assert(await evaluate('pending_navigation'));
  await delay(220);
  assert(await evaluate('File.editor.tryOpenUrl===original_url&&File.editor.library.openFile===original_file&&host.openFile===original_app&&host.workspace.activeEditor.openFile===original_editor'));
  assert(await evaluate('leaf.view.onOpen===original_methods.onOpen&&leaf.view.getState===original_methods.getState&&leaf.view.setState===original_methods.setState'));
  assert.equal(await evaluate('[...subscriptions.values()].reduce((sum,set)=>sum+set.size,0)'),0);
  assert.equal(await evaluate('commands.size'),0);assert.equal(await evaluate('notices.length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".linux-note-path-item,.linux-note-reading-minimap,#linux-note-reading-minimap-style").length'),0);
  assert(await evaluate('![...document.documentElement.attributes].some(a=>/data-linux-note-(reading|copy-path|history)/.test(a.name))'));
  await evaluate(`window.workspace=qa.create_reading_workspace(()=>File.bundle.filePath,()=>false);window.restore_pending=workspace.restore(workspace.active(),{scroll_top:600,scroll_left:0});workspace.dispose();workspace.dispose();document.querySelector('content').scrollTop=900;`);
  assert.equal(await evaluate('restore_pending'),false);await delay(100);assert.equal(await evaluate("document.querySelector('content').scrollTop"),900);
  // First location delivery is not equal to stable period, stale host scroll still correct; new task and cancel cannot be pulled back by old task.
  await evaluate(`window.workspace=qa.create_reading_workspace(()=>File.bundle.filePath,()=>false);window.position_abort=new AbortController();window.initial_started=performance.now();void 0`);
  assert(await evaluate(`workspace.restore(workspace.active(),{scroll_top:600,scroll_left:0},{background:true,signal:position_abort.signal})`));
  assert.equal(await evaluate("document.querySelector('content').scrollTop"),600);
  await delay(80);await evaluate("document.querySelector('content').scrollTop=0;void 0");await delay(90);
  assert.equal(await evaluate("document.querySelector('content').scrollTop"),600,'晚到宿主滚动由原位置任务校正');
  await evaluate("position_abort.abort();document.querySelector('content').scrollTop=900;void 0");await delay(100);
  assert.equal(await evaluate("document.querySelector('content').scrollTop"),900,'取消后不再校正');
  for(let round=0;round<20;round++){
    await evaluate(`workspace.restore(workspace.active(),{scroll_top:${100+round*10},scroll_left:0},{background:true})`);
  }
  await delay(320);assert.equal(await evaluate("document.querySelector('content').scrollTop"),290,'20次新恢复均替换旧任务');
  await evaluate('workspace.dispose();void 0');
  await evaluate('window.dispose_nav2=qa.bind_reading_navigation();window.dispose_paths2=qa.bind_file_path_actions();window.dispose_map2=qa.bind_reading_minimap();void 0;');
  assert.equal(await evaluate('commands.size'),2);assert.equal(await evaluate('document.querySelectorAll(".linux-note-reading-minimap").length'),1);
  await evaluate('dispose_nav2();dispose_paths2();dispose_map2();');
  // When there are two native link entries inside and outside, real click may directly enter internal method.
  await evaluate(`File.editor.tryOpenUrl_=function(){document.querySelector('content').scrollTop=1200;};window.native_inner=File.editor.tryOpenUrl_;window.dispose_inner=qa.bind_reading_navigation();void 0;`);
  await delay(400);
  await evaluate(`document.querySelector('content').scrollTop=120;File.editor.tryOpenUrl_('#target');void 0;`);
  await delay(320);
  assert.equal(await evaluate("document.querySelector('content').scrollTop"),1200);
  await evaluate(`document.querySelector('#write').contentEditable='true';document.querySelector('#write').focus();void 0`);
  await evaluate('window.measure_navigation=true;void 0');
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Left',modifiers:['alt']});
  test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Left',modifiers:['alt']});
  await delay(600);
  assert.equal(await evaluate("document.querySelector('content').scrollTop"),120,'内部链接入口可由Alt后退恢复来源');
  console.log('NAVIGATION_LATENCY '+JSON.stringify(await evaluate('navigation_sample')));
  assert((await evaluate('navigation_sample.first_frame_ms'))<120,'就绪同文历史不再固定等待140ms');
  assert((await evaluate('navigation_sample.ready_ms'))<220,'首次定位不等待250ms稳定期');
  // Alt Hold down, multiple direction keys in the history back and forth; real Chromium keyboard events.
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Alt'});
  for(let round=0;round<5;round++){
    test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right',modifiers:['alt']});
    test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right',modifiers:['alt']});await delay(600);
    assert.equal(await evaluate("document.querySelector('content').scrollTop"),0,'持续Alt前进 '+round);
    test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Left',modifiers:['alt']});
    test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Left',modifiers:['alt']});await delay(600);
    assert.equal(await evaluate("document.querySelector('content').scrollTop"),120,'持续Alt后退 '+round);
  }
  test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Alt'});
  await evaluate('dispose_inner();void 0');
  assert(await evaluate('File.editor.tryOpenUrl_===native_inner'),'销毁恢复真实内部链接入口');
  // Tool panel switching may repeat notifications for the same active editor, and change the cached native selection; cannot pollute the document history.
  await evaluate(`window.toolbar_cursor={type:'cursor',id:'a',start:0};File.editor.selection.buildUndo=()=>toolbar_cursor;File.editor.undo={exeCommand(cursor){toolbar_cursor=cursor}};window.dispose_toolbar_nav=qa.bind_reading_navigation();qa.notify_navigation_selection();toolbar_cursor={type:'cursor',id:'b',start:0};qa.notify_navigation_selection(true);toolbar_cursor={type:'cursor',id:'c',start:0};qa.notify_navigation_selection(true);void 0`);
  await evaluate(`window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));void 0`);await delay(400);
  assert.equal(await evaluate('toolbar_cursor.id'),'b');
  await evaluate(`const tool=document.createElement('button');tool.id='activity-tool';tool.textContent='搜索';document.body.append(tool);tool.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));tool.focus();toolbar_cursor={type:'cursor',id:'host-focus-reset',start:0};emit('active-leaf:change');void 0`);await delay(180);
  assert.equal(await evaluate('document.documentElement.dataset.linuxNoteHistoryForward'),'true','功能栏点击及同编辑器焦点通知不能截断前进');
  await evaluate(`window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:1}}));void 0`);await delay(400);
  assert.equal(await evaluate('toolbar_cursor.id'),'c','工具栏操作后前进仍到原文档位置');
  await evaluate(`window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));void 0`);await delay(400);
  await evaluate(`document.querySelector('#write').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.querySelector('content').scrollTop=450;void 0`);
  for(let round=0;round<20;round++){
    await evaluate(`(()=>{const tool=document.querySelector('#activity-tool');tool.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));tool.focus();toolbar_cursor={type:'cursor',id:'background-${round}',start:0};const range=document.createRange();range.selectNodeContents(document.querySelector('#write p'));window.getSelection().removeAllRanges();window.getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));emit('active-leaf:change');qa.notify_navigation_selection();})()`);await delay(120);
    assert.equal(await evaluate('document.documentElement.dataset.linuxNoteHistoryForward'),'true','工具控件与延迟正文选区不截断前进 '+round);
  }
  await evaluate(`window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:1}}));void 0`);await delay(400);
  assert.equal(await evaluate('toolbar_cursor.id'),'c');
  await evaluate(`window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));void 0`);await delay(400);
  assert.equal(await evaluate('toolbar_cursor.id'),'b','返回来源未被工具期间的宿主缓存选区覆盖');
  assert.equal(await evaluate("document.querySelector('content').scrollTop"),450,'离开前的正文阅读滚动仍能恢复，工具控件本身不产生历史');
  // The starting point is clearly localized in the function bar and is still recorded; the document content resumes the ordinary selection sampling after accepting mouse/keyboard editing again.
  await evaluate(`toolbar_cursor={type:'cursor',id:'outline-target',start:0};qa.notify_navigation_selection(true);void 0`);
  assert.equal(await evaluate('document.documentElement.dataset.linuxNoteHistoryForward'),'false','明确定位正常截断旧前进');
  await evaluate(`const root=document.querySelector('#write');root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));toolbar_cursor={type:'cursor',id:'text-edit',start:0};root.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertText',data:'x'}));qa.notify_navigation_selection();void 0`);
  await evaluate(`window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));void 0`);await delay(400);
  assert.equal(await evaluate('toolbar_cursor.id'),'outline-target','正文编辑位置正常进入共同历史');
  await evaluate(`dispose_toolbar_nav();document.querySelector('#activity-tool').remove();File.editor.selection.buildUndo=()=>null;void 0`);
  // Monaco receives textarea keyboard, cannot be mistakenly intercepted by the ordinary form's Alt protection.
  await evaluate(`window.source_position={kind:'source',file_path:'/test/code.c',view_id:-1,line:10,cursor:{startLineNumber:10},scroll_top:10,scroll_left:0};window.release_port=qa.register_navigation_editor({capture:()=>source_position,restore:async location=>{source_position=location;qa.notify_navigation_selection();return true}});window.dispose_source_nav=qa.bind_reading_navigation();window.dispatchEvent(new Event('blur'));qa.notify_navigation_selection();source_position={...source_position,line:11,cursor:{startLineNumber:11}};qa.notify_navigation_selection(true);const source_panel=document.createElement('section');source_panel.className='linux-note-source-file';source_panel.innerHTML='<textarea></textarea>';document.body.append(source_panel);source_panel.firstChild.focus();void 0;`);
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Left',modifiers:['alt']});
  test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Left',modifiers:['alt']});await delay(50);
  assert.equal(await evaluate('source_position.line'),10,'源码输入面中的Alt后退走共同历史');
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right',modifiers:['alt']});
  test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right',modifiers:['alt']});await delay(50);
  assert.equal(await evaluate('source_position.line'),11,'恢复引起的选区事件不污染前进历史');
  await evaluate(`release_port();window.reopened_id=100;window.release_port=qa.register_navigation_editor({capture:()=>source_position,restore:async location=>{source_position={...location,view_id:++reopened_id};host.workspace.activeLeaf=leaf;setTimeout(()=>qa.notify_navigation_selection(),10);return true}});void 0;`);
  for(let round=0;round<20;round++){
    // Must respond even without an active file; the recovery end returns a new view, and its stale selection cannot cut off the forward.
    await evaluate('source_position=null;host.workspace.activeLeaf={view:{}};void 0');
    test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Left',modifiers:['alt']});
    test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Left',modifiers:['alt']});await delay(50);
    assert.equal(await evaluate('source_position?.line'),10,'空编辑区重开后退 '+round);
    assert.equal(await evaluate('document.documentElement.dataset.linuxNoteHistoryForward'),'true','重开选区后仍有前进 '+round);
    test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right',modifiers:['alt']});
    test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right',modifiers:['alt']});await delay(50);
    assert.equal(await evaluate('source_position.line'),11,'重开后连续前进 '+round);
  }
  // Do not reserve waiting for each recovery: real keyboard double presses must be executed one by one, including reverse and browser duplicate keys.
  await evaluate(`dispose_source_nav();release_port();source_position={kind:'source',file_path:'/test/burst.c',view_id:500,line:10,cursor:{startLineNumber:10},scroll_top:10,scroll_left:0};window.burst_trace=[];window.fail_burst=false;window.release_port=qa.register_navigation_editor({capture:()=>source_position,restore:async(location,signal)=>{await new Promise(resolve=>setTimeout(resolve,30));if(signal.aborted||fail_burst)return false;source_position={...location};burst_trace.push(location.line);qa.notify_navigation_selection();return true}});window.dispose_source_nav=qa.bind_reading_navigation();qa.notify_navigation_selection();for(const line of [30,50,70]){source_position={...source_position,line,cursor:{startLineNumber:line},scroll_top:line};qa.notify_navigation_selection(true);}void 0`);
  const burst_keys=keys=>{for(const keyCode of keys){test_window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers:['alt']});test_window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers:['alt']});}};
  burst_keys(['Left','Left','Left']);await delay(300);
  assert.deepEqual(await evaluate('burst_trace'),[50,30,10],'连续三次后退逐步兑现，不丢弃忙碌期间按键');
  await evaluate('burst_trace=[];void 0');burst_keys(['Right','Right','Right']);await delay(300);
  assert.deepEqual(await evaluate('burst_trace'),[30,50,70],'连续三次前进逐步兑现');
  await evaluate('burst_trace=[];void 0');burst_keys(['Left','Left','Right','Left','Right','Right']);await delay(400);
  assert.deepEqual(await evaluate('burst_trace'),[50,30,50,30,50,70],'连续反向请求保留接收顺序');
  await evaluate(`burst_trace=[];for(let i=0;i<3;i++)window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,repeat:i>0,bubbles:true}));void 0`);await delay(300);
  assert.deepEqual(await evaluate('burst_trace'),[50,30,10],'重复方向键不忽略');
  await evaluate('burst_trace=[];fail_burst=true;void 0');burst_keys(['Right','Right','Right']);await delay(300);
  assert.deepEqual(await evaluate('burst_trace'),[],'失败不推进，余下请求不在失败后重放');
  await evaluate('fail_burst=false;void 0');burst_keys(['Right']);await delay(100);assert.equal(await evaluate('source_position.line'),30,'失败后的新请求仍可执行');
  await evaluate('burst_trace=[];void 0');burst_keys(['Right','Right']);
  await evaluate(`window.dispatchEvent(new Event('linux-note-workspace-context-changed'));void 0`);await delay(200);
  assert.deepEqual(await evaluate('burst_trace'),[],'切工程取消执行中及排队导航');
  await evaluate(`dispose_source_nav();window.dispose_source_nav=qa.bind_reading_navigation();qa.notify_navigation_selection();source_position={...source_position,line:70,cursor:{startLineNumber:70}};qa.notify_navigation_selection(true);release_port();window.release_port=qa.register_navigation_editor({capture:()=>source_position,restore:async(location,signal)=>{await new Promise(resolve=>setTimeout(resolve,0));if(signal.aborted)return false;source_position={...location};burst_trace.push(location.line);qa.notify_navigation_selection();return true}});void 0`);
  for(const rounds of [20,100,1000]){
    assert(await evaluate(`(async()=>{burst_trace=[];for(let round=0;round<${rounds};round++){
      for(const direction of [-1,1])window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction}}));
      const deadline=performance.now()+2000;while(burst_trace.length<(round+1)*2&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
      if(burst_trace[round*2]!==30||burst_trace[round*2+1]!==70)return false;
    }return source_position.line===70;})()`),'连续反向队列压力 '+rounds);
    console.log('NAVIGATION_QUEUE '+rounds+' rounds / '+rounds*2+' ordered restores');
  }
  await evaluate(`dispose_source_nav();release_port();document.querySelector('.linux-note-source-file').remove();void 0;`);
  // Native positioning across frames during wait period: Do not scroll new viewport or restore old selection.
  await evaluate(`(() => {
    const wrapper=document.createElement('div');wrapper.className='CodeMirror';wrapper.tabIndex=0;document.querySelector('#write').append(wrapper);
    let cursor={line:0,ch:0};window.undo_count=0;
    wrapper.CodeMirror={getCursor:()=>cursor,getRange:()=> 'a',setSelection(){},focus(){wrapper.focus()},scrollIntoView(){},charCoords:()=>({top:100,bottom:120})};
    File.editor.getMarkdown=()=> 'a';File.editor.sourceView.gotoLine=p=>{cursor={line:p.line,ch:p.ch};wrapper.focus()};File.editor.selection.buildUndo=()=>({type:'cursor',id:'p1',start:0});File.editor.undo={exeCommand(){undo_count++}};
    window.cancel_location=new AbortController();window.location_pending=qa.reveal_markdown_location({line:1,column:1,end_line:1,end_column:2,expected_text:'a'},cancel_location.signal).then(()=>false,error=>error.name==='AbortError');
    cancel_location.abort();document.querySelector('content').scrollTop=1000;
  })()`);
  assert(await evaluate('location_pending'));await delay(50);assert.equal(await evaluate('undo_count'),0);assert.equal(await evaluate("document.querySelector('content').scrollTop"),1000);
  console.log('PASS: reading/path dispose, rebind, command/event/DOM cleanup and cancelled navigation/position/reveal.');
  test_window.destroy();app.quit();
}).catch(error=>{console.error(error);test_window?.destroy();app.exit(1)});
