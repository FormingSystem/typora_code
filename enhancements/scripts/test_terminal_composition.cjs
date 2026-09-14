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
  fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}.linux-note-terminal{height:500px;width:850px}.linux-note-terminal-viewport{height:450px}#plain-input,#editable-input{display:block;min-height:24px;width:800px}</style><textarea id="plain-input"></textarea><div id="editable-input" contenteditable="true"></div>','utf8');await win.loadFile(html);
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
  // 搜狗可在纯Shift按下后直接产生insertText，未必经过compositionend。
  // 与普通文本控件使用同一组真实Chromium事件；不能用完整组合提交替代这条路径。
  const direct_results=[],direct_failures=[];
  await evaluate(`window.direct_trace=[];window.direct_target=undefined;window.direct_lifetime=new AbortController();
    for(const type of ['keydown','keyup','compositionstart','compositionend','beforeinput','input']){
      window.addEventListener(type,event=>{if(event.target!==direct_target)return;const record={type,key:event.key,code:event.code,data:event.data,input_type:event.inputType,trusted:event.isTrusted,prevented:false,focus_preserved:false};direct_trace.push(record);queueMicrotask(()=>{record.prevented=event.defaultPrevented;record.focus_preserved=document.activeElement===direct_target;});},{capture:true,signal:direct_lifetime.signal});
    }void 0`);
  for(const [code,location]of [['ShiftLeft',1],['ShiftRight',2]]){
    for(const kind of ['textarea','contenteditable','terminal']){
      await evaluate(`(()=>{make_surface();direct_trace=[];direct_target=${kind==='terminal'?'surface.term.textarea':`document.querySelector(${JSON.stringify(kind==='textarea'?'#plain-input':'#editable-input')})`};if(direct_target instanceof HTMLTextAreaElement)direct_target.value='';else direct_target.textContent='';direct_target.focus();})()`);
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code,windowsVirtualKeyCode:16,modifiers:8,location});
      await commit('pin');await pause(20);
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code,windowsVirtualKeyCode:16,modifiers:0,location});
      await commit('x');await pause(25);
      const result=await evaluate('({value:direct_target instanceof HTMLTextAreaElement?direct_target.value:direct_target.textContent,writes:[...writes],trace:[...direct_trace],focused:document.activeElement===direct_target})');
      direct_results.push({kind,code,...result});
      const shift_events=result.trace.filter(event=>event.key==='Shift');
      if(result.value!=='pinx'||!result.focused||shift_events.length!==2||shift_events.some(event=>!event.trusted||event.prevented||!event.focus_preserved)||result.trace.some(event=>event.type.startsWith('composition'))||result.trace.filter(event=>event.type==='input').some(event=>!event.trusted))direct_failures.push(`${kind} ${code}: 浏览器直提交、默认行为或焦点异常`);
      if(kind==='terminal'&&JSON.stringify(result.writes)!==JSON.stringify(['pin','x']))direct_failures.push(`${kind} ${code}: 期望一次发送pin和后续x，实际${JSON.stringify(result.writes)}`);
    }
  }
  await evaluate('direct_lifetime.abort();make_surface();void 0');
  for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'F',modifiers:['control','shift']});await pause(25);
  const find_result=await evaluate('!surface.container.querySelector(".terminal-find").hidden&&document.activeElement===surface.container.querySelector(".terminal-find input")&&writes.length===0');
  if(!find_result)direct_failures.push('Ctrl+Shift+F未打开终端查找或误发PTY');
  for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Escape'});await pause(25);
  if(!await evaluate('document.activeElement===surface.term.textarea&&surface.container.querySelector(".terminal-find").hidden'))direct_failures.push('查找Escape未恢复终端焦点');
  fs.writeFileSync(path.join(root,'direct_input.json'),JSON.stringify({direct_results,direct_failures,find_result},null,2),'utf8');
  assert.deepEqual(direct_failures,[],'Shift direct input must match plain textarea and contenteditable');
  checks.push('Left and right Shift direct input matches textarea/contenteditable, preserves default and focus, and sends each commit once');
  checks.push('Ctrl+Shift+F retains terminal find and Escape restores typing after direct input');
  const boundary_results=[];
  for(const [label,modifiers,key_code]of [['Ctrl+Shift',10,16],['Alt+Shift',9,16],['Meta+Shift',12,16],['Shift key with 229',8,229]]){
    await evaluate(`make_surface();window.boundary_events=[];surface.term.textarea.addEventListener('keydown',event=>boundary_events.push({key:event.key,key_code:event.keyCode,trusted:event.isTrusted,ctrl:event.ctrlKey,alt:event.altKey,meta:event.metaKey}),true);void 0`);
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:key_code,modifiers,location:1});
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:key_code,modifiers:0,location:1});await pause(15);
    const result=await evaluate('({events:[...boundary_events],focused:document.activeElement===surface.term.textarea,writes:[...writes]})');boundary_results.push({label,...result});
    assert.equal(result.events.length,1,label+' reaches the real xterm textarea target');assert(result.events[0].trusted);assert.equal(result.events[0].key_code,key_code);assert.equal(result.events[0].ctrl,Boolean(modifiers&2));assert.equal(result.events[0].alt,Boolean(modifiers&1));assert.equal(result.events[0].meta,Boolean(modifiers&4));assert(result.focused);assert.deepEqual(result.writes,[]);
  }
  // AltGraph和显式isComposing的精确标志用renderer事件回放，和上方trusted输入分开记证。
  for(const flags of [{modifierAltGraph:true},{isComposing:true}]){
    const result=await evaluate(`(()=>{make_surface();const input=surface.term.textarea;let reached=false;input.addEventListener('keydown',()=>reached=true,{once:true,capture:true});const event=new KeyboardEvent('keydown',{key:'Shift',code:'ShiftLeft',keyCode:16,shiftKey:true,bubbles:true,cancelable:true,...${JSON.stringify(flags)}});input.dispatchEvent(event);return{reached,prevented:event.defaultPrevented,alt_graph:event.getModifierState('AltGraph'),is_composing:event.isComposing,trusted:event.isTrusted};})()`);
    boundary_results.push({label:'renderer composition modifier flags',flags,...result});assert(result.reached&&!result.prevented);assert.equal(result.alt_graph,Boolean(flags.modifierAltGraph));assert.equal(result.is_composing,Boolean(flags.isComposing));
  }
  await evaluate(`make_surface();window.boundary_events=[];surface.term.textarea.addEventListener('keydown',event=>boundary_events.push({key:event.key,trusted:event.isTrusted}),true);void 0`);
  await compose('pin');await pause(20);
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:8,location:1});
  await commit('pin');
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:0,location:1});await pause(25);
  const active_composition=await evaluate('({events:[...boundary_events],writes:[...writes],focused:document.activeElement===surface.term.textarea})');boundary_results.push({label:'trusted active composition Shift',...active_composition});assert.equal(active_composition.events.length,1);assert(active_composition.events[0].trusted&&active_composition.focused);assert.deepEqual(active_composition.writes,['pin']);
  await evaluate(`make_surface();window.boundary_events=[];surface.term.textarea.addEventListener('keydown',event=>boundary_events.push({key:event.key,trusted:event.isTrusted}),true);void 0`);
  for(const options of [{key:'X',code:'KeyX',windowsVirtualKeyCode:88,text:'X',unmodifiedText:'x'},{key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37}]){
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',modifiers:8,...options});
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',modifiers:8,key:options.key,code:options.code,windowsVirtualKeyCode:options.windowsVirtualKeyCode});
  }
  await pause(25);const shifted_keys=await evaluate('({events:[...boundary_events],writes:[...writes]})');boundary_results.push({label:'trusted shifted character and arrow',...shifted_keys});assert.deepEqual(shifted_keys.events,[{key:'X',trusted:true},{key:'ArrowLeft',trusted:true}]);assert.deepEqual(shifted_keys.writes,['X','\x1b[1;2D']);
  fs.writeFileSync(path.join(root,'modifier_boundaries.json'),JSON.stringify(boundary_results,null,2),'utf8');
  checks.push('Ctrl/Alt/Meta/AltGraph+Shift, 229 and active composition reach xterm; shifted character and arrow retain terminal sequences');
  await evaluate('make_surface();void 0');
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
  await evaluate(`window.disposed_input=surface.term.textarea;window.disposed_parent=disposed_input.parentElement;window.disposed_shift_events=[];disposed_input.addEventListener('keydown',event=>disposed_shift_events.push({key:event.key,trusted:event.isTrusted,prevented:event.defaultPrevented}),true);surface.dispose();document.body.append(disposed_parent);disposed_parent.append(disposed_input);disposed_input.focus();void 0`);
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:8,location:1});
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:0,location:1});await pause(15);
  assert.deepEqual(await evaluate('disposed_shift_events'),[{key:'Shift',trusted:true,prevented:false}]);assert.equal(await evaluate('writes.join("")'),'ascii\x03');await evaluate('disposed_parent.remove();void 0');checks.push('Surface disposal removes parent Shift capture so a reattached textarea receives native keydown again');
  fs.writeFileSync(path.join(root,'trace.json'),JSON.stringify(await evaluate('({writes,trace})'),null,2));
  win.webContents.debugger.detach();await evaluate('surface.dispose();void 0');
  console.log(JSON.stringify({status:'PASS',root,checks}));win.destroy();app.quit();
}).catch(async error=>{console.error(error);console.error(root);if(win&&!win.isDestroyed())fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify(await evaluate('({writes,trace})'),null,2));win?.destroy();app.exit(1)});
