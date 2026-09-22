const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_terminal_conpty_'));
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
let win;const samples=[];
const evaluate=async source=>{const result=await win.webContents.executeJavaScript('(async()=>{try{return {value:await (0,eval)('+JSON.stringify(source)+')}}catch(error){return {error:error.stack}}})()');if(result.error)throw Error(result.error);return result.value;};
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const html=path.join(root,'fixture.html');
  fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;overflow:hidden}#host{display:flex;position:absolute;left:30px;top:20px;width:900px;height:300px}footer{position:absolute;left:30px;top:320px;width:900px;height:24px}</style><main id="host"></main><footer>status</footer>');
  await win.loadFile(html);
  const bundle=await build({stdin:{contents:'export {terminal_surface} from "./src/terminal_surface";export {terminal_defaults} from "./src/terminal_settings";export {Terminal as upstream_terminal} from "@xterm/xterm";export {Terminal as patched_terminal} from "./vendor/xterm/xterm.mjs";export {default as css} from "./src/terminal_workspace.css";export {default as xterm_css} from "@xterm/xterm/css/xterm.css";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'geometry_api',loader:{'.css':'text'},write:false});
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`window.probe=async function(variant,options,stream,after){
    const host=document.createElement('div');document.body.append(host);
    const term=new geometry_api[variant]({cols:20,rows:5,scrollback:1000,...options});term.open(host);
    const write=data=>new Promise(resolve=>term.write(data,resolve));
    try{await write(stream);if(after)await after(term,write);const b=term.buffer.active;return {base:b.baseY,position:b.viewportY,x:b.cursorX,y:b.cursorY,type:b.type,lines:Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString(true)),background:b.getLine(b.baseY+4).getCell(0).getBgColor()};}
    finally{term.dispose();host.remove();}
  };void 0`);
  const seed=Array.from({length:5},(_,i)=>`\x1b[${i+1};1HLINE_${i}`).join('');
  const stream=seed+'\x1b[1S\x1b[5;1HLINE_5';
  const baseline=await evaluate(`probe('upstream_terminal',{windowsPty:{backend:'conpty',buildNumber:19045}},${JSON.stringify(stream)})`);
  assert.equal(baseline.base,0);assert(!baseline.lines.includes('LINE_0'),'原版SU确实删除历史首行');
  for(const tier of [20,100,1000]){
    const replay=seed+Array.from({length:tier},(_,i)=>`\x1b[1S\x1b[5;1HLINE_${i+5}`).join('');
    const state=await evaluate(`probe('patched_terminal',{windowsPty:{backend:'conpty',buildNumber:19045}},${JSON.stringify(replay)})`);
    assert.equal(state.base,tier);assert.deepEqual(state.lines,Array.from({length:tier+5},(_,i)=>'LINE_'+i),'SU不能丢行、重复或乱序');
    samples.push({scenario:'conpty_su',iterations:tier,history:state.base});
  }
  for(const scrollback of [0,1,3,1000])for(const save of [['\x1b7','\x1b8'],['\x1b[s','\x1b[u']]){
    const replay=seed+'\x1b[3;4H'+save[0]+'\x1b[2S'.repeat(6)+save[1];
    const state=await evaluate(`probe('patched_terminal',{scrollback:${scrollback},windowsPty:{backend:'conpty',buildNumber:19045}},${JSON.stringify(replay)})`);
    assert.equal(state.base,Math.min(scrollback,12));assert.equal(state.x,3);assert.equal(state.y,2,'SU达到容量后保存光标仍恢复原屏幕行');
  }
  const bounded=await evaluate(`probe('patched_terminal',{windowsPty:{backend:'conpty',buildNumber:19045}},${JSON.stringify(seed+'\x1b[999S')})`);
  assert.equal(bounded.base,5,'超大SU参数仅滚动一个屏幕高度');
  for(const scenario of [
    {label:'non_conpty',options:{},stream},
    {label:'alternate_screen',options:{windowsPty:{backend:'conpty',buildNumber:19045}},stream:'\x1b[?1049h'+stream},
    {label:'partial_top',options:{windowsPty:{backend:'conpty',buildNumber:19045}},stream:seed+'\x1b[1;4r\x1b[2S'},
    {label:'partial_inner',options:{windowsPty:{backend:'conpty',buildNumber:19045}},stream:seed+'\x1b[2;4r\x1b[2S'}
  ]){
    const values=[];for(const variant of ['upstream_terminal','patched_terminal'])values.push(await evaluate(`probe('${variant}',${JSON.stringify(scenario.options)},${JSON.stringify(scenario.stream)})`));
    assert.deepEqual(values[1],values[0],scenario.label+'保留上游屏幕和历史语义');
  }
  const color=await evaluate(`probe('patched_terminal',{windowsPty:{backend:'conpty',buildNumber:19045}},${JSON.stringify(seed+'\x1b[44m\x1b[S')})`);
  assert.equal(color.background,4,'新增空行使用当前擦除背景');
  const scrolled=await evaluate(`probe('patched_terminal',{windowsPty:{backend:'conpty',buildNumber:19045}},${JSON.stringify(seed+'\x1b[5S')},async(term,write)=>{term.scrollToTop();await write('\\x1b[2S');})`);
  assert.equal(scrolled.position,0,'后台SU输出不抢走历史阅读位置');
  const cleared=await evaluate(`probe('patched_terminal',{windowsPty:{backend:'conpty',buildNumber:19045}},${JSON.stringify(stream+'\x1b[3J')})`);
  assert.equal(cleared.base,0,'显式清除历史仍然有效');
  await evaluate(`{const style=document.createElement('style');style.textContent=geometry_api.xterm_css+geometry_api.css;document.head.append(style);window.inputs=[];window.resizes=[];window.surface=new geometry_api.terminal_surface(geometry_api.terminal_defaults,{input:data=>inputs.push(data),resize:(cols,rows)=>resizes.push({cols,rows}),copy:async()=>{},active(){},error(error){throw error}},{backend:'conpty',buildNumber:19045});document.querySelector('#host').append(surface.container);surface.mount();}`);
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await evaluate('surface.term.options.windowsPty.buildNumber'),19045);
  await evaluate("new Promise(r=>surface.term.write('\\x1b[c',r))");
  assert.deepEqual(await evaluate('inputs'),['\x1b[?61;4c']);
  const resize_count=await evaluate('resizes.length');
  for(let cycle=0;cycle<20;cycle++){await evaluate('surface.mount();surface.resize();surface.apply_settings(geometry_api.terminal_defaults)');await new Promise(r=>setTimeout(r,25));}
  assert.equal(await evaluate('resizes.length'),resize_count,'相同行格不能重发后端resize');
  await evaluate("new Promise(r=>surface.term.write(Array.from({length:200},(_,i)=>'KEEP_'+i+'\\r\\n').join(''),r))");
  await new Promise(r=>setTimeout(r,100));
  const base_y=await evaluate('surface.term.buffer.active.baseY');assert(base_y>100);
  const point=await evaluate('(()=>{const r=surface.term.element.getBoundingClientRect();return {x:Math.round(r.x+80),y:Math.round(r.y+70)}})()');
  win.webContents.sendInputEvent({type:'mouseMove',...point});
  win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:180,deltaX:0,wheelTicksY:3,wheelTicksX:0,canScroll:true});
  await new Promise(r=>setTimeout(r,100));assert(await evaluate('surface.term.buffer.active.viewportY')<base_y,'真实滚轮访问历史');
  assert(await evaluate("(()=>{const slider=surface.term.element.querySelector('.scrollbar.vertical .slider');if(!slider)return false;const rect=slider.getBoundingClientRect();return rect.width>0&&rect.height>0&&rect.height<surface.viewport.clientHeight})()"),'存在具有实际尺寸的历史滑块');
  const drag_start=await evaluate("(()=>{const r=surface.term.element.querySelector('.scrollbar.vertical .slider').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  const before_drag=await evaluate('surface.term.buffer.active.viewportY');
  win.webContents.sendInputEvent({type:'mouseMove',...drag_start});
  win.webContents.sendInputEvent({type:'mouseDown',...drag_start,button:'left',clickCount:1});
  await new Promise(r=>setTimeout(r,50));
  win.webContents.sendInputEvent({type:'mouseMove',x:drag_start.x,y:drag_start.y-50,modifiers:['leftButtonDown']});
  await new Promise(r=>setTimeout(r,100));
  win.webContents.sendInputEvent({type:'mouseUp',x:drag_start.x,y:drag_start.y-50,button:'left',clickCount:1});
  await new Promise(r=>setTimeout(r,150));assert(await evaluate('surface.term.buffer.active.viewportY')<before_drag,'真实Chromium拖动滑块可回看历史');
  const scroll_y=await evaluate('surface.term.buffer.active.viewportY');
  await evaluate("new Promise(r=>surface.term.write('BACKGROUND\\r\\n',r))");assert.equal(await evaluate('surface.term.buffer.active.viewportY'),scroll_y,'后台输出保持阅读位置');
  await evaluate("document.querySelector('#host').style.height='450px';void 0");await new Promise(r=>setTimeout(r,100));
  assert(await evaluate("Array.from({length:surface.term.buffer.active.length},(_,i)=>surface.term.buffer.active.getLine(i)?.translateToString()).join('').includes('KEEP_0')"),'Win10行格扩大保留历史');
  await evaluate('surface.term.scrollToBottom();surface.focus();inputs=[];void 0');
  for(const key_code of ['Enter','Left']){
    await evaluate('inputs=[];void 0');
    for(let i=0;i<100;i++)win.webContents.sendInputEvent({type:'keyDown',keyCode:key_code,isAutoRepeat:i>0});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:key_code});await new Promise(r=>setTimeout(r,150));
    assert.equal(await evaluate('inputs.length'),100,key_code+'每次键入只转发一次');await new Promise(r=>setTimeout(r,200));assert.equal(await evaluate('inputs.length'),100,'松键后不自行续发');
  }
  await evaluate("new Promise(r=>surface.term.write('\\x1b[?1049h\\x1b[?1000h\\x1b[?1006h',r))");
  await evaluate('inputs=[];void 0');win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:180,deltaX:0,wheelTicksY:3,wheelTicksX:0,canScroll:true});await new Promise(r=>setTimeout(r,100));
  assert(await evaluate('inputs.some(data=>data.startsWith("\\x1b[<64;"))'),'TUI鼠标协议仍交给应用');
  samples.push({windows_build:19045,resize_cycles:20,key_events:200,history_lines:200,wheel:'trusted Chromium ticks',limits:'Electron参数与协议测试；真实Shell另由原生夹具验证'});
  await evaluate('surface.dispose()');
  // 首次输出不能依赖预先按键/反复mount；覆盖输出先于挂载及隐藏后重新显示。
  await evaluate(`{const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/workspace_scrollbars.css'),'utf8'))};document.head.append(style);document.documentElement.dataset.linuxNoteTyporaEnhancements='ready';document.documentElement.dataset.workspaceScrollbars='auto';}`);
  const snapshot=()=>evaluate(`(()=>{const buffer=surface.term.buffer.active,slider=surface.term.element.querySelector('.scrollbar.vertical .slider'),rect=slider?.getBoundingClientRect();return {base:buffer.baseY,position:buffer.viewportY,length:buffer.length,type:buffer.type,first:buffer.getLine(0)?.translateToString(true),slider_width:rect?.width||0,slider_height:rect?.height||0,rows:surface.term.rows,viewport_height:surface.viewport.clientHeight,inputs:inputs.length}})()`);
  for(let cycle=0;cycle<20;cycle++){
    const mode=['before_mount','after_mount','hidden_output','remount'][cycle%4];
    await evaluate(`{inputs=[];window.surface=new geometry_api.terminal_surface(geometry_api.terminal_defaults,{input:data=>inputs.push(data),resize(){},copy:async()=>{},active(){},error(error){throw error}},{backend:'conpty',buildNumber:19045});document.querySelector('#host').append(surface.container);}`);
    if(mode!=='before_mount')await evaluate('surface.mount()');
    if(mode==='hidden_output'){await evaluate("document.querySelector('#host').style.display='none';void 0");await new Promise(r=>setTimeout(r,50));}
    await evaluate("new Promise(r=>surface.term.write(Array.from({length:200},(_,i)=>'EARLY_'+i+'\\r\\n').join(''),r))");
    if(mode==='hidden_output')await new Promise(r=>setTimeout(r,50));
    await evaluate("document.querySelector('#host').style.display='flex';surface.mount();void 0");
    if(mode==='remount'){await evaluate('surface.container.remove()');await new Promise(r=>setTimeout(r,50));await evaluate('document.querySelector("#host").append(surface.container);surface.mount();void 0');}
    await new Promise(r=>setTimeout(r,150));
    const before=await snapshot();
    assert.equal(before.inputs,0,'首次输出验证之前不得发送键盘输入');
    assert(before.base>100&&before.first==='EARLY_0','首次编号输出已进入历史');
    assert(before.slider_width>0&&before.slider_height>0&&before.slider_height<before.viewport_height,'按上下键前已经生成历史滑块');
    const startup_point=await evaluate('(()=>{const r=surface.term.element.getBoundingClientRect();return {x:Math.round(r.x+80),y:Math.round(r.y+70)}})()');
    win.webContents.sendInputEvent({type:'mouseMove',...startup_point});
    win.webContents.sendInputEvent({type:'mouseWheel',...startup_point,deltaY:180,deltaX:0,wheelTicksY:3,wheelTicksX:0,canScroll:true});
    await new Promise(r=>setTimeout(r,100));
    const after_wheel=await snapshot();assert(after_wheel.position<before.position,'首次滚轮不依赖历史命令键');
    await evaluate('surface.focus();void 0');
    for(const key_code of ['Up','Down'])for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:key_code});
    await new Promise(r=>setTimeout(r,100));
    const after_keys=await snapshot();
    assert.equal(after_keys.length,before.length,'前端上下键不能自行生成输出历史');
    assert.equal(after_keys.slider_width,before.slider_width,'前端上下键不能改变滑块宽度');
    samples.push({cycle,mode,before,after_wheel,after_keys,limits:'真实Chromium事件，受控输出；无PowerShell命令历史执行'});
    await evaluate('surface.dispose()');
  }
  fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify({status:'PASS',samples},null,2));
  console.log(JSON.stringify({status:'PASS',cases:samples.length,evidence:root}));
}).catch(async error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({error:String(error),samples},null,2));}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
