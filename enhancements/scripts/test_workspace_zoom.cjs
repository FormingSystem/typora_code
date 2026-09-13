// 隐藏 Electron 使用真实 webFrame 和 xterm；不启动 Shell，不访问用户文档或配置。
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_workspace_zoom_'));
app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();
let test_window;const checks=[];const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source);
const check=async(source,label)=>{assert(await evaluate(source),label);checks.push(label);};
app.whenReady().then(async()=>{
 test_window=new BrowserWindow({show:false,width:1100,height:740,webPreferences:{contextIsolation:false,nodeIntegration:true,offscreen:true,backgroundThrottling:false}});
 const html=path.join(evidence,'fixture.html');
 fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;color:#333;background:#fff}#editor{margin:20px}#terminal{height:300px;position:absolute;left:0;right:0;bottom:0}.linux-note-terminal,.linux-note-terminal-viewport{height:100%}[hidden]{display:none!important}</style><input id="editor" value="unchanged draft"><input id="search" value="query"><section id="dialog" role="dialog" aria-modal="true" hidden><input id="dialog-input"></section><section class="reading-media-viewer" hidden><button>diagram</button></section><div id="terminal"></div>','utf8');
 await test_window.loadFile(html);
 await test_window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../node_modules/@xterm/xterm/css/xterm.css'),'utf8'));
 const bundle=await build({stdin:{contents:'export * from "./src/workspace_zoom";export * from "./src/workspace_shortcuts";export * from "./src/workspace_titlebar_entries";export {terminal_surface} from "./src/terminal_surface";export {terminal_defaults} from "./src/terminal_settings";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'zoom_qa',write:false});
 await evaluate(bundle.outputFiles[0].text);
 await evaluate(`(()=>{
  window.frame=require('electron').webFrame;window.commands=new Map();window.calls=[];window.terminal_input=[];window.keyup_leaks=0;
  window.runtime={ClientCommand:{zoomIn(){calls.push('in');frame.setZoomLevel(frame.getZoomLevel()+1)},zoomOut(){calls.push('out');frame.setZoomLevel(frame.getZoomLevel()-1)},resetZoom(){calls.push('reset');frame.setZoomLevel(0)}}};
  window.host={commands:{register(c){commands.set(c.id,c);return()=>commands.delete(c.id)},run(id){commands.get(id)?.callback()}},workspace:{activeLeaf:{state:{path:'test.md'}},sidebar:{toggle(){}},activeFile:'test.md'}};
  window.zoom_binding=zoom_qa.bind_workspace_zoom_commands(host,runtime);window.binding=zoom_qa.install_workspace_shortcuts(host,runtime);
  document.addEventListener('keyup',()=>keyup_leaks++);
  window.send=(code,key,options={},selector='#editor')=>{const target=document.querySelector(selector);const down=new KeyboardEvent('keydown',{code,key,ctrlKey:true,bubbles:true,cancelable:true,...options});target.dispatchEvent(down);const up=new KeyboardEvent('keyup',{code,key,ctrlKey:true,bubbles:true,cancelable:true,...options});target.dispatchEvent(up);return down.defaultPrevented;};
  window.reset=()=>{frame.setZoomLevel(0);calls.length=0;keyup_leaks=0};
  window.view=new zoom_qa.terminal_surface(zoom_qa.terminal_defaults,{input:data=>terminal_input.push(data),resize(){},copy:async()=>{},active(){},error:error=>{throw error}});
  document.querySelector('#terminal').append(view.container);view.mount();view.term.write('preserved terminal buffer',()=>window.output_ready=true);
  const files={core:{app:host},path_api:require('path'),source_editor_active:()=>false,context_root:()=>'',open_file(){},can_save_active:()=>false};
  window.defs=zoom_qa.create_workspace_titlebar_definitions(files,runtime,()=>{});window.menu=async label=>(await defs.find(d=>d.label==='视图').entries()).find(e=>e.label===label);
 })()`);
 for(const [code,key,options,direction] of [
  ['Equal','=',{},1],['Equal','+',{shiftKey:true},1],['NumpadAdd','+',{location:3},1],
  ['Minus','-',{},-1],['Minus','_',{shiftKey:true},-1],['NumpadSubtract','-',{location:3},-1],
  ['BracketRight','+',{},1],['','-',{},-1],['Equal','=',{ctrlKey:false,metaKey:true},1],
 ]) await check(`reset();send(${JSON.stringify(code)},${JSON.stringify(key)},${JSON.stringify(options)})&&frame.getZoomLevel()===${direction}&&calls.length===1&&keyup_leaks===0`,code+' '+key+' routes one native zoom step and consumes key release');
 for(const [label,id,level]of [['放大','in',1],['缩小','out',-1],['实际大小','reset',0]])await check(`(async()=>{reset();const entry=await menu(${JSON.stringify(label)});entry.action();return !entry.disabled&&calls.join()===${JSON.stringify(id)}&&frame.getZoomLevel()===${level}})()`,label+' menu shares the registered zoom command');
 for(const selector of ['#search','#dialog-input','.xterm-helper-textarea']){
  await check(`reset();document.querySelector('#dialog').hidden=${selector!=='#dialog-input'};send('Equal','=',{},${JSON.stringify(selector)})&&frame.getZoomLevel()===1&&calls.length===1`,selector+' focus keeps window zoom active');
 }
 await check(`document.querySelector('#dialog').hidden=true;reset();send('Equal','=',{});send('Equal','=',{repeat:true});frame.getZoomLevel()===2&&calls.length===2&&keyup_leaks===0`,'held key repeats once per keydown without keyup duplication');
 for(const options of [{ctrlKey:false},{altKey:true},{metaKey:true},{isComposing:true},{keyCode:229}])await check(`reset();!send('Equal','=',${JSON.stringify(options)})&&calls.length===0&&frame.getZoomLevel()===0`,'non-shortcut or composing input does not zoom '+JSON.stringify(options));
 await check(`reset();!send('Digit0','0')&&calls.length===0`,'Ctrl+0 remains owned by native paragraph formatting');
 await check(`reset();document.querySelector('.reading-media-viewer').hidden=false;!send('Equal','=')&&calls.length===0`,'visible diagram viewer retains local zoom priority');
 await check(`document.querySelector('.reading-media-viewer').hidden=true;reset();send('Equal','=')&&calls.length===1`,'hidden diagram viewer does not suppress window zoom');
 // 真实 Electron 输入进入实际编辑控件及 xterm，验证字符不会被写入草稿或发给 PTY。
 for(const [selector,terminal]of [['#editor',false],['.xterm-helper-textarea',true]]){
  await evaluate(`reset();document.querySelector(${JSON.stringify(selector)}).focus();terminal_input.length=0;`);
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'=',modifiers:['control']});
  test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'=',modifiers:['control']});
  await delay(80);
  await check(`frame.getZoomLevel()===1&&calls.join()==='in'&&terminal_input.length===0&&document.querySelector('#editor').value==='unchanged draft'`,'real Ctrl+= under '+selector+' changes webFrame without document or terminal input');
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'-',modifiers:['control']});
  test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'-',modifiers:['control']});
  await delay(80);
  await check(`frame.getZoomLevel()===0&&calls.join()==='in,out'&&terminal_input.length===0&&view.term.buffer.active.getLine(0).translateToString(true)==='preserved terminal buffer'`,'real Ctrl+- restores the same window and retains terminal buffer '+terminal);
 }
 await check(`(async()=>{reset();const original=runtime.ClientCommand.zoomIn;delete runtime.ClientCommand.zoomIn;const disabled=(await menu('放大')).disabled;const free=!send('Equal','=');runtime.ClientCommand.zoomIn=original;return disabled&&free&&calls.length===0})()`,'missing host capability disables menu and releases shortcut');
 await check(`(()=>{let active=0;try{zoom_qa.bind_workspace_zoom_commands({commands:{register(){if(active)throw Error('fixture');active++;return()=>active--}}},runtime)}catch{}return active===0})()`,'partial registration failure removes earlier commands');
 await check(`(()=>{reset();const stale=commands.get('linux_note:zoom_in').callback;binding.dispose();zoom_binding.dispose();stale();const released=!send('Equal','=');return released&&calls.length===0&&commands.size===0})()`,'dispose removes keys and commands and invalidates stale callbacks');
 await check(`reset();zoom_binding=zoom_qa.bind_workspace_zoom_commands(host,runtime);binding=zoom_qa.install_workspace_shortcuts(host,runtime);send('Equal','=')&&calls.length===1&&commands.size===3`,'reinstallation has one command and keyboard owner');
 await evaluate('binding.dispose();zoom_binding.dispose();view.dispose();frame.setZoomLevel(0)');
 fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks},null,2),'utf8');
 console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));test_window.destroy();app.exit(0);
}).catch(error=>{console.error(JSON.stringify({status:'FAIL',checks,error:String(error.stack||error),evidence}));if(test_window&&!test_window.isDestroyed())test_window.destroy();app.exit(1)});
