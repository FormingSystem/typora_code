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
  ClientCommand.setTheme('vscode2026_dark.css','vscode2026_dark.css');await wait(()=>document.documentElement.dataset.workspaceColors==='dark','dark theme applied');
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
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'explorer_stable'}));await pause(500);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,frames:frames.length,trusted,scroll:top,max_scroll_deviation:Math.max(...frames.map(frame=>Math.abs(frame.scroll-top)))},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,input_events,diagnostic:{root:files.context_root(),tree:document.querySelector('.workspace-explorer-tree')?.outerHTML.slice(0,9000),panel:core.app.workspace.sidebar.activePanel?.ribbonButton?.id}},null,2));}
})();
