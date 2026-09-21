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
  const bundle=await build({stdin:{contents:'export {terminal_surface} from "./src/terminal_surface";export {terminal_defaults} from "./src/terminal_settings";export {default as css} from "./src/terminal_workspace.css";export {default as xterm_css} from "@xterm/xterm/css/xterm.css";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'geometry_api',loader:{'.css':'text'},write:false});
  await evaluate(bundle.outputFiles[0].text);
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
  samples.push({windows_build:19045,resize_cycles:20,key_events:200,history_lines:200,wheel:'trusted Chromium ticks',limits:'Win10兼容参数测试，不冒充Win10实机'});
  await evaluate('surface.dispose()');
  fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify({status:'PASS',samples},null,2));
  console.log(JSON.stringify({status:'PASS',cases:samples.length,evidence:root}));
}).catch(async error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({error:String(error),samples},null,2));}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
