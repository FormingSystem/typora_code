(async()=>{
 const base=__CASE_ROOT__,fs=reqnode('fs'),path=reqnode('path'),cp=reqnode('child_process');
 const root=path.join(base,'workspace'),second=path.join(base,'second'),checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(await fn())return;await pause(40);}throw Error('timeout '+label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify(checks,null,2),'utf8');};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const leaves=()=>{const result=[];core.app.workspace.eachLeaves(leaf=>{result.push(leaf);});return result.reverse();};
 const trace=[];for(const event of ["file:open","file:will-open","active-leaf:change","layout-changed"])core.app.workspace.on(event,value=>{trace.push({event,value:typeof value==="string"?value:value?.state?.path,root:File.getMountFolder(),time:Date.now()});});
 const opened=()=>leaves().map(leaf=>files.editor_state(leaf).file_path).filter(Boolean);
 const current=()=>files.editor_state(core.app.workspace.activeLeaf).file_path;
 const stable=()=>!File.isFileLoading()&&!leaves().some(leaf=>files.editor_state(leaf).busy);
 const switch_to=async(target)=>{await core.app.commands.commandMap['linux_note:open_folder_path'].callback(target);await wait(()=>File.getMountFolder()===target&&stable(),'switch '+target);await pause(120);};
 const source=path.join(root,'source.ts'),markdown=path.join(root,'front.md');
 try{
  reqnode(path.join(window._options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  await wait(()=>document.documentElement.dataset.linuxNoteTyporaEnhancements==='ready'&&stable(),'initial');await pause(600);
  if(fs.existsSync(path.join(base,'session_phase_one.json'))){
   await wait(()=>opened().includes(source),'new process restore source');
   assert(opened().includes(markdown)&&opened().includes(source),'新宿主进程从磁盘恢复同一目录的Markdown与源码');
   assert(current()===markdown,'启动时宿主明确打开文件保持活动，不被历史活动源码抢占');
   assert(String(JSON.parse(await JSBridge.invoke("setting.getExtraOption")).restoreWhenLaunch)==='2','第二进程沿用原生持久化恢复配置');
   fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',requirement:'R040.2',phase:2,checks,input:'原始Typora隔离副本第二进程'},null,2),'utf8');window.close();return;
  }
  await JSBridge.invoke('setting.put','restoreWhenLaunch',2);
  const options=JSON.parse(await JSBridge.invoke('setting.getExtraOption'));assert(String(options.restoreWhenLaunch)==='2','原生偏好页配置接口实际读到恢复文件和目录');
  fs.mkdirSync(second);fs.writeFileSync(path.join(second,'target.ts'),'const target = 2;\n','utf8');fs.writeFileSync(source,'const source = 1;\n','utf8');
  const git=args=>cp.execFileSync('git',['-C',second,...args],{windowsHide:true,stdio:'pipe'});
  git(['init','-b','target-branch']);git(['add','.']);git(['-c','user.name=Native QA','-c','user.email=native@example.invalid','commit','-m','native fixture']);
  await files.open_file(source);await wait(stable,'source');await files.open_file(markdown);await wait(stable,'markdown');
  await switch_to(second);assert(opened().length===0,'无历史目录保持空编辑区');
  await files.open_file(path.join(second,'target.ts'));await wait(stable,'target');
  await switch_to(root);assert(opened().join('|')===[markdown,source].join('|')&&current()===markdown,'返回A恢复文件顺序及活动Markdown');
  core.app.commands.run('linux_note:source_control');await wait(()=>document.querySelector('.git-status-branch')?.textContent.includes('main'),'Git A');
  File.reloadContent(File.editor.getMarkdown()+'\n会话恢复保护草稿\n',{delayRefresh:false,skipChangeCount:false,skipStore:true});
  if(!File.changeCounter.isDocumentEdited())File.updateChangeCount(File.ChangeType.NSChangeDone);
  const canceled=core.app.commands.commandMap['linux_note:open_folder_path'].callback(second);
  await wait(()=>document.querySelector('[data-workspace-switch]'),'same group dirty guard');
  document.querySelector('[data-workspace-switch] .git-graph-dialog-footer').lastElementChild.click();await canceled;
  assert(File.getMountFolder()===root&&File.changeCounter.isDocumentEdited()&&File.editor.getMarkdown().includes('会话恢复保护草稿'),'同组非末尾Markdown草稿参与切换检查，取消保留内存');
  await File.reloadFromDisk(true);await wait(()=>stable()&&!File.changeCounter.isDocumentEdited(),'discard fixture-only draft');
  for(let i=0;i<20;i++){
   await switch_to(i%2?root:second);
   assert(opened().every(file=>file.startsWith(i%2?root:second)),'循环'+i+'恢复仅所属工作区文件');
  }
  assert(current()===markdown,'20次往返后活动文件仍一致');
  await files.open_file(source);await wait(stable,'final source');
  window.dispatchEvent(new Event('beforeunload'));
  const bucket=path.join(window._options.userDataPath,'typora_code/state/workspace_sessions');
  assert(fs.readdirSync(bucket).filter(name=>name.endsWith('.json')).length===2,'两个工作区分别写入独立磁盘记录');
  assert(fs.readFileSync(markdown,'utf8').includes('原文必须保持'),'恢复全过程未改写Markdown原文');
  fs.writeFileSync(path.join(base,'session_phase_one.json'),JSON.stringify({checks},null,2),'utf8');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',requirement:'R040.2',phase:1,checks,input:'原始Typora隔离副本，renderer事件/宿主API'},null,2),'utf8');
  window.close();
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack),root:File.getMountFolder(),opened:opened(),trace},null,2),'utf8');}
})();
