// 原始宿主与真实ConPTY：显隐首帧和进程初始化分别采样，不接触用户窗口。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),frame=()=>new Promise(requestAnimationFrame);
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<500;i++){if(fn())return;await pause(30);}throw Error(label);};
 const core=window[Symbol.for('typora-code:workspace')],command=name=>core.app.commands.run('linux_note:'+name);
 let entry;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口尺寸未就绪');await pause(1200);
  const start=performance.now();command('terminal_toggle');await frame();const first_frame_ms=performance.now()-start;
  await wait(()=>document.querySelector('.linux-note-terminal')?.getAttribute('aria-busy')==='false','真实Shell输出未就绪');
  samples.push({first_frame_ms,first_output_ms:performance.now()-start});
  command('terminal_move_editor');entry=core.app.workspace.activeLeaf.view.entry;command('terminal_move_panel');await pause(300);
  const panel=document.querySelector('.typora-terminal-panel'),surface=entry.surface,term=surface.term,pid=entry.session.pid;
  await new Promise(resolve=>term.write(Array.from({length:1000},(_,i)=>'TOGGLE_HISTORY_'+i+'\r\n').join(''),resolve));
  term.scrollToLine(400);await pause(150);const viewport=term.buffer.active.viewportY;
  for(let round=0;round<100;round++){
   command('terminal_toggle');if(round%2)await frame();
   const started=performance.now();command('terminal_toggle');
   const synchronous_height=surface.viewport.getBoundingClientRect().height,command_ms=performance.now()-started;
   await frame();const first_frame_height=surface.viewport.getBoundingClientRect().height,next_frame_ms=performance.now()-started;
   await frame();samples.push({round,synchronous_height,first_frame_height,command_ms,next_frame_ms});
   assert(!panel.hidden&&surface.viewport.clientHeight>100,'可见终端尺寸 '+round);
   assert(entry.session.pid===pid&&surface.term===term&&term.buffer.active.viewportY===viewport,'进程屏幕与历史位置保持 '+round);
  }
  assert(samples.filter(sample=>'round' in sample).every(sample=>sample.synchronous_height>100),'100轮重开无零高度中间态');
  command('terminal');await wait(()=>document.querySelectorAll('.linux-note-terminal').length===2,'第二会话未创建');
  const second=[...document.querySelectorAll('.linux-note-terminal')].find(node=>node!==surface.container);
  await wait(()=>second.dataset.state==='running'&&second.getAttribute('aria-busy')==='false','第二Shell未就绪');
  for(let round=0;round<20;round++){
   const second_pid=second.dataset.pid,before_hide=document.querySelector('.terminal-tab[aria-selected=true]');
   command('terminal_toggle');await frame();
   // Shell首次输出允许刷新状态行；只比较本次重开前后，不能将迟到启动刷新算成显隐重建。
   const selected=document.querySelector('.terminal-tab[aria-selected=true]');command('terminal_toggle');
   samples.push({kind:'second_session',cycle:round,row_updated_while_hidden:before_hide!==selected,selected:selected?.dataset.session,expected:second.dataset.session,height:second.clientHeight});
   assert(second.clientHeight>100&&selected===document.querySelector('.terminal-tab[aria-selected=true]')&&selected.dataset.session===second.dataset.session,'第二会话与列表身份保持 '+round);
   assert(second.dataset.pid===second_pid,'第二会话进程保持 '+round);await frame();
  }
  command('terminal_kill');
  for(let round=0;round<20;round++){
   command('terminal_kill');command('terminal_toggle');command('terminal_kill');await pause(10);
   assert(!document.querySelector('.linux-note-terminal'),'启动取消无迟到表面 '+round);
  }
  await pause(1800);assert(!document.querySelector('.linux-note-terminal'),'结束后未复活');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,viewport:{width:innerWidth,height:innerHeight,dpi:devicePixelRatio},asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'私有桌面命令回放、真实Shell；首帧数值不是物理鼠标及跨设备保证'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
 finally{command('terminal_kill');}
})();
