// 原始宿主的真实终端链路；隔离文档与 Shell，会话外不写用户数据。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),core=window[Symbol.for('typora-code:workspace')];
 const command=n=>core.app.commands.run('linux_note:'+n);
 const assert=(v,label)=>{if(!v)throw Error(label);checks.push(label)};
 const wait=async fn=>{for(let i=0;i<600;i++){if(fn())return;await pause(25)}throw Error('等待超时')};
 let entry;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')));await pause(1500);
  for(const title of ['Windows PowerShell','Git Bash']){
   command('terminal_toggle');await wait(()=>document.querySelector('.linux-note-terminal')?.dataset.state==='running');
   document.querySelector('[aria-label="选择终端配置"]').click();await pause(1000);
   const item=[...document.querySelectorAll('[data-action^="terminal_profile_"]')].find(e=>e.textContent===title);assert(item,'检测 '+title);item.click();
   await pause(1500);command('terminal_move_editor');await pause(300);entry=core.app.workspace.activeLeaf.view.entry;assert(entry,'取得编辑器会话');command('terminal_move_panel');await pause(300);
   const {surface,session}=entry,term=surface.term;await wait(()=>session.state==='running'&&!session.launch_pending);
   const text=()=>Array.from({length:term.buffer.active.length},(_,i)=>term.buffer.active.getLine(i)?.translateToString()).join('\n');
   const events=[],outputs=[];term.onData(data=>events.push({t:performance.now(),data}));const write=term.write.bind(term);term.write=(data,done)=>{outputs.push({t:performance.now(),n:data.length});write(data,done)};
   // 隔离目录也是 Git 仓库，覆盖 Git Bash 分支提示符的真实成本。
   reqnode('child_process').execFileSync('git',['init',path.join(base,'workspace')],{windowsHide:true,stdio:'ignore'});
   const ps=title.includes('PowerShell');
   // 首次输出可能只是启动横幅，等真实提示符再提交测试命令。
   await wait(()=>ps?/>[\t ]*(?:\n|$)/.test(text()):/(?:^|\n)\$\s*(?:\n|$)/.test(text()));
   surface.focus();await pause(500);
   term.paste(ps?"1..200 | % { 'NATIVE_HISTORY_' + $_ }; 'NATIVE_DONE'":"for i in {1..200}; do echo NATIVE_HISTORY_$i; done; echo NATIVE_DONE");term.textarea.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
   term.textarea.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));await wait(()=>text().includes('NATIVE_HISTORY_200'));await pause(500);
   assert(term.options.windowsPty?.backend==='conpty','ConPTY前后端匹配');const sample={title,mode:term.modes,base:term.buffer.active.baseY,before:term.buffer.active.viewportY};samples.push(sample);
   const wheel=new WheelEvent('wheel',{deltaY:-180,bubbles:true,cancelable:true});Object.defineProperty(wheel,'wheelDeltaY',{value:360});term.element.querySelector('.xterm-screen').dispatchEvent(wheel);await pause(350);
   sample.after=term.buffer.active.viewportY;assert(sample.after<sample.before,title+'滚轮改变历史视口');sample.first=text().includes('NATIVE_HISTORY_1');sample.wheel_prevented=wheel.defaultPrevented;
   const slider=term.element.querySelector('.scrollbar.vertical .slider'),slider_rect=slider?.getBoundingClientRect();sample.slider={width:slider_rect?.width,height:slider_rect?.height};assert(slider_rect?.width>0&&slider_rect?.height>0&&slider_rect.height<surface.viewport.clientHeight,title+'实际历史滑块存在');
   term.scrollToBottom();events.length=0;outputs.length=0;surface.focus();
   for(let i=0;i<100;i++){term.textarea.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,repeat:i>0,bubbles:true,cancelable:true}));await pause(33)}
   term.textarea.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));const released=performance.now();await pause(5000);
   sample.inputs=events.filter(e=>e.data==='\r').length;sample.tail_ms=(outputs.at(-1)?.t||released)-released;sample.bytes=outputs.reduce((n,o)=>n+o.n,0);assert(sample.inputs===100,title+'100次回车单次转发');
   command('terminal_kill');command('terminal_kill');await pause(200);
  }
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,output:entry?Array.from({length:entry.surface.term.buffer.active.length},(_,i)=>entry.surface.term.buffer.active.getLine(i)?.translateToString()).join('\n').slice(-3000):''},null,2));}
})();
