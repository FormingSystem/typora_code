// 首次打开时直接通过公开DOM输入；采样前不搬移、不调整终端，避免掩盖初始布局故障。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const core=window[Symbol.for('typora-code:workspace')];
 const command=name=>core.app.commands.run('linux_note:'+name);
 const wait=async predicate=>{for(let i=0;i<600;i++){if(predicate())return;await pause(25);}throw Error('等待超时');};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const sample=label=>{
  const terminal=document.querySelector('.linux-note-terminal'),slider=terminal.querySelector('.scrollbar.vertical .slider');
  const rect=slider.getBoundingClientRect();
  const ancestors=[];
  for(let node=slider;node&&node!==document.body;node=node.parentElement){const style=getComputedStyle(node);ancestors.push({class_name:node.className,rect:node.getBoundingClientRect().toJSON(),opacity:style.opacity,visibility:style.visibility,display:style.display,background:style.backgroundColor,overflow:style.overflow});}
  const hits=[1,rect.width/2,rect.width-1].map(offset=>document.elementFromPoint(rect.x+offset,rect.y+rect.height/2)?.className);
  const result={label,ancestors,hit:hits[1],hits,text:terminal.querySelector('.xterm-rows').innerText};samples.push(result);
  fs.writeFileSync(path.join(base,'scrollbar_diagnostics.json'),JSON.stringify(samples,null,2));return result;
 };
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')));await pause(1800);
  const child_process=reqnode('child_process'),original_fork=child_process.fork,transcript=[];
  child_process.fork=function(...args){const child=original_fork.apply(this,args);child.on('message',message=>{if(message?.type==='data')transcript.push(message.data);});return child;};
  command('terminal_toggle');await wait(()=>document.querySelector('.linux-note-terminal')?.dataset.state==='running');
  child_process.fork=original_fork;
  const terminal=document.querySelector('.linux-note-terminal'),textarea=terminal.querySelector('textarea');
  await wait(()=>/>\s*$/.test(terminal.querySelector('.xterm-rows').innerText));
  const key=name=>{const code={Enter:13,ArrowUp:38,ArrowDown:40}[name];for(const type of ['keydown','keyup'])textarea.dispatchEvent(new KeyboardEvent(type,{key:name,code:name,keyCode:code,which:code,bubbles:true,cancelable:true}));};
  textarea.focus();
  for(let i=0;i<100;i++){key('Enter');await pause(33);}
  await pause(1500);sample('repeated_enter_idle');
  fs.writeFileSync(path.join(base,'enter_transcript.json'),JSON.stringify(transcript,null,2));
  const first_screen=terminal.querySelector('.xterm-screen');first_screen.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await pause(200);sample('repeated_enter_hover');
  const first_wheel=new WheelEvent('wheel',{deltaY:-180,bubbles:true,cancelable:true});Object.defineProperty(first_wheel,'wheelDeltaY',{value:360});first_screen.dispatchEvent(first_wheel);await pause(300);sample('repeated_enter_wheel');
  key('ArrowUp');await pause(200);sample('repeated_enter_up');key('ArrowDown');await pause(200);sample('repeated_enter_down');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'repeated_enter'}));
  await wait(()=>fs.existsSync(path.join(base,'capture_done.json')));
  const hover=samples.find(item=>item.label==='repeated_enter_hover'),scrolled=samples.find(item=>item.label==='repeated_enter_wheel');
  assert(hover.ancestors[0].rect.height<hover.ancestors[1].rect.height,'连续100次空回车产生真实历史滑块');
  assert(Number(hover.ancestors[1].opacity)>0.99&&hover.hit==='slider','悬停后历史滑块可见且可命中');
  assert(scrolled.ancestors[0].rect.top<hover.ancestors[0].rect.top,'连续空回车后滚轮可回看历史');
  for(const label of ['repeated_enter_hover','repeated_enter_wheel','repeated_enter_up','repeated_enter_down'])assert(samples.find(item=>item.label===label).hits.every(hit=>hit==='slider'),label+'滑块左中右均可命中');
  const clipboard=new DataTransfer();clipboard.setData('text/plain',"1..200 | % { 'FIRST_HISTORY_' + $_ }; 'FIRST_DONE'");
  textarea.focus();textarea.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));key('Enter');
  await wait(()=>terminal.querySelector('.xterm-rows').innerText.includes('FIRST_HISTORY_200'));await pause(150);
  sample('first_output');
  const screen=terminal.querySelector('.xterm-screen');screen.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await pause(200);sample('hover');
  const wheel=new WheelEvent('wheel',{deltaY:-180,bubbles:true,cancelable:true});Object.defineProperty(wheel,'wheelDeltaY',{value:360});screen.dispatchEvent(wheel);await pause(300);sample('wheel');
  key('ArrowUp');await pause(200);sample('arrow_up');key('ArrowDown');await pause(200);sample('arrow_down');
  assert(samples.every(item=>item.ancestors[0].rect.width>0),'首次打开始终具有滚动条宽度');
  command('terminal_kill');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
