// 原始宿主的文件模式切换；文件与窗口均由隔离运行器持有。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<400;i++){if(fn())return;await pause(20);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口就绪');await pause(600);
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,root=files.context_root();
  assert(root===path.join(base,'workspace'),'隔离工程');
  for(const file of ['main.c','src/next.c','other.cpp','.codecov.yml','folder.c/note.md','src/file1.h','arr[0].md']){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'fixture '+file);}
  document.querySelector('.workspace-titlebar-search').click();
  const panel=document.querySelector('.workspace-quick-open:not(.workspace-recent-open)'),input=panel.querySelector('input'),regex=panel.querySelector('[aria-label="使用正则表达式"]'),glob=panel.querySelector('[aria-label="使用通配符"]');
  assert(regex.hidden&&glob.hidden,'功能首页隐藏模式按钮');
  const query=async text=>{input.value=text;input.dispatchEvent(new Event('input'));await wait(()=>!panel.querySelector('.workspace-quick-open-status').textContent.includes('正在'),'匹配完成');};
  const names=()=>[...panel.querySelectorAll('.workspace-quick-open-name')].map(item=>item.textContent).sort().join(',');
  await query('*.c');assert(regex.getAttribute('aria-pressed')==='true'&&panel.textContent.includes('正则表达式无效'),'默认仍为严格正则');
  glob.click();await wait(()=>names()==='main.c,next.c','通配符匹配C文件');assert(true,'排除cpp、点文件与.c目录内文件');
  assert(regex.getAttribute('aria-pressed')==='false'&&glob.getAttribute('aria-pressed')==='true'&&document.activeElement===input,'模式互斥与焦点');
  await query('**/*.{c,h}');assert(names()==='file1.h,main.c,next.c','递归与后缀备选');
  await query('./*.c');assert(names()==='main.c','根路径锚定');
  await query('**/file?.h');assert(names()==='file1.h','单字符通配符');
  await query('**\\[n]ext.c');assert(names()==='next.c','Windows路径分隔与字符类');
  await query('arr[0].md');assert(names()==='arr[0].md','真实特殊文件名优先');
  for(let i=0;i<20;i++){
   regex.click();await query('[.]c$');assert(names()==='main.c,next.c','正则模式 '+i);
   glob.click();await query('*.c');assert(names()==='main.c,next.c','通配符模式 '+i);
  }
  await query('[');assert(panel.textContent.includes('括号不匹配'),'无效模式保留错误');await query('src/next.c');assert(names()==='next.c','错误后恢复');
  for(const type of ['keydown','keyup'])input.dispatchEvent(new KeyboardEvent(type,{key:'Escape',bubbles:true}));assert(panel.hidden,'Esc关闭');
  document.querySelector('.workspace-titlebar-search').click();await query('*.c');assert(glob.getAttribute('aria-pressed')==='true'&&names()==='main.c,next.c','重开保留当前模式');
  await query('src/next.c');input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(()=>files.current_file()===path.join(root,'src/next.c'),'打开C文件');assert(true,'共同文件服务打开目标');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'隔离原始Typora DOM事件，未代表物理键鼠或其他平台。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks},null,2));}
})();
