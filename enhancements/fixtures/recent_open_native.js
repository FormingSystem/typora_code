// 仅在原始宿主独立副本运行；所有删除对象由本夹具在专属目录新建。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(await fn())return;await pause(30);}throw Error('timeout '+label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const picker=()=>document.querySelector('.workspace-recent-open'),history=()=>JSBridge.invoke('setting.getRecentFiles');
 const open=async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',ctrlKey:true,bubbles:true,cancelable:true}));await wait(()=>picker()&&!picker().hidden&&picker().querySelector('.workspace-recent-row'),'Ctrl+R');};
 const query=value=>{const input=picker().querySelector('input');input.value=value;input.dispatchEvent(new Event('input'));return input;};
 const escape=async()=>{for(const type of ['keydown','keyup'])picker().querySelector('input').dispatchEvent(new KeyboardEvent(type,{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));await wait(()=>picker().hidden,'Escape');};
 const top_menu=async()=>{
  [...document.querySelectorAll('.workspace-titlebar-menu button')].find(node=>node.textContent==='文件').click();
  await wait(()=>[...document.querySelectorAll('.workspace-titlebar-label')].some(node=>node.textContent==='打开最近'),'file menu');
  [...document.querySelectorAll('.workspace-titlebar-label')].find(node=>node.textContent==='打开最近').parentElement.click();await pause(50);
 };
 try{
  reqnode(path.join(window._options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const front=path.join(root,'front.md'),gone=path.join(root,'recent-gone.md'),gone_folder=path.join(root,'recent-gone-folder'),target=path.join(base,'recent-target');
  await wait(()=>files.current_file()===front&&!File.isFileLoading(),'initial');await pause(400);const original=File.editor.getMarkdown();
  await JSBridge.invoke("setting.put","restoreWhenLaunch",2);
  fs.writeFileSync(gone,'# 最近打开测试\n','utf8');fs.mkdirSync(gone_folder);fs.mkdirSync(target);
  await files.open_file(gone);await wait(()=>files.current_file()===gone&&!File.isFileLoading(),'open history file');await pause(150);
  await files.open_file(front);await wait(()=>files.current_file()===front&&!File.isFileLoading(),'return original');
  await JSBridge.invoke('setting.addRecentFolder',gone_folder);await JSBridge.invoke('setting.addRecentFolder',target);
  assert((await history()).files.some(item=>item.path===gone),'原生打开文件实际进入宿主最近历史');
  fs.unlinkSync(gone);fs.rmdirSync(gone_folder);
  await open();query('recent-gone-folder');assert(picker().querySelectorAll('.workspace-recent-row').length===1,'删除目录仍可定位为一条历史');picker().querySelector('.workspace-recent-target').click();
  await wait(async()=>!(await history()).folders.some(item=>item.path===gone_folder),'persist folder removal');
  await wait(()=>!picker().querySelector('.workspace-recent-row'),'refresh missing folder');await escape();
  assert(files.context_root()===root&&files.current_file()===front,'删除目录选择不切换工作区或清空当前文件');
  await open();query('recent-gone.md');picker().querySelector('.workspace-recent-target').click();
  await wait(async()=>!(await history()).files.some(item=>item.path===gone),'persist file removal');await wait(()=>!picker().querySelector('.workspace-recent-row'),'refresh missing file');await escape();
  assert(File.editor.getMarkdown()===original,'失效最近文件不覆盖当前正文');
  for(let i=0;i<20;i++){await open();query('recent-gone');assert(!picker().querySelector('.workspace-recent-row'),'连续重读不恢复失效历史 '+(i+1));await escape();}
  await open();assert(picker().getBoundingClientRect().width===600,'原生主题QuickPick600px');assert(picker().querySelector('.workspace-recent-row').getBoundingClientRect().height===22,'原生主题最近项目22px');query('recent-target');picker().querySelector('.workspace-recent-target').click();
  await wait(()=>files.context_root()===target&&picker().hidden,'shared workspace switch');
  await core.app.commands.run('linux_note:open_folder_path',[root]);await wait(()=>files.context_root()===root&&files.current_file()===front&&!File.isFileLoading(),'restore source workspace session');
  await top_menu();assert([...document.querySelectorAll('.workspace-titlebar-label')].some(node=>node.textContent===root),'正式菜单展示完整目录路径');
  [...document.querySelectorAll('.workspace-titlebar-label')].find(node=>node.textContent==='清空最近打开记录…').parentElement.click();await pause(50);
  [...document.querySelectorAll('.git-graph-dialog-footer button')].find(node=>node.textContent==='取消').click();assert((await history()).folders.length>0,'清空取消保留宿主记录');
  await top_menu();[...document.querySelectorAll('.workspace-titlebar-label')].find(node=>node.textContent==='清空最近打开记录…').parentElement.click();await pause(50);
  [...document.querySelectorAll('.git-graph-dialog-footer button')].find(node=>node.textContent==='清空记录').click();
  await wait(async()=>{const data=await history();return !data.files.length&&!data.folders.length;},'clear persisted all groups');
  assert(fs.readFileSync(front,'utf8').includes('原文必须保持')&&files.current_file()===front&&files.context_root()===root,'清空历史保留磁盘/编辑器/工作区');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',requirements:['R059'],checks,input:'原始Typora1.14.10私有桌面，真实菜单/主进程存储/候选；renderer合成键盘及点击，非物理操作'},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error.stack),html:picker()?.outerHTML},null,2),'utf8');}
})();
