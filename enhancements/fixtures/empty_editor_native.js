// 专属原始宿主副本：从真实菜单/关闭按钮和文件服务验证最后一个文档。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(await fn())return;await pause(30);}throw Error('timeout '+label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify(checks,null,2),'utf8');};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const leaves=()=>{const result=[];core.app.workspace.eachLeaves(leaf=>{result.push(leaf);});return result;};
 const active=()=>core.app.workspace.activeLeaf;
 const blank=()=>leaves().length===1&&active().state.path.startsWith('typ://core.empty/');
 const rows=()=>[...document.querySelectorAll('.workspace-explorer-open-row')];
 const stable=()=>!File.isFileLoading()&&!File._onFileSwitching;
 const opened=async file=>{await files.open_file(file);await wait(()=>files.current_file()===file&&stable()&&!files.editor_state(active()).busy,'open '+file);await pause(80);};
 const close_button=async()=>{const row=document.querySelector('.workspace-explorer-open-row.is-active [aria-label="关闭"]');if(!row)throw Error('missing actual close button');row.click();await wait(blank,'last editor closes');await pause(100);};
 try{
  reqnode(path.join(window._options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  await wait(()=>File.bundle.filePath?.endsWith('front.md')&&stable(),'initial');await pause(500);core.app.commands.run('linux_note:file_explorer');await wait(()=>rows().length===1,'Explorer');
  const front=path.join(root,'front.md'),original=fs.readFileSync(front,'utf8');
  await close_button();assert(rows().length===0,'最后一个Markdown关闭后没有New tab假文件');
  assert(document.querySelector('.workspace-explorer-opened-list').getBoundingClientRect().height===0,'默认空列表保留标题但不占文件行');
  assert(!document.querySelector('.workspace-timeline-target')?.textContent,'未固定时间线清除上一个文件');
  assert(getComputedStyle(document.querySelector('#footer-word-count')).display==='none','空编辑区不显示上一个文件的字数');
  const empty=active();for(let i=0;i<20;i++)core.app.commands.run('linux_note:close_editor');await pause(100);
  assert(active()===empty&&blank()&&rows().length===0,'20次关闭空编辑区不会创建假文件或替换占位身份');
  fs.writeFileSync(front,original+'\n重新打开必须读到磁盘版本\n','utf8');await opened(front);
  assert(rows().length===1&&File.editor.getMarkdown().includes('重新打开必须读到磁盘版本'),'关闭后同路径可重新打开并读取实际文件');
  assert(getComputedStyle(document.querySelector('#footer-word-count')).display!=='none','重新打开Markdown恢复当前文档状态');
  File.reloadContent(original+'\n未保存草稿\n',{delayRefresh:false,skipChangeCount:false,skipStore:true});if(!File.changeCounter.isDocumentEdited())File.updateChangeCount(File.ChangeType.NSChangeDone);
  document.querySelector('.workspace-explorer-open-row.is-active [aria-label="关闭"]').click();await wait(()=>document.querySelector('[data-workspace-tab-close]'),'dirty close');document.querySelector('[data-workspace-tab-close] .git-graph-dialog-footer').lastElementChild.click();await pause(60);
  assert(!blank()&&File.changeCounter.isDocumentEdited()&&File.editor.getMarkdown().includes('未保存草稿'),'取消关闭最后文档保留草稿和真实文件行');
  document.querySelector('.workspace-explorer-open-row.is-active [aria-label="关闭"]').click();await wait(()=>document.querySelector('[data-workspace-tab-close]'),'save close');[...document.querySelectorAll('[data-workspace-tab-close] button')].find(button=>button.textContent==='保存并关闭').click();await wait(blank,'saved close');await pause(100);
  assert(fs.readFileSync(front,'utf8').includes('未保存草稿')&&rows().length===0,'最后文档保存并关闭后无假文件且草稿写入原路径');
  await opened(front);const renamed=await files.rename_file(root,front,'renamed.md');await wait(()=>files.current_file()===renamed&&stable(),'rename');
  assert(!fs.existsSync(front)&&fs.existsSync(renamed)&&File.bundle.filePath===renamed,'最后一个Markdown改名同步磁盘、标签和宿主路径');
  await wait(()=>document.querySelector('.workspace-explorer-row[data-path="'+CSS.escape(renamed)+'"]'),'renamed row');
  const tree_row=document.querySelector('.workspace-explorer-row[data-path="'+CSS.escape(renamed)+'"]');tree_row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:180,clientY:230}));await wait(()=>document.querySelector('.git-graph-menu'),'file menu');[...document.querySelectorAll('.git-graph-menu [role=menuitem]')].find(node=>node.textContent.includes('删除')).click();await wait(()=>document.querySelector('[aria-label="删除"]'),'delete confirm');
  [...document.querySelectorAll('[aria-label="删除"] button')].find(node=>node.textContent==='取消').click();assert(fs.existsSync(renamed)&&files.current_file()===renamed,'取消删除保留最后文件和编辑器');
  tree_row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:180,clientY:230}));await wait(()=>document.querySelector('.git-graph-menu'),'file menu again');[...document.querySelectorAll('.git-graph-menu [role=menuitem]')].find(node=>node.textContent.includes('删除')).click();await wait(()=>document.querySelector('[aria-label="删除"]'),'delete confirm again');[...document.querySelectorAll('[aria-label="删除"] button')].find(node=>node.textContent==='移到回收站').click();await wait(()=>!fs.existsSync(renamed)&&blank(),'trash');await pause(150);
  assert(rows().length===0&&!document.querySelector('.workspace-explorer-row[data-path="'+CSS.escape(renamed)+'"]'),'确认回收最后Markdown实际删除文件并清理列表');
  const source=path.join(root,'only.ts');fs.writeFileSync(source,'const keep = 1;\n','utf8');await opened(source);await wait(()=>active().view.loaded,'source ready');const moved=await files.rename_file(root,source,'only-renamed.ts');await wait(()=>files.current_file()===moved,'source rename');await files.trash_entries(root,[moved]);await wait(blank,'source trash');await pause(100);
  assert(!fs.existsSync(moved)&&rows().length===0,'最后源码文件改名和回收不依赖其他标签');
  assert(!File.bundle.filePath&&!File.changeCounter.isDocumentEdited(),"回收后原生空缓冲区没有隐藏草稿");fs.writeFileSync(front,original,'utf8');for(let i=0;i<20;i++){await opened(front);await close_button();assert(rows().length===0,'原生打开关闭循环 '+(i+1));}
  assert(fs.readFileSync(front,'utf8')===original,'循环不修改文件内容');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',requirement:'R052',checks,input:'原始Typora 1.14.10私有桌面；renderer事件和宿主接口，非物理输入'},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error.stack),native_text:File.editor.getMarkdown(),native_path:File.bundle.filePath,native_dirty:File.changeCounter.isDocumentEdited(),rows:rows().length,leaves:leaves().map(leaf=>leaf.state.path)},null,2),'utf8');}
})();