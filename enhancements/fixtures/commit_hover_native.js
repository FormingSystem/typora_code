// 原始宿主隔离副本：真实SCM/Git读取，renderer事件，非物理输入。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),cp=reqnode('child_process'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(await fn())return;await pause(40);}throw Error('timeout '+label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);fs.writeFileSync(path.join(base,'progress.json'),JSON.stringify({checks,samples},null,2),'utf8');};
 const core=window[Symbol.for('typora-code:workspace')];
 const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 try{
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  await wait(()=>File.bundle.filePath.endsWith('front.md')&&!File.isFileLoading(),'startup');await pause(1000);
  const before=digest(path.join(root,'front.md'));
  const message='fix(workspace): 恢复目录文件会话\n\n- **切换目录**恢复各自上次打开的文件\n- 保持 `main` 状态和文件顺序\n- [设计说明](https://example.com/doc)\n\n<img src=x onerror=alert(1)>\n\n![禁用图片](https://example.com/tracker.png)';
  fs.writeFileSync(path.join(base,'message.txt'),message,'utf8');
  cp.execFileSync('git',['-C',root,'-c','user.name=Native QA','-c','user.email=native@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=.git/unused_hooks','commit','--allow-empty','-F',path.join(base,'message.txt')],{windowsHide:true});
  cp.execFileSync('git',['-C',root,'remote','add','origin','git@gitee.com:fixture/hosted-repo.git'],{windowsHide:true});
  const opened_urls=[],shell=reqnode('electron').shell,original_open=shell.openExternal;
  shell.openExternal=async url=>{opened_urls.push(url);};
  core.app.commands.run('linux_note:source_control');
  await wait(()=>[...document.querySelectorAll('.git-scm-history-commit')].some(n=>n.textContent.includes('恢复目录文件会话')),'SCM commit');
  for(const [theme,name]of [['github.css','light'],['night.css','dark']]){
   await JSBridge.invoke('setting.setCurTheme',theme,name==='dark'?'Night':'Github');
   File.setTheme(theme);await pause(350);document.querySelector('#ty-suppress-mode-warning-close-btn')?.click();
   samples.push({theme_probe:theme,href:document.querySelector('#theme_css')?.href,body:getComputedStyle(document.body).backgroundColor,html:getComputedStyle(document.documentElement).backgroundColor,actual:document.documentElement.dataset.workspaceFileIconTheme});
   await wait(()=>document.documentElement.dataset.workspaceFileIconTheme===name,'actual theme '+name);
   for(const zoom of [1,1.25]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(300);
    const row=[...document.querySelectorAll('.git-scm-history-commit')].find(n=>n.textContent.includes('恢复目录文件会话'));
    row.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));
    await wait(()=>document.querySelector('.git-commit-hover-message>div')?.shadowRoot.querySelectorAll('li').length===3,'rendered Markdown');
    const tip=document.querySelector('.git-commit-hover'),host=tip.querySelector('.git-commit-hover-message>div'),body=host.shadowRoot;
    assert(body.querySelector('strong')?.textContent==='切换目录',name+'/'+zoom+' 强调和列表由真实Git正文渲染');
    assert(!body.querySelector('img,script,[onerror]'),name+'/'+zoom+' 原生正文无图片加载或可执行HTML');
    assert(getComputedStyle(body.querySelector('li')).fontSize==='12px'&&getComputedStyle(body.querySelector('li')).lineHeight==='19px',name+'/'+zoom+' 12px/19px且不受正文主题污染');
    const list_padding=getComputedStyle(body.querySelector('ul')).paddingLeft;
    assert(Math.abs(parseFloat(list_padding)-20)<.01,name+'/'+zoom+' 20px列表缩进，实际 '+list_padding);
    const web=tip.querySelector('.git-commit-hover-web'),copy=tip.querySelector('.git-commit-hover-copy');
    assert(web?.textContent==='在 Gitee 上打开',name+'/'+zoom+' 真实Git远端识别Gitee');
    const copy_box=copy.getBoundingClientRect(),web_box=web.getBoundingClientRect();
    assert(Math.abs(copy_box.top-web_box.top)<1&&web_box.left>=copy_box.right,name+'/'+zoom+' 哈希和托管操作同一行且不重叠');
    const count=opened_urls.length;web.click();web.click();
    await wait(()=>opened_urls.length===count+1,'一次网页打开');
    assert(opened_urls.at(-1)==='https://gitee.com/fixture/hosted-repo/commit/'+row.dataset.hash,name+'/'+zoom+' 真实runner与浏览器边界收到完整提交网页');
    const box=tip.getBoundingClientRect();assert(box.right<=innerWidth&&box.bottom<=innerHeight&&tip.scrollWidth<=tip.clientWidth+1,name+'/'+zoom+' 浮层未越界/横向溢出');
    samples.push({theme,actual_theme:document.documentElement.dataset.workspaceFileIconTheme,zoom,actual_zoom:reqnode('electron').webFrame.getZoomFactor(),background:getComputedStyle(tip).backgroundColor,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,box:box.toJSON(),lines:[...body.querySelectorAll('li')].map(n=>n.getBoundingClientRect().toJSON()),input:'renderer PointerEvent + actual native SCM/Git'});
    const stage='commit_hover_'+name+'_'+String(zoom).replace('.','_');
    fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}),'utf8');
    await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage===stage}catch{return false}},'capture');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause(100);
   }
  }
  shell.openExternal=original_open;
  assert(digest(path.join(root,'front.md'))===before&&!File.changeCounter.isDocumentEdited(),'原正文和dirty状态保持');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2),'utf8');}
})();
