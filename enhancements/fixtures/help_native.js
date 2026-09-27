// 原始宿主隔离副本：检查原生帮助的真实文件、关于界面和菜单路由。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],calls=[],samples=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 if(File.bundle.filePath!==path.join(base,'workspace/front.md'))return;
 const original_invoke=JSBridge.invoke,original_browser=JSBridge.showInBrowser;
 const close=()=>window.dispatchEvent(new Event('workspace-titlebar-dismiss'));
 const open=async()=>{close();[...document.querySelectorAll('.workspace-titlebar-menu>button')].find(n=>n.textContent==='帮助').click();await pause(90);return document.querySelector('.workspace-titlebar-popup');};
 try{
  for(let i=0;i<200&&!fs.existsSync(path.join(base,'window_bounds_ready.json'));i++)await pause(30);
  const text=fs.readFileSync(path.join(base,'workspace/front.md'),'utf8'),dirty=File.isDirty;
  const labels=["What's New...",'Quick Start','Markdown Reference','Install and Use Pandoc','Custom Themes','Use Images in Typora','Data Recovery and Version Control','More Topics...','鸣谢','更新日志','隐私条款','官方网站','反馈','检查更新...','我的许可证...','关于','检查 Typora Code 更新…','Typora Code GitHub 仓库'];
  for(const theme of ['cpp_github-consolas_light.css','cpp_github-consolas_dark.css']){
   await original_invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(450);
   for(const width of [1280,720]){
    window.resizeTo(width,850);await pause(150);const menu=await open();const rows=[...menu.querySelectorAll('button')];
    assert(JSON.stringify(rows.map(n=>n.querySelector('.workspace-titlebar-label').textContent))===JSON.stringify(labels),'全部原生条目 '+theme+'/'+width);
    assert(rows.every(n=>!n.disabled),'全部原生端口可用');assert(menu.querySelectorAll('hr,[role=separator]').length===4,'原生分组和项目独立分组');
    assert(menu.scrollWidth<=menu.clientWidth,'无水平文字溢出');rows.at(-1).focus();rows.at(-1).scrollIntoView({block:'nearest'});assert(rows.at(-1).getBoundingClientRect().bottom<=innerHeight,'底部菜单可滚动到达');
    samples.push({theme,width,labels:rows.map(n=>n.textContent)});close();
   }
  }
  JSBridge.invoke=async(name,...args)=>{calls.push([name,...args]);};JSBridge.showInBrowser=url=>calls.push(['browser',url]);
  for(const label of labels.filter(n=>n!=='关于'&&!n.startsWith('检查 Typora Code'))){const menu=await open();[...menu.querySelectorAll('button')].find(n=>n.querySelector('.workspace-titlebar-label').textContent===label).click();await pause(15);assert(!document.querySelector('.workspace-titlebar-popup'),'点击后关闭 '+label);}
  assert(calls.length===16,'每项单次分发');
  for(const call of calls.filter(c=>c[0]==='app.openFile'))assert(fs.existsSync(call[1])&&call[2].forceCreateWindow,'原生Docs实际存在 '+path.basename(call[1]));
  assert(calls.some(c=>c[0]==='updater.checkForUpdates')&&calls.some(c=>c[0]==='license.show'),'更新与许可交给宿主IPC');
  JSBridge.invoke=original_invoke;JSBridge.showInBrowser=original_browser;
  const menu=await open();[...menu.querySelectorAll('button')].find(n=>n.textContent==='关于').click();await pause(250);
  const about=document.querySelector('#megamenu-section-about');assert(about.getBoundingClientRect().height>0&&getComputedStyle(about).display!=='none','实际原生关于面板可见');File.megaMenu.hide();await pause(100);
  assert(File.isDirty===dirty&&fs.readFileSync(path.join(base,'workspace/front.md'),'utf8')===text,'当前文档和dirty不变');
  window.resizeTo(1280,850);await pause(150);await open();fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'native_help_dark'}));await pause(500);close();
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,calls,samples,limits:'Docs路由及实际文件已核对；更新/许可/外部浏览器用桥接记录，未调用在线服务或更改许可。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,calls,error:String(error.stack||error),html:document.querySelector('.workspace-titlebar-popup')?.outerHTML},null,2));}
 finally{JSBridge.invoke=original_invoke;JSBridge.showInBrowser=original_browser;}
})();
