// 原始Typora的顶栏首页、既有命令和文件查询；仅操作隔离工程。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[],metrics=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<400;i++){if(fn())return;await pause(20);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const button=()=>document.querySelector('.workspace-titlebar-search'),picker=()=>document.querySelector('.workspace-quick-open:not(.workspace-recent-open)');
 const close=()=>{for(const type of ['keydown','keyup'])picker().querySelector('input').dispatchEvent(new KeyboardEvent(type,{key:'Escape',bubbles:true}));};
 const original=fs.promises.readdir;let reads=0;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口就绪');await pause(600);
  const root=files.context_root();assert(root===path.join(base,'workspace'),'隔离工程身份');
  fs.promises.readdir=async function(...args){if(String(args[0]).startsWith(root))reads++;return original.apply(this,args);};
  for(let i=0;i<20;i++){
   const start=performance.now();button().click();await new Promise(requestAnimationFrame);
   const panel=picker();assert(!panel.hidden&&panel.querySelectorAll('.is-command').length===5,'原生顶栏首页 '+i);
   assert(panel.textContent.includes('front.md'),'已打开文档立即可见 '+i);metrics.push({cycle:i,first_frame_ms:performance.now()-start});close();assert(panel.hidden,'Esc关闭首页 '+i);
  }
  assert(reads===0,'20次首页无目录枚举');
  button().click();const panel=picker(),input=panel.querySelector('input');
  const find=name=>[...panel.querySelectorAll('.workspace-quick-open-result')].find(row=>row.textContent.includes(name));
  find('搜索文本').click();await wait(()=>panel.hidden,'搜索入口关闭首页');
  assert(core.app.workspace.sidebar.isShown&&document.querySelector('.linux-note-workspace-search')?.getBoundingClientRect().height>0,'搜索入口打开搜索侧栏');
  button().click();find('转到编辑器大纲').click();await wait(()=>panel.hidden,'大纲入口关闭首页');
  assert(core.app.workspace.sidebar.isShown,'大纲入口调用共同视图命令');
  const file=path.join(root,'center-target.md');fs.writeFileSync(file,'# Command center target\n');await pause(200);
  button().click();const started=performance.now();input.value='center-target';input.dispatchEvent(new Event('input'));
  await wait(()=>find('center-target.md'),'输入后显示文件');metrics.push({query_ms:performance.now()-started,directory_reads:reads});
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(()=>files.current_file()===file,'打开文件');assert(true,'文件命中通过共同文件服务打开');
  await pause(200);button().click();find('front.md').click();await wait(()=>files.current_file()===path.join(root,'front.md'),'原文档激活');assert(true,'最近编辑器激活原文档');
  button().click();input.value='';input.dispatchEvent(new Event('input'));assert(panel.querySelectorAll('.is-command').length===5,'清空回到首页');
  document.querySelector('#write').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));assert(panel.hidden,'正文外点关闭');
  button().click();find('显示和运行命令').click();await wait(()=>panel.hidden&&[...document.querySelectorAll('.typ-command-modal__item')].some(row=>row.getBoundingClientRect().height>0),'命令面板可见');assert(true,'已有命令面板显示真实可执行条目');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,metrics,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'原始宿主DOM事件/帧测量；可信Chromium输入另测，未等同物理用户设备或VS Code同机性能比较。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks,metrics},null,2));}
 finally{fs.promises.readdir=original;}
})();
