// 正式构建、原始Typora独立副本；只操作运行器创建的临时文档。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<400;i++){if(fn())return;await pause(50);}throw Error(label);};
 const source=path.join(base,'workspace/links.md'),target=path.join(base,'workspace/target.md');
 const text='# Links\n\n[目标](target.md#目标标题)\n\n[引用][ref]\n\n[ref]: target.md#目标标题\n';
 fs.writeFileSync(source,text);fs.writeFileSync(target,'# 起点\n\n'+Array.from({length:30},(_,i)=>'段落'+i+' '+ 'reading anchor long paragraph content '.repeat(40)+'\n\n').join('')+'## 目标标题\n\n**目标正文**\n');
 try{
  await pause(2400);await files.open_file(source);await wait(()=>document.querySelector('#write a[href],#write a[data-ref]'),'原生链接未出现');await pause(500);
  const source_leaf=core.app.workspace.activeLeaf;
  assert(!document.querySelector('.linux-note-workspace-search'),'首次选择前未打开搜索侧栏');
  const select=()=>{const link=(File.bundle.filePath===source?document.querySelector('#write a[href]'):source_leaf.view.containerEl.querySelector('a[href],a[data-ref]')),range=document.createRange();range.selectNodeContents(link);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return link;};
  const link=select();
  const sidebar=document.querySelector('.workspace-link-dock');
  await wait(()=>sidebar.querySelector('.workspace-link-preview .workspace-lookup-markdown')?.shadowRoot?.querySelector('.lookup-target-block')?.textContent.includes('目标标题'),'侧栏未定位链接标题');
  assert(core.app.workspace.activeLeaf===source_leaf,'侧栏预览保留来源活动标签');
  assert(getSelection().toString()==='目标','侧栏预览保留原生选区');
  assert(!sidebar.querySelector('.workspace-link-preview [contenteditable=true]'),'侧栏只读');
  const open_menu=async(index)=>{core.app.workspace.activeLeaf=source_leaf.parent.toggleTab(source_leaf.state.path);await wait(()=>File.bundle.filePath===source&&document.querySelector('#write a[href]')||source_leaf.view.containerEl.querySelector('a[href],a[data-ref]'),'来源文档链接尚未恢复');const current=select(),event=new MouseEvent('contextmenu',{bubbles:true,clientX:current.getBoundingClientRect().left,clientY:current.getBoundingClientRect().bottom});if(current.closest('#write')){File.editor.contextMenu.show(event,current);const item=document.querySelector(`[data-key="typora-code-link-preview-${index}"]`);assert(item&&!item.classList.contains('hide'),'原生右键含分屏动作'+index);item.querySelector('a').click();}else{current.dispatchEvent(event);const item=[...document.querySelectorAll('[role=menuitem]')].find(n=>n.textContent.includes(index?'上下分屏':'左右分屏'));assert(item,'阅读栏右键含分屏动作'+index);item.click();}};
  for(let i=0;i<20;i++){
   const direction=i%2;await open_menu(direction);
   await wait(()=>core.app.workspace.activeLeaf.state.path.startsWith('typ://linux_note.link_preview/'),'分屏标签未打开');
   const leaf=core.app.workspace.activeLeaf;
   await wait(()=>leaf.view.containerEl.querySelector('.workspace-lookup-markdown')?.shadowRoot?.textContent.includes('目标正文'),'分屏正文未加载');
   const a=source_leaf.view.containerEl.getBoundingClientRect(),b=leaf.view.containerEl.getBoundingClientRect();
   assert(direction===0?b.left>=a.right-2:b.top>=a.bottom-2,'真实编辑组方向正确'+i);
   assert(!leaf.view.containerEl.querySelector('[contenteditable=true]'),'分屏只读'+i);
   if(i===0){
    for(const [theme,name] of [['github.css','Github'],['night.css','Night'],['cpp_github-consolas.css','Cpp Github Consolas']]){
     await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(250);
     for(const zoom of [1,1.25]){
      reqnode('electron').webFrame.setZoomFactor(zoom);await pause(100);
      const toolbar=leaf.view.containerEl.querySelector('[role=toolbar]'),box=toolbar.getBoundingClientRect();
      assert([...toolbar.querySelectorAll('button')].every(button=>{const b=button.getBoundingClientRect();return b.width>0&&b.left>=box.left-1&&b.right<=box.right+1;}),'主题缩放工具按钮完整 '+name+'/'+zoom);
      samples.push({theme:name,zoom,toolbar:{width:box.width,height:box.height},color:getComputedStyle(toolbar).color});
     }
     if(theme==='github.css'){const stage='link_preview';fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));for(let n=0;n<100;n++){try{if(JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'' )).stage===stage)break;}catch{}await pause(50);}}
    }
    reqnode('electron').webFrame.setZoomFactor(1);await pause(100);
   }
   if(i===0){const button=[...leaf.view.containerEl.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')==='打开源文件');button.click();await wait(()=>files.current_file()===target&&File.bundle.filePath===target&&!File.isFileLoading()&&!button.disabled,'源文件未进入普通编辑器');assert(!core.app.workspace.activeLeaf.state.path.startsWith('typ://linux_note.link_preview'),'源文件入口进入可编辑文档');
    const scroller=document.querySelector('content'),write=document.querySelector('#write');scroller.scrollTop=scroller.scrollHeight/2;await pause(150);
    const box=scroller.getBoundingClientRect(),wb=write.getBoundingClientRect(),point=document.caretRangeFromPoint(wb.left+40,box.top+box.height/3);
    assert(point&&write.contains(point.startContainer)&&point.startContainer.nodeType===3,'原生长段落可捕获字符位置');point.setEnd(point.startContainer,Math.min(point.startContainer.length,point.startOffset+1));const offset=point.getBoundingClientRect().top-box.top;
    const margin=document.querySelector('.linux-note-document-margin input');margin.value='18';margin.dispatchEvent(new Event('input',{bubbles:true}));await pause(150);
    samples.push({anchor_before:offset,anchor_after:point.getBoundingClientRect().top-scroller.getBoundingClientRect().top,scroll:scroller.scrollTop,root_parent:write.parentElement.tagName,margin:margin.value,line_height:getComputedStyle(point.startContainer.parentElement).lineHeight});assert(Math.abs(point.getBoundingClientRect().top-scroller.getBoundingClientRect().top-offset)<3,'原生边距重排保持当前字符');
    reqnode('electron').webFrame.setZoomFactor(1.25);await pause(200);
    assert(Math.abs(point.getBoundingClientRect().top-scroller.getBoundingClientRect().top-offset)<30,'原生窗口缩放仍保留当前文字行');
    reqnode('electron').webFrame.setZoomFactor(1);margin.value='0';margin.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);await files.close_leaf(core.app.workspace.activeLeaf);}
   await files.close_leaf(leaf);await pause(40);
  }
  const previews=[];core.app.workspace.eachLeaves(leaf=>{if(leaf.state.path.startsWith('typ://linux_note.link_preview'))previews.push(leaf);});assert(previews.length===0,'20次关闭无残留预览标签');
  core.app.commands.run('typora_code:settings');await wait(()=>document.querySelector('.workspace-settings-modal'),'设置浮层未打开');
  const modal=document.querySelector('.workspace-settings-modal'),panel=modal.querySelector('.git-graph-dialog');
  assert(![...document.querySelectorAll('.workspace-menu')].some(node=>node.getClientRects().length),'设置出现时没有遗留链接菜单');
  assert(panel.getBoundingClientRect().left<document.querySelector('.typ-workspace-root').getBoundingClientRect().left,'设置浮层跨越资源管理器独立布局');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'settings_modal'}));await pause(300);
  modal.querySelector('[data-settings-maximize]').click();await pause(80);assert(Math.abs(panel.getBoundingClientRect().width-innerWidth+32)<3,'设置最大化保留16px边距');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'settings_maximized'}));await pause(300);
  modal.querySelector('[data-settings-maximize]').click();
  const toggle=modal.querySelector('[data-setting="editor.link_preview_enabled"]');toggle.checked=false;toggle.dispatchEvent(new Event('change'));assert(sidebar.hidden,'关闭自动链接预览立即隐藏阅读dock');
  const wrap=modal.querySelector('[data-setting="editor.wrap_tabs"]');wrap.checked=true;wrap.dispatchEvent(new Event('change'));
  modal.querySelector('.workspace-dialog-close').click();await pause(80);assert(!document.querySelector('.workspace-settings-modal'),'右上关闭释放浮层');
  core.app.commands.run('linux_note:search');await pause(80);assert(document.querySelector('.linux-note-workspace-search'),'自动链接预览关闭不影响搜索侧栏');
  assert(fs.readFileSync(source,'utf8')===text,'来源磁盘正文不变');
  samples.push({viewport:{width:innerWidth,height:innerHeight,dpi:devicePixelRatio,zoom:reqnode('electron').webFrame.getZoomFactor()},asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(_options.userDataPath,'typora_code/workbench.js'))).digest('hex')});
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,iterations:20,limits:'原生renderer选区/菜单；物理鼠标、其他系统及远端网页登录未覆盖'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,debug:{file:File.bundle.filePath,active:core.app.workspace.activeLeaf?.state.path,links:[...document.querySelectorAll('#write a')].map(a=>a.outerHTML),leaves:(()=>{const x=[];core.app.workspace.eachLeaves(l=>{x.push({path:l.state.path,visible:l.view.containerEl.getBoundingClientRect().width,mode:l.view.isEditor?.(),classes:l.view.containerEl.className,children:l.view.containerEl.children.length})});return x;})()}},null,2));}
})();
