// 原始宿主、真实SSH与独立临时目录；凭据仅从运行器环境取得。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),buffer=reqnode('buffer').Buffer,base=__CASE_ROOT__,checks=[];
 const env=reqnode('process').env,target=env.TYPORA_TEST_SSH_TARGET,password=env.TYPORA_TEST_SSH_PASSWORD;
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify(checks));};
 const wait=async(fn,label)=>{for(let i=0;i<600;i++){if(fn())return;await pause(30);}throw Error(label);};
 const button=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);
 const assets=path.join(_options.userDataPath,'typora_code/assets/remote'),api=reqnode(path.join(assets,'remote_ssh_service.cjs'));
 const version=JSON.parse(fs.readFileSync(path.join(_options.userDataPath,'typora_code/assets/update/runtime.json'),'utf8')).node_version;
 const service=api.create_remote_ssh({asset_root:assets,node_path:path.join(_options.userDataPath,'linux_note_enhancements/terminal_runtime/node',version,'node.exe'),authenticate:async prompt=>{if(/yes\/no|fingerprint/iu.test(prompt))throw Error('测试要求已信任主机');return password;}});
 let panel,root='';
 try{
  if(!target||!password)throw Error('缺少SSH测试环境');await pause(1000);
  const hello=await service.connect(target);root=hello.home+'/.typora-workspace-native-'+crypto.randomUUID();await service.request('mkdir',{path:root});await service.request('mkdir',{path:root+'/子目录'});
  await service.request('create',{path:root+'/dot.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'});
  const first='# 起点\n\n[下一篇](子目录/目标.md#目标)\n\n这是远程Markdown。\n\n![远程图片](dot.png)\n';
  await service.request('create',{path:root+'/起点.md',data:buffer.from(first.replace(/\n/g,'\r\n')).toString('base64')});
  await service.request('create',{path:root+'/子目录/目标.md',data:buffer.from('# 目标\n\n远端链接目标。\n').toString('base64')});
  core.app.commands.run('typora_code:remote_ssh');await wait(()=>document.querySelector('.workspace-ssh-sidebar'),'SSH面板未出现');panel=document.querySelector('.workspace-ssh-sidebar');panel.querySelector('input').value=target;button(panel,'连接').click();
  await wait(()=>document.querySelector('[role=dialog] input[type=password]'),'认证未出现');const password_input=document.querySelector('[role=dialog] input[type=password]');password_input.value=password;password_input.closest('[role=dialog]').querySelector('input[type=checkbox]').checked=true;button(password_input.closest('[role=dialog]'),'连接').click();
  await wait(()=>files.context_root().includes('remote_cache'),'主工作区未切到远端');
  core.app.commands.run('linux_note:open_folder');await wait(()=>document.querySelector('input[aria-label="远程路径"]'),'远端文件夹选择器未出现');
  const picker=document.querySelector('input[aria-label="远程路径"]');picker.value=root;picker.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  await wait(()=>!button(picker.closest('[role=dialog]'),'打开').disabled&&picker.value===root,'远端目录未列出');button(picker.closest('[role=dialog]'),'打开').click();
  await wait(()=>files.context_root().endsWith(path.basename(root)),'选择未成为主资源树根');assert(true,'文件菜单选择远端文件夹成为主工作区');
  await wait(()=>document.querySelector('.workspace-explorer-tree')?.textContent.includes('起点.md'),'主资源树未显示远端文件');assert(true,'主资源树枚举远端条目');
  let local=path.join(files.context_root(),'起点.md');await files.open_file(local);await wait(()=>File.bundle.filePath===local&&document.querySelector('#write')?.textContent.includes('这是远程Markdown'),'原生Markdown未加载');
  assert(core.app.workspace.activeLeaf.type==='core.markdown'||!core.app.workspace.activeLeaf.state.path.startsWith('typ://'),'远程Markdown使用原生编辑器');
  await wait(()=>document.querySelector('#write img')?.naturalWidth===1,'远程相对图片未物化');assert(true,'远程相对图片由原生Markdown显示');
  await pause(400);
  const original_markdown=File.editor.getMarkdown();
  fs.writeFileSync(path.join(base,'browse_state.json'),JSON.stringify({dirty:File.changeCounter.isDocumentEdited(),saved:File.bundle.savedContent,text:original_markdown,useCRLF:File.useCRLF,finalNewline:File.finalNewline}));
  assert(!files.editor_state(core.app.workspace.activeLeaf).dirty,'CRLF远程Markdown仅打开不标记修改');
  for(let i=0;i<20;i++){
   const text_node=[...document.querySelector('#write').querySelectorAll('p')].find(node=>node.textContent.includes('这是远程Markdown'));
   text_node.dispatchEvent(new MouseEvent('click',{bubbles:true,button:0}));const range=document.createRange();range.selectNodeContents(text_node);range.collapse(i%2===0);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);await pause(20);
   assert(File.editor.getMarkdown()===original_markdown&&!files.editor_state(core.app.workspace.activeLeaf).dirty,'只移动光标不提示保存 '+i);
  }
  for(let i=0;i<20;i++){
   const text=first+'\n实际编辑 '+i+'\n';File.reloadContent(text,{delayRefresh:false,skipChangeCount:false,skipStore:true});await pause(50);
   assert(document.querySelector('#write')?.textContent.includes('实际编辑 '+i),'原生随写随渲染 '+i);
   assert(await files.save_active(),'原生远程保存 '+i);const saved=await service.request('read',{path:root+'/起点.md'});assert(buffer.from(saved.data,'base64').toString().includes('实际编辑 '+i),'独立通道读取真实远端结果 '+i);
  }
  const save_as=files.save_as_active();await wait(()=>document.querySelector('input[aria-label="文件名"]'),'另存为未提供远程选择器');
  const name=document.querySelector('input[aria-label="文件名"]');name.value='另存.md';await wait(()=>!button(name.closest('[role=dialog]'),'保存').disabled,'远程另存为目录未加载');button(name.closest('[role=dialog]'),'保存').click();assert(await save_as,'远程另存为完成');
  await wait(()=>File.bundle.filePath.endsWith('另存.md'),'另存为未更新原生身份');assert(buffer.from((await service.request('read',{path:root+'/另存.md'})).data,'base64').toString().includes('实际编辑 19'),'另存为真实远端文件');
  await files.open_file(local);
  core.app.commands.run('linux_note:search');await wait(()=>document.querySelector('.workspace-search-query-box textarea'),'搜索面板未显示');const query=document.querySelector('.workspace-search-query-box textarea');query.value='远程Markdown';query.dispatchEvent(new Event('input',{bubbles:true}));query.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await wait(()=>document.querySelector('.workspace-search-results')?.textContent.includes('起点.md'),'主搜索未返回远端正文');assert(true,'主搜索面板返回远端正文结果');
  core.app.commands.run('linux_note:git_graph');await wait(()=>core.app.workspace.activeLeaf?.view.panel,'Git界面未打开');const graph=core.app.workspace.activeLeaf,git=graph.view.panel;await wait(()=>!git.pending,'Git检测未完成');
  assert(git.workbench.sidebar.dataset.repositoryState==='empty','远端空目录显示Git初始化入口');await git.initialize();await wait(()=>git.loaded&&!git.pending,'远端Git初始化失败');assert(git.state.root===files.context_root(),'主Git界面使用远端项目身份');
  await git.writer.run(git.root,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','add','--','起点.md']);await git.writer.run(git.root,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);await git.refresh(false);assert(git.state.commits.length===1,'主Git图显示远端真实提交');
  await files.open_file(local);
  const target_path=path.join(files.context_root(),'子目录/目标.md');const link=document.querySelector('#write a[href]');assert(!!link,'原生远端链接DOM存在');link.dispatchEvent(new MouseEvent('click',{ctrlKey:true,bubbles:true,cancelable:true,button:0}));await wait(()=>File.bundle.filePath===target_path&&document.querySelector('#write')?.textContent.includes('远端链接目标'),'跨篇相对链接未打开');assert(true,'中文相对路径跨篇标题导航');
  await pause(700);window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));await wait(()=>File.bundle.filePath===local,'远端链接后退未回原文');assert(true,'远端链接后退回原文');
  await pause(700);window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:1}}));await wait(()=>File.bundle.filePath===target_path,'远端链接前进未回目标');assert(true,'远端链接前进回目标');
  await files.open_file(local);await pause(150);local=await files.rename_file(files.context_root(),local,'改名.md');await wait(()=>File.bundle.filePath===local,'原生改名身份未更新');assert(true,'远程改名同步已打开原生Markdown身份');
  await files.open_file(local);const external=await service.request('read',{path:root+'/改名.md'});await service.request('write',{path:root+'/改名.md',version:external.version,data:buffer.from('external version').toString('base64')});File.reloadContent(first+'本地草稿',{delayRefresh:false,skipChangeCount:false,skipStore:true});await pause(80);
  let conflict=false;try{await files.save_active();}catch{conflict=true;}assert(conflict&&File.changeCounter.isDocumentEdited(),'远端并发写入冲突保留原生草稿');
  button(panel,'断开 / 取消').click();let disconnected=false;try{await files.save_active();}catch{disconnected=true;}assert(disconnected&&File.editor.getMarkdown().includes('本地草稿'),'断线保存不回落本地并保留正文');
  core.app.commands.run('typora_code:remote_ssh');button(panel,'连接').click();await wait(()=>panel.dataset.connection==='connected','保存的系统凭据未用于重连');assert(!document.querySelector('.workspace-ssh-auth-prompt'),'记住密码后重连无需再次输入');assert(File.editor.getMarkdown().includes('本地草稿'),'重连保留原生草稿');
  button(panel,'忘记密码').click();await wait(()=>panel.textContent.includes('已移除此主机保存的密码'),'忘记密码未完成');assert(true,'主动忘记系统密文凭据');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,remote_root:root},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error.stack||error),remote_root:root,root:files.context_root(),native_path:File.bundle?.filePath,images:[...document.querySelectorAll('#write img')].map(node=>({html:node.outerHTML,src:node.src,width:node.naturalWidth})),dialogs:[...document.querySelectorAll('[role=dialog]')].map(node=>node.textContent)},null,2));}
 finally{service.dispose();}
})();
