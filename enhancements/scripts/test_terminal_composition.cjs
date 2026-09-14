const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_terminal_composition_'));
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let win;
const evaluate=source=>win.webContents.executeJavaScript(source);
const checks=[];
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:900,height:650,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const html=path.join(root,'fixture.html');
  fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}.linux-note-terminal{height:500px;width:850px}.linux-note-terminal-viewport{height:450px}</style>');await win.loadFile(html);
  const bundle=await build({stdin:{contents:'export {terminal_surface} from "./src/terminal_surface";export {terminal_defaults} from "./src/terminal_settings";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'terminal_api',loader:{'.css':'text'},write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(`window.trace=[];window.make_surface=()=>{
    window.surface?.dispose();window.writes=[];
    window.surface=new terminal_api.terminal_surface(terminal_api.terminal_defaults,{input:data=>writes.push(data),resize(){},copy:async()=>{},error:error=>{throw error},active(){}});
    document.body.append(surface.container);surface.mount();surface.focus();
    for(const type of ['compositionstart','compositionupdate','compositionend','input'])surface.term.textarea.addEventListener(type,event=>trace.push({type,data:event.data,inputType:event.inputType,value:surface.term.textarea.value}));
  };make_surface();void 0`);
  win.webContents.debugger.attach('1.3');
  const compose=(text,extra={})=>win.webContents.debugger.sendCommand('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length,...extra});
  const commit=text=>win.webContents.debugger.sendCommand('Input.insertText',{text});
  await commit('中文');await pause(35);assert.equal(await evaluate('writes.join("")'),'中文');
  await compose('p');await pause(20);await compose('pin',{replacementStart:0,replacementEnd:3});await pause(20);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Shift',modifiers:['shift']});
  await commit('pin');win.webContents.sendInputEvent({type:'keyUp',keyCode:'Shift'});await pause(35);
  assert.equal(await evaluate('writes.join("")'),'中文pin');checks.push('Chromium appending composition keeps Shift-committed pinyin');
  // CDP不重现Windows TSF整值替换：明确回放上游6049的DOM事件顺序。
  await evaluate(`window.replay=async({text='pin',pending='pin',whole=true,after=false,shift='ShiftLeft',wait=true}={})=>{
    const ta=surface.term.textarea,previous=ta.value;
    ta.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
    ta.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:pending}));
    ta.value=whole?pending:previous+pending;
    if(wait)await new Promise(resolve=>setTimeout(resolve,15));
    for(const type of ['keydown','keyup'])ta.dispatchEvent(new KeyboardEvent(type,{key:'Shift',code:shift,keyCode:16,which:16,shiftKey:type==='keydown',bubbles:true,cancelable:true}));
    const final_value=text?(whole?text:previous+text):previous;
    if(!after)ta.value=final_value;
    ta.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:text}));
    if(after)ta.value=final_value;
    if(wait)await new Promise(resolve=>setTimeout(resolve,25));
  };replay()`);
  assert.equal(await evaluate('writes.join("")'),'中文pinpin','Whole-value replacement must not lose Shift pinyin behind a stale offset');
  assert(await evaluate('document.activeElement===surface.term.textarea'));checks.push('Whole-value replacement after prior Chinese and pinyin does not lose commit');
  for(const options of [
    {seed:'x',text:'pinyin'},
    {seed:'long existing prefix',text:'pin',after:true,shift:'ShiftRight'},
    {seed:'中文',pending:'zhongwen',text:'中文'},
    {seed:'same',text:'same'},
    {seed:'🧪',pending:'shiyan',text:'实验'},
    {seed:'normal',text:'pin',whole:false},
    {seed:'',text:'pin'},
    {seed:'cancel',text:''},
  ]){
    await evaluate('make_surface();void 0');if(options.seed){await commit(options.seed);await pause(25);}
    await evaluate(`replay(${JSON.stringify(options)})`);
    assert.equal(await evaluate('writes.join("")'),options.seed+options.text,JSON.stringify(options));
  }
  checks.push('Partial/full offset loss, Chinese, surrogate prefix, repeated text, append, empty prefix and cancellation');
  await evaluate('make_surface();void 0');await commit('prefix');await pause(25);
  for(let i=0;i<4;i++)await evaluate('replay({shift:"ShiftRight"})');
  assert.equal(await evaluate('writes.join("")'),'prefix'+('pin'.repeat(4)));checks.push('Consecutive right Shift commits send exactly once');
  // 一轮任务中结束后立刻开始下一次组合，覆盖xterm尚未发送前一次结果的窗口。
  await evaluate('make_surface();void 0');await commit('prefix');await pause(25);
  await evaluate('(async()=>{await replay({text:"a",wait:false});await replay({text:"b",wait:false});})()');await pause(35);
  assert.equal(await evaluate('writes.join("")'),'prefixab');checks.push('Back-to-back committed compositions before xterm timer retain both results');
  await evaluate('make_surface();void 0');await commit('prefix');await pause(25);
  await evaluate('replay({text:"a",wait:false});replay({text:"b",wait:false});void 0');await pause(35);
  assert.equal(await evaluate('writes.join("")'),'prefixab');checks.push('Same-stack next composition flushes the prior committed replacement');
  await evaluate('make_surface();void 0');await commit('prefix');await pause(25);
  await evaluate(`(()=>{const ta=surface.term.textarea;ta.dispatchEvent(new CompositionEvent('compositionstart',{data:'',bubbles:true}));ta.value='pin';ta.dispatchEvent(new CompositionEvent('compositionend',{data:'pin',bubbles:true}));ta.blur();})()`);await pause(35);
  assert.equal(await evaluate('writes.join("")'),'prefix');assert.equal(await evaluate('surface.term.textarea.value'),'');checks.push('Blur invalidates pending normalization');
  await evaluate('make_surface();void 0');await commit('prefix');await pause(25);
  await evaluate(`(()=>{window.old_input=surface.term.textarea;old_input.dispatchEvent(new CompositionEvent('compositionstart',{data:'',bubbles:true}));old_input.value='pin';old_input.dispatchEvent(new CompositionEvent('compositionend',{data:'pin',bubbles:true}));surface.dispose();window.disposed_value=old_input.value;})()`);await pause(35);
  assert.equal(await evaluate('writes.join("")'),'prefix');assert(await evaluate('old_input.value===disposed_value'));checks.push('Dispose removes adaptation and prevents queued DOM writes');
  await evaluate('make_surface();void 0');await commit('ascii');await pause(25);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'C',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'C',modifiers:['control']});await pause(25);
  assert.equal(await evaluate('writes.join("")'),'ascii\x03');checks.push('Direct insertText and Ctrl+C retain normal terminal behavior');
  fs.writeFileSync(path.join(root,'trace.json'),JSON.stringify(await evaluate('({writes,trace})'),null,2));
  win.webContents.debugger.detach();await evaluate('surface.dispose();void 0');
  console.log(JSON.stringify({status:'PASS',root,checks}));win.destroy();app.quit();
}).catch(async error=>{console.error(error);console.error(root);if(win&&!win.isDestroyed())fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify(await evaluate('({writes,trace})'),null,2));win?.destroy();app.exit(1)});
