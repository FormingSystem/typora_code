// 原始宿主独立副本；实际Shell输出、工作台命令与缩放，保留用户运行环境。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],command=name=>core.app.commands.run('linux_note:'+name);
 const file=path.join(base,'workspace/front.md'),before=fs.readFileSync(file,'utf8');
 const inspect=label=>{
  const footer=document.querySelector('footer.ty-footer').getBoundingClientRect();
  for(const surface of document.querySelectorAll('.linux-note-terminal')){
   const viewport=surface.querySelector('.linux-note-terminal-viewport').getBoundingClientRect();if(!viewport.width||!viewport.height)continue;
   const screen=surface.querySelector('.xterm-screen').getBoundingClientRect(),last=surface.querySelector('.xterm-rows').lastElementChild.getBoundingClientRect();
   const gap=viewport.bottom-screen.bottom;
   samples.push({label,zoom:reqnode('electron').webFrame.getZoomFactor(),gap,screen_bottom:screen.bottom,last_bottom:last.bottom,viewport_bottom:viewport.bottom,footer_top:footer.top});
   assert(gap>=3.4,label+'终端行格保留底部留白');assert(last.bottom<=viewport.bottom-3.4,label+'末行完整位于内容区');assert(viewport.bottom<=footer.top+1,label+'终端不覆盖底栏');
  }
 };
 try{
  for(let i=0;i<100&&File.isFileLoading();i++)await pause(50);await pause(2400);
  command('terminal_toggle');
  for(let i=0;i<400&&document.querySelector('.linux-note-terminal')?.getAttribute('aria-busy')==='true';i++)await pause(25);
  const first=document.querySelector('.linux-note-terminal');assert(first?.dataset.state==='running','真实Shell运行');const pid=first.dataset.pid;
  // 终端公开粘贴入口执行一条临时输出命令；不接触用户文件。
  const clipboard=new DataTransfer();clipboard.setData('text/plain',"1..80 | ForEach-Object { 'GEOMETRY_ROW' }\r");
  first.querySelector('.linux-note-terminal-viewport').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clipboard}));await pause(100);
  [...document.querySelectorAll('.git-graph-dialog-footer button')].find(button=>button.textContent==='粘贴到终端')?.click();await pause(1800);
  assert(first.querySelector('.xterm-rows').textContent.includes('GEOMETRY_ROW'),'实际Shell输出到终端');
  for(const mode of ['panel','split','editor']){
   if(mode==='split'){command('terminal_split');await pause(1800);}
   if(mode==='editor'){command('terminal_move_editor');await pause(350);}
   for(const zoom of [0.8,1,1.25]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(250);
    for(const direction of ['ArrowDown','ArrowUp','ArrowUp']){
     const sash=document.querySelector('.terminal-panel-sash');sash.dispatchEvent(new KeyboardEvent('keydown',{key:direction,bubbles:true,cancelable:true}));await pause(150);inspect(mode+' '+zoom+' '+direction);
    }
   }
  }
  assert(first.dataset.pid===pid,'缩放和分屏保留原Shell进程');
  command('terminal_move_panel');command('zoom_reset');await pause(200);
  for(let i=0;i<2;i++){command('terminal_kill');await pause(150);}
  assert(!document.querySelector('.linux-note-terminal'),'会话终止清理所有表面');assert(fs.readFileSync(file,'utf8')===before,'原生文档保持');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'原始Typora1.14.10及真实ConPTY；renderer命令/粘贴/键盘事件，非物理鼠标或跨平台验收'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
