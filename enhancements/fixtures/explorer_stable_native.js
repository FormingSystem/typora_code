// R028.2: adjacent file activation must preserve the production Explorer viewport.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[],input_events=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<500;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 let input_id=0;
 const click=async node=>{const r=node.getBoundingClientRect(),id=++input_id;assert(r.width>0&&r.height>0,'visible target');fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'click',width:innerWidth,height:innerHeight,x:r.left+Math.min(r.width/2,120),y:r.top+r.height/2}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id;}catch{return false}},'click delivered');};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  document.addEventListener('click',event=>input_events.push({trusted:event.isTrusted,ctrl:event.ctrlKey,shift:event.shiftKey,alt:event.altKey,path:event.target.closest?.('[data-path]')?.dataset.path,x:event.clientX,y:event.clientY}),true);
  ClientCommand.setTheme('vscode_default_dark.css','vscode_default_dark.css');await wait(()=>document.documentElement.dataset.workspaceColors==='dark','dark theme applied');
  const directory=path.join(base,'workspace'),content=index=>'# File '+index+'\n\nOriginal content '+index+'\n';
  for(let index=0;index<100;index++)fs.writeFileSync(path.join(directory,'entry_'+String(index).padStart(3,'0')+'.md'),content(index),'utf8');
  await files.open_file(path.join(directory,'entry_050.md'));await pause(500);
  if(!core.app.workspace.sidebar.isShown||core.app.workspace.sidebar.activePanel?.ribbonButton?.id!=='linux_note:file_explorer')await click(document.querySelector('[data-id="core.file-explorer"]'));
  const tree=()=>document.querySelector('.workspace-explorer-tree');await wait(()=>tree()?.getBoundingClientRect().height>0,'Explorer visible');
  document.querySelector('.workspace-explorer-root [data-git-icon="refresh"]').closest('button').click();await pause(600);
  const opened_toggle=document.querySelector('.workspace-explorer-opened .workspace-explorer-section-title');if(opened_toggle?.getAttribute('aria-expanded')==='true')opened_toggle.click();await pause(250);
  const find=index=>[...tree().querySelectorAll('.workspace-explorer-row')].find(row=>row.dataset.path.endsWith('entry_'+index+'.md'));
  tree().scrollTop=26*42;await wait(()=>find('050')&&find('051'),'adjacent rows');await pause(200);
  const rows=[find('050'),find('051')],top=tree().scrollTop,tops=rows.map(row=>row.getBoundingClientRect().top),frames=[];
  let running=true,input_time=0,next_frame=0,trusted=0;
  const on_pointer=event=>{if(event.isTrusted&&rows.some(row=>row.contains(event.target))){input_time=performance.now();trusted++;requestAnimationFrame(()=>{next_frame=performance.now()-input_time;});}};
  tree().addEventListener('pointerdown',on_pointer,true);
  const sample=()=>{frames.push({time:performance.now(),scroll:tree().scrollTop,tops:rows.map(row=>row.getBoundingClientRect().top),same:rows.every(row=>row.isConnected)});if(running)requestAnimationFrame(sample);};sample();
  for(let index=0;index<20;index++){
   const side=index%2?0:1,target=rows[side].dataset.path;input_time=0;next_frame=0;
   await click(rows[side]);await wait(()=>files.current_file()===target&&File.bundle.filePath===target&&!File.isFileLoading(),'opened target');
   const opened_ms=input_time?performance.now()-input_time:null;await pause(350);
   assert(File.editor.getMarkdown().trim()===content(side===0?50:51).trim(),'native document content '+index);
   samples.push({index,target:path.basename(target),opened_ms,next_frame_ms:next_frame,scroll:tree().scrollTop});
   assert(tree().scrollTop===top&&rows.every((row,i)=>row.isConnected&&row.getBoundingClientRect().top===tops[i]),'adjacent geometry stable '+index+' '+JSON.stringify({top,now:tree().scrollTop,tops,after:rows.map(row=>({top:row.getBoundingClientRect().top,same:row.isConnected}))}));
   assert(tree().querySelector('[aria-selected="true"]')?.dataset.path===target,'selected target '+index);
  }
  running=false;tree().removeEventListener('pointerdown',on_pointer,true);
  assert(trusted===20,'20 trusted adjacent clicks');assert(frames.every(frame=>frame.scroll===top&&frame.same&&frame.tops.every((value,i)=>value===tops[i])),'all sampled frames stable');
  await click(document.querySelector('.workspace-explorer-toolbar [data-git-icon="target"]').closest('button'));await pause(200);assert(tree().scrollTop!==top,'manual locate centers current file');
  await files.open_file(path.join(directory,'entry_095.md'));await wait(()=>find('095'),'offscreen current file revealed');
  const box=find('095').getBoundingClientRect(),viewport=tree().getBoundingClientRect();assert(box.top>=viewport.top&&box.bottom<=viewport.bottom,'offscreen automatic target fully visible');
  for(let i=0;i<100;i++)assert(fs.readFileSync(path.join(directory,'entry_'+String(i).padStart(3,'0')+'.md'),'utf8')===content(i),'file unchanged '+i);
  const parent=path.join(directory,'sticky_parent'),child=path.join(parent,'child');
  fs.mkdirSync(child,{recursive:true});fs.writeFileSync(path.join(parent,'other.md'),'# Other\n');
  for(let i=0;i<1000;i++)fs.writeFileSync(path.join(child,`nested_${String(i).padStart(4,'0')}.md`),'# Nested '+i+'\n');
  const pinned=()=>[...tree().querySelectorAll('.workspace-explorer-sticky .workspace-explorer-row')];
  const nested_file=path.join(child,'nested_0500.md');
  for(let i=0;i<20;i++){
   await files.open_file(nested_file);await pause(120);
   await click(document.querySelector('.workspace-explorer-toolbar [data-git-icon="target"]').closest('button'));
   await wait(()=>pinned().some(row=>row.dataset.path===child),'nested ancestor pinned');
   const rows=pinned(),bounds=tree().getBoundingClientRect();
   assert(rows.length===2,'two original ancestors '+i);
   assert(rows.every(row=>row.getBoundingClientRect().top>=bounds.top&&row.getBoundingClientRect().bottom<=bounds.top+bounds.height*.4),'sticky geometry '+i);
   assert(tree().querySelectorAll('.workspace-explorer-row').length<70,'bounded 1000-file DOM '+i);
   if(i===0){fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'explorer_sticky'}));await pause(500);}
   const target=rows.find(row=>row.dataset.path===child);
   await click(target);await wait(()=>target.getAttribute('aria-expanded')==='false','native sticky collapse');
   assert(target.isConnected&&target.getBoundingClientRect().top>=bounds.top,'collapsed folder stays visible '+i);
   assert(File.editor.getMarkdown().trim()==='# Nested 500','collapse preserves editor '+i);
  }
  assert(input_events.filter(event=>event.trusted&&event.path===child).length===20,'20 trusted sticky collapse clicks');
  // R041: production file service, actual main-process recycling and trusted confirmation.
  await files.open_file(path.join(directory,'front.md'));await pause(300);
  const native_key=async key=>{const id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'key',key,width:innerWidth,height:innerHeight,x:20,y:100}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id;}catch{return false}},'key delivered');};
  const task_states=[],stop_tasks=files.file_operations.subscribe(state=>task_states.push({id:state.id,phase:state.phase,busy:state.busy,label:state.label,error:state.error}));
  const original_invoke=JSBridge.invoke,trash_calls=[];
  let delayed_target='',release_native,refused_target='';
  JSBridge.invoke=async function(command,target,...args){
   if(command==='shell.trashItem'){
    trash_calls.push(target);
    if(target===refused_target)return false;
    if(target===delayed_target)await new Promise(resolve=>release_native=resolve);
   }
   return original_invoke.call(this,command,target,...args);
  };
  const select_delete=async target=>{
   document.querySelector('.workspace-explorer-root [data-git-icon="refresh"]').closest('button').click();tree().scrollTop=0;
   await wait(()=>[...tree().querySelectorAll('.workspace-explorer-row')].some(row=>row.dataset.path===target),'delete target visible');
   await click([...tree().querySelectorAll('.workspace-explorer-row')].find(row=>row.dataset.path===target));tree().focus();await native_key(46);
   await wait(()=>document.querySelector('[role=dialog] .git-graph-dialog-footer button:last-child'),'delete dialog visible');
  };
  const accept_delete=()=>click(document.querySelector('[role=dialog] .git-graph-dialog-footer button:last-child'));
  try{
   for(const count of [20,100,1000]){
    const target=path.join(directory,'build_recycle_'+String(count).padStart(4,'0'));fs.mkdirSync(target);
    for(let index=0;index<count;index++)fs.writeFileSync(path.join(target,'object_'+index+'.o'),'temporary build object '+index);
    const nested=path.join(target,'目录 space','nested_a','nested_b','nested_c');fs.mkdirSync(nested,{recursive:true});fs.writeFileSync(path.join(nested,'中文 name.o'),'nested object');
    await select_delete(target);
    if(count===20){await click(document.querySelector('[role=dialog] .git-graph-dialog-footer button:first-child'));assert(fs.existsSync(target)&&!trash_calls.includes(target),'cancel leaves build directory untouched');await select_delete(target);}
    const before=files.file_operations.state.id;await accept_delete();await wait(()=>files.file_operations.state.id>before&&!files.file_operations.state.busy,'native recycle completed');
    assert(files.file_operations.state.phase==='succeeded'&&!fs.existsSync(target),'real build directory recycled '+count);
    assert(trash_calls.filter(item=>item===target).length===1,'one native call '+count);
    await wait(()=>![...tree().querySelectorAll('.workspace-explorer-row')].some(row=>row.dataset.path===target),'deleted row rendered '+count);
    assert(![...tree().querySelectorAll('.workspace-explorer-row')].some(row=>row.dataset.path===target),'deleted row refreshed '+count);
   }
   const slow=path.join(directory,'build_waiting');fs.mkdirSync(slow);fs.writeFileSync(path.join(slow,'keep.txt'),'waiting bytes');delayed_target=slow;
   await select_delete(slow);await accept_delete();await wait(()=>!!release_native,'native call captured');
   await wait(()=>files.file_operations.state.phase==='waiting','pending outcome is visible');
   assert(document.querySelector('.workspace-progress')?.hidden===false,'pending native progress visible');
   assert(document.querySelector('.workspace-explorer-status')?.textContent.includes('结果尚未确定'),'pending outcome text visible');
   tree().focus();await native_key(46);assert(trash_calls.filter(item=>item===slow).length===1,'repeated delete does not retry pending call');
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'file_task_waiting'}));await pause(500);
   release_native();await wait(()=>!files.file_operations.state.busy,'late native result settled');assert(!fs.existsSync(slow)&&files.file_operations.state.phase==='succeeded','late success verified');delayed_target='';
   const refused=path.join(directory,'build_refused');fs.mkdirSync(refused);fs.writeFileSync(path.join(refused,'keep.txt'),'retained bytes');refused_target=refused;
   await select_delete(refused);await accept_delete();await wait(()=>files.file_operations.state.phase==='failed','native refusal reported');
   assert(fs.readFileSync(path.join(refused,'keep.txt'),'utf8')==='retained bytes','refusal never permanently deletes');
   await click(document.querySelector('.workspace-explorer-toolbar [data-git-icon="target"]').closest('button'));await pause(150);
   assert(document.querySelector('.workspace-explorer-status')?.textContent.includes('回收站'),'navigation retains error');
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'file_task_failed'}));await pause(500);
   refused_target='';await select_delete(refused);await accept_delete();await wait(()=>files.file_operations.state.phase==='succeeded','explicit retry succeeds');assert(!fs.existsSync(refused),'retry used native recycle');
   const locked=path.join(directory,'build_locked');fs.mkdirSync(locked);const locked_file=path.join(locked,'occupied.o');fs.writeFileSync(locked_file,'locked bytes');
   const locker=reqnode('child_process').spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','$file_path=[Console]::In.ReadLine(); $stream=[IO.File]::Open($file_path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); try {[Console]::Out.WriteLine("LOCKED"); [Console]::Out.Flush(); [Console]::In.ReadLine() | Out-Null} finally {$stream.Dispose()}'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   let lock_ready=false,lock_error='',lock_exit=false;locker.stdout.on('data',chunk=>{if(String(chunk).includes('LOCKED'))lock_ready=true;});locker.stderr.on('data',chunk=>lock_error+=String(chunk));locker.on('exit',()=>lock_exit=true);locker.on('error',error=>lock_error+=String(error));locker.stdin.write(locked_file+'\n');
   try{
    await wait(()=>lock_ready||lock_exit||lock_error,'exclusive lock ready');assert(lock_ready,'exclusive Windows lock acquired '+lock_error);
    await select_delete(locked);await accept_delete();await wait(()=>!files.file_operations.state.busy,'occupied directory returned');
    assert(files.file_operations.state.phase==='failed'&&fs.existsSync(locked_file),'occupied build returns a visible failure');
    assert(document.querySelector('.workspace-explorer-status')?.textContent.includes('回收站'),'real occupied failure remains visible');
   }finally{locker.stdin.end('\n');await wait(()=>lock_exit,'lock helper exited');}
   assert(fs.readFileSync(locked_file,'utf8')==='locked bytes','locked contents retained');await select_delete(locked);await accept_delete();await wait(()=>!files.file_operations.state.busy,'unlocked retry ended');assert(!fs.existsSync(locked)&&files.file_operations.state.phase==='succeeded','unlocked native retry succeeds');
   for(let index=0;index<20;index++){
    const target=path.join(directory,'cycle_'+index+'.txt');fs.writeFileSync(target,'temporary cycle');await files.trash_entries(directory,[target]);assert(!fs.existsSync(target)&&!files.file_operations.state.busy,'native sequential cycle '+index);
   }
   let stale_rejected=false;const protected_file=path.join(directory,'front.md');
   try{await files.trash_entries(base,[protected_file]);}catch{stale_rejected=true;}
   assert(stale_rejected&&fs.existsSync(protected_file),'service rejects stale root before native invocation');
   assert(File.editor.getMarkdown().includes('原文必须保持'),'native document preserved');
   assert(task_states.some(state=>state.phase==='verifying')&&task_states.some(state=>state.phase==='cleanup')&&task_states.some(state=>state.phase==='refreshing'),'production phases observed');
   fs.writeFileSync(path.join(base,'file_task_results.json'),JSON.stringify({status:'PASS',trash_calls:trash_calls.map(item=>path.relative(directory,item)),task_states,native_build_children:[20,100,1000],native_sequential_cycles:20,controlled:['delayed bridge with real eventual recycle','false bridge response']},null,2));
  }finally{JSBridge.invoke=original_invoke;stop_tasks();}
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'explorer_stable'}));await pause(500);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,frames:frames.length,trusted,scroll:top,max_scroll_deviation:Math.max(...frames.map(frame=>Math.abs(frame.scroll-top)))},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,input_events,diagnostic:{root:files.context_root(),tree:document.querySelector('.workspace-explorer-tree')?.outerHTML.slice(0,9000),panel:core.app.workspace.sidebar.activePanel?.ribbonButton?.id}},null,2));}
})();
