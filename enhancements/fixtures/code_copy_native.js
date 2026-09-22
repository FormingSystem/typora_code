// 在独立Typora内读取真实CodeMirror；复制端口记录文本，不改用户系统剪贴板。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(await fn())return;await pause(30);}throw Error('timeout '+label);};
 const assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,original_copy=files.copy;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window');
  const values=['  中文\ttext\nsecond line',Array.from({length:100},(_,i)=>'echo full_line_'+i).join('\n'),'plain code'];
  const source='# Copy\n\n'+values.map((text,i)=>'## Block '+i+'\n\n```'+(i===1?'sh':'')+'\n'+text+'\n```\n\n').join('');
  const file=path.join(base,'workspace/code_copy.md');fs.writeFileSync(file,source,'utf8');await files.open_file(file);await wait(()=>!File.isFileLoading()&&document.querySelectorAll('#write .md-fences').length===3,'fences');
  const fences=()=>[...document.querySelectorAll('#write .md-fences')];
  for(const f of fences()){f.scrollIntoView({block:'center'});await pause(180);}await pause(300);
  const before=File.editor.getMarkdown();let copied='',count=0;files.copy=text=>{copied=text;count++;};
  for(let i=0;i<20;i++){
   const f=fences()[i%3];f.scrollIntoView({block:'center'});await pause(130);
   const cm=f.querySelector('.CodeMirror')?.CodeMirror;assert(!!cm,'原生围栏实例 '+i);
   const rect=f.getBoundingClientRect();const button=[...document.querySelectorAll('.reading-code-copy')].find(b=>!b.hidden&&Math.abs(b.getBoundingClientRect().top-rect.top-4)<2);
   assert(!!button,'当前块复制入口 '+i);const cursor=JSON.stringify(cm.listSelections()),height=rect.height,expanded=f.className;
   button.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));button.click();await pause(20);
   assert(copied===cm.getValue(),'完整当前代码进入剪贴板端口 '+i);assert(button.title==='已复制','成功反馈 '+i);
   const feedback=button.parentElement.querySelector('.reading-copy-feedback');assert(feedback.offsetHeight===24&&getComputedStyle(button).opacity==='1','反馈文字单行且图标可见 '+i);
   assert(cursor===JSON.stringify(cm.listSelections())&&expanded===f.className&&Math.abs(height-f.getBoundingClientRect().height)<1,'光标折叠及高度保持 '+i);
  }
  assert(count===20&&File.editor.getMarkdown()===before,'复制不修改正文');
  const f=fences()[0];f.scrollIntoView({block:'center'});await pause(150);const cm=f.querySelector('.CodeMirror').CodeMirror;cm.setValue('未保存\t修改\n完整内容');await pause(150);
  const rect=f.getBoundingClientRect(),button=[...document.querySelectorAll('.reading-code-copy')].find(b=>!b.hidden&&Math.abs(b.getBoundingClientRect().top-rect.top-4)<2);
  const changed=File.editor.getMarkdown();files.copy=()=>{throw Error('injected clipboard busy');};button.click();assert(button.title==='复制失败，请重试','复制失败明确反馈');files.copy=text=>{copied=text;count++;};button.click();assert(copied===cm.getValue(),'复制未保存内存正文');assert(File.editor.getMarkdown()===changed,'未保存正文保持');assert(fs.readFileSync(file,'utf8')===source,'磁盘文件保持');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,cycles:20,clipboard:'真实读取/复制端口记录，未覆盖系统剪贴板'},null,2),'utf8');
 }catch(e){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(e.stack)},null,2),'utf8');}finally{files.copy=original_copy;}
})();
