// Original host's file mode switch; files and windows are both held by the isolated runner.
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
  await query('*.c');await wait(()=>names().includes('.codecov.yml'),'默认上游模糊结果');
  assert(regex.getAttribute('aria-pressed')==='false'&&glob.getAttribute('aria-pressed')==='false'&&!panel.textContent.includes('正则表达式无效'),'默认双按钮关闭并采用上游模糊');
  regex.click();await wait(()=>panel.textContent.includes('正则表达式无效'),'手动正则错误');assert(true,'正则仅由手动开启');
  regex.click();await wait(()=>names().includes('.codecov.yml'),'关闭正则恢复模糊');assert(true,'关闭模式恢复上游模糊');
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
  const color=node=>{const value=getComputedStyle(node);return {bg:value.backgroundColor,fg:value.color,border:value.borderTopColor};},samples=[];
  const close=()=>{for(const type of ['keydown','keyup'])document.activeElement.dispatchEvent(new KeyboardEvent(type,{key:'Escape',bubbles:true}));};
  for(const mode of ['light','dark']){
   const theme='vscode2026_'+mode+'.css';await JSBridge.invoke('setting.setCurTheme',theme,'VSCode2026_'+mode);File.setTheme(theme);await pause(700);
   await wait(()=>document.documentElement.dataset.workspaceColors===mode,'主题切换');
   document.querySelector('.workspace-titlebar-search').click();await pause(150);
   const before=document.querySelector('#write').innerHTML;
   const expected={bg:mode==='dark'?'rgb(32, 33, 34)':'rgb(250, 250, 253)',input:mode==='dark'?'rgb(25, 26, 27)':'rgb(255, 255, 255)',border:mode==='dark'?'rgb(42, 43, 44)':'rgb(226, 226, 229)',focus:mode==='dark'?'rgba(57, 148, 188, 0.7)':'rgb(0, 105, 204)'};
   const inspect=(target,entry)=>{const row=target.querySelector('.workspace-quick-open-input-row');samples.push({mode,entry,panel:color(target),input:color(row)});assert(!target.hidden&&color(target).bg===expected.bg&&color(target).border===expected.border,'浮层颜色 '+mode+' '+entry);assert(color(row).bg===expected.input&&color(row).border===expected.focus,'输入/焦点颜色 '+mode+' '+entry);const box=row.getBoundingClientRect();assert(target.contains(document.elementFromPoint(box.left+10,box.top+10)),'实际命中 '+entry);};
   inspect(panel,'顶栏首页');await query('*.c');await pause(160);inspect(panel,'文件查询');assert(glob.getAttribute('aria-pressed')==='true','主题切换保留搜索模式');
   close();core.app.commands.run('linux_note:open_recent');await pause(250);
   const recent=document.querySelector('.workspace-recent-open');inspect(recent,'打开最近');close();
   assert(document.querySelector('#write').innerHTML===before,'浮层操作保留正文 '+mode);
   document.querySelector('.workspace-titlebar-search').click();await pause(100);fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'quick_input_'+mode}));await pause(400);close();
  }
  fs.writeFileSync(path.join(base,'color_samples.json'),JSON.stringify(samples,null,2));
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex'),css_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workspace.css'))).digest('hex'),limits:'隔离原始Typora DOM事件，未代表物理键鼠或其他平台。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks},null,2));}
})();
