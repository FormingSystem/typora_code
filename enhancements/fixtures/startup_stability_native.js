// 原始宿主隔离副本；采集 head 起的状态以及真实侧栏调用，不触碰用户工作区。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],switches=[];
 const probe=window.startup_timing_probe,core=window[Symbol.for('typora-code:workspace')];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const library=editor.library,original_show=library.showSidebar,original_hide=library.hideSidebar;
 let show_count=0,hide_count=0;
 library.showSidebar=function(...args){show_count++;return original_show.apply(this,args);};
 library.hideSidebar=function(...args){hide_count++;return original_hide.apply(this,args);};
 const digest=file=>reqnode('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const front=path.join(base,'workspace/front.md'),before=digest(front);
 try{
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  for(let i=0;i<200&&document.documentElement.dataset.linuxNoteTyporaEnhancements!=='ready';i++)await pause(25);
  assert(document.documentElement.dataset.linuxNoteTyporaEnhancements==='ready','真实常驻入口就绪');
  const root_node=core.app.workspace.rootSplit.containerEl,editor_node=editor.writingArea;
  const node_count=document.querySelectorAll('*').length;
  for(const tier of [20,100,1000]){
   for(let index=0;index<tier;index++){core.app.initialize();core.app.workspace.mount();core.app.start();}
   assert(core.app.workspace.rootSplit.containerEl===root_node&&editor.writingArea===editor_node&&document.querySelectorAll('*').length===node_count,'重复挂载 '+tier+' 次保持布局及原生编辑节点身份和数量');
  }
  const sidebar=core.app.workspace.sidebar;
  const panels=['core.file-explorer','core.outline','linux_note:search','linux_note:source_control'].map(id=>sidebar.panels.find(panel=>panel.ribbonButton?.id===id));
  // Explorer 用增强实现，避免同名原生面板取错。
  panels[0]=sidebar.panels.find(panel=>panel.containerEl?.classList.contains('linux-note-workspace-explorer'));
  assert(panels.every(Boolean),'四个真实功能区已登记');
  sidebar.switch(panels[0].constructor);sidebar.show();await pause(100);
  const initial_hide=hide_count,initial_show=show_count;
  for(let i=0;i<20;i++){
   const target=panels[(i+1)%panels.length],start=performance.now();
   if(sidebar.activePanel!==target)sidebar.switch(target.constructor);else sidebar.show();
   const synchronous=performance.now()-start;
   await new Promise(resolve=>requestAnimationFrame(resolve));
   const frame_time=performance.now()-start;
   const visible_custom=panels.filter(panel=>panel.ribbonButton.id!=='core.outline'&&panel.containerEl?.isConnected&&getComputedStyle(panel.containerEl).display!=='none');
   switches.push({index:i,target:target.ribbonButton.id,synchronous,frame_time,shown:sidebar.isShown,visible_custom:visible_custom.length,hide_count,show_count});
   assert(sidebar.isShown&&sidebar.activePanel===target,'切换 '+i+' 后目标一致且侧栏保持展开');
   assert(visible_custom.length<=1,'切换 '+i+' 无两个自定义面板重叠');
   await pause(20);
  }
  assert(hide_count===initial_hide,'可见功能区切换不关闭宿主侧栏');
  const exposed=probe.samples.filter(sample=>sample.body&&(sample.visibility==='visible'||sample.write_visibility==='visible')&&sample.title!=='ready');
  assert(exposed.length===0,'head起采样未暴露尚未挂载工作台的旧正文布局');
  assert(!probe.samples.some(sample=>sample.workspace_visibility==='visible'&&sample.ready!=='ready'),'首个可见工作台根已完成基础UI注册');
  assert(!probe.samples.some(sample=>sample.overlay.includes('正在加载工作台')),'启动无加载提示覆盖层');
  assert(probe.first_visible_root===root_node&&probe.first_visible_write===editor_node,'首个可见工作台和原生正文节点沿用至当前');
  assert(digest(front)===before&&!File.changeCounter.isDocumentEdited(),'原文及未保存状态不变');
  probe.stop();
  if(probe.stop_profile)fs.writeFileSync(path.join(base,'startup.cpuprofile'),JSON.stringify(await probe.stop_profile()),'utf8');
  if(probe.profile_error)fs.writeFileSync(path.join(base,'profile_error.txt'),probe.profile_error,'utf8');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',head_runtime:probe.head_runtime,checks,switches,startup:probe.samples,long_tasks:probe.long_tasks,measures:performance.getEntriesByType('measure').filter(entry=>entry.name.startsWith('typora-code:')).map(entry=>entry.toJSON()),host_calls:{show_count,hide_count,initial_show,initial_hide},viewport:[innerWidth,innerHeight],dpr:devicePixelRatio},null,2),'utf8');
 }catch(error){probe?.stop();fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,switches,startup:probe?.samples,long_tasks:probe?.long_tasks},null,2),'utf8');}
 finally{library.showSidebar=original_show;library.hideSidebar=original_hide;}
})();
