// 仅在独立宿主副本/私有桌面执行；真实开窗、文件服务和移交频道，输入是 renderer 事件。
(async () => {
  const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__;
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  const workspace=core.app.workspace,root=path.join(base,'workspace'),file=path.join(root,'window_draft.c');
  const coordinator=new BroadcastChannel('typora-code:native-drag-qa:'+base),id=crypto.randomUUID();
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(fn,label)=>{for(let i=0;i<750;i++){if(await fn())return;await pause(40);}throw Error('timeout: '+label);};
  const find=()=>{let result;workspace.eachLeaves(leaf=>{if(files.editor_state(leaf).file_path===file)result=leaf;});return result;};
  const signal=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail,cancelable:true}));
  const start=leaf=>{const transfer_token=crypto.randomUUID();signal('typora-code:tab-drag-start',{leaf,transfer_token});return transfer_token;};
  const end=(leaf,transfer_token,drop_effect)=>signal('typora-code:tab-drag-end',{leaf,transfer_token,drop_effect,screen_x:screenX+outerWidth+80,screen_y:screenY+100});
  // 此夹具不测试联网更新，不向真实远端发起检查。
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>null;
  let leader=false;
  try{fs.writeFileSync(path.join(base,'drag_leader'),id,{flag:'wx'});leader=true;}catch(error){if(error.code!=='EEXIST')throw error;}
  const checks=[],rounds=[];
  try {
    if(!leader){
      await wait(()=>{const leaf=find();return leaf?.view?.loaded&&files.editor_state(leaf).dirty;},'child draft received');
      const leaf=find(),model=leaf.view.editor.models[0];
      if(model.getValue()!=='int unsaved = 7;\n')throw Error('child draft mismatch');
      // 等待来源收到 accepted 并释放原标签，然后才开始反向移交。
      const child_pid=reqnode('process').pid;
      fs.writeFileSync(path.join(base,'child_'+id+'.json'),JSON.stringify({pid:child_pid,options:{initFilePath:_options.initFilePath,initAnchor:_options.initAnchor},file:File.bundle.filePath}));
      coordinator.postMessage({kind:'received',id,pid:child_pid});
      await new Promise(resolve=>{coordinator.onmessage=event=>{if(event.data.kind==='return'&&event.data.id===id)resolve();};});
      const token=start(leaf);coordinator.postMessage({kind:'merge',id,token});end(leaf,token,'move');
      return;
    }
    await wait(()=>File.bundle.filePath.endsWith('front.md')&&!File.isFileLoading(),'main startup');
    fs.writeFileSync(file,'int original = 1;\n','utf8');await files.open_file(file);
    await wait(()=>find()?.view?.loaded,'source loaded');
    find().view.editor.models[0].setValue('int unsaved = 7;\n');
    const original_group=find().parent;
    let child_id='',merge_token='',child_pid=0;
    coordinator.onmessage=event=>{
      if(event.data.kind==='received'){child_id=event.data.id;child_pid=event.data.pid;}
      if(event.data.kind==='merge'){
        merge_token=event.data.token;
        signal('typora-code:tab-drop',{transfer_token:merge_token,target_group:original_group,target_index:original_group.children.length});
      }
      if(event.data.kind==='error')fs.writeFileSync(path.join(base,'child_error.json'),JSON.stringify(event.data));
    };
    for(let i=0;i<20;i++){
      child_id=merge_token='';const started=performance.now(),leaf=find();
      await wait(()=>!files.editor_state(leaf).busy,'source idle');
      const token=start(leaf);end(leaf,token,'none');
      await wait(()=>child_id&&!find(),'native detached window and source ACK');
      coordinator.postMessage({kind:'return',id:child_id});
      await wait(()=>merge_token&&find()?.view?.loaded&&files.editor_state(find()).dirty,'merge restored draft');
      if(!child_pid||child_pid===reqnode('process').pid)throw Error('Expected independent child renderer');
      await wait(()=>{try{reqnode('process').kill(child_pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}},'empty auxiliary renderer actually exited');
      if(find().view.editor.models[0].getValue()!=='int unsaved = 7;\n'||fs.readFileSync(file,'utf8')!=='int original = 1;\n')throw Error('native roundtrip changed memory/disk');
      checks.push('第'+(i+1)+'轮原生拖出建窗、草稿回合并、附窗关闭且磁盘不变');
      rounds.push(performance.now()-started);
      fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify({checks,rounds},null,2));
    }
    coordinator.close();
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,rounds,max_round_ms:Math.max(...rounds),boundary:'原始Typora独立副本；renderer拖动事件驱动真实宿主建窗/关闭、真实Monaco和BroadcastChannel；非物理OS跨窗输入'},null,2));
  }catch(error){
    const failure={status:'ERROR',error:String(error.stack||error),checks,rounds};
    if(leader)fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify(failure,null,2));
    else{coordinator.postMessage({kind:'error',id,...failure});fs.writeFileSync(path.join(base,'child_error.json'),JSON.stringify(failure,null,2));}
  }
})()
