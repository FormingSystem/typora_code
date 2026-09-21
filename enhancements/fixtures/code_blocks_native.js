// 仅在独立原始宿主和临时文档中观察代码围栏几何。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(await fn())return;await pause(30);}throw Error('timeout '+label);};
 const assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const fences=()=>[...document.querySelectorAll('#write .md-fences')];
 const measure=f=>{const cm=f.querySelector('.CodeMirror')?.CodeMirror;return {class:f.className,rect:f.getBoundingClientRect().height,lines:cm?.lineCount(),doc_height:cm?.doc?.height,info:cm?.getScrollInfo(),style:f.getAttribute('style'),sizer:f.querySelector('.CodeMirror-sizer')?.getAttribute('style'),wrapper:f.querySelector('.CodeMirror')?.getAttribute('style')};};
 try{
  await wait(()=>files.current_file()===path.join(base,'workspace/front.md')&&!File.isFileLoading(),'initial');await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'private runner window bounds');
  const source='# Code block geometry\n\n'+[80,1,4,100,1,2].map((n,i)=>'## Block '+i+'\n\n```sh\n'+Array.from({length:n},(_,j)=>'echo environment_'+i+'_line_'+j+'_configuration_and_dependencies_path').join('\n')+'\n```\n\n').join('');
  const file=path.join(base,'workspace/code_blocks.md');fs.writeFileSync(file,fs.existsSync(path.join(base,'workspace/repro.md'))?fs.readFileSync(path.join(base,'workspace/repro.md'),'utf8')+'\n\n'+source:source,'utf8');await files.open_file(file);await wait(()=>fences().length>=6&&!File.isFileLoading(),'fences');await pause(800);
  const initial_markdown=File.editor.getMarkdown(),disk=fs.readFileSync(file,'utf8');
  const custom=fs.existsSync(path.join(base,'workspace/repro.md'));
  for(const zoom of custom?[1.8]:[1,1.8]){
   reqnode('electron').webFrame.setZoomFactor(zoom);await pause(400);
   // 宿主按可见区域创建围栏编辑器，先滚动建立实际实例，再取长短块集合。
   for(const f of fences()){f.scrollIntoView({block:'center'});await pause(100);}
   await pause(100);
   const long_indices=fences().map((f,i)=>f.querySelector('.linux-note-code-toggle')?i:-1).filter(i=>i>=0);
   const short_indices=fences().map((f,i)=>{const cm=f.querySelector('.CodeMirror')?.CodeMirror;return cm&&cm.lineCount()<=4?i:-1;}).filter(i=>i>=0);
   assert(long_indices.length>=(custom?1:2),'混排存在实际长代码块');
   for(let i=0;i<10;i++){
    const long=fences()[long_indices[i%long_indices.length]],other=fences()[long_indices[(i+1)%long_indices.length]],other_state=other.classList.contains('is-code-expanded');
    long.scrollIntoView({block:'center'});await pause(100);
    document.querySelector('#write').style.setProperty('max-width',i%2?'640px':'520px','important');await pause(120);
    const button=long.querySelector('.linux-note-code-toggle');assert(!!button,'长代码有独立按钮 '+zoom+' '+i);button.click();await pause(120);
    assert(other===long||other.classList.contains('is-code-expanded')===other_state,'其他长块展开状态不变 '+zoom+' '+i);
    for(const j of short_indices){
      const f=fences()[j];
      for(let attempt=0;attempt<5;attempt++){f.scrollIntoView({block:'center'});await pause(120);const rect=f.getBoundingClientRect();if(rect.bottom>100&&rect.top<innerHeight-50)break;}
      const cm=f.querySelector('.CodeMirror')?.CodeMirror;assert(!!cm,'原生编辑器存在 '+j);
      assert(f.getBoundingClientRect().bottom>0&&f.getBoundingClientRect().top<innerHeight,'采样位于窗口可见区域 '+j);
      const before=measure(f),cursor=JSON.stringify(cm.getCursor());cm.refresh();await pause(30);const after=measure(f);
      samples.push({zoom,cycle:i,index:j,before,after});
      assert(Math.abs(before.rect-after.rect)<1,'短块无需点击即具有最终高度 '+zoom+' '+i+' '+j+' '+before.rect+'/'+after.rect);
      assert(cursor===JSON.stringify(cm.getCursor()),'测量不移动代码光标 '+zoom+' '+i+' '+j);
    }
   }
  }
  assert(File.editor.getMarkdown()===initial_markdown,'正文保持');assert(fs.readFileSync(file,'utf8')===disk,'磁盘文件保持');
  reqnode('electron').webFrame.setZoomFactor(1);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,source_unchanged:File.editor.getMarkdown()===initial_markdown},null,2),'utf8');
 }catch(e){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,samples,error:String(e.stack)},null,2),'utf8');}
})();
