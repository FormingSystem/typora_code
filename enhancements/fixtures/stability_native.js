// 在原始Typora的独立用户目录/私有桌面夹具中执行；__CASE_ROOT__由夹具替换。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__;
 const checks=[],samples=[],root=path.join(base,'workspace');
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(await fn())return;await pause(40);}throw Error('timeout '+label);};
 const persist=()=>fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify({checks,samples},null,2),'utf8');
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);persist();};
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const core=window[Symbol.for('typora-code:workspace')];
 const files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const active=()=>core.app.workspace.activeLeaf;
 let menu;
 try {
  await wait(()=>File.bundle.filePath.endsWith('front.md')&&!File.isFileLoading(),'startup');await pause(1200);
  samples.push({viewport:{width:innerWidth,height:innerHeight,device_pixel_ratio:devicePixelRatio,zoom_factor:reqnode('electron').webFrame?.getZoomFactor?.()},input:'renderer事件与真实宿主API；非物理输入'});
  const before=hash(path.join(root,'front.md'));
  const folder=path.join(root,'recent_validation');fs.mkdirSync(folder);
  core.app.commands.run('linux_note:open_folder_path',[folder]);
  await wait(async()=>{const data=await JSBridge.invoke('setting.getRecentFiles');return data.folders?.some(item=>path.resolve(item.path)===folder);},'最近目录写入原生历史');
  assert(path.resolve(File.getMountFolder())===folder,'TC-files-recent: 新目录挂载且原生最近历史包含它');
  core.app.commands.run('linux_note:open_folder_path',[root]);await wait(()=>path.resolve(File.getMountFolder())===root,'restore root');
  const extensionless=await files.create_entry(root,root,'111',false);
  await files.open_file(extensionless);await wait(()=>active().view?.loaded,'extensionless source loaded');
  assert(active().view.editor.models[0].getLanguageId()==='plaintext','TC-files-rename: 无后缀默认纯文本');
  const renamed=await files.rename_file(root,extensionless,'1111.md');
  await wait(()=>File.bundle.filePath===renamed&&!active().state.path.startsWith('typ://'),'clean Markdown automatic view');
  assert(!File.changeCounter.isDocumentEdited(),'TC-files-rename: clean改后缀自动进入原生Markdown且保持clean');
  const dirty_source=await files.create_entry(root,root,'draft_without_extension',false);await files.open_file(dirty_source);await wait(()=>active().view?.loaded,'dirty source load');
  const model=active().view.editor.models[0];model.setValue('# 内存草稿\n\n正文');
  const dirty_renamed=await files.rename_file(root,dirty_source,'draft_renamed.md');
  assert(active().view.editor.models[0]===model&&model.getLanguageId()==='markdown'&&files.editor_state(active()).dirty,'TC-files-rename: dirty正文/模型保留且语言更新');
  assert(fs.readFileSync(dirty_renamed,'utf8')==='','TC-files-rename: 改名不静默保存草稿');
  await files.save_active();await wait(()=>File.bundle.filePath===dirty_renamed&&!active().state.path.startsWith('typ://'),'save changes default editor');
  assert(File.editor.getMarkdown().includes('内存草稿')&&!File.changeCounter.isDocumentEdited(),'TC-files-rename: 保存后自动进入Markdown且正文正确');
  // 只回收本次新建的明确对象，原生桥接不替换。
  const disposable=await files.create_entry(root,root,'recycle_validation.txt',false);fs.writeFileSync(disposable,'private recycle payload','utf8');
  await files.trash_entries(root,[disposable]);assert(!fs.existsSync(disposable),'TC-files-trash: 原始Typora主进程实际回收临时文件');
  const directory=await files.create_entry(root,root,'recycle_directory',true);fs.writeFileSync(path.join(directory,'child.txt'),'child','utf8');
  await files.trash_entries(root,[directory]);assert(!fs.existsSync(directory),'TC-files-trash: 原始Typora主进程实际回收临时目录');
  const navigation=path.join(root,'navigation.md');fs.writeFileSync(navigation,'# 起点\n\n'+Array.from({length:70},(_,i)=>'段落 '+i+'\n\n').join('')+'## 目标章节\n\n'+Array.from({length:30},()=> '结尾\n\n').join(''),'utf8');
  await files.open_file(navigation);await wait(()=>File.bundle.filePath===navigation&&!File.isFileLoading()&&document.querySelector('#write h2'),'navigation ready');await pause(300);
  for(const [theme,name]of [['github.css','Github'],['night.css','Night']]){
   ClientCommand.setTheme(theme,name);await pause(250);document.querySelector('#ty-suppress-mode-warning-close-btn')?.click();
   const heading=document.querySelector('#write h2'),content=document.querySelector('content');
   await wait(()=>!File.editor.isScrolling()&&!File._onInitParse,'native scroll idle');File.editor.selection.scrollAdjust($(heading),10,0,true);await pause(650);
   const geometry={theme,top:heading.getBoundingClientRect().top,content_top:content.getBoundingClientRect().top+content.clientTop,bottom:content.getBoundingClientRect().bottom,scroll:content.scrollTop,scroll_height:content.scrollHeight,client_height:content.clientHeight,busy:File.inBusyMode,typewriter:File.isTypeWriterMode,bar_bottom:document.querySelector('.workspace-breadcrumbs:not([hidden])')?.getBoundingClientRect().bottom};samples.push(geometry);
   assert(geometry.top>=Math.max(geometry.content_top,geometry.bar_bottom||0)-1&&geometry.top-geometry.content_top<100&&geometry.top+heading.getBoundingClientRect().height<geometry.bottom,'TC-reading-native: '+name+'显式章节跳转完整避开顶部导航');
   {
    const group=document.querySelector('.typ-ribbon .group.top');
    group.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:250}));
    await pause(100);menu=core.app.workspace.ribbon.ribbonView.dispalyMenu;
    assert(Boolean(menu?.containerEl?.isConnected),'实际活动栏功能菜单打开');
    const slots=[...menu.containerEl.querySelectorAll('.typ-menu-icon')],labels=[...menu.containerEl.querySelectorAll('.typ-menu-label')];
    samples.push({theme,menu:slots.map(node=>({slot:node.getBoundingClientRect().toJSON(),icon:node.firstElementChild?.getBoundingClientRect().toJSON(),row:node.parentElement.getBoundingClientRect().toJSON(),display:getComputedStyle(node.parentElement).display,html:node.outerHTML,label_left:node.nextElementSibling.getBoundingClientRect().left}))});persist();
    assert(slots.length>=3&&slots.every(node=>Math.abs(node.getBoundingClientRect().width-16)<1&&Math.abs(node.getBoundingClientRect().height-16)<1),'TC-workspace-menu: '+name+'字体/SVG共用16px槽位');
    assert(slots.every(node=>{const slot=node.getBoundingClientRect(),icon=node.firstElementChild.getBoundingClientRect(),row=node.parentElement.getBoundingClientRect();return Math.abs(icon.width-16)<1&&Math.abs(icon.height-16)<1&&Math.abs(icon.top+icon.height/2-row.top-row.height/2)<1&&getComputedStyle(node.parentElement).display==='flex';}),'TC-workspace-menu: '+name+'实际图标和文字行内居中');
    assert(labels.every(node=>Math.abs(node.getBoundingClientRect().left-labels[0].getBoundingClientRect().left)<1),'TC-workspace-menu: '+name+'功能菜单文字对齐');
    assert(labels.every((node,index)=>node.getBoundingClientRect().left-slots[index].getBoundingClientRect().right>=7),'TC-workspace-menu: '+name+'图标与文字保留槽间距');
    fs.writeFileSync(base+'/capture_request.json',JSON.stringify({stage:'stability_'+name}));
    await wait(()=>{try{return JSON.parse(fs.readFileSync(base+'/capture_done.json','utf8').replace(/^\uFEFF/,'' )).stage==='stability_'+name;}catch{return false;}},'screenshot');
    menu.hide?.();menu.close?.();menu=null;
   }
  }
  if(reqnode('process').env.TYPORA_TEST_PURPOSE==='stress'){
   const iterations=Number(reqnode('process').env.TYPORA_STRESS_ITERATIONS||20);assert([20,100,1000].includes(iterations),'原生压力档有效');
   const count=()=>document.querySelectorAll('.context-menu').length,baseline=count(),started=Date.now();
   for(let index=0;index<iterations;index++){
    document.querySelector('.typ-ribbon .group.top').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:250}));await pause(1);
    menu=core.app.workspace.ribbon.ribbonView.dispalyMenu;if(!menu.containerEl.isConnected)throw Error('压力菜单意外脱离DOM');menu.close();menu=null;
    if(count()!==baseline)throw Error('反复打开菜单泄漏DOM');
   }
   samples.push({stress:{iterations,elapsed_ms:Date.now()-started,concurrency:1,menus_before:baseline,menus_after:count()}});
   assert(getComputedStyle(core.app.workspace.ribbon.ribbonView.dispalyMenu.containerEl).display==='none','原生压力后无遗留菜单');
  }
  assert(hash(path.join(root,'front.md'))===before,'原始夹具文档保持字节一致');
  fs.writeFileSync(base+'/checks.json',JSON.stringify({status:'PASS',checks,samples,scope:'原始Typora 1.14.10，私有桌面/用户目录；renderer调用实际宿主API，非物理用户输入'},null,2),'utf8');
 }catch(error){fs.writeFileSync(base+'/checks.json',JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2),'utf8');}
 finally{menu?.hide?.();menu?.close?.();}
})();
