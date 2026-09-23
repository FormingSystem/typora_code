(async()=>{
 const base=__CASE_ROOT__,fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto');
 const root=path.join(base,'workspace'),checks=[],trace=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,workspace=core.app.workspace;
 const wait=async(fn,label)=>{for(let n=0;n<400;n++){if(await fn())return;await pause(25);}throw Error('timeout '+label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const leaves=()=>{const out=[];workspace.eachLeaves(x=>{out.push(x)});return out;};
 const front=path.join(root,'front.md'),stable=()=>!File.isFileLoading()&&!File._onInitParse&&!File._onFileSwitching;
 const original_change=File.updateChangeCount;
 File.updateChangeCount=function(...args){const result=original_change.apply(this,args);if(File.changeCounter.isDocumentEdited())trace.push({args,path:File.bundle.filePath,stack:new Error().stack,text:File.editor.getMarkdown(),saved:File.bundle.savedContent});return result;};
 const write_session=(target,entries,active)=>{const dir=path.join(_options.userDataPath,'typora_code/state/workspace_sessions');fs.mkdirSync(dir,{recursive:true});const key=path.resolve(target).toLowerCase();fs.writeFileSync(path.join(dir,crypto.createHash('sha256').update(key).digest('hex')+'.json'),JSON.stringify({schema:1,root:key,files:entries,active}));};
 try{
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  await wait(()=>document.documentElement.dataset.linuxNoteTyporaEnhancements==='ready'&&stable(),'ready');await pause(500);
  if(fs.existsSync(path.join(base,'phase_one.json'))){
   await wait(()=>leaves().length>=101,'startup tabs');await pause(1200);
   assert(File.bundle.filePath===front&&workspace.activeLeaf.state.path===front,'第二进程恢复101个标签仍保留首屏文档');
   assert(leaves().filter(x=>x.view.editor).length===0,'启动恢复源码标签不创建Monaco');
   assert([...document.querySelectorAll('.typ-tab')].filter(tab=>tab.dataset.id?.startsWith('typ://')).every(tab=>tab.querySelector('.typ-file-basename')?.textContent===path.basename(tab.title)),'第二进程后台源码标签直接显示真实文件名');
   assert(!File.changeCounter.isDocumentEdited(),'第二进程恢复后原生文档保持未修改');
   assert(!trace.length,'启动恢复未产生正文修改记录');
   fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',phase:2,checks,trace},null,2));window.close();return;
  }
  await JSBridge.invoke('setting.put','restoreWhenLaunch',2);
  const entries=[];
  for(let i=0;i<100;i++){
   const source=i%2===1,p=path.join(root,i===1?'inspect_environment_中文 空格%3A#.py':'restored-'+i+(source?'.ts':'.md'));
   fs.writeFileSync(p,source?'const value = '+i+';\n':'---\ntitle: 页面'+i+'\n---\n\n# 页面'+i+'\n\n正文段落。\n\n```cpp\nint value = '+i+';\n```\n\n|A|B|\n|-|-|\n|甲|乙|\n');entries.push({path:p,source,pinned:false});
  }
  let opens=0;const stop=workspace.on('file:will-open',()=>opens++);
  const before=File.editor.getMarkdown();
  await files.restore_files(entries,new AbortController().signal);await pause(700);
  assert(document.querySelector('.typ-tab.active')?.dataset.id===front,'后台恢复不改变活动标签样式');
  assert(opens===0,'登记100个后台标签不调用原生文件打开');
  assert(File.editor.getMarkdown()===before&&!File.changeCounter.isDocumentEdited(),'后台标签不改变当前正文和脏状态');
  assert(leaves().filter(x=>x.view.editor).length===0,'后台源码标签不创建Monaco');
  const source_tabs=entries.filter(entry=>entry.source).map(entry=>({entry,tab:[...document.querySelectorAll('.typ-tab')].find(tab=>tab.title===entry.path)}));
  assert(source_tabs.every(({entry,tab})=>tab?.querySelector('.typ-file-basename')?.textContent===path.basename(entry.path)),'50个后台源码标签首次展示真实文件名与完整路径提示');
  assert(source_tabs[0].tab?.querySelector('.typ-file-basename')?.textContent==='inspect_environment_中文 空格%3A#.py','文件名中文空格及字面百分号不被二次解码');
  stop();
  for(let i=0;i<20;i++){
   const p=entries[(i*2)%100].path;await files.open_file(p);await wait(()=>stable()&&File.bundle.filePath===p,'open markdown '+i);await pause(120);
   assert(!File.changeCounter.isDocumentEdited(),'浏览切换'+i+'不产生保存提示');
   workspace.activeLeaf.parent.toggleTab(workspace.activeLeaf.state.path);await pause(20);
   assert(!File.changeCounter.isDocumentEdited(),'重复选中'+i+'不产生正文修改');
  }
  for(let i=0;i<20;i++){
   const group=workspace.activeLeaf.parent;
   group.toggleTab(entries[2].path);group.toggleTab(entries[4].path);
   await wait(()=>stable()&&File.bundle.filePath===entries[4].path,'rapid '+i);await pause(120);
   assert(!File.changeCounter.isDocumentEdited(),'连续快速标签切换'+i+'不修改正文');
  }
  await files.open_file(front);await wait(stable,'front');
  const second=path.join(base,'second');fs.mkdirSync(second);const other=path.join(second,'other.md');fs.writeFileSync(other,'# 另一个工作区\n');write_session(second,[{path:other,source:false,pinned:false}],0);
  const invoke=JSBridge.invoke;let release;
  JSBridge.invoke=function(...args){if(args[0]==='setting.getExtraOption')return new Promise(resolve=>{release=()=>Promise.resolve(invoke.apply(this,args)).then(resolve);});return invoke.apply(this,args);};
  const switching=core.app.commands.commandMap['linux_note:open_folder_path'].callback(second);
  await wait(()=>release,'delayed preference');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  release();await switching;JSBridge.invoke=invoke;
  assert(workspace.activeLeaf.state.path.startsWith('typ://core.empty'),'配置迟到后不覆盖用户已操作的空编辑区');
  assert(leaves().some(x=>x.state.path===other),'取消自动激活仍保留历史标签');
  await core.app.commands.commandMap['linux_note:open_folder_path'].callback(root);await wait(stable,'return');
  await files.open_file(front);await wait(stable,'front final');await pause(250);
  assert(!File.changeCounter.isDocumentEdited(),'恢复和切换全过程保持原生正文未修改');
  // 确認真实草稿仍由共同切换保护；只在专属文档中造草稿。
  File.reloadContent(File.editor.getMarkdown()+'\n真实草稿\n',{delayRefresh:false,skipChangeCount:false,skipStore:true});
  if(!File.changeCounter.isDocumentEdited())File.updateChangeCount(File.ChangeType.NSChangeDone);
  const guarded=core.app.commands.commandMap['linux_note:open_folder_path'].callback(second);
  await wait(()=>document.querySelector('[data-workspace-switch]'),'dirty guard');document.querySelector('[data-workspace-switch] .git-graph-dialog-footer').lastElementChild.click();await guarded;
  assert(File.getMountFolder()===root&&File.changeCounter.isDocumentEdited()&&File.editor.getMarkdown().includes('真实草稿'),'真实编辑取消切换仍保留正文');
  await File.reloadFromDisk(true);await wait(()=>stable()&&!File.changeCounter.isDocumentEdited(),'fixture cleanup');
  window.dispatchEvent(new Event('beforeunload'));
  fs.writeFileSync(path.join(base,'phase_one.json'),JSON.stringify({checks,trace},null,2));
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',phase:1,checks,trace},null,2));window.close();
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack),trace,file:File.bundle.filePath,dirty:File.changeCounter.isDocumentEdited()},null,2));}
})();
