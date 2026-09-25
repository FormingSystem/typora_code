// 隐藏 Electron 使用真实 webFrame 和 xterm；不启动 Shell，不访问用户文档或配置。
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_workspace_zoom_'));
app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();
let test_window;const checks=[];const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source);
const check=async(source,label)=>{assert(await evaluate(source),label);checks.push(label);};
const until=async(source,label=source)=>{for(let attempt=0;attempt<160;attempt++){if(await evaluate(source))return;await delay(25);}throw Error('Timed out: '+label);};
const key=async(key_code,modifiers=[])=>{test_window.webContents.sendInputEvent({type:'keyDown',keyCode:key_code,modifiers});if(key_code==='Enter'&&!modifiers.length)test_window.webContents.sendInputEvent({type:'char',keyCode:'\r'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:key_code,modifiers});await delay(70);};
const pointer_position=async selector=>{
 const point=await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),rect=node.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;return{x,y,hit:node.contains(document.elementFromPoint(x,y))&&rect.width>0&&rect.height>0}})()`);
 assert(point.hit,selector+' is visible and owns the pointer hit target');const factor=test_window.webContents.getZoomFactor();return{x:Math.round(point.x*factor),y:Math.round(point.y*factor)};
};
const move=async selector=>{const point=await pointer_position(selector);test_window.webContents.sendInputEvent({type:'mouseMove',...point});await delay(90);};
const click=async selector=>{const point=await pointer_position(selector);for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});await delay(20);}await delay(90);};
app.whenReady().then(async()=>{
 test_window=new BrowserWindow({show:false,width:1100,height:740,webPreferences:{contextIsolation:false,nodeIntegration:true,offscreen:true,backgroundThrottling:false}});
 const html=path.join(evidence,'fixture.html');
 fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;color:#333;background:#fff;font:13px system-ui}body{--text-color:#333;--bg-color:#fff}body.dark{color:#ddd;background:#171717;--text-color:#ddd;--bg-color:#171717}#editor{margin:20px}#write{margin:20px;max-width:600px}#terminal{height:300px;position:absolute;left:0;right:0;bottom:30px}.linux-note-terminal,.linux-note-terminal-viewport{height:100%}footer.ty-footer{position:fixed;display:flex;align-items:center;left:0;right:0;bottom:0;height:30px;box-sizing:border-box;font:12px system-ui;color:var(--text-color);background:var(--bg-color)}#footer-count{margin-left:auto;padding:0 12px}[hidden]{display:none!important}</style><input id="editor" value="unchanged draft"><input id="search" value="query"><article id="write" contenteditable="true"><p>preserved Markdown selection</p></article><section id="dialog" role="dialog" aria-modal="true" hidden><input id="dialog-input"></section><section class="reading-media-viewer" hidden><button>diagram</button></section><div id="terminal"></div><footer class="ty-footer"><span id="footer-count" class="footer-item-right">100 词</span></footer>','utf8');
 await test_window.loadFile(html);
 test_window.webContents.debugger.attach();await test_window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await test_window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../node_modules/@xterm/xterm/css/xterm.css'),'utf8'));
 const bundle=await build({stdin:{contents:'export * from "./src/workspace_zoom";export * from "./src/workspace_zoom_status";export * from "./src/workspace_shortcuts";export * from "./src/workspace_titlebar_entries";export {terminal_surface} from "./src/terminal_surface";export {terminal_defaults} from "./src/terminal_settings";export {acquire_workspace_file_icons} from "./src/workspace_file_icons";',resolveDir:path.join(__dirname,'..')},plugins:require('./editor_bundle.cjs').editor_plugins(),bundle:true,loader:{'.css':'text'},format:'iife',globalName:'zoom_qa',write:false});
 await evaluate(bundle.outputFiles[0].text);
 await evaluate(`(()=>{
  window.frame=require('electron').webFrame;window.commands=new Map();window.calls=[];window.terminal_input=[];window.keyup_leaks=0;
  window.runtime={reqnode:require,ClientCommand:{zoomIn(){calls.push('in');frame.setZoomLevel(frame.getZoomLevel()+1)},zoomOut(){calls.push('out');frame.setZoomLevel(frame.getZoomLevel()-1)},resetZoom(){calls.push('reset');frame.setZoomLevel(0)}}};
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
 // 底栏仅展示宿主真实窗口比例；不以测试变量替代webFrame或公共交互主题。
 await evaluate(`reset();window.preferences_calls=[];runtime.ClientCommand.showPreferencePanel=(...args)=>preferences_calls.push(args);window.source_before={html:document.querySelector('#write').innerHTML,draft:document.querySelector('#editor').value,query:document.querySelector('#search').value};window.native_zoom_hint=document.createElement('div');native_zoom_hint.id='zoom-hint';native_zoom_hint.innerHTML='<span id="zoom-hint-current">100%</span>';document.body.append(native_zoom_hint);window.theme_binding=zoom_qa.acquire_workspace_file_icons();window.status_binding=zoom_qa.bind_workspace_zoom_status(host,runtime);void 0`);
 const toggle='.workspace-zoom-status button[data-zoom-action="toggle"]';
 const panel_visible=`(()=>{const panel=document.querySelector('.workspace-zoom-controls');return !!panel&&!panel.hidden&&panel.getClientRects().length>0&&getComputedStyle(panel).visibility==='visible'})()`;
 const status_visible=`(()=>{const node=document.querySelector(${JSON.stringify(toggle)});return !!node&&!node.closest('[hidden]')&&node.getClientRects().length>0})()`;
 const level_matches=`document.querySelector('.workspace-zoom-level')?.textContent===String(Math.round(frame.getZoomLevel()*100)/100)&&document.querySelector('.workspace-zoom-level')?.title.includes(Math.round(frame.getZoomFactor()*100)+'%')`;
 const open_panel=async()=>{await click(toggle);await until(panel_visible,'zoom panel opens from a real click');};
 const set_factor=async factor=>{await evaluate(`frame.setZoomFactor(${factor})`);await until(status_visible,'nondefault zoom entry becomes visible');await delay(90);};
 const origin_input=async()=>{await move('#search');await evaluate(`document.querySelector('#editor').focus();document.querySelector('#editor').setSelectionRange(2,8,'forward');void 0`);};
 await delay(100);
 await check(`${status_visible}&&!${panel_visible}`,'default zero zoom level keeps a visible accessible entry');
 await set_factor(1.2);
 await check(`Math.abs(frame.getZoomLevel()-1)<.001&&document.querySelector(${JSON.stringify(toggle+' [data-git-icon="zoom-in"]')})&&Math.abs(frame.getZoomFactor()-1.2)<.0001`,'native positive zoom displays the official zoom-in status icon');
 await origin_input();await open_panel();
 await check(`${level_matches}&&document.querySelectorAll('.workspace-zoom-controls').length===1`,'click opens exactly one panel with the current native level and percentage');
 await check(`getComputedStyle(native_zoom_hint).visibility==='hidden'`,'open status panel suppresses the duplicate native zoom hint');
 await evaluate('calls.length=0');await click('[data-zoom-action="in"]');await until(`${level_matches}&&Math.abs(frame.getZoomLevel()-2)<.001`);
 await check(`calls.join()==='in'`,'popup plus executes the shared native zoom command exactly once');
 await click('[data-zoom-action="out"]');await until(`${level_matches}&&Math.abs(frame.getZoomLevel()-1)<.001`);
 await check(`calls.join()==='in,out'`,'popup minus executes the shared native zoom command exactly once');
 await key('Escape');await until(`!${panel_visible}`);
 await check(`document.activeElement.id==='editor'&&document.querySelector('#editor').selectionStart===2&&document.querySelector('#editor').selectionEnd===8`,'Escape after mouse-open restores the original editor and selection');
 await origin_input();await move(toggle);await until(panel_visible,'hover opens the zoom panel');await move('.workspace-zoom-level');
 await check(panel_visible,'pointer can cross from the status icon into the hover panel');
 await move('#search');await until(`!${panel_visible}`,'leaving the hover entry and panel dismisses it');
 checks.push('hover opens the same controls and leaving both regions closes them');
 await origin_input();await open_panel();await click('#search');await until(`!${panel_visible}`);
 await check(`document.activeElement.id==='search'`,'outside pointer dismisses once and keeps focus on its destination');
 await origin_input();await open_panel();
 await evaluate('frame.setZoomFactor(1.25)');await until(level_matches,'open panel reflects externally changed webFrame factor');
 await check(`document.querySelector('.workspace-zoom-level').textContent==='1.22'&&document.querySelector('.workspace-zoom-level').title.includes('125%')`,'external fractional zoom displays its real level and percentage without writing a rounded level back');
 await evaluate('calls.length=0');await key('=', ['control']);await until(`${level_matches}&&calls.length===1`);
 await check(`calls.join()==='in'&&Math.abs(frame.getZoomFactor()-1.5)<.001`,'real global shortcut updates native zoom and an already open status panel');
 await click('[data-zoom-action="reset"]');await until(`Math.abs(frame.getZoomLevel())<.001&&${status_visible}&&${panel_visible}`,'reset returns to native zero and keeps the entry and controls accessible');
 await check(`calls.join()==='in,reset'`,'reset delegates once to the original native command');
 if(await evaluate(panel_visible)){await key('Escape');await until(`!${panel_visible}`);}
 await set_factor(1/1.2);
 await check(`!!document.querySelector(${JSON.stringify(toggle+' [data-git-icon="zoom-out"]')})`,'negative zoom uses the official zoom-out status icon');
 await origin_input();await open_panel();await click('[data-zoom-action="settings"]');await until('preferences_calls.length===1');
 await check(`preferences_calls.length===1&&preferences_calls[0].length===0`,'settings calls the existing native preferences panel once without an invented zoom deep link');
 if(await evaluate(panel_visible)){await key('Escape');await until(`!${panel_visible}`);}
 await evaluate(`window.original_preferences=runtime.ClientCommand.showPreferencePanel;window.original_zoom_out=runtime.ClientCommand.zoomOut;delete runtime.ClientCommand.showPreferencePanel;delete runtime.ClientCommand.zoomOut;void 0`);
 await origin_input();await open_panel();
 await check(`document.querySelector('[data-zoom-action="settings"]').disabled&&document.querySelector('[data-zoom-action="out"]').disabled&&!document.querySelector('[data-zoom-action="in"]').disabled`,'missing native capabilities disable only their popup actions');
 await key('Escape');await until(`!${panel_visible}`);await evaluate(`runtime.ClientCommand.showPreferencePanel=original_preferences;runtime.ClientCommand.zoomOut=original_zoom_out;void 0`);
 await move('#search');await evaluate(`document.querySelector(${JSON.stringify(toggle)}).focus();void 0`);await key('Enter');await until(panel_visible);
 await key('End');await check(`document.activeElement.dataset.zoomAction==='settings'`,'keyboard activation opens the controls and End reaches the last available action');
 await key('Home');await key('Tab');await check(`document.activeElement.dataset.zoomAction==='in'`,'Home and Tab navigate the real popup buttons');
 await key('Escape');await until(`!${panel_visible}`);await check(`document.activeElement===document.querySelector(${JSON.stringify(toggle)})`,'keyboard-open Escape restores its status trigger');
 // 等过公共500ms显示延迟，防止Esc恢复焦点或未完成的悬停计时再次弹出。
 const escape_timing=[];
 const record_escape=async(name,before_escape_closed)=>{
  const sample=await evaluate(`({panel_visible:${panel_visible},trigger_focused:document.activeElement===document.querySelector(${JSON.stringify(toggle)}),trigger_hovered:document.querySelector(${JSON.stringify(toggle)}).matches(':hover'),expanded:document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-expanded')})`);
  sample.name=name;sample.before_escape_closed=before_escape_closed;escape_timing.push(sample);fs.writeFileSync(path.join(evidence,'escape_timing.json'),JSON.stringify(escape_timing,null,2),'utf8');fs.writeFileSync(path.join(evidence,'escape_'+name+'.png'),(await test_window.webContents.capturePage()).toPNG());
 };
 await delay(650);await record_escape('restored_trigger');
 for(const source of ['focus','hover']){
  await click('#search');await until(`!${panel_visible}`);
  if(source==='focus'){await evaluate(`document.querySelector(${JSON.stringify(toggle)}).focus();void 0`);await delay(90);}else await move(toggle);
  const before_escape_closed=!(await evaluate(panel_visible));await key('Escape');await delay(650);await record_escape('pending_'+source,before_escape_closed);
 }
 await click('#search');await until(`!${panel_visible}`);
 console.log('Zoom Escape timing evidence: '+path.join(evidence,'escape_timing.json'));
 for(const sample of escape_timing){if(sample.name.startsWith('pending_'))assert(sample.before_escape_closed,sample.name+' exercises the pending stage before a popup exists');assert(!sample.panel_visible&&sample.expanded==='false',sample.name+' remains closed after 650ms, beyond the hover display delay');checks.push('Escape cancels delayed zoom popup '+sample.name);}
 await move('#search');await evaluate(`document.querySelector('#write').focus();const text=document.querySelector('#write p').firstChild;getSelection().setBaseAndExtent(text,2,text,12);window.markdown_selection=getSelection().toString();void 0`);await open_panel();await key('Escape');await until(`!${panel_visible}`);
 await check(`document.activeElement.id==='write'&&getSelection().toString()===markdown_selection`,'Escape also restores native Markdown focus and DOM selection');
 // 明暗和不同底栏高度下测真实内容矩形；窗口缩放只由Electron负责。
 const geometry_metrics=[];
 const luminance=rgb=>rgb.map(value=>{const srgb=value/255;return srgb<=.04045?srgb/12.92:((srgb+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
 const contrast=(foreground,background)=>{const levels=[luminance(foreground),luminance(background)].sort((left,right)=>right-left);return(levels[0]+.05)/(levels[1]+.05);};
 for(const theme of ['light','dark'])for(const height of [22,30])for(const factor of [1.25,1/1.2]){
  await evaluate(`document.body.classList.toggle('dark',${theme==='dark'});document.querySelector('footer.ty-footer').style.height='${height}px';void 0`);await until(`document.documentElement.dataset.workspaceFileIconTheme===${JSON.stringify(theme)}`);await set_factor(factor);await origin_input();await open_panel();await until(level_matches);
  const sample=await evaluate(`(()=>{
   const trigger=document.querySelector(${JSON.stringify(toggle)}),icon=trigger.querySelector('svg'),panel=document.querySelector('.workspace-zoom-controls'),level=panel.querySelector('.workspace-zoom-level'),footer=document.querySelector('footer.ty-footer');
   const rect=node=>{const value=node.getBoundingClientRect();return{left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height}};
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');const pixel=()=>Array.from(context.getImageData(0,0,1,1).data).slice(0,3);
   const colors=node=>{context.fillStyle='#fff';context.fillRect(0,0,1,1);const chain=[];for(let item=node;item;item=item.parentElement)chain.unshift(item);for(const item of chain){context.fillStyle=getComputedStyle(item).backgroundColor;context.fillRect(0,0,1,1);}const background=pixel();context.fillStyle=getComputedStyle(node).color;context.fillRect(0,0,1,1);return{background,foreground:pixel()}};
   const level_range=document.createRange();level_range.selectNodeContents(level);
   return{theme:document.documentElement.dataset.workspaceFileIconTheme,level:frame.getZoomLevel(),factor:frame.getZoomFactor(),viewport:{width:innerWidth,height:innerHeight},footer:rect(footer),trigger:rect(trigger),icon:rect(icon),panel:rect(panel),label:rect(level),label_lines:[...level_range.getClientRects()].map(value=>({left:value.left,right:value.right,top:value.top,bottom:value.bottom})),controls:[...panel.querySelectorAll('button')].map(rect),popup_colors:colors(level),trigger_colors:colors(trigger),focus_inside:panel.contains(document.activeElement),no_css_zoom:getComputedStyle(document.body).zoom==='1'&&getComputedStyle(document.body).transform==='none'};
  })()`);
  sample.expected_theme=theme;sample.expected_height=height;sample.expected_factor=factor;sample.popup_contrast=contrast(sample.popup_colors.foreground,sample.popup_colors.background);sample.trigger_contrast=contrast(sample.trigger_colors.foreground,sample.trigger_colors.background);geometry_metrics.push(sample);
  fs.writeFileSync(path.join(evidence,'status_geometry.json'),JSON.stringify(geometry_metrics,null,2),'utf8');fs.writeFileSync(path.join(evidence,'status_'+theme+'_'+height+'_'+Math.round(factor*100)+'.png'),(await test_window.webContents.capturePage()).toPNG());
  const description=theme+'/'+height+'px/'+Math.round(factor*100)+'%';
  assert.equal(sample.theme,theme,description+' uses the production theme observer');assert(Math.abs(sample.factor-factor)<.0001&&sample.no_css_zoom,description+' uses native window scaling only');assert(Math.abs(sample.footer.height-height)<.05,description+' preserves the host footer height within Chromium subpixel precision');assert(Math.abs(sample.trigger.height-height)<.05,description+' fills the shared footer content box');assert(Math.abs(sample.icon.width-16)<.05,description+' keeps the official icon width');assert(Math.abs(sample.icon.height-16)<.05,description+' keeps the official icon height');assert(Math.abs((sample.icon.top+sample.icon.bottom-sample.footer.top-sample.footer.bottom)/2)<.6,description+' centers the icon vertically');
  assert(sample.panel.left>=0&&sample.panel.right<=sample.viewport.width+.5&&sample.panel.top>=0&&sample.panel.bottom<=sample.footer.top+.5,description+' places the complete popup above the footer within the viewport');assert(sample.controls.every(rect=>rect.left>=sample.panel.left&&rect.right<=sample.panel.right+.5&&rect.top>=sample.panel.top&&rect.bottom<=sample.panel.bottom+.5),description+' leaves every popup action visible');assert(sample.label_lines.every(rect=>rect.left>=sample.label.left-.5&&rect.right<=sample.label.right+.5&&rect.top>=sample.panel.top&&rect.bottom<=sample.panel.bottom+.5),description+' keeps the actual zoom text line visible');assert(sample.popup_contrast>=4.5&&sample.trigger_contrast>=3,description+' keeps popup text and status icon readable');assert(sample.focus_inside,description+' retains keyboard focus inside the clicked popup');checks.push('native zoom status geometry and contrast '+description);
  await key('Escape');await until(`!${panel_visible}`);
 }
 await check(`document.querySelector('#write').innerHTML===source_before.html&&document.querySelector('#editor').value===source_before.draft&&document.querySelector('#search').value===source_before.query&&terminal_input.length===0&&view.term.buffer.active.getLine(0).translateToString(true)==='preserved terminal buffer'`,'status controls and shortcuts preserve source DOM, drafts, search input and terminal buffer');
 await origin_input();await open_panel();await evaluate('status_binding.dispose();status_binding.dispose();frame.setZoomFactor(1.4);native_zoom_hint.querySelector("span").textContent="140%";window.dispatchEvent(new Event("resize"));void 0');await delay(180);
 await check(`!document.querySelector('.workspace-zoom-status,.workspace-zoom-controls')&&getComputedStyle(native_zoom_hint).visibility!=='hidden'`,'dispose removes the open status UI, restores native feedback and prevents later zoom events from resurrecting it');
 await check(`zoom_qa.bind_workspace_zoom_status(host,{...runtime,reqnode(){throw Error('webFrame unavailable')}})===undefined&&!document.querySelector('.workspace-zoom-status,.workspace-zoom-controls')`,'unavailable native webFrame leaves no misleading status or partial popup');
 await evaluate(`status_binding=zoom_qa.bind_workspace_zoom_status(host,runtime);void 0`);await until(status_visible);
 await check(`document.querySelectorAll('.workspace-zoom-status').length===1`,'status reinstallation creates one new owner after disposal');
 await evaluate('status_binding.dispose();theme_binding.remove();native_zoom_hint.remove()');
 await evaluate('binding.dispose();zoom_binding.dispose();view.dispose();frame.setZoomLevel(0)');
 fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks},null,2),'utf8');
 console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));test_window.destroy();app.exit(0);
}).catch(async error=>{console.error(JSON.stringify({status:'FAIL',checks,error:String(error.stack||error),evidence}));if(test_window&&!test_window.isDestroyed()){fs.writeFileSync(path.join(evidence,'failure.png'),(await test_window.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(evidence,'failure.html'),await evaluate('document.documentElement.outerHTML'),'utf8');test_window.destroy();}app.exit(1)});
