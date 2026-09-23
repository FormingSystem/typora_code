// 原始Typora独立副本；当前候选、实际Shell及原生Markdown，不修改用户环境。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<400;i++){if(fn())return;await pause(30);}throw Error(label);};
 const command=name=>core.app.commands.run('linux_note:'+name),frame=reqnode('electron').webFrame;
 const wheel=(node,delta=-120,options={})=>{const e=new WheelEvent('wheel',{ctrlKey:true,deltaY:delta,bubbles:true,cancelable:true,...options});node.dispatchEvent(e);return e.defaultPrevented;};
 const file=path.join(base,'workspace/wheel.md'),text='# 滚轮缩放\n\n'+Array.from({length:60},(_,i)=>'段落'+i+' 阅读位置保持测试 long reading anchor '.repeat(30)+'\n\n').join('')+'```js\nconsole.log(1)\n```\n\n```mermaid\ngraph LR\n A-->B\n```\n';
 let entry;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'运行器未完成窗口准备');await pause(800);
  fs.writeFileSync(file,text);await files.open_file(file);await wait(()=>File.bundle.filePath===file&&!File.isFileLoading()&&document.querySelectorAll('#write p').length>30,'正文未打开');await pause(400);
  command('zoom_reset');await pause(200);
  const trigger=document.querySelector('.workspace-zoom-status button');assert(trigger&&trigger.getBoundingClientRect().width>0&&!trigger.closest('[hidden]'),'100%入口常驻');
  trigger.click();await pause(60);assert(document.querySelector('.workspace-zoom-controls'),'100%入口可打开控制');
  document.querySelector('[data-zoom-action="in"]').click();await pause(200);if(!document.querySelector('[data-zoom-action="reset"]'))trigger.click();document.querySelector('[data-zoom-action="reset"]').click();await pause(180);
  assert(frame.getZoomLevel()===0&&!trigger.closest('[hidden]'),'重置后入口仍可操作');document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  const scroller=document.querySelector('content'),write=document.querySelector('#write');
  scroller.scrollTop=scroller.scrollHeight/2;await pause(200);
  const box=scroller.getBoundingClientRect(),wb=write.getBoundingClientRect(),point=document.caretRangeFromPoint(wb.left+40,box.top+box.height/3);
  assert(point&&write.contains(point.startContainer)&&point.startContainer.nodeType===3,'捕获原生正文阅读字符');point.setEnd(point.startContainer,Math.min(point.startContainer.length,point.startOffset+1));const offset=point.getBoundingClientRect().top-box.top;
  assert(wheel(point.startContainer.parentElement),'原生正文消费Ctrl滚轮');await pause(300);
  assert(Math.abs(frame.getZoomLevel()-1)<.001,'原生正文只调用一次宿主缩放');
  const after=point.getBoundingClientRect().top-scroller.getBoundingClientRect().top;samples.push({offset,after,zoom:frame.getZoomFactor()});assert(Math.abs(after-offset)<32,'缩放后阅读字符仍保持在原文字行附近');
  wheel(point.startContainer.parentElement,120);await pause(250);assert(frame.getZoomLevel()===0,'正文滚轮可恢复100%');
  for(const selector of ['#write .md-fences','#write .md-diagram']){const node=document.querySelector(selector);assert(node,'原生排除区域存在 '+selector);const before=frame.getZoomLevel();wheel(node);await pause(90);assert(frame.getZoomLevel()===before,'原生嵌入区域不改变窗口比例 '+selector);}
  const para=document.querySelector('#write p');for(const options of [{ctrlKey:false},{altKey:true},{shiftKey:true}])assert(!wheel(para,-120,options),'正文保留非缩放组合 '+JSON.stringify(options));
  command('terminal_toggle');await wait(()=>document.querySelector('.linux-note-terminal')?.dataset.state==='running','Shell启动失败');
  command('terminal_move_editor');await wait(()=>core.app.workspace.activeLeaf?.view.entry,'终端未进入编辑组');entry=core.app.workspace.activeLeaf.view.entry;command('terminal_move_panel');await pause(200);
  const term=entry.surface.term,pid=entry.session.pid;
  term.paste("1..220 | ForEach-Object { 'NATIVE_ZOOM_' + $_ }");const input=term.textarea;for(const type of ['keydown','keyup'])input.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
  const all=()=>Array.from({length:term.buffer.active.length},(_,i)=>term.buffer.active.getLine(i)?.translateToString(true)).join('\n');await wait(()=>all().includes('NATIVE_ZOOM_220'),'真实Shell未完成220行输出');await pause(300);
  const top=()=>term.buffer.active.getLine(term.buffer.active.viewportY)?.translateToString(true);
  term.scrollToLine(60);await pause(100);const first=top(),size=term.options.fontSize;
  for(let i=0;i<20;i++){
   wheel(entry.surface.viewport,i%2?120:-120);await pause(85);
   assert(top()===first,'原生终端历史行保持 '+i);assert(frame.getZoomLevel()===0,'终端不缩放窗口 '+i);
  }
  assert(term.options.fontSize===size&&entry.session.pid===pid,'往返字体和Shell身份保持');
  assert(JSON.parse(localStorage.getItem('linux-note-terminal:v1:')).font_size===size,'终端字号由统一配置持久化');
  command('terminal_move_editor');await pause(200);wheel(entry.surface.viewport);await pause(180);assert(term.options.fontSize===size+1&&entry.session.pid===pid,'移入编辑组后同一表面缩放');
  command('terminal_move_panel');await pause(160);term.scrollToBottom();await pause(150);wheel(entry.surface.viewport,120);await pause(180);assert(term.buffer.active.viewportY===term.buffer.active.baseY,'原生终端底部继续跟随');
  for(const [theme,name]of [['night.css','Night'],['cpp_github-consolas.css','Cpp Github Consolas']]){
   await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(250);
   assert(trigger.getBoundingClientRect().width>0&&!trigger.closest('[hidden]'),'主题下100%入口可见 '+name);
   samples.push({theme:name,color:getComputedStyle(trigger).color,background:getComputedStyle(trigger).backgroundColor,font_size:term.options.fontSize});
  }
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'wheel_zoom_terminal'}));await pause(300);
  command('terminal_kill');entry=undefined;assert(fs.readFileSync(file,'utf8')===text,'正文磁盘未修改');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,iterations:20,limits:'Typora1.14.10/Windows11真实Shell与原生渲染；滚轮由renderer事件触发，Chromium输入注入由独立Electron测试，未验证物理鼠标或Win10实机'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
 finally{if(entry)command('terminal_kill');}
})();
