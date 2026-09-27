// 仅在隔离宿主回放renderer键盘；不关闭用户窗口。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],observed=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error('wait');};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')));
  const core=window[Symbol.for('typora-code:workspace')],side=core.app.workspace.sidebar,write=document.querySelector('#write'),stylize=File.editor.stylize;
  const send=(code,key,mod={})=>{let prevented=false;for(const type of ['keydown','keyup']){const e=new KeyboardEvent(type,{bubbles:true,cancelable:true,code,key,keyCode:code.startsWith('Key')?key.toUpperCase().charCodeAt(0):0,which:code.startsWith('Key')?key.toUpperCase().charCodeAt(0):0,...mod});write.dispatchEvent(e);if(type==='keydown')prevented=e.defaultPrevented;}return prevented;};
  const toggle=side.toggle;let toggles=0;side.toggle=function(...args){toggles++;return toggle.apply(this,args);};
  const action=stylize.toggleStyle;stylize.toggleStyle=function(...args){observed.push(args);return action.apply(this,args);};
  // 选中原生正文，让宿主自己的按键处理器执行实际加粗。
  const p=write.querySelector('p'),range=document.createRange();range.selectNodeContents(p);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);write.focus();
  send('KeyB','b',{ctrlKey:true});await pause(180);
  assert(toggles===0,'Ctrl+B不折叠侧栏');
  assert(!!write.querySelector('strong')&&observed.some(v=>v[0]==='strong'),'Ctrl+B真实原生加粗');
  observed.push({strong:!!write.querySelector('strong'),html:write.innerHTML.slice(0,700)});
  const native_keys=[['KeyK','k'],['Backslash','\\'],['Equal','='],['Minus','-'],['Backquote','~']];
  const passed=[];const handler=e=>{passed.push(e.code);};window.addEventListener('keydown',handler);
  for(const [code,key] of native_keys){send(code,key,{ctrlKey:true,shiftKey:code==='Backquote'});await pause(30);}
  window.removeEventListener('keydown',handler);
  assert(native_keys.every(([code])=>passed.includes(code)),'原生链接清除格式标题和代码键不被工作台截断');
  for(let i=0;i<20;i++)send('KeyB','b',{altKey:true});assert(toggles===20,'Alt+B二十轮每次仅执行一次');
  assert(!send('KeyB','b',{altKey:true,ctrlKey:true}),'AltGr不触发侧栏');
  const run=core.app.commands.run,commands=[];core.app.commands.run=function(id,...args){if(id==='linux_note:open_folder'){commands.push(id);return;}return run.call(this,id,...args);};
  send('KeyK','k',{altKey:true});send('KeyO','o',{altKey:true});await pause(100);assert(commands.length===1,'Alt+K Alt+O优先于顶栏助记键且单次执行');
  core.app.commands.run=run;side.toggle=toggle;stylize.toggleStyle=action;
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,observed,limitation:'renderer合成事件；OS原生accelerator/物理键盘另列'},null,2));
 }catch(e){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,observed,error:String(e.stack)},null,2));}
})();
