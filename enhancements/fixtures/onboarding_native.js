// Exclusive native host startup guide; only view the area, do not operate the real repository or user documents.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(fn,name)=>{for(let i=0;i<600;i++){if(fn())return;await pause(25);}throw Error('timeout '+name);};
 const check=(v,n)=>{if(!v)throw Error(n);checks.push(n);};
 const current=()=>document.querySelector('.workspace-onboarding');
 const button=t=>[...(current()?.querySelectorAll('button')||[])].find(n=>n.textContent===t);
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'bounds');
  await wait(()=>current(),'automatic tour');
  const core=window[Symbol.for('typora-code:workspace')],ws=core.app.workspace;
  const original=File.editor.getMarkdown(),original_path=File.bundle.filePath;
  check(document.documentElement.getAttribute('data-linux-note-typora-enhancements')==='ready','auto only after ready');
  const state=path.join(_options.userDataPath,'typora_code/settings/onboarding_state.json');
  check(fs.existsSync(state),'automatic tour records install');
  for(let i=0;i<10;i++){
   await pause(90);const panel=current().querySelector('.git-graph-dialog'),r=panel.getBoundingClientRect();
   check(r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,'step within native viewport '+i);
   check(current().dataset.step===String(i),'native next step '+i);
   if(i>0)check(!current().querySelector('.workspace-onboarding-highlight').hidden,'native region target '+i);
   if(i<9)button('下一步').click();
  }
  button('完成').click();check(!current(),'complete removes modal');await pause(700);check(!current(),'no automatic repeat');
  check(File.editor.getMarkdown()===original&&File.bundle.filePath===original_path,'tutorial preserves document and path');
  for(let i=0;i<20;i++){core.app.commands.run('typora_code:operation_guide');await pause(15);check(document.querySelectorAll('.workspace-onboarding').length===1,'replay single modal '+i);button('跳过').click();}
  check(!document.querySelector('.workspace-onboarding-highlight'),'no orphan highlight');
  core.app.commands.run('typora_code:operation_guide');await pause(100);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,limitation:'原始宿主自动启动与renderer操作；未覆盖物理输入、Linux/macOS安装和真实跨进程竞争'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack),focused:document.hasFocus(),hidden:document.hidden,ready:document.documentElement.getAttribute('data-linux-note-typora-enhancements'),dialogs:[...document.querySelectorAll('[role="dialog"],.modal.in')].map(n=>n.outerHTML.slice(0,200))},null,2));}
})();
