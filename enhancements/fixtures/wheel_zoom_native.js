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
  const padding_size=parseFloat(getComputedStyle(write).fontSize);assert(wheel(scroller),'原生编辑区留白消费Ctrl滚轮');await pause(160);
  assert(frame.getZoomLevel()===0&&parseFloat(getComputedStyle(write).fontSize)>padding_size,'原生编辑区留白只调整内容字号');wheel(scroller,120);await pause(160);
  scroller.scrollTop=scroller.scrollHeight/2;await pause(200);
  const box=scroller.getBoundingClientRect(),wb=write.getBoundingClientRect(),point=document.caretRangeFromPoint(wb.left+40,box.top+box.height/3);
  assert(point&&write.contains(point.startContainer)&&point.startContainer.nodeType===3,'捕获原生正文阅读字符');point.setEnd(point.startContainer,Math.min(point.startContainer.length,point.startOffset+1));const offset=point.getBoundingClientRect().top-box.top,body_size=parseFloat(getComputedStyle(write).fontSize);
  assert(wheel(point.startContainer.parentElement),'原生正文消费Ctrl滚轮');await pause(300);
  assert(frame.getZoomLevel()===0&&parseFloat(getComputedStyle(write).fontSize)>body_size,'原生正文只改变内容字体');
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
  const saved_settings=localStorage.getItem('linux-note-terminal:v1:');
  command('terminal_move_editor');await pause(200);wheel(entry.surface.viewport);await pause(180);assert(term.options.fontSize===size+1&&entry.session.pid===pid,'移入编辑组后同一表面缩放');
  command('terminal_move_panel');await pause(160);term.scrollToBottom();await pause(150);wheel(entry.surface.viewport,120);await pause(180);assert(term.buffer.active.viewportY===term.buffer.active.baseY,'原生终端底部继续跟随');
  const terminal_size=term.options.fontSize;const initial_body=parseFloat(getComputedStyle(write).fontSize),history=top();
  const reading_box=scroller.getBoundingClientRect(),reading_point=document.caretRangeFromPoint(write.getBoundingClientRect().left+45,reading_box.top+reading_box.height/3);if(reading_point)reading_point.setEnd(reading_point.startContainer,Math.min(reading_point.startContainer.length||0,reading_point.startOffset+1));const reading_top=reading_point?.getBoundingClientRect().top-reading_box.top;
  command('zoom_in');await pause(300);
  assert(Math.abs(term.options.fontSize*frame.getZoomFactor()-terminal_size)<.05,'界面缩放保持终端视觉字号');
  assert(Math.abs(parseFloat(getComputedStyle(write).fontSize)*frame.getZoomFactor()-initial_body)<.05,'界面缩放保持正文视觉字号');
  assert(top()===history,'界面缩放保持终端历史位置');
  assert(reading_point&&Math.abs(reading_point.getBoundingClientRect().top-scroller.getBoundingClientRect().top-reading_top)<32,'界面缩放保持正文所读字符');
  assert(localStorage.getItem('linux-note-terminal:v1:')===saved_settings,'会话字体调整不写永久配置');
  const source=path.join(base,'workspace/font.c');fs.writeFileSync(source,Array.from({length:120},(_,i)=>'int value_'+i+' = '+i+';').join('\n'));
  await files.open_file(source);await wait(()=>core.app.workspace.activeLeaf?.view.editor?.editor,'源码编辑器');
  const source_view=core.app.workspace.activeLeaf.view,editor=source_view.editor.focused_editor();
  const options=()=>editor.getRawOptions();const source_size=options().fontSize;
  editor.setScrollTop(editor.getTopForLineNumber(40));await pause(120);const line=editor.getVisibleRanges()[0].startLineNumber;
  assert(wheel(editor.getDomNode()),'源码Ctrl滚轮由内容层接管');await pause(200);
  assert(options().fontSize>source_size&&Math.abs(frame.getZoomFactor()-1.2)<.01,'源码字体调整不改变窗口');
  assert(Math.abs(editor.getVisibleRanges()[0].startLineNumber-line)<=1,'源码逻辑行保持');
  command('zoom_out');await pause(200);
  assert(Math.abs(options().fontSize-source_size*1.2-1)<.1,'源码继承会话增量并补偿窗口恢复');
  await files.open_file(file);await pause(200);
  const fence=document.querySelector('#write .md-fences:not(.md-diagram)');fence?.scrollIntoView();await pause(200);
  const code=fence?.querySelector('.CodeMirror')||fence;const code_size=code&&parseFloat(getComputedStyle(code).fontSize);
  wheel(fence);await pause(250);
  assert(code&&parseFloat(getComputedStyle(code).fontSize)>code_size,'代码围栏字体随编辑区滚轮变化');
  File.editor.sourceView.show();await wait(()=>File.editor.sourceView.inSourceMode&&File.editor.sourceView.cm,'原生Markdown源码模式');await pause(250);
  const cm=File.editor.sourceView.cm,cm_root=cm.getWrapperElement(),cm_text=cm.getValue(),cm_cursor=JSON.stringify(cm.getCursor());
  cm.scrollTo(null,cm.heightAtLine(40,'local'));await pause(150);
  const cm_before=parseFloat(getComputedStyle(cm_root).fontSize),cm_position=cm.coordsChar({left:0,top:cm.getScrollInfo().top},'local');
  assert(wheel(cm_root),'原生Markdown源码接管Ctrl滚轮');await pause(220);
  assert(parseFloat(getComputedStyle(cm_root).fontSize)>cm_before&&frame.getZoomLevel()===0,'原生Markdown源码只调整字体');
  assert(Math.abs(cm.coordsChar({left:0,top:cm.getScrollInfo().top},'local').line-cm_position.line)<=1,'原生Markdown源码保持逻辑行');
  const cm_font=parseFloat(getComputedStyle(cm_root).fontSize);command('zoom_in');await pause(200);
  assert(Math.abs(parseFloat(getComputedStyle(cm_root).fontSize)*frame.getZoomFactor()-cm_font)<.05,'原生Markdown源码补偿窗口比例');
  assert(cm.getValue()===cm_text&&JSON.stringify(cm.getCursor())===cm_cursor,'原生Markdown源码保留正文及编辑光标');
  command('zoom_reset');File.editor.sourceView.hide();await pause(250);
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
