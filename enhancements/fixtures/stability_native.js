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
  const update_service=reqnode(path.join(window._options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs'));
  const update_release=JSON.parse(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/assets/update/release.json'),'utf8'));
  const check_update=update_service.check_update;let update_checks=0;
  update_service.check_update=async()=>{update_checks++;const release=JSON.parse(JSON.stringify(update_release));release.releases[0].sequence++;release.releases[0].version='9999.1';release.releases[0].notes=['原生验收公告，不联网、不安装'];return {release};};
  const update_popup=()=>document.querySelector('[role="dialog"][aria-label="Typora Code 有新版本"]');
  await wait(update_popup,'原生启动更新公告');
  assert(update_checks===1,'TC-update-native: 原生主进程身份检查和启动公告成功且一次请求');
  assert(update_popup().textContent.includes('手动重启')&&update_popup().textContent.includes('原生验收公告'),'TC-update-native: 公告展示立即安装与手动重启说明');
  [...update_popup().querySelectorAll('button')].find(button=>button.textContent==='稍后').click();
  core.app.commands.run('typora_code:check_update');await wait(update_popup,'手动更新入口');
  assert(update_checks===2,'TC-update-native: 同一会话可由帮助命令主动重试');
  [...update_popup().querySelectorAll('button')].find(button=>button.textContent==='稍后').click();
  update_service.check_update=check_update;
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
  for(let index=0;index<60;index++)fs.writeFileSync(path.join(root,'scrollbar_'+index+'.txt'),'scrollbar fixture\n','utf8');
  for(const [theme,name]of [['github.css','Github'],['night.css','Night']]){
   await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(350);document.querySelector('#ty-suppress-mode-warning-close-btn')?.click();
   assert(document.documentElement.dataset.workspaceFileIconTheme===(name==='Night'?'dark':'light'),'实际主题完成 '+name);
   // Explorer使用真实宿主主题；标题、文件内容和辅助动作分别核对。
   if(!document.querySelector('.linux-note-workspace-explorer')?.getBoundingClientRect().width)document.querySelector('.typ-ribbon-item[data-id="core.file-explorer"]').click();
   await wait(()=>document.querySelector('.linux-note-workspace-explorer'),'Explorer挂载');
   const explorer=document.querySelector('.linux-note-workspace-explorer');
   await wait(()=>{const title=explorer.querySelector('.workspace-explorer-toolbar strong'),box=title.getBoundingClientRect();return title.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));},'Explorer实际可见命中');
   await document.fonts.ready;
   for(const toggle of explorer.querySelectorAll('.workspace-explorer-section-title'))if(toggle.getAttribute('aria-expanded')==='false')toggle.click();
   await wait(()=>explorer.querySelector('.workspace-explorer-name'),'Explorer内容');
   const sidebar=document.querySelector('#typora-sidebar'),sash=document.querySelector('#typora-sidebar-resizer');
   for(const zoom of [1,1.25])for(const width of [300,220]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(150);
    sash.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
    for(let step=170;step<width;step+=10)sash.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
    explorer.querySelector('.workspace-timeline .workspace-explorer-section-title').focus();await pause(350);
    assert(Math.abs(sidebar.getBoundingClientRect().width-width)<1&&document.querySelector('.typ-workspace-root').getBoundingClientRect().left>=sidebar.getBoundingClientRect().right-1,'TC-explorer-hierarchy: '+name+' '+width+'真实分隔条调整且不覆盖编辑区');
    const fonts=[...explorer.querySelectorAll('.workspace-explorer-toolbar strong,.workspace-explorer-name,.workspace-explorer-open-name,.workspace-timeline-label')].map(node=>({role:node.className,font:getComputedStyle(node).fontFamily,size:getComputedStyle(node).fontSize,weight:getComputedStyle(node).fontWeight}));
    const buttons=[...explorer.querySelectorAll('.workspace-explorer-section-actions button')].filter(node=>node.getBoundingClientRect().width>0);
    const geometry=buttons.map(node=>({button:node.getBoundingClientRect().toJSON(),icon:node.querySelector('svg').getBoundingClientRect().toJSON()}));
    samples.push({explorer:{theme,width,fonts,geometry,device_pixel_ratio:devicePixelRatio}});persist();
    const origin=explorer.getBoundingClientRect().left;
    const section_geometry=[...explorer.querySelectorAll('.workspace-explorer-section-heading')].map(node=>{
     const icon=node.querySelector('svg').getBoundingClientRect(),title=node.querySelector('.workspace-explorer-section-label,.workspace-explorer-root-name')||node.querySelector('.workspace-explorer-section-title');
     const range=document.createRange();range.selectNodeContents([...title.childNodes].find(child=>child.nodeType===Node.TEXT_NODE)||title);
     return {icon:icon.left-origin,label:range.getBoundingClientRect().left-origin,icon_width:icon.width};
    });
    assert(section_geometry.length===3&&section_geometry.every(row=>Math.abs(row.icon-4)<.5&&Math.abs(row.label-24)<.5&&Math.abs(row.icon_width-16)<.5),'R061 '+name+' '+width+' '+zoom+' Explorer三分区图标/文字共用4/24px');
    for(const toggle of explorer.querySelectorAll('.workspace-explorer-section-title')){
     const before=toggle.getAttribute('aria-expanded');toggle.click();await pause(20);
     assert(toggle.getAttribute('aria-expanded')!==before,'R061折叠状态响应 '+toggle.textContent);
     toggle.click();await pause(20);
    }
    core.app.commands.run('linux_note:source_control');
    await wait(()=>document.querySelector('.git-scm-input-heading')?.getBoundingClientRect().width>0,'R061 SCM显示');
    const scm=document.querySelector('.linux-note-git-source-control'),scm_origin=scm.getBoundingClientRect().left;
    const scm_geometry=[...scm.querySelectorAll('.git-scm-input-heading>.git-disclosure-icon,.git-scm-history-toggle>.git-disclosure-icon')].map(node=>({left:node.getBoundingClientRect().left-scm_origin,width:node.getBoundingClientRect().width}));
    assert(scm_geometry.length===2&&scm_geometry.every(row=>Math.abs(row.left-section_geometry[0].icon)<.5&&Math.abs(row.width-16)<.5),'R061 '+name+' '+width+' '+zoom+' Git与Explorer实际槽位相同');
    samples.push({disclosure:{theme,zoom,width,section_geometry,scm_geometry}});persist();
    document.querySelector('.typ-ribbon-item[data-id="core.file-explorer"]').click();
    await wait(()=>explorer.getBoundingClientRect().width>0,'R061返回Explorer');
    explorer.querySelector('.workspace-timeline .workspace-explorer-section-title').focus();await pause(100);
    const stage='explorer_'+name+'_'+width+'_'+Math.round(zoom*100);
    fs.writeFileSync(base+'/capture_request.json',JSON.stringify({stage}));
    await wait(()=>{try{return JSON.parse(fs.readFileSync(base+'/capture_done.json','utf8').replace(/^\uFEFF/,'' )).stage===stage;}catch{return false;}},'Explorer截图');
    assert(fonts.length>1&&fonts.every(item=>item.font.includes('Segoe')),'TC-explorer-hierarchy: '+name+' '+width+'正文主题不改变UI字体');
    assert(geometry.length===4&&geometry.every(({button,icon})=>Math.abs(button.width-20)<1&&Math.abs(button.height-20)<1&&Math.abs(icon.width-16)<1&&Math.abs(icon.height-16)<1&&Math.abs(icon.x+8-button.x-10)<1&&Math.abs(icon.y+8-button.y-10)<1),'TC-explorer-hierarchy: '+name+' '+width+'分区20px目标内16px图标居中');
    const title=explorer.querySelector('.workspace-timeline .workspace-explorer-section-title').getBoundingClientRect(),actions=explorer.querySelector('.workspace-timeline .workspace-explorer-section-actions').getBoundingClientRect();
    assert(title.right<=actions.left+.5&&title.width>20,'TC-explorer-hierarchy: '+name+' '+width+'标题与辅助工具不重叠');
   }
   reqnode('electron').webFrame.setZoomFactor(1);await pause(100);
   document.activeElement?.blur();
   const heading=document.querySelector('#write h2'),content=document.querySelector('content');
   await wait(()=>!File.editor.isScrolling()&&!File._onInitParse,'native scroll idle');File.editor.selection.scrollAdjust($(heading),10,0,true);await pause(650);
   const geometry={theme,top:heading.getBoundingClientRect().top,content_top:content.getBoundingClientRect().top+content.clientTop,bottom:content.getBoundingClientRect().bottom,scroll:content.scrollTop,scroll_height:content.scrollHeight,client_height:content.clientHeight,busy:File.inBusyMode,typewriter:File.isTypeWriterMode,bar_bottom:document.querySelector('.workspace-breadcrumbs:not([hidden])')?.getBoundingClientRect().bottom};samples.push(geometry);
   assert(geometry.top>=Math.max(geometry.content_top,geometry.bar_bottom||0)-1&&geometry.top-geometry.content_top<100&&geometry.top+heading.getBoundingClientRect().height<geometry.bottom,'TC-reading-native: '+name+'显式章节跳转完整避开顶部导航');
   {
    const bar=document.querySelector('.workspace-breadcrumbs:not([hidden])'),line=getComputedStyle(bar,'::after'),rect=bar.getBoundingClientRect();
    assert(line.content==='""'&&line.height==='1px'&&line.left==='0px'&&line.right==='0px'&&line.bottom==='0px'&&line.pointerEvents==='none'&&line.backgroundColor===(name==='Night'?'rgb(42, 43, 44)':'rgb(228, 229, 230)')&&Math.abs(rect.height-22)<.1,'TC-breadcrumb-border: '+name+'整行下沿主题分界线且栏高不变');
    samples.push({breadcrumb_border:{theme,rect:rect.toJSON(),color:line.backgroundColor}});
    fs.writeFileSync(base+'/capture_request.json',JSON.stringify({stage:'breadcrumb_border_'+name}));
    await wait(()=>{try{return JSON.parse(fs.readFileSync(base+'/capture_done.json','utf8').replace(/^\uFEFF/,'')).stage==='breadcrumb_border_'+name;}catch{return false;}},'breadcrumb border screenshot');
   }
   {
    const group=document.querySelector('.typ-ribbon .group.top');
    group.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:250}));
    await pause(100);menu=core.app.workspace.ribbon.ribbonView.dispalyMenu;
    assert(Boolean(menu?.containerEl?.isConnected),'实际活动栏功能菜单打开');
    const rows=[...menu.containerEl.querySelectorAll('a[role="menuitemcheckbox"]')];
    assert(rows.length>=3&&rows.every(node=>node.getAttribute('aria-checked')==='true'&&node.querySelector('[data-git-icon="check"]')),'TC-workspace-menu: '+name+'显示入口均有真实勾选，非活动入口也保留勾选');
    const toggle_id=rows[1].parentElement.dataset.key;
    rows[1].click();group.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:250}));await pause(80);
    const unchecked=menu.containerEl.querySelector('[data-key="'+toggle_id+'"] > a');
    assert(unchecked.getAttribute('aria-checked')==='false'&&!unchecked.querySelector('svg')&&getComputedStyle(group.querySelector('[data-id="'+toggle_id+'"]')).display==='none','TC-workspace-menu: '+name+'隐藏后重开准确显示未勾选');
    unchecked.click();group.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:250}));await pause(80);
    assert(core.app.workspace.ribbon.getState()[toggle_id].visible===true,'TC-workspace-menu: '+name+'重新勾选恢复所有者状态');
    const slots=[...menu.containerEl.querySelectorAll('.typ-menu-icon')],labels=[...menu.containerEl.querySelectorAll('.typ-menu-label')];
    samples.push({theme,menu:slots.map(node=>({slot:node.getBoundingClientRect().toJSON(),icon:node.firstElementChild?.getBoundingClientRect().toJSON(),row:node.parentElement.getBoundingClientRect().toJSON(),display:getComputedStyle(node.parentElement).display,html:node.outerHTML,label_left:node.nextElementSibling.getBoundingClientRect().left}))});persist();
    assert(slots.length>=3&&slots.every(node=>Math.abs(node.getBoundingClientRect().width-26)<1&&Math.abs(node.getBoundingClientRect().height-16)<1),'TC-workspace-menu: '+name+'单一26px勾选槽位');
    assert(slots.every(node=>{const slot=node.getBoundingClientRect(),icon=node.firstElementChild.getBoundingClientRect(),row=node.parentElement.getBoundingClientRect();return Math.abs(icon.width-16)<1&&Math.abs(icon.height-16)<1&&Math.abs(icon.top+icon.height/2-row.top-row.height/2)<1&&getComputedStyle(node.parentElement).display==='flex';}),'TC-workspace-menu: '+name+'实际图标和文字行内居中');
    assert(labels.every(node=>Math.abs(node.getBoundingClientRect().left-labels[0].getBoundingClientRect().left)<1),'TC-workspace-menu: '+name+'功能菜单文字对齐');
    assert(labels.every((node,index)=>Math.abs(node.getBoundingClientRect().left-slots[index].getBoundingClientRect().right)<1&&Math.abs(node.getBoundingClientRect().left-node.parentElement.getBoundingClientRect().left-26)<1&&Math.abs(node.parentElement.getBoundingClientRect().height-24)<1),'TC-workspace-menu: '+name+'文字紧接勾选槽且24px行高，无额外原生留白');
    fs.writeFileSync(base+'/capture_request.json',JSON.stringify({stage:'stability_'+name}));
    await wait(()=>{try{return JSON.parse(fs.readFileSync(base+'/capture_done.json','utf8').replace(/^\uFEFF/,'' )).stage==='stability_'+name;}catch{return false;}},'screenshot');
    menu.hide?.();menu.close?.();menu=null;
    const branch_button=document.querySelector('[data-git-status="branch"]');
    await wait(()=>branch_button&&!branch_button.disabled&&branch_button.closest('[data-repository="ready"]'),'Git底栏准备');
    branch_button.click();await wait(()=>document.querySelectorAll('.git-branch-picker [data-checkout-id]').length>=6,'分支快速选择器');
    const picker=document.querySelector('.git-branch-picker'),filter=picker.querySelector('input');
    assert(document.activeElement===filter&&picker.getBoundingClientRect().top===6,'TC-git-checkout-native: '+name+'底栏打开顶部输入焦点');
    assert(picker.querySelector('[data-checkout-id="refs/tags/release/native"]')?.textContent.includes('Native QA'),'TC-git-checkout-native: '+name+'标签读取实际作者与剥离提交');
    const checkout_rows=[...picker.querySelectorAll('[data-checkout-id]')];
    assert(checkout_rows.every(row=>Math.abs(row.getBoundingClientRect().height-(row.classList.contains('has-detail')?44:22))<1),'TC-git-checkout-native: '+name+'真实宿主22/44px行高');
    assert([...picker.querySelectorAll('.git-branch-detail')].every(node=>getComputedStyle(node).textAlign==='left'&&Math.abs(node.getBoundingClientRect().left+parseFloat(getComputedStyle(node).paddingLeft)-node.parentElement.querySelector('.git-scm-ref-label').getBoundingClientRect().left)<1),'TC-git-checkout-native: '+name+'详情与名称同起点');
    samples.push({checkout:{theme,width:picker.getBoundingClientRect().width,top:picker.getBoundingClientRect().top,rows:checkout_rows.map(row=>({label:row.textContent,height:row.getBoundingClientRect().height}))}});
    fs.writeFileSync(base+'/capture_request.json',JSON.stringify({stage:'checkout_'+name}));
    await wait(()=>{try{return JSON.parse(fs.readFileSync(base+'/capture_done.json','utf8').replace(/^\uFEFF/,'' )).stage==='checkout_'+name;}catch{return false;}},'checkout screenshot');
    filter.value='topic/native';filter.dispatchEvent(new Event('input',{bubbles:true}));
    assert(picker.querySelector('[data-checkout-id]')?.dataset.checkoutId==='refs/heads/topic/native','TC-git-checkout-native: '+name+'搜索匹配优先且不打开旧右键菜单');
    for(const type of ['keydown','keyup'])filter.dispatchEvent(new KeyboardEvent(type,{key:'Escape',bubbles:true,cancelable:true}));
    await wait(()=>!document.querySelector('.git-branch-picker'),'取消分支选择');
    core.app.commands.run('linux_note:source_control');
    await wait(()=>document.querySelectorAll('.git-scm-file').length>=60&&document.querySelector('.git-scm-groups')?.getBoundingClientRect().height>0,'SCM滚动列表');await pause(150);
    const scroll_nodes=[document.querySelector('.git-scm-groups'),document.querySelector('.git-scm-history-list'),document.querySelector('content')];
    const scroll_samples=scroll_nodes.map(node=>({name:node.className,bar:getComputedStyle(node,'::-webkit-scrollbar').width,radius:getComputedStyle(node,'::-webkit-scrollbar-thumb').borderRadius,color:getComputedStyle(node,'::-webkit-scrollbar-thumb').backgroundColor,standard_width:getComputedStyle(node).scrollbarWidth,standard_color:getComputedStyle(node).scrollbarColor}));
    samples.push({scrollbars:{theme,values:scroll_samples}});persist();
    assert(scroll_samples.every(item=>item.bar==='8px'&&item.radius==='4px'&&item.standard_width==='auto'&&item.standard_color==='auto'),'TC-scrollbars-native: '+name+'SCM/历史/正文共同8px/4px且标准样式不绕过绘制');
    const scroll_group=scroll_nodes[0];scroll_group.scrollTop=100;
    assert(scroll_group.scrollTop===100,'TC-scrollbars-native: '+name+'真实SCM列表仍可滚动');scroll_group.scrollTop=0;
    const mini=document.querySelector('.linux-note-reading-minimap-viewport');
    assert(mini&&getComputedStyle(mini).borderRadius==='4px','TC-scrollbars-native: '+name+'阅读缩略图共享圆角');
    fs.writeFileSync(base+'/capture_request.json',JSON.stringify({stage:'scrollbars_'+name}));
    await wait(()=>{try{return JSON.parse(fs.readFileSync(base+'/capture_done.json','utf8').replace(/^\uFEFF/,'')).stage==='scrollbars_'+name;}catch{return false;}},'scrollbars screenshot');
    core.app.commands.run('linux_note:git_graph');
    await wait(()=>active().view?.panel?.state&&document.querySelectorAll('.git-graph-column-resize').length===3,'Graph列宽入口');await pause(120);
    const columns_panel=active().view.panel;
    const column_rect=key=>columns_panel.header.querySelector('.git-graph-column-'+key).getBoundingClientRect();
    assert([...columns_panel.header.querySelectorAll('.git-graph-column-resize')].every(node=>Math.abs(Number(node.getAttribute('aria-valuenow'))-node.parentElement.getBoundingClientRect().width)<1),'TC-columns-native: '+name+'初始无障碍列宽对应实际布局');
    for(const [left,right]of [['subject','date'],['date','author'],['author','hash']])for(const step of [-10,10]){
     const control=columns_panel.header.querySelector('[data-left-column='+left+']'),left_before=column_rect(left),right_before=column_rect(right);
     control.focus();control.dispatchEvent(new KeyboardEvent('keydown',{key:step<0?'ArrowLeft':'ArrowRight',bubbles:true,cancelable:true}));
     const left_after=column_rect(left),right_after=column_rect(right);
     assert(Math.abs(left_after.right-left_before.right-step)<1&&Math.abs(left_after.width-left_before.width-step)<1&&Math.abs(right_after.width-right_before.width+step)<1,'TC-columns-native: '+name+' '+left+'/'+right+'边界同向、相邻宽度守恒 '+step);
    }
    const hash_control=columns_panel.header.querySelector('[data-right-column=hash]');hash_control.focus();
    hash_control.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,bubbles:true,cancelable:true}));
    assert(Math.abs(column_rect('hash').width-130)<1,'TC-columns-native: '+name+'哈希列实际扩宽至130px');
    samples.push({columns:{theme,values:['subject','date','author','hash'].map(key=>({key,rect:column_rect(key).toJSON()}))}});
    fs.writeFileSync(base+'/capture_request.json',JSON.stringify({stage:'columns_'+name}));
    await wait(()=>{try{return JSON.parse(fs.readFileSync(base+'/capture_done.json','utf8').replace(/^\uFEFF/,'')).stage==='columns_'+name;}catch{return false;}},'columns screenshot');
    hash_control.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true,cancelable:true}));
    await files.open_file(navigation);await wait(()=>active().view?.panel!==columns_panel&&File.bundle.filePath===navigation,'恢复阅读标签');
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
