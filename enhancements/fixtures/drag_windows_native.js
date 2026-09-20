// 仅在独立宿主副本/私有桌面执行；真实开窗、文件服务和移交频道，输入是 renderer 事件。
(async () => {
  const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__;
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  const workspace=core.app.workspace,root=path.join(base,'workspace'),scenario_path=path.join(base,'drag_scenario.json');
  let scenario={kind:'source',dirty:true},file=path.join(root,'window_draft.c');
  const coordinator=new BroadcastChannel('typora-code:native-drag-qa:'+base),id=crypto.randomUUID();
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(fn,label)=>{for(let i=0;i<750;i++){if(fs.existsSync(path.join(base,'child_error.json')))throw Error(fs.readFileSync(path.join(base,'child_error.json'),'utf8'));if(await fn())return;await pause(40);}throw Error('timeout: '+label);};
  const find=()=>{let result;workspace.eachLeaves(leaf=>{if(files.editor_state(leaf).file_path===file)result=leaf;});return result;};
  const signal=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail,cancelable:true}));
  const start=leaf=>{const transfer_token=crypto.randomUUID();signal('typora-code:tab-drag-start',{leaf,transfer_token});return transfer_token;};
  const end=(leaf,transfer_token,drop_effect)=>signal('typora-code:tab-drag-end',{leaf,transfer_token,drop_effect,screen_x:screenX+outerWidth+80,screen_y:screenY+100});
  // 此夹具不测试联网更新，不向真实远端发起检查。
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>null;
  let leader=false;
  try{fs.writeFileSync(path.join(base,'drag_leader'),id,{flag:'wx'});leader=true;}catch(error){if(error.code!=='EEXIST')throw error;}
  const checks=[],rounds=[];
  for(const method of ['capture_transfer','receive_transfer','release_transfer']){
    const original=files[method];files[method]=async(...args)=>{try{return await original(...args);}catch(error){fs.writeFileSync(path.join(base,'transfer_error_'+id+'.json'),JSON.stringify({method,error:String(error.stack||error),loading:File.isFileLoading(),switching:File._onFileSwitching,parsing:File._onInitParse},null,2));throw error;}};
  }
  const dialog_watch=new MutationObserver(()=>{
    const dialogs=[...document.querySelectorAll('.git-graph-dialog-shade[role="dialog"]')].map(node=>node.textContent);
    const notices=[...document.querySelectorAll('.typ-notice__content')].map(node=>node.textContent);
    if(notices.length)fs.writeFileSync(path.join(base,'notices_'+id+'.json'),JSON.stringify(notices));
    if(dialogs.length)fs.writeFileSync(path.join(base,'dialogs_'+id+'.json'),JSON.stringify(dialogs));
  });dialog_watch.observe(document.body,{childList:true,subtree:true});
  const original_text=()=>scenario.kind==='source'?'int original = 1;\n':'# Original\n\nSaved paragraph.\n';
  const expected_text=()=>!scenario.dirty?original_text():scenario.kind==='source'?'int unsaved = 7;\n':'# Draft\n\nUnsaved paragraph.\n';
  const actual_text=()=>scenario.kind==='source'?find().view.editor.models[0].getValue():File.editor.getMarkdown();
  const ready=()=>{const leaf=find();return leaf&&(scenario.kind==='source'?leaf.view?.loaded:File.bundle.filePath===file&&!File.isFileLoading())&&files.editor_state(leaf).dirty===scenario.dirty;};

  try {
    if(!leader){
      scenario=JSON.parse(fs.readFileSync(scenario_path,'utf8'));file=path.join(root,scenario.file);
      await wait(ready,'child document received');
      const leaf=find();
      const real_leaves=[];workspace.eachLeaves(item=>{if(files.editor_state(item).file_path)real_leaves.push(files.editor_state(item).file_path);});
      if(real_leaves.length!==1)throw Error('Auxiliary restored unrelated editors: '+JSON.stringify(real_leaves));
      if(actual_text()!==expected_text())throw Error('child document mismatch');
      // 等待来源收到 accepted 并释放原标签，然后才开始反向移交。
      const child_pid=reqnode('process').pid;
      fs.writeFileSync(path.join(base,'child_'+id+'.json'),JSON.stringify({pid:child_pid,options:{initFilePath:_options.initFilePath,initAnchor:_options.initAnchor},file:File.bundle.filePath}));
      coordinator.postMessage({kind:'received',id,pid:child_pid});
      await new Promise(resolve=>{coordinator.onmessage=event=>{if(event.data.kind==='return'&&event.data.id===id)resolve();};});
      const token=start(leaf);coordinator.postMessage({kind:'merge',id,token});end(leaf,token,'move');
      return;
    }
    await wait(()=>File.bundle.filePath.endsWith('front.md')&&!File.isFileLoading(),'main startup');
    await JSBridge.invoke('setting.put','restoreWhenLaunch',2);
    if(String(JSON.parse(await JSBridge.invoke('setting.getExtraOption')).restoreWhenLaunch)!=='2')throw Error('Restore preference not enabled');
    let child_id='',merge_token='',child_pid=0;
    coordinator.onmessage=event=>{
      if(event.data.kind==='received'){child_id=event.data.id;child_pid=event.data.pid;}
      if(event.data.kind==='merge'){
        merge_token=event.data.token;
        signal('typora-code:tab-drop',{transfer_token:merge_token,target_group:window.drag_original_group,target_index:window.drag_original_group.children.length});
      }
      if(event.data.kind==='error')fs.writeFileSync(path.join(base,'child_error.json'),JSON.stringify(event.data));
    };
    for(const config of [{kind:'source',dirty:false,file:'window_saved.c'},{kind:'source',dirty:true,file:'window_draft.c'},{kind:'markdown',dirty:false,file:'window_saved.md'},{kind:'markdown',dirty:true,file:'window_dirty.md'}]){
      scenario=config;file=path.join(root,scenario.file);fs.writeFileSync(scenario_path,JSON.stringify(scenario));
      fs.writeFileSync(file,original_text(),'utf8');await files.open_file(file);
      await wait(()=>find()&&(scenario.kind==='source'?find().view?.loaded:File.bundle.filePath===file&&!File.isFileLoading()),'source loaded');
      if(scenario.dirty){
        if(scenario.kind==='source')find().view.editor.models[0].setValue(expected_text());
        else File.reloadContent(expected_text(),{delayRefresh:false,skipChangeCount:false,skipStore:true});
      }
      await wait(ready,'source prepared');window.drag_original_group=find().parent;await pause(250);
      for(let i=0;i<20;i++){
      child_id=merge_token='';const started=performance.now(),leaf=find();
      await wait(()=>!files.editor_state(leaf).busy,'source idle');
      const token=start(leaf);end(leaf,token,'none');
      await wait(()=>child_id&&!find(),'native detached window and source ACK');
      // 每类10轮在返回前先打开同一文件，验证真实重复路径合并不创建第二份标签。
      let duplicate_leaf,duplicate_model,duplicate_version,duplicate_count;
      if(i%2===1){
        // 移出导致原生切到另一标签；独立的测试准备打开必须等该切换完成。
        await wait(()=>{const active=files.editor_state(workspace.activeLeaf);return !File.isFileLoading()&&!File._onFileSwitching&&!File._onInitParse&&(active.kind!=='markdown'||File.bundle.filePath===active.file_path);},'main settled before duplicate setup');
        await files.open_file(file);
        await wait(()=>find()&&(scenario.kind==='source'?find().view?.loaded:File.bundle.filePath===file&&!File.isFileLoading()),'duplicate target loaded');
        if(scenario.kind==='source'&&scenario.dirty)find().view.editor.models[0].setValue(expected_text());
        if(scenario.kind==='markdown'&&scenario.dirty&&File.editor.getMarkdown()!==expected_text())File.reloadContent(expected_text(),{delayRefresh:false,skipChangeCount:false,skipStore:true});
        await wait(ready,'duplicate target prepared');duplicate_leaf=find();duplicate_count=0;workspace.eachLeaves(()=>{duplicate_count++;});
        if(scenario.kind==='source'){duplicate_model=find().view.editor.models[0];duplicate_version=duplicate_model.getAlternativeVersionId();}
      }
      coordinator.postMessage({kind:'return',id:child_id});
      await wait(()=>merge_token&&ready(),'merge restored document');
      if(!child_pid||child_pid===reqnode('process').pid)throw Error('Expected independent child renderer');
      await wait(()=>{try{reqnode('process').kill(child_pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}},'empty auxiliary renderer actually exited');
      if(duplicate_leaf){
        let count=0;workspace.eachLeaves(()=>{count++;});
        if(find()!==duplicate_leaf||count!==duplicate_count)throw Error('Duplicate merge replaced target leaf or added a tab');
        if(duplicate_model&&(find().view.editor.models[0]!==duplicate_model||duplicate_model.getAlternativeVersionId()!==duplicate_version))throw Error('Duplicate merge replaced source model or undo state');
      }
      if(actual_text()!==expected_text()||fs.readFileSync(file,'utf8')!==original_text())throw Error('native roundtrip changed memory/disk');
      checks.push(scenario.kind+(scenario.dirty?' dirty':' saved')+(duplicate_leaf?' existing target':' empty target')+' 第'+(i+1)+'轮原生拖出建窗、草稿回合并、附窗关闭且磁盘不变');
      rounds.push(performance.now()-started);
      fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify({checks,rounds},null,2));
    }
      // 仅还原夹具自己的文档，以便进入下一种格式；不保存磁盘。
      if(scenario.kind==='source')find().view.editor.models[0].setValue(original_text());
      if(!scenario.dirty||scenario.kind==='source')await files.open_file(path.join(root,'front.md'));
    }
    dialog_watch.disconnect();coordinator.close();
    if(fs.readdirSync(base).some(name=>name.startsWith('dialogs_')||name.startsWith('notices_')))throw Error('Unexpected modal or notification during successful transfer');
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,rounds,max_round_ms:Math.max(...rounds),boundary:'原始Typora独立副本；renderer拖动事件驱动真实宿主建窗/关闭、真实Monaco和BroadcastChannel；非物理OS跨窗输入'},null,2));
  }catch(error){
    const current_leaves=[];workspace.eachLeaves(item=>{current_leaves.push(files.editor_state(item));});const failure={status:'ERROR',error:String(error.stack||error),checks,rounds,native:{path:File.bundle.filePath,dirty:File.changeCounter.isDocumentEdited(),text:File.editor.getMarkdown(),loading:File.isFileLoading(),switching:File._onFileSwitching},current_leaves};
    if(leader)fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify(failure,null,2));
    else{coordinator.postMessage({kind:'error',id,...failure});fs.writeFileSync(path.join(base,'child_error.json'),JSON.stringify(failure,null,2));}
  }
})()
