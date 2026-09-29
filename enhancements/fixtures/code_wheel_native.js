// Original host, isolated document; do not call CodeMirror.refresh/focus before the first line check.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[],samples=[],inputs=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const source=path.join(base,'workspace/wheel.md'),repro=path.join(base,'workspace/repro.md');
 const text=fs.existsSync(repro)?fs.readFileSync(repro,'utf8'):'# 代码滚轮验收\n\n'+('正文段落。\n\n'.repeat(18))+'```c\nstruct demo_device {\n    int requested_mode;\n};\n'+Array.from({length:29},(_,i)=>'int value_'+i+' = '+i+';').join('\n')+'\n```\n\n'+('后续正文。\n\n'.repeat(40));
 fs.writeFileSync(source,text,'utf8');let on_wheel;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'宿主窗口尺寸回执');
  reqnode('electron').webFrame.setZoomFactor(1);File.option.showLineNumbersForFence=true;
  await JSBridge.invoke('setting.setCurTheme','vscode2026_light.css','vscode2026_light.css');File.setTheme('vscode2026_light.css');
  await files.open_file(source);await wait(()=>document.querySelector('#write .md-fences'),'围栏未创建');
  const fence=document.querySelector('#write .md-fences'),owner=fence.closest('content');fence.scrollIntoView({block:'center'});
  await wait(()=>fence.querySelector('.linux-note-code-toggle'),'按钮未创建');await pause(500);
  const scroller=fence.querySelector('.CodeMirror-scroll'),cm=fence.querySelector('.CodeMirror').CodeMirror,button=fence.querySelector('.linux-note-code-toggle');
  const original=File.editor.getMarkdown(),cursor=JSON.stringify(cm.listSelections());
  const position=async(top)=>{owner.scrollTop+=fence.getBoundingClientRect().top-top;await pause(150);};
  on_wheel=e=>{if(e.isTrusted){const sample={delta:e.deltaY,target:e.target.className,start:performance.now()};inputs.push(sample);requestAnimationFrame(()=>{sample.frame_ms=performance.now()-sample.start;sample.outer=owner.scrollTop;sample.inner=scroller.scrollTop;});}};
  document.addEventListener('wheel',on_wheel,true);let input_id=0;
  const native_wheel=async(delta)=>{
   const id=++input_id,r=scroller.getBoundingClientRect(),count=inputs.length;
   fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'wheel',delta,x:r.left+r.width/2,y:Math.max(owner.getBoundingClientRect().top+100,Math.min(r.top+100,owner.getBoundingClientRect().bottom-100)),width:innerWidth,height:innerHeight}));
   await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/, '')).id===id;}catch{return false;}},'滚轮回执');
   await wait(()=>inputs.length>count,'未收到可信滚轮');await pause(120);
  };
  const measure=label=>{
   const line=fence.querySelector('.CodeMirror-code pre'),range=document.createRange();range.selectNodeContents(line);
   const item={label,scroll_top:scroller.scrollTop,model_top:cm.doc.scrollTop,line:line.getBoundingClientRect().toJSON(),text:range.getBoundingClientRect().toJSON(),scroller:scroller.getBoundingClientRect().toJSON(),font:getComputedStyle(line).font};samples.push(item);return item;
  };
  const complete=label=>{const s=measure(label);assert(s.scroll_top===0&&s.model_top===0&&s.text.top>=s.scroller.top-0.5,'首行无内部偏移/裁剪 '+label);};
  for(let i=0;i<8;i++){scroller.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-120}));await pause(60);}
  for(const theme of ['vscode2026_light.css','vscode2026_dark.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(250);
   for(const zoom of [1,1.25]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(250);
    if(fence.classList.contains('is-code-expanded'))button.click();await pause(120);
    await position(owner.getBoundingClientRect().bottom-100);const outer=owner.scrollTop;
    await native_wheel(-120);assert(owner.scrollTop>outer&&scroller.scrollTop===0,'按钮屏外先滚正文 '+theme+'/'+zoom);
    await position(owner.getBoundingClientRect().top+40);
    for(let i=0;i<40&&scroller.scrollTop+scroller.clientHeight<scroller.scrollHeight-1;i++)await native_wheel(-120);
    assert(scroller.scrollTop>0&&scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-1,'真实滚轮将代码滚到底 '+theme+'/'+zoom);
    owner.scrollTop+=button.getBoundingClientRect().top-owner.getBoundingClientRect().top-50;await pause(150);
    measure('收起底部 '+theme+'/'+zoom);button.click();complete('展开立即 '+theme+'/'+zoom);
    await new Promise(requestAnimationFrame);complete('展开首帧 '+theme+'/'+zoom);await pause(150);
    for(let i=0;i<20&&fence.getBoundingClientRect().top<owner.getBoundingClientRect().top+70;i++)await native_wheel(120);
    complete('滚回顶部 '+theme+'/'+zoom);
    assert(fence.getBoundingClientRect().top>=owner.getBoundingClientRect().top,'首行实际回到阅读区域 '+theme+'/'+zoom);
   }
  }
  for(let i=0;i<20;i++){
   button.click();await pause(40);scroller.scrollTop=scroller.scrollHeight;await pause(40);
   button.click();complete('20轮展开 '+i);await pause(40);
  }
  assert(File.editor.getMarkdown()===original&&fs.readFileSync(source,'utf8')===text,'正文与磁盘保持');
  assert(JSON.stringify(cm.listSelections())===cursor,'选区保持');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'code_expanded'}));await pause(500);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,inputs,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(_options.userDataPath,'typora_code/workbench.js'))).digest('hex')},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,samples,inputs,error:String(error.stack)},null,2));}
 finally{if(on_wheel)document.removeEventListener('wheel',on_wheel,true);}
})();
