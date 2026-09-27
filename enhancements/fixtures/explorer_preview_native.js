// 原始宿主隔离文档；真实文件服务及树事件，不触碰用户文件。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[],counts=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(fn,label)=>{for(let i=0;i<400;i++){if(await fn())return;await pause(25);}throw Error('timeout '+label);};
 const assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify(checks));};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'bounds');
  const core=window[Symbol.for('typora-code:workspace')],ws=core.app.workspace,files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  const leaves=()=>{const result=[];ws.eachLeaves(leaf=>{result.push(leaf);});return result;};
  const active=()=>ws.activeLeaf,stable=()=>!File.isFileLoading()&&!File._onFileSwitching;
  const paths=Array.from({length:25},(_,i)=>path.join(root,'preview_'+String(i).padStart(2,'0')+'.md'));
  paths.forEach((p,i)=>fs.writeFileSync(p,'# 预览 '+i+'\n\n正文编号 '+i+'。\n'));
  const opened=async(p,preview=true)=>{await files.open_file(p,{preview});await wait(()=>File.bundle.filePath===p&&stable(),'open '+p);};
  const start=leaves().length;
  for(let i=0;i<20;i++){
   const previous=active();await opened(paths[i]);
   assert(active().state.workspace_preview===true&&document.querySelector('#write').textContent.includes('正文编号 '+i),'原生即时显示 '+i);
   if(i)assert(!leaves().includes(previous)&&!previous.view._loaded,'旧Markdown视图释放 '+i);
   counts.push(leaves().length);
  }
  assert(counts.every(n=>n===start+1),'20轮只增加一个预览标签');
  assert(getComputedStyle(active().parent.tabHeader.getTabById(active().state.path).querySelector('.typ-file-basename')).fontStyle==='italic','预览文件名斜体');
  core.app.commands.run('linux_note:file_explorer');
  document.querySelector('[aria-label="刷新资源管理器"]')?.click();await pause(500);
  await core.app.commands.run('linux_note:reveal_in_explorer',[paths[19],root]);
  const row=await (async()=>{await wait(()=>[...document.querySelectorAll('.workspace-explorer-row')].some(n=>n.dataset.path===paths[19]),'row');return [...document.querySelectorAll('.workspace-explorer-row')].find(n=>n.dataset.path===paths[19]);})();
  row.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,altKey:true,detail:1}));
  await wait(()=>!active().state.workspace_preview,'Alt promotes');const resident=active();
  assert(getComputedStyle(resident.parent.tabHeader.getTabById(resident.state.path).querySelector('.typ-file-basename')).fontStyle!=='italic','常驻文件名恢复普通字形');
  await opened(paths[20]);assert(leaves().includes(resident)&&!resident.state.workspace_preview,'Alt左键常驻不被替换');
  const editable=active(),write=document.querySelector('#write'),p=write.querySelector('p'),range=document.createRange();range.selectNodeContents(p);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);write.focus();
  File.editor.stylize.toggleStyle('strong');
  assert(!!write.querySelector('strong'),'原生格式命令确实编辑正文');
  await wait(()=>!editable.state.workspace_preview,'native edit promotion');
  assert(leaves().includes(editable),'无input格式命令自动常驻');
  assert(await files.save_leaf(editable),'通过原生保存保留修改');
  await opened(paths[21]);assert(leaves().includes(editable)&&!editable.state.workspace_preview,'编辑保存后仍常驻');
  const current=active();try{await files.open_file(path.join(root,'missing.md'),{preview:true});}catch{}
  assert(active()===current&&leaves().includes(current),'打开失败保留原预览');
  await opened(paths[19]);assert(active()===resident&&!resident.state.workspace_preview,'常驻重选不降级');
  const before_burst=leaves().length;await Promise.allSettled(paths.slice(22).map(p=>files.open_file(p,{preview:true})));await pause(300);
  assert(leaves().length===before_burst&&leaves().filter(l=>l.state.workspace_preview).length===1,'快速点击只保留最终预览');
  const split=await files.duplicate_leaf(resident,core.split_workspace_group(resident,'right'));await opened(paths[0]);
  assert(leaves().includes(resident)&&leaves().includes(split)&&resident.parent!==split.parent,'分屏及来源文档保留');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,counts,limitation:'原生renderer合成点击/格式命令；未测物理鼠标，固定轮次视图释放不等同长期堆分析'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,counts,rows:[...document.querySelectorAll('.workspace-explorer-row')].map(n=>n.dataset.path),root:document.querySelector('.workspace-explorer-root')?.textContent,error:String(error.stack)},null,2));}
})();
