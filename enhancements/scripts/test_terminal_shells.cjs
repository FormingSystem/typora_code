// 隔离 Electron 中使用真实键盘和鼠标；仅加载已校验的终端运行文件。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { editor_plugins } = require('./editor_bundle.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_terminal_ui_'));require('node:child_process').execFileSync('git',['init',root],{windowsHide:true,stdio:'ignore'});
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
  const html = path.join(root, 'fixture.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden}.typ-workspace-root{position:absolute;inset:0 0 24px}</style><main class="typ-workspace-root"></main>'); await test_window.loadFile(html);
  const bundle = (await build({ plugins: editor_plugins(), stdin: { contents: 'export { create_terminal_profile_service } from "./src/terminal_profile_detection"; export { create_graph_host } from "./src/git_graph_host"; export { bind_terminal_workspace } from "./src/terminal_workspace";', resolveDir: path.join(__dirname, '..') }, bundle: true, loader: { '.css':'text' }, format: 'iife', globalName: 'terminal_qa', write: false })).outputFiles[0].text;
  await evaluate(bundle);
  await evaluate(`(async () => {
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    window.reqnode=require; window._options={userDataPath:${JSON.stringify(runtime_data)}};
    window.JSBridge={invoke:async(command,value)=>{window.copied=JSON.parse(value).text;}};
    const factories=new Map(); const leaves=[];
    const core={WorkspaceView:class{constructor(leaf){this.leaf=leaf;}},app:{viewManager:{registerView:(type,factory)=>factories.set(type,factory)},commands:{run(){},register(){}},workspace:{activeLeaf:null,eachLeaves:callback=>leaves.forEach(callback),on(){},ribbon:{addButton(){}}}}};
    const parent={appendChild(leaf){leaves.push(leaf);document.body.replaceChildren(leaf.view.container);leaf.view.onOpen();}};
    core.app.workspace.activeLeaf={parent}; core.app.workspace.createLeaf=({type,state})=>{const leaf={state,parent};leaf.view=factories.get(type)(leaf);window.view=leaf.view;return leaf;};
    localStorage.setItem('linux-note-terminal:v1:',JSON.stringify({profile:'cmd',location:'panel'}));
    window.probe_host={core,fs:require('node:fs'),path_api:require('node:path'),process_api:process,context_path:()=>${JSON.stringify(root)},workspace_path:()=>${JSON.stringify(root)},copy:async text=>{window.copied=text;},runner:()=>({run:async()=>${JSON.stringify(root)}})};window.binding=terminal_qa.bind_terminal_workspace(window.probe_host);window.entry=await binding.open(${JSON.stringify(root)},'cmd');window.view=entry.surface;
    window.output_text=()=>{let text='';for(let index=0;index<view.term.buffer.active.length;index++)text+=view.term.buffer.active.getLine(index)?.translateToString()+'\\n';return text;};
  })()`);
  const detected=process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).profiles : await evaluate(`(async()=>{const catalog=terminal_qa.create_terminal_profile_service({...probe_host,child_process:require('node:child_process')});try{await catalog.ready();return catalog.profiles()}finally{catalog.dispose()}})()`);
  const reports=[];assert(detected.length>0,'必须发现并实际启动Shell');
  for(const profile of detected){
    const report={title:profile.title,id:profile.id};reports.push(report);
    try{
      await evaluate('binding.dispose()');
      const config={...profile,args:/powershell|pwsh/i.test(profile.executable)?[...profile.args,'-NoProfile']:profile.args,env:{...profile.env,HOME:root,USERPROFILE:root,HISTFILE:path.join(root,'history_'+profile.id),APPDATA:path.join(root,'appdata'),LOCALAPPDATA:path.join(root,'localappdata')}};
      await evaluate(`(async()=>{localStorage.setItem('linux-note-terminal:v1:',JSON.stringify({profile:${JSON.stringify(profile.id)},profiles:[${JSON.stringify(config)}],location:'panel',scrollback:1000}));window.binding=terminal_qa.bind_terminal_workspace(window.probe_host);window.entry=await binding.open(${JSON.stringify(root)},${JSON.stringify(profile.id)});window.view=entry.surface;window.events=[];window.output_chunks=[];const write=view.term.write.bind(view.term);view.term.write=(data,done)=>{output_chunks.push({time:performance.now(),data});write(data,done)};view.term.onData(data=>events.push({time:performance.now(),data}));view.focus();})()`);
      await wait('view.container.dataset.state==="running" && !entry.session.launch_pending');await delay(1000);
      const ps=/powershell|pwsh/i.test(profile.executable),cmd=profile.id==='cmd';
      const command=ps?"1..200 | ForEach-Object { 'HISTORY_LINE_' + $_ }; 'HISTORY_DONE'":cmd?'for /L %i in (1,1,200) do @echo HISTORY_LINE_%i':'for i in {1..200}; do echo HISTORY_LINE_$i; done; echo HISTORY_DONE';
      test_window.webContents.insertText(command);await key('Enter');if(cmd)await key('Enter');await wait('output_text().includes("HISTORY_LINE_200")');await delay(400);
      report.before=await evaluate('({base:view.term.buffer.active.baseY,position:view.term.buffer.active.viewportY,mode:view.term.modes.mouseTrackingMode,length:view.term.buffer.active.length,contains_first:output_text().includes("HISTORY_LINE_1")})');
      const point=await evaluate('(()=>{const r=view.viewport.getBoundingClientRect();return {x:Math.round(r.x+100),y:Math.round(r.y+80)}})()');
      for(let i=0;i<5;i++){test_window.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:180,deltaX:0,wheelTicksY:3,wheelTicksX:0,canScroll:true});await delay(70);}
      await delay(250);report.after_wheel=await evaluate('({position:view.term.buffer.active.viewportY,base:view.term.buffer.active.baseY,mode:view.term.modes.mouseTrackingMode})');
      await evaluate('view.term.scrollToTop();void 0');await delay(200);report.after_programmatic=await evaluate('view.term.buffer.active.viewportY');
      await evaluate('view.term.scrollToBottom();events=[];output_chunks=[];view.focus();void 0');
      if(!ps&&!cmd){test_window.webContents.insertText("PS1='$ '; PROMPT_COMMAND=''");await key('Enter');await delay(600);await evaluate('events=[];output_chunks=[];void 0')}const start=Date.now();for(let i=0;i<100;i++){test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',isAutoRepeat:i>0});await delay(33);}test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});report.release_ms=Date.now()-start;report.released=await evaluate('performance.now()');
      await delay(5000);report.input=await evaluate('({count:events.filter(e=>e.data==="\\r").length,all:events.length,tail:output_chunks.slice(-3).map(e=>({time:e.time,size:e.data.length})),bytes:output_chunks.reduce((n,e)=>n+e.data.length,0)})');report.tail_ms=(report.input.tail.at(-1)?.time||report.released)-report.released;assert(report.before.base>100,'编号输出进入历史');assert(report.after_wheel.position<report.before.position,'滚轮实际改变视口');assert.equal(report.after_programmatic,0);assert.equal(report.input.count,100,'长按只转发100次输入');assert(report.tail_ms<1000,'隔离简单提示符松键后不积压');report.status='PASS';
    }catch(error){report.status='ERROR';report.error=String(error.stack);process.exitCode=1}
    console.log(JSON.stringify(report));fs.writeFileSync(path.join(evidence,'shell_matrix.json'),JSON.stringify(reports,null,2));
  }
  await evaluate('binding.dispose()');
}).catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{test_window?.destroy();app.exit(process.exitCode||0)});
