const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_terminal_panel_'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
let win;const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=async source=>{const result=await win.webContents.executeJavaScript('(async()=>{try{return {value:await (0,eval)('+JSON.stringify(source)+')}}catch(error){return {error:error.stack}}})()');if(result.error)throw new Error(result.error);return result.value;};
const wait=async source=>{for(let index=0;index<120;index++){if(await evaluate(source))return;await delay(50);}throw new Error('Timed out: '+source);};
const open_profiles=async()=>{await evaluate('document.querySelector(".terminal-panel-actions button[title=选择终端配置]").click();void 0');await wait('Boolean(document.querySelector("[data-action=terminal_profile_cmd], [data-action=terminal_open_local_folder]"))');};
const click_menu=async title=>{await evaluate('[...document.querySelectorAll(".git-graph-menu button")].find(node=>node.querySelector(".git-menu-label")?.textContent==='+JSON.stringify(title)+').click();void 0');};
const open_settings=async()=>{await evaluate('commands.get("linux_note:terminal_settings").callback();void 0');await wait('Boolean(document.querySelector("[data-setting=profile]"))');};
const dialog_action=async title=>{await evaluate('[...document.querySelectorAll(".git-graph-dialog-footer button")].find(node=>node.textContent==='+JSON.stringify(title)+').click();void 0');};
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const html=path.join(root,'fixture.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:#fff;color:#333}.typ-workspace-root{position:absolute;left:220px;right:0;top:35px;bottom:24px}.ty-footer{position:absolute;bottom:0;left:220px;height:24px;width:980px}</style><main class="typ-workspace-root">UNSAVED_DOCUMENT</main><footer class="ty-footer">status</footer>');await win.loadFile(html);
  const pty_mock=`export function start_terminal_pty(runtime,request,callbacks){return new Promise((resolve,reject)=>{const record={request,callbacks,killed:0,writes:[],sizes:[],proxy:{pid:4000+window.pty_starts.length,write(data){record.writes.push(data)},resize(cols,rows){record.sizes.push([cols,rows])},acknowledge(){},kill(){record.killed++}},ready(){resolve(record.proxy)}};window.pty_starts.push(record);runtime.signal.addEventListener('abort',()=>{record.killed++;reject(new Error('aborted'))},{once:true});});}`;
  // 探测边界可控；使用真实设置、菜单、会话和显示代码，避免依赖测试机装了哪些 Shell。
  const discovery_mock=`export function create_terminal_profile_service(){
    const record={values:[],pending:undefined,scans:0,disposed:false,complete:undefined};
    const refresh=()=>{if(record.pending)return record.pending;record.scans++;record.pending=new Promise(resolve=>{record.complete=values=>{record.values=structuredClone(values);record.pending=undefined;resolve(structuredClone(record.values));};});return record.pending;};
    window.profile_scans.push(record);refresh();
    return {warnings:()=>[],profiles:()=>structuredClone(record.values),ready:()=>record.pending||Promise.resolve(structuredClone(record.values)),refresh,dispose(){record.disposed=true;}};
  }`;
  const bundle=await build({stdin:{contents:'export {register_ssh_auth_owner} from "./src/remote_ssh_auth_context";export {bind_terminal_workspace} from "./src/terminal_workspace";export {read_terminal_state} from "./src/terminal_state";export {register_remote_workspace_context,current_remote_workspace} from "./src/remote_workspace_context";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'panel_api',loader:{'.css':'text'},write:false,plugins:[{name:'terminal-fixture',setup(build){
    build.onLoad({filter:/terminal_pty_client\.ts$/},()=>({contents:pty_mock,loader:'js'}));
    build.onLoad({filter:/terminal_profile_detection\.ts$/},()=>({contents:discovery_mock,loader:'js'}));
  }}]});await evaluate(bundle.outputFiles[0].text);
  const profiles=[
    {id:'cmd',title:'Command Prompt',executable:path.join(root,'cmd.exe'),args:[]},
    {id:'pwsh',title:'PowerShell',executable:path.join(root,'PowerShell','pwsh.exe'),args:['-NoLogo']},
    {id:'git_bash',title:'Git Bash',executable:path.join(root,'Git','bin','bash.exe'),args:['--login','-i']},
  ];
  const custom={id:'project_shell',title:'项目 Shell',executable:path.join(root,'custom_shell.exe'),args:['argument with spaces','plain'],env:{PANEL_FIXTURE:'custom'}};
  const wsl={id:'wsl:Ubuntu',title:'Ubuntu (WSL)',executable:path.join(root,'wsl.exe'),args:['--distribution','Ubuntu'],wsl:true};
  await evaluate(`window.pty_starts=[];window.profile_scans=[];window.commands=new Map();window.factories=new Map();window.leaves=[];window.reqnode=require;window._options={userDataPath:${JSON.stringify(root)}};
    localStorage.setItem('linux-note-terminal:v1:',JSON.stringify({profiles:[${JSON.stringify(custom)}]}));
    window.parent_group={appendChild(leaf){leaves.push(leaf);document.querySelector('.typ-workspace-root').append(leaf.view.containerEl);leaf.view.onOpen()},toggleTab(uri){const leaf=leaves.find(item=>item.state.path===uri);leaf.view.onOpen();return leaf},removeTab(uri){const index=leaves.findIndex(item=>item.state.path===uri);if(index>=0){const leaf=leaves.splice(index,1)[0];leaf.view.onClose();leaf.view.containerEl.remove();core.app.workspace.activeLeaf=original_leaf;}}};
    window.original_leaf={state:{path:'draft.md'},parent:parent_group};
    window.core={WorkspaceView:class{constructor(leaf){this.leaf=leaf}},app:{viewManager:{registerView(id,factory){factories.set(id,factory);return()=>factories.delete(id)}},commands:{register(command){commands.set(command.id,command);return()=>commands.delete(command.id)},run(id){commands.get(id)?.callback()}},workspace:{activeLeaf:original_leaf,eachLeaves(callback){leaves.forEach(callback)},createLeaf({type,state}){const leaf={state,parent:parent_group};leaf.view=factories.get(type)(leaf);return leaf},on(name,callback){if(name==="file-menu")window.file_menu=callback;return()=>{}},ribbon:{addButton(name,callback){if(name==="file-menu")window.file_menu=callback;return()=>{}}}}}};
    window.host={core,fs:require('node:fs'),path_api:require('node:path'),process_api:process,copy:async text=>window.copied=text,context_path:()=>${JSON.stringify(root)},workspace_path:()=>${JSON.stringify(root)},runner:()=>({run:async()=>${JSON.stringify(root)}})};
    window.binding=panel_api.bind_terminal_workspace(host);window.pending_open=binding.open(${JSON.stringify(root)},'cmd');void 0;`);
  assert(await evaluate('profile_scans.length===1&&profile_scans[0].scans===1&&pty_starts.length===0'));
  await evaluate('(async()=>{window.first=await pending_open;await new Promise(requestAnimationFrame);return true})()');
  assert(await evaluate('!document.querySelector(".typora-terminal-panel").hidden&&first.surface.container.getBoundingClientRect().height>100&&first.surface.container.getAttribute("aria-busy")==="true"&&first.surface.status.textContent.includes("检测")'),'panel paints while shell discovery is unresolved');
  assert(await evaluate('!first.surface.container.querySelector("[role=progressbar]").hidden'),'shared activity bar is visible during discovery');
  await evaluate('commands.get("linux_note:terminal_move_editor").callback();void 0');
  assert(await evaluate('leaves.length===1&&document.querySelector(".terminal-editor-host .linux-note-terminal")===first.surface.container&&pty_starts.length===0'),'pending session moves to editor before discovery');
  await evaluate('commands.get("linux_note:terminal_move_panel").callback();void 0');
  assert(await evaluate('leaves.length===0&&document.querySelector(".typora-terminal-panel .linux-note-terminal")===first.surface.container'),'pending session moves back without recreation');
  for(let index=0;index<20;index++)await evaluate('binding.toggle();binding.toggle();void 0');
  assert(await evaluate('document.querySelectorAll(".linux-note-terminal").length===1&&pty_starts.length===0'),'rapid toggles reuse pending session');
  await evaluate('commands.get("linux_note:terminal_settings").callback();void 0');
  assert(await evaluate('Boolean(document.querySelector("[role=dialog]"))&&!document.querySelector(".terminal-settings-form")'));
  await dialog_action('关闭');
  await evaluate('binding.toggle();void 0');
  await evaluate(`profile_scans[0].complete(${JSON.stringify(profiles)});void 0`);
  await wait('pty_starts.length===1');
  assert(await evaluate('document.querySelector(".typora-terminal-panel").hidden'),'late discovery does not reopen hidden panel');
  await evaluate('binding.toggle();void 0');
  await evaluate('(async()=>{window.first=await pending_open;return Boolean(first)})()');
  await wait('pty_starts.length===1&&document.querySelector(".typora-terminal-panel").getBoundingClientRect().height>200');
  assert(await evaluate('!document.querySelector("[role=dialog]")&&profile_scans[0].scans===1'));
  assert.equal(await evaluate('pty_starts[0].request.executable'),profiles[0].executable);
  assert(await evaluate('core.app.workspace.activeLeaf===original_leaf&&document.querySelector(".terminal-tabs").hidden'));
  assert(await evaluate('Math.abs(document.querySelector(".typ-workspace-root").getBoundingClientRect().bottom-document.querySelector(".typora-terminal-panel").getBoundingClientRect().top)<2'));
  await evaluate('pty_starts[0].ready();void 0');await wait('first.session.state==="running"');

  assert(await evaluate('first.session.launch_pending&&first.surface.status.textContent.includes("等待首次输出")'),'PTY ready is not shell output readiness');
  await evaluate('pty_starts[0].callbacks.data("KEEP_OUTPUT\\r\\n");void 0');await delay(100);
  assert(await evaluate('!first.session.launch_pending&&first.surface.status.hidden&&first.surface.container.querySelector("[role=progressbar]").hidden'),'first output clears busy feedback');
  assert(await evaluate('panel_api.read_terminal_state(core.app).active_id===first.session.id&&panel_api.read_terminal_state(core.app).panel_visible'),'menu state reads coordinator session and panel');
  await evaluate('binding.toggle();void 0');assert(await evaluate('!panel_api.read_terminal_state(core.app).panel_visible'),'menu state follows external hide');assert(await evaluate('document.querySelector(".typora-terminal-panel").hidden&&pty_starts[0].killed===0'));
  await evaluate('binding.toggle();commands.get("linux_note:terminal_split").callback();void 0');await wait('pty_starts.length===2');
  assert(await evaluate('!document.querySelector(".terminal-tabs").hidden&&document.querySelectorAll(".terminal-split-group:not([hidden])>.linux-note-terminal").length===2'));
  await evaluate('pty_starts[1].callbacks.data("EARLY_OUTPUT");pty_starts[1].ready();void 0');await delay(100);
  assert(await evaluate('!document.querySelector("[data-session=terminal_2]").textContent.includes("等待首次输出")'),'output before ready does not leave stale waiting status');

  // 使用真实输入路径拖动分隔条；每次变化只调整表面几何，不创建或结束PTY。
  const sash_drag=async(selector,dx,cancel=false)=>{
    const rect=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
    win.webContents.sendInputEvent({type:'mouseMove',...rect});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...rect});await delay(30);
    win.webContents.sendInputEvent({type:'mouseMove',x:rect.x+dx,y:rect.y,movementX:dx,movementY:0});await delay(60);
    if(cancel){win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});}
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:rect.x+dx,y:rect.y});await delay(80);
  };
  const list_width=()=>evaluate('document.querySelector(".terminal-tabs").getBoundingClientRect().width');
  const widths=()=>evaluate('[...document.querySelectorAll(".terminal-split-group:not([hidden])>.linux-note-terminal")].map(node=>node.getBoundingClientRect().width)');
  assert.equal(Math.round(await list_width()),120);
  await sash_drag('.terminal-tabs-sash',-110);assert.equal(Math.round(await list_width()),230);
  await sash_drag('.terminal-tabs-sash',70,true);assert.equal(Math.round(await list_width()),230,'Esc restores list width');
  assert.equal(await evaluate('Number(localStorage.getItem("typora-code:terminal-list-width"))'),230);
  await evaluate('document.querySelector(".terminal-tabs-sash").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));void 0');assert.equal(Math.round(await list_width()),120);
  const original_sizes=await widths();await sash_drag('.terminal-split-group:not([hidden]) .terminal-split-sash',60);const resized=await widths();
  assert(Math.abs(resized[0]-original_sizes[0]-60)<2&&Math.abs(resized[1]-original_sizes[1]+60)<2,'split resize follows pointer');
  await sash_drag('.terminal-split-group:not([hidden]) .terminal-split-sash',-40,true);assert.deepEqual((await widths()).map(Math.round),resized.map(Math.round),'split cancel restores size');
  await evaluate('document.querySelector(".terminal-split-group:not([hidden]) .terminal-split-sash").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));void 0');const equal=await widths();assert(Math.abs(equal[0]-equal[1])<1);
  await sash_drag('.terminal-tabs-sash',100);assert.equal(Math.round(await list_width()),46);assert(await evaluate('getComputedStyle(document.querySelector(".terminal-tab-label")).display==="none"'));
  await evaluate('document.querySelector(".terminal-tabs-sash").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));void 0');
  await open_settings();await evaluate('document.querySelector("[data-setting=tabs_location]").value="left";void 0');await dialog_action('应用');
  await sash_drag('.terminal-tabs-sash',60);assert.equal(Math.round(await list_width()),180,'left list grows towards right');
  await open_settings();await evaluate('document.querySelector("[data-setting=tabs_location]").value="right";void 0');await dialog_action('应用');
  await evaluate('document.querySelector(".terminal-tabs-sash").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));void 0');
  assert(await evaluate('pty_starts.length===2&&pty_starts.every(item=>item.killed===0)&&first.surface.term.buffer.active.getLine(0).translateToString().includes("KEEP_OUTPUT")'));
  // 生产DnD事件路径验证身份、取消与重排；真实指针分隔条与HTML拖放分别测试。
  await evaluate(`window.drag_terminal=(source,target,after=false,commit=true)=>{
    const row=document.querySelector('.terminal-tab[data-session="'+source+'"]'),list=document.querySelector('.terminal-tabs');const data=new DataTransfer();
    row.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));
    const destination=target?document.querySelector('.terminal-tab[data-session="'+target+'"]'):list,r=destination.getBoundingClientRect();
    destination.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data,clientY:after?r.bottom-1:r.top+1}));
    if(commit)destination.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
    row.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data}));
  };void 0`);
  const order=()=>evaluate('[...document.querySelectorAll(".terminal-tab")].map(node=>node.dataset.session)');
  const baseline_order=await order();await evaluate('drag_terminal("terminal_2","terminal_1",false,false);void 0');assert.deepEqual(await order(),baseline_order);
  await evaluate('drag_terminal("terminal_2","terminal_1");void 0');assert.deepEqual(await order(),['terminal_2','terminal_1']);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".terminal-split-group:not([hidden])>.linux-note-terminal")].map(node=>node.dataset.session)'),['terminal_2','terminal_1']);
  assert.equal(await evaluate('panel_api.read_terminal_state(core.app).active_id'),'terminal_2','reorder preserves active session');
  await evaluate('drag_terminal("terminal_1","terminal_2");void 0');
  await sash_drag('.terminal-split-group:not([hidden]) .terminal-split-sash',55);const unequal=await widths();
  await evaluate('drag_terminal("terminal_2","terminal_1");void 0');assert.deepEqual((await widths()).map(Math.round),[...unequal].reverse().map(Math.round),'sizes follow session identity');
  await evaluate('drag_terminal("terminal_1","terminal_2");void 0');
  win.webContents.setZoomFactor(1.25);await delay(180);assert.equal(Math.round(await list_width()),120);assert((await widths()).every(value=>value>=80));
  win.webContents.setZoomFactor(1);win.setContentSize(580,800);await delay(180);
  await sash_drag('.terminal-tabs-sash',-600);assert((await list_width())<=await evaluate('document.querySelector(".terminal-panel-body").clientWidth-119.5'));assert((await widths()).every(value=>value>=59));
  const narrow=await evaluate('(()=>{const b=document.querySelector(".terminal-panel-body"),p=document.querySelector(".terminal-panes");return b.scrollWidth<=b.clientWidth+1&&p.clientWidth>=119})()');assert(narrow,'narrow window retains terminal area without body overflow');
  win.setContentSize(1200,800);await delay(100);assert.equal(Math.round(await list_width()),500);
  await evaluate('document.querySelector(".terminal-tabs-sash").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));void 0');
  fs.writeFileSync(path.join(root,'terminal_split_layout.png'),(await win.webContents.capturePage()).toPNG());

  // R006.7：真实 Chromium 组合输入交给 xterm，PTY 边界只记录写入，不运行用户命令。
  // CDP 输入放在 sendInputEvent 指针检查之后，避免调试会话影响 offscreen DPI 坐标。
  win.webContents.debugger.attach('1.3');
  const ime = (text) => win.webContents.debugger.sendCommand('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
  const commit_text = (text) => win.webContents.debugger.sendCommand('Input.insertText',{text});
  const press = async(keyCode,modifiers=[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await delay(30);};
  await evaluate(`window.terminal_input_events=[];window.input_events_lifetime=new AbortController();
    for(const type of ['keydown','keypress','keyup','beforeinput','input','compositionstart','compositionupdate','compositionend']){
      document.body.addEventListener(type,event=>{if(first.surface.container.contains(event.target))terminal_input_events.push(event.type);},{signal:input_events_lifetime.signal});
    }
    first.surface.focus();void 0`);
  await ime('zhongwen');await delay(20);await commit_text('中文');await delay(30);
  assert.equal(await evaluate('pty_starts[0].writes.join("")'),'中文','Chinese composition commits once');
  await ime('git');await delay(20);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Shift',modifiers:['shift']});
  await commit_text('git');
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Shift'});await delay(30);
  await press('a');await press('b');await press('1');await press('2');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Shift',modifiers:['shift']});
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'X',modifiers:['shift']});
  win.webContents.sendInputEvent({type:'char',keyCode:'X',modifiers:['shift']});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'X',modifiers:['shift']});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Shift'});await delay(30);
  assert.equal(await evaluate('pty_starts[0].writes.join("")'),'中文gitab12X','Shift commit and subsequent English input have no missing or duplicate characters');
  assert(await evaluate('document.activeElement===first.surface.term.textarea'),'typing retains terminal focus');
  assert.deepEqual(await evaluate('terminal_input_events'),[],'terminal input never reaches host editor bubble handlers');
  await ime('quxiao');await delay(20);await ime('');await delay(30);await press('n');
  assert.equal(await evaluate('pty_starts[0].writes.join("")'),'中文gitab12Xn','cancelled candidates are not sent to PTY');
  for(let index=0;index<3;index++){
    await ime('pin');await delay(10);await press('Shift');await commit_text('pin');await delay(20);await press('m');
  }
  assert.equal(await evaluate('pty_starts[0].writes.join("")'),'中文gitab12Xnpinmpinmpinm','repeated IME mode transitions remain writable');
  await commit_text('DIRECT');await delay(30);
  assert.equal(await evaluate('pty_starts[0].writes.join("")'),'中文gitab12XnpinmpinmpinmDIRECT','direct insertText without a composition also commits once');
  const before_copy=await evaluate('pty_starts[0].writes.join("")');
  await evaluate('first.surface.term.selectAll();void 0');await press('c',['control','shift']);
  assert((await evaluate('copied')).includes('KEEP_OUTPUT'),'Ctrl+Shift+C still copies terminal selection');
  assert.equal(await evaluate('pty_starts[0].writes.join("")'),before_copy,'copy does not send a shell command');
  await evaluate('first.surface.term.clearSelection();void 0');await press('c',['control']);
  assert.equal(await evaluate('pty_starts[0].writes.at(-1)'),'\u0003','Ctrl+C without a selection still interrupts the shell');
  // 输入法可能使用 isComposing 或遗留 229；两条路径都不能打开查找并移走候选焦点。
  for(const flags of [{isComposing:true,keyCode:70},{keyCode:229}]){
    assert(await evaluate(`(()=>{const event=new KeyboardEvent('keydown',{key:'f',code:'KeyF',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true,...${JSON.stringify(flags)}});first.surface.term.textarea.dispatchEvent(event);return !event.defaultPrevented&&first.surface.container.querySelector('.terminal-find').hidden&&document.activeElement===first.surface.term.textarea})()`),'IME owns shortcut keys');
  }
  await press('f',['control','shift']);
  assert(await evaluate('!first.surface.container.querySelector(".terminal-find").hidden'),'normal terminal find shortcut works');
  for(const flags of [{isComposing:true,keyCode:13},{keyCode:229}]){
    for(const key of ['Enter','Escape'])assert(await evaluate(`(()=>{const input=first.surface.container.querySelector('.terminal-find input');const event=new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true,...${JSON.stringify(flags)}});input.dispatchEvent(event);return !event.defaultPrevented&&!first.surface.container.querySelector('.terminal-find').hidden&&document.activeElement===input})()`),'IME selection keys do not close or navigate terminal find');
  }
  await press('Escape');assert(await evaluate('document.activeElement===first.surface.term.textarea'),'normal Escape returns focus to terminal');
  await press('z');assert.equal(await evaluate('pty_starts[0].writes.at(-1)'),'z','typing resumes after find closes');
  assert.deepEqual(await evaluate('terminal_input_events'),[],'terminal find events share the same host boundary');
  await evaluate('input_events_lifetime.abort();pty_starts[0].writes.length=0;void 0');
  win.webContents.debugger.detach();


  await evaluate('commands.get("linux_note:terminal_move_editor").callback();void 0');await wait('leaves.length===1');assert(await evaluate('pty_starts.every(item=>item.killed===0)'));assert(await evaluate('(()=>{const h=document.querySelector(".terminal-editor-host"),s=h.querySelector(".linux-note-terminal");return Math.abs(h.getBoundingClientRect().width-s.getBoundingClientRect().width)<1})()'),'editor terminal releases split width');
  await evaluate('commands.get("linux_note:terminal_move_panel").callback();void 0');await wait('leaves.length===0');assert(await evaluate('pty_starts.length===2&&pty_starts.every(item=>item.killed===0)'));
  await open_settings();
  const before=await evaluate('localStorage.getItem("linux-note-terminal:v1:")');
  await evaluate('document.querySelector("[data-setting=font_size]").value="101";void 0');await dialog_action('应用');
  assert(await evaluate('Boolean(document.querySelector(".terminal-settings-error").textContent)'));assert.equal(await evaluate('localStorage.getItem("linux-note-terminal:v1:")'),before);
  await evaluate('document.querySelector("[data-setting=font_size]").value="18";void 0');await dialog_action('应用');await wait('!document.querySelector("[role=dialog]")');assert.equal(await evaluate('first.surface.term.options.fontSize'),18);
  await evaluate('commands.get("linux_note:terminal_restart").callback();void 0');await wait('pty_starts.length===3');
  await evaluate('commands.get("linux_note:terminal_restart").callback();void 0');await wait('pty_starts.length===4');assert(await evaluate('pty_starts[1].killed===1&&pty_starts[2].killed===1'));
  await evaluate('pty_starts[2].ready();pty_starts[3].ready();void 0');await delay(100);
  const button_box=await evaluate('(()=>{const b=document.querySelector(".terminal-panel-actions button").getBoundingClientRect();return {w:b.width,h:b.height}})()');assert.deepEqual(button_box,{w:22,h:22});

  // 新建菜单、默认配置与实际启动共用发现结果；不存在的静态候选不能冒充可用 Shell。
  await open_profiles();
  const menu_profiles=await evaluate('[...document.querySelectorAll(".git-graph-menu [data-action^=terminal_profile_]")].map(node=>({id:node.dataset.action.slice("terminal_profile_".length),title:node.querySelector(".git-menu-label").textContent}))');
  assert.deepEqual(menu_profiles,[...profiles,custom].map(({id,title})=>({id,title})));
  assert(!JSON.stringify(menu_profiles).includes('需已安装'));assert(!JSON.stringify(menu_profiles).includes('需在 PATH'));
  await click_menu('Git Bash');await wait('pty_starts.length===5');
  assert.deepEqual(await evaluate('({executable:pty_starts[4].request.executable,args:pty_starts[4].request.args})'),{executable:profiles[2].executable,args:profiles[2].args});
  await evaluate('pty_starts[4].ready();void 0');
  const before_group_drag=await order();const before_killed=await evaluate('pty_starts.map(item=>item.killed)');
  await evaluate('drag_terminal("terminal_1","terminal_3",true);void 0');assert.deepEqual(await order(),['terminal_2','terminal_3','terminal_1']);
  await evaluate('drag_terminal("terminal_2","",true);void 0');assert.deepEqual(await order(),['terminal_3','terminal_1','terminal_2']);
  assert.deepEqual(await evaluate('pty_starts.map(item=>item.killed)'),before_killed);
  // 未由本列表开始的外部拖放，即使复制了MIME名称，也不能移动会话。
  const before_external=await order();await evaluate(`(()=>{const d=new DataTransfer();d.setData('application/x-typora-code-terminal-tab','terminal_3');document.querySelector('.terminal-tabs').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:d}));})()`);assert.deepEqual(await order(),before_external);

  await open_profiles();await click_menu('选择默认配置…');await wait('Boolean(document.querySelector("[data-setting=profile]"))');
  assert.deepEqual(await evaluate('[...document.querySelector("[data-setting=profile]").options].filter(item=>item.value).map(item=>({id:item.value,title:item.textContent}))'),menu_profiles);
  assert.equal(await evaluate('profile_scans[0].scans'),1);
  await evaluate('document.querySelector("[data-setting=profile]").value="git_bash";void 0');await dialog_action('应用');
  await evaluate('commands.get("linux_note:terminal").callback();void 0');await wait('pty_starts.length===6');
  assert.equal(await evaluate('pty_starts[5].request.executable'),profiles[2].executable);await evaluate('pty_starts[5].ready();void 0');
  await open_profiles();await click_menu('项目 Shell');await wait('pty_starts.length===7');
  assert.deepEqual(await evaluate('({executable:pty_starts[6].request.executable,args:pty_starts[6].request.args,env:pty_starts[6].request.options.env.PANEL_FIXTURE})'),{executable:custom.executable,args:custom.args,env:'custom'});await evaluate('pty_starts[6].ready();void 0');

  const kept_processes=await evaluate('pty_starts.map(item=>item.killed)');
  await open_profiles();await click_menu('重新检测终端');
  assert(await evaluate('profile_scans[0].scans===2&&Boolean(profile_scans[0].pending)&&pty_starts.length===7'));
  await evaluate(`profile_scans[0].complete(${JSON.stringify([...profiles,wsl])});void 0`);
  await wait('[...document.querySelectorAll(".git-graph-menu [data-action]")].some(node=>node.dataset.action==="terminal_profile_wsl:Ubuntu")');
  assert.deepEqual(await evaluate('pty_starts.map(item=>item.killed)'),kept_processes);
  await click_menu('Ubuntu (WSL)');await wait('pty_starts.length===8');
  assert.deepEqual(await evaluate('({executable:pty_starts[7].request.executable,args:pty_starts[7].request.args})'),{executable:wsl.executable,args:[...wsl.args,'--cd',root]});await evaluate('pty_starts[7].ready();void 0');
  await open_settings();assert(await evaluate('[...document.querySelector("[data-setting=profile]").options].some(item=>item.value==="wsl:Ubuntu")'));await dialog_action('关闭');

  // 菜单关闭后迟到的扫描不再弹出；失效默认仍显示原选择，不能偷偷改为自动模式。
  await open_profiles();await click_menu('重新检测终端');assert.equal(await evaluate('profile_scans[0].scans'),3);
  await evaluate('document.querySelector(".git-graph-menu").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));window.dispatchEvent(new KeyboardEvent("keyup",{key:"Escape",bubbles:true}));void 0');
  await evaluate(`profile_scans[0].complete(${JSON.stringify([profiles[0],profiles[1],wsl])});void 0`);await delay(50);
  assert(await evaluate('!document.querySelector(".git-graph-menu")'));
  await evaluate('(async()=>{window.missing_default=await binding.open('+JSON.stringify(root)+');return missing_default===undefined})()');
  await wait('missing_default.session.state==="error"');
  assert(await evaluate('pty_starts.length===8&&missing_default.surface.status.textContent.includes("git_bash")&&!missing_default.session.launch_pending&&!document.querySelector("[role=dialog]")'),'failed startup stays visible in its session without modal');
  await open_settings();
  assert(await evaluate('document.querySelector("[data-setting=profile]").value==="git_bash"&&document.querySelector("[data-setting=profile]").selectedOptions[0].textContent.includes("不可用")'));
  await evaluate('document.querySelector("[data-setting=font_size]").value="19";void 0');await dialog_action('应用');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("linux-note-terminal:v1:")).profile'),'git_bash');
  assert.equal(await evaluate('first.surface.term.options.fontSize'),19);
  fs.writeFileSync(path.join(root,'terminal_panel.png'),(await win.webContents.capturePage()).toPNG());

  // 设置自身刷新也共享扫描；关闭表单不会被完成回调重新挂回 DOM。
  await open_settings();await evaluate('[...document.querySelectorAll(".terminal-settings-form button")].find(node=>node.textContent==="重新检测终端").click();void 0');
  assert.equal(await evaluate('profile_scans[0].scans'),4);await dialog_action('关闭');
  await evaluate(`profile_scans[0].complete(${JSON.stringify([...profiles,wsl])});void 0`);await delay(50);
  assert(await evaluate('!document.querySelector("[role=dialog]")&&pty_starts.length===8'));

  // 探测期间仍允许用户选择；新结果不得恢复开始扫描时的旧选择。
  await open_settings();await evaluate('[...document.querySelectorAll(".terminal-settings-form button")].find(node=>node.textContent==="重新检测终端").click();document.querySelector("[data-setting=profile]").value="cmd";void 0');
  await evaluate(`profile_scans[0].complete(${JSON.stringify([...profiles,wsl])});void 0`);await delay(50);
  assert.equal(await evaluate('document.querySelector("[data-setting=profile]").value'),'cmd');await dialog_action('应用');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("linux-note-terminal:v1:")).profile'),'cmd');

  // 卸载时，菜单、设置、新建三个等待者不得在同一迟到结果后恢复 UI 或创建 PTY。
  await open_profiles();await click_menu('重新检测终端');
  await evaluate('commands.get("linux_note:terminal_settings").callback();window.pending_after_dispose=binding.open('+JSON.stringify(root)+',"cmd");void 0');
  assert(await evaluate('Boolean(document.querySelector(".git-graph-menu"))&&Boolean(document.querySelector("[role=dialog]"))&&profile_scans[0].scans===6'));
  await evaluate('binding.dispose();binding.dispose();void 0');
  await evaluate(`profile_scans[0].complete(${JSON.stringify(profiles)});void 0`);
  assert(await evaluate('(async()=>{const entry=await pending_after_dispose;return entry.session.state==="exited"&&!entry.surface.container.isConnected})()'));await delay(50);
  assert(await evaluate('profile_scans[0].disposed&&pty_starts.length===8&&commands.size===0&&factories.size===0&&!document.querySelector(".typora-terminal-panel,.git-graph-menu,.git-graph-dialog-shade")&&document.querySelector(".typ-workspace-root").style.bottom===""&&pty_starts.every(item=>item.killed===1)'));
  assert(await evaluate('panel_api.read_terminal_state(core.app)===undefined'),'dispose releases menu state');
  assert(await evaluate(`(()=>{const input=document.createElement('input'),surface=first.surface.container;surface.append(input);document.body.append(surface);let reached=false;const listener=()=>reached=true;document.body.addEventListener('keyup',listener,{once:true});input.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));document.body.removeEventListener('keyup',listener);surface.remove();return reached})()`),'disposed terminal releases input event listeners');
  // 命令入口先显示真实会话；目录解析暂停、终止和切库不能留下迟到进程。
  await evaluate('window.binding=panel_api.bind_terminal_workspace(host);window.resolve_directory=undefined;host.runner=()=>({run:()=>new Promise(resolve=>window.resolve_directory=resolve)});window.file_popup=document.createElement("ul");file_menu({menu:{containerEl:file_popup},path:'+JSON.stringify(root)+'});file_popup.firstElementChild.click();void 0');
  await wait('Boolean(resolve_directory)');
  assert(await evaluate('!document.querySelector(".typora-terminal-panel").hidden&&document.querySelector(".linux-note-terminal-status").textContent.includes("工作目录")&&pty_starts.length===8'),'command paints while directory resolution is pending');
  await evaluate('commands.get("linux_note:terminal_kill").callback();resolve_directory('+JSON.stringify(root)+');void 0');await delay(30);
  assert(await evaluate('!document.querySelector(".linux-note-terminal")&&pty_starts.length===8'),'kill before directory resolution prevents process creation');
  await evaluate('commands.get("linux_note:terminal_toggle").callback();void 0');await delay(30);
  assert(await evaluate('document.querySelector(".linux-note-terminal-status").textContent.includes("检测")'),'icon command paints before profile discovery');
  await evaluate('window.dispatchEvent(new Event("linux-note-workspace-context-changed"));profile_scans[1].complete('+JSON.stringify(profiles)+');void 0');await delay(30);
  assert(await evaluate('!document.querySelector(".linux-note-terminal")&&pty_starts.length===8'),'workspace change rejects late discovery');
  await evaluate('binding.dispose();void 0');
  // 同一会话重启时，旧目录解析晚于新解析返回，不能污染新启动基点。
  fs.mkdirSync(path.join(root,'restart_target'));
  await evaluate('window.binding=panel_api.bind_terminal_workspace(host);window.resolve_directory=undefined;window.file_popup=document.createElement("ul");file_menu({menu:{containerEl:file_popup},path:'+JSON.stringify(root)+'});file_popup.firstElementChild.click();void 0');
  await wait('Boolean(resolve_directory)');
  await evaluate('window.old_resolve_directory=resolve_directory;resolve_directory=undefined;commands.get("linux_note:terminal_restart").callback();void 0');
  await wait('Boolean(resolve_directory)');
  await evaluate('resolve_directory('+JSON.stringify(path.join(root,'restart_target'))+');void 0');await delay(30);
  await evaluate('old_resolve_directory('+JSON.stringify(root)+');void 0');await delay(30);
  await evaluate('profile_scans[2].complete('+JSON.stringify(profiles)+');void 0');await wait('pty_starts.length===9');
  assert.equal(await evaluate('pty_starts[8].request.options.cwd'),path.join(root,'restart_target'),'stale root resolution never overwrites restarted session cwd');
  await evaluate('commands.get("linux_note:terminal_kill").callback();pty_starts[8].ready();binding.dispose();void 0');await delay(30);
  assert(await evaluate('pty_starts[8].killed===1&&!document.querySelector(".linux-note-terminal")'),'late PTY after kill stays disposed');
  // 远程临时配置不查本地Shell目录，不展开路径模板；拆分及重启复用同一启动协议。
  const ssh_profile={id:'ssh_remote',title:'SSH: alias',executable:'ssh.exe',args:['-tt','alias',"cd -- '/tmp/${env:NOT_LOCAL}'"]};
  await evaluate('(async()=>{window.binding=panel_api.bind_terminal_workspace(host);window.remote_profile='+JSON.stringify(ssh_profile)+';window.remote=await binding.open('+JSON.stringify(root)+',"","panel","",true,undefined,remote_profile);})()');
  await evaluate('profile_scans[3].complete('+JSON.stringify(profiles)+');void 0');await wait('pty_starts.length===10');
  assert.deepEqual(await evaluate('pty_starts[9].request.args'),['-tt','alias',"cd -- '/tmp/${env:NOT_LOCAL}'"]);
  await evaluate('pty_starts[9].ready();void 0');await wait('remote.session.state==="running"');
  await evaluate('commands.get("linux_note:terminal_split").callback();void 0');await wait('pty_starts.length===11');
  assert.deepEqual(await evaluate('pty_starts[10].request.args'),['-tt','alias',"cd -- '/tmp/${env:NOT_LOCAL}'"]);
  await evaluate('pty_starts[10].ready();void 0');await delay(20);
  await evaluate('commands.get("linux_note:terminal_restart").callback();void 0');await wait('pty_starts.length===12');
  assert.equal(await evaluate('pty_starts[11].request.executable'),'ssh.exe');
  assert.deepEqual(await evaluate('pty_starts[11].request.args'),['-tt','alias',"cd -- '/tmp/${env:NOT_LOCAL}'"]);
  await evaluate('pty_starts[11].ready();void 0');await delay(20);await evaluate('binding.dispose();void 0');await delay(30);
  assert(await evaluate('pty_starts.slice(9).every(item=>item.killed===1)&&!document.querySelector(".linux-note-terminal")'));
  // 真实协调器的全部默认入口，保留现有本地会话及各自拆分身份。
  const remote_assets=path.join(root,'typora_code/assets/remote');fs.mkdirSync(remote_assets,{recursive:true});
  for(const name of ['remote_ssh_service.cjs','remote_ssh_auth.cjs'])fs.copyFileSync(path.join(__dirname,'../src',name),path.join(remote_assets,name));
  await evaluate(`window.auth_starts=0;window.auth_releases=0;window.release_auth=panel_api.register_ssh_auth_owner({list:async()=>[],prepare:async()=>{auth_starts++;return{env:{SSH_ASKPASS_REQUIRE:'force'},dispose(){auth_releases++;}}}});void 0`);
  await evaluate(`(async()=>{window.binding=panel_api.bind_terminal_workspace(host);window.remote_context=undefined;window.release_remote=panel_api.register_remote_workspace_context(()=>remote_context);window.local_entry=await binding.open(${JSON.stringify(root)},'cmd');profile_scans[4].complete(${JSON.stringify(profiles)});})()`);
  await wait('pty_starts.length===13');await evaluate('pty_starts[12].ready();void 0');await delay(30);
  await evaluate(`window.remote_context={target:'alias',remote_path:"/tmp/项目 '$quoted",state:'connected'};window.dispatchEvent(new Event('linux-note-workspace-context-changed'));binding.toggle();void 0`);
  await wait('pty_starts.length===14');
  assert.equal(await evaluate('pty_starts[13].request.options.env.SSH_ASKPASS_REQUIRE'),'force','remote PTY receives shared authentication environment');
  assert.equal(await evaluate('pty_starts[13].request.args.at(-2)'),'alias','toggle starts SSH even with a visible local terminal');
  assert(await evaluate('pty_starts[13].request.args.at(-1).includes("/tmp/项目")&&pty_starts[12].killed===1'),'workspace switch closes old local PTY');
  await evaluate('pty_starts[13].ready();void 0');await delay(30);
  for(const operation of [
    'commands.get("linux_note:terminal").callback()',
    'document.querySelector(".terminal-panel-actions button[title^=新建终端]").click()',
    'window.dispatchEvent(new CustomEvent("linux-note-open-terminal",{detail:{cwd:"C:/irrelevant"}}))',
    'window.dispatchEvent(new KeyboardEvent("keydown",{code:"Backquote",ctrlKey:true,shiftKey:true,bubbles:true}))'
  ]){
    const count=await evaluate('pty_starts.length');await evaluate(operation+';void 0');await wait('pty_starts.length==='+String(count+1));
    assert.equal(await evaluate(`pty_starts[${count}].request.args.at(-2)`),'alias','shared default entry uses remote host');
    await evaluate(`pty_starts[${count}].ready();void 0`);await delay(20);
  }
  const remote_count=await evaluate('pty_starts.length');
  await evaluate('remote_context={target:"other",remote_path:"/different",state:"connected"};commands.get("linux_note:terminal_split").callback();void 0');
  await delay(60);assert.equal(await evaluate('pty_starts.length'),remote_count,'stale split cannot launch another owner');await dialog_action('关闭');
  await evaluate('remote_context={target:"alias",remote_path:"/next",state:"connected"};commands.get("linux_note:terminal_split").callback();void 0');
  await wait('pty_starts.length==='+String(remote_count+1));
  assert.equal(await evaluate(`pty_starts[${remote_count}].request.args.at(-2)`),'alias','split retains source host');
  await evaluate(`pty_starts[${remote_count}].ready();void 0`);await delay(20);
  for(const state of ['connecting','disconnected']){
    const count=await evaluate('pty_starts.length');await evaluate(`remote_context.state=${JSON.stringify(state)};commands.get('linux_note:terminal').callback();void 0`);await delay(60);
    assert.equal(await evaluate('pty_starts.length'),count,'unavailable SSH never creates local PTY');
    assert(await evaluate('document.querySelector(".git-graph-dialog").textContent.includes("SSH尚未连接")'));
    await dialog_action('关闭');
  }
  await evaluate('remote_context={target:"alias",remote_path:"/next",state:"connected"};void 0');
  await open_profiles();assert(await evaluate('!document.querySelector("[data-action=terminal_profile_cmd]")&&!!document.querySelector("[data-action=terminal_open_local_folder]")'),'remote menu routes local request through workspace switch');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));document.dispatchEvent(new KeyboardEvent("keyup",{key:"Escape",bubbles:true}));void 0');
  const blocked_count=await evaluate('pty_starts.length');await evaluate('commands.get("linux_note:terminal_admin").callback();void 0');await delay(40);
  assert.equal(await evaluate('pty_starts.length'),blocked_count);assert(await evaluate('document.querySelector(".git-graph-dialog").textContent.includes("本机UAC")'));await dialog_action('关闭');
  await evaluate('remote_context=undefined;window.dispatchEvent(new Event("linux-note-workspace-context-changed"));commands.get("linux_note:terminal").callback();void 0');await wait('pty_starts.length==='+String(blocked_count+1));
  assert.equal(await evaluate(`pty_starts[${blocked_count}].request.executable`),profiles[0].executable,'local workspace default uses local shell');await evaluate(`pty_starts[${blocked_count}].ready();void 0`);
  await evaluate('binding.dispose();release_remote();release_auth();void 0');
  assert(await evaluate('panel_api.current_remote_workspace()===undefined&&pty_starts.slice(12).every(item=>item.killed===1)'));
  console.log(JSON.stringify({status:'PASS',checks:['default SSH routing, disconnected rejection, local workspace switch, stale split rejection and cleanup','SSH literal directory, split, restart and disposal preserve remote launch identity','late directory result cannot overwrite restarted session cwd','pending startup moves between panel and editor without recreation','directory wait, kill and workspace change reject late startup','panel paints before shell discovery; 20 rapid toggles reuse pending session','late discovery does not reopen hidden panel','PTY ready waits for first output; early output clears busy status','failed startup stays in session; disposal prevents late process creation','Chinese composition, Shift English commit, cancellation and repeated input send exactly once','terminal IME and key releases stay local without blocking browser defaults','IME shortcuts preserve focus; normal copy, interrupt, find and Escape still work','disposed terminal releases input event listeners','list and split pointer resize, cancel and keyboard reset','left/right list, narrow icon mode, window clamp and zoom','drag reorder keeps session sizes, active identity and PTY output','editor move releases split-only geometry','panel reserves editor space without changing active document','hidden panel keeps process','split session group and list','panel/editor moves preserve PTY','invalid config does not write','valid appearance updates existing session','rapid restart cancels pending launch','compact action geometry','initial async scan gates startup and respects closed settings','detected and custom profiles agree across menu/settings/launch','refresh adds WSL without stopping existing PTY','removed default is retained and cannot silently launch another shell','closed menu and settings reject late results','refresh preserves selections changed while detection is pending','cleanup cancels pending UI and restores root and every process'],evidence:root}));
}).catch(async error=>{console.error(error);process.exitCode=1;if(win){fs.writeFileSync(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());await evaluate('window.binding?.dispose()');}}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
