// 仅在专属原始宿主副本运行，所有写入限定于夹具工作区。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),cp=reqnode('child_process'),base=__CASE_ROOT__;
 const root=path.join(base,'workspace'),second=path.join(base,'second'),plain=fs.mkdtempSync(path.join(reqnode('os').tmpdir(),'typora_workspace_plain_')),checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(await fn())return;await pause(40);}throw Error('timeout '+label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify(checks,null,2),'utf8');};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const leaves=()=>{const result=[];core.app.workspace.eachLeaves(leaf=>{result.push(leaf);});return result;};
 const active=()=>core.app.workspace.activeLeaf;
 const open_root=target=>core.app.commands.run('linux_note:open_folder_path',[target]);
 const branch=()=>document.querySelector('.git-status-branch')?.textContent||'';
 try{
  reqnode(path.join(window._options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  await wait(()=>File.bundle.filePath.endsWith('front.md')&&!File.isFileLoading(),'initial Markdown');await pause(500);
  const original=fs.readFileSync(path.join(root,'front.md'),'utf8');
  fs.mkdirSync(second);fs.writeFileSync(path.join(second,'target.ts'),'const target = 2;\n','utf8');fs.writeFileSync(path.join(plain,'plain.txt'),'plain','utf8');
  const git=args=>cp.execFileSync('git',['-C',second,...args],{windowsHide:true,stdio:'pipe'});
  git(['init','-b','target-branch']);git(['add','.']);git(['-c','user.name=Native QA','-c','user.email=native@example.invalid','commit','-m','native fixture']);
  fs.writeFileSync(path.join(root,'split.ts'),'const split = 1;\n','utf8');await files.open_file(path.join(root,'split.ts'),{},'right');await wait(()=>active().view?.loaded,'split source');const previous=leaves();core.app.commands.run('linux_note:source_control');await wait(()=>branch().includes('main'),'initial Git');
  open_root(second);await wait(()=>File.getMountFolder()===second,'second root');await wait(()=>branch().includes('target-branch'),'second Git');
  assert(previous.every(leaf=>!leaves().includes(leaf)),'原生Markdown和旧标签在切换后移除');
  assert(leaves().every(leaf=>leaf.state.path.startsWith('typ://core.empty')),'新工作区空编辑区不暴露旧正文');
  core.app.commands.run('linux_note:file_explorer');await wait(()=>document.querySelector('.workspace-explorer-row[data-path$="target.ts"]'),'second tree');
  assert(!document.querySelector('.workspace-explorer-row[data-path$="front.md"]'),'文件树仅显示新工作区');
  await files.open_file(path.join(second,'target.ts'));await wait(()=>active().view?.loaded,'new source');const dirty=active();dirty.view.editor.models[0].setValue('const target = 3;\n');
  open_root(root);await wait(()=>document.querySelector('[data-workspace-switch]'),'dirty confirmation');
  document.querySelector('[data-workspace-switch] .git-graph-dialog-footer').lastElementChild.click();await pause(80);
  assert(File.getMountFolder()===second&&leaves().includes(dirty)&&files.editor_state(dirty).dirty,'取消切换保留原目录和源码草稿');
  open_root(root);await wait(()=>document.querySelector('[data-workspace-switch]'),'save confirmation');
  [...document.querySelector('[data-workspace-switch]').querySelectorAll('button')].find(button=>button.textContent==='全部保存并切换').click();
  await wait(()=>File.getMountFolder()===root,'saved switch');await wait(()=>branch().includes('main'),'restored Git');
  assert(fs.readFileSync(path.join(second,'target.ts'),'utf8')==='const target = 3;\n','保存仅写原目录目标文件');
  await files.open_file(path.join(root,'front.md'));await wait(()=>File.bundle.filePath===path.join(root,'front.md')&&!File.isFileLoading(),'reopen Markdown');
  assert(File.editor.getMarkdown().includes('原文必须保持'),'切回后可重新打开原生Markdown');
  File.reloadContent(original+'\n原生未保存草稿\n',{delayRefresh:false,skipChangeCount:false,skipStore:true});
  if(!File.changeCounter.isDocumentEdited())File.updateChangeCount(File.ChangeType.NSChangeDone);
  assert(File.changeCounter.isDocumentEdited(),'原始Markdown草稿进入dirty状态');
  open_root(second);await wait(()=>document.querySelector('[data-workspace-switch]'),'native dirty confirmation');
  document.querySelector('[data-workspace-switch] .git-graph-dialog-footer').lastElementChild.click();await pause(80);
  assert(File.getMountFolder()===root&&File.editor.getMarkdown().includes('原生未保存草稿')&&File.changeCounter.isDocumentEdited(),'取消保留原生Markdown内存草稿');
  open_root(second);await wait(()=>document.querySelector('[data-workspace-switch]'),'native save confirmation');
  [...document.querySelector('[data-workspace-switch]').querySelectorAll('button')].find(button=>button.textContent==='全部保存并切换').click();
  await wait(()=>File.getMountFolder()===second,'native saved switch');
  assert(fs.readFileSync(path.join(root,'front.md'),'utf8').includes('原生未保存草稿'),'原生Markdown按原路径保存后切换');
  open_root(root);await wait(()=>File.getMountFolder()===root,'return for native recent');
  await File.editor.library.onRootChanged(second);await wait(()=>File.getMountFolder()===second,'native recent');await wait(()=>branch().includes('target-branch'),'native recent Git');
  assert(!leaves().some(leaf=>leaf.state.path.endsWith('front.md')),'宿主最近目录入口采用同一隔离流程');
  open_root(plain);await wait(()=>File.getMountFolder()===plain,'plain root');await wait(()=>document.querySelector('.linux-note-git-status')?.dataset.repository==='none','plain Git');
  assert(!branch().includes('main')&&!branch().includes('target-branch'),'非Git目录不继承旧分支');
  for(let i=0;i<20;i++){const target=i%2?root:second;open_root(target);await wait(()=>File.getMountFolder()===target,'stress '+i);await pause(35);}
  assert(leaves().every(leaf=>leaf.state.path.startsWith('typ://core.empty')),'20次真实宿主切换不残留旧文件标签');
  assert(fs.readFileSync(path.join(root,'front.md'),'utf8').includes('原文必须保持')&&fs.readFileSync(path.join(root,'front.md'),'utf8').includes('原生未保存草稿'),'原Markdown只包含明确保存的草稿且原文保留');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',requirement:'R040.1',checks,input:'原始Typora 1.14.10，renderer事件及宿主API，非物理输入'},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error.stack),root:File.getMountFolder(),leaves:leaves().map(leaf=>leaf.state.path)},null,2),'utf8');}
})();
