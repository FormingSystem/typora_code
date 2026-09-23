// 原始宿主真实底栏节点与当前候选；不修改用户的运行窗口或文档。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],frame=reqnode('electron').webFrame;
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error(label);};
 const front=path.join(base,'workspace/front.md'),original=fs.readFileSync(front,'utf8');
 const command=name=>core.app.commands.run('linux_note:'+name);
 let monitor;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口准备超时');await pause(700);
  const sidebar=core.app.workspace.sidebar,explorer=sidebar.panels.find(panel=>panel.containerEl?.classList.contains('linux-note-workspace-explorer'));
  if(explorer&&sidebar.activePanel!==explorer)sidebar.switch(explorer.constructor);sidebar.show();await pause(200);
  editor.library.refreshMenuVisibility();
  const footer=document.querySelector('footer.ty-footer'),menu=document.getElementById('sidebar-files-menu');
  const trigger=document.querySelector('#sidebar-menu-btn>.sidebar-footer-item');
  // 沿宿主真实委托事件打开；后续主题/缩放仍保留原菜单与监听器。
  trigger.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));trigger.click();await pause(150);
  assert(menu.getBoundingClientRect().height>20,'实际文件操作入口打开原生菜单');
  const first=menu.firstElementChild;let writes=0;
  monitor=new MutationObserver(records=>writes+=records.length);monitor.observe(menu,{attributes:true,attributeFilter:['style']});
  command('terminal_toggle');await wait(()=>document.querySelector('.linux-note-terminal')?.dataset.state==='running','终端未启动');await pause(400);
  for(const [theme,name]of [['night.css','Night'],['cpp_github-consolas.css','Cpp Github Consolas']]){
   await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(700);
   for(const level of [0,1,2,-1]){
    frame.setZoomLevel(level);window.dispatchEvent(new Event('resize'));await pause(750);
    // 宿主自身主题/焦点处理可关闭菜单，重新通过入口打开。
    if(menu.getBoundingClientRect().height<20){trigger.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));trigger.click();await pause(120);}
    assert(menu.getBoundingClientRect().height>20,'菜单保持可见 '+name+' '+level);
    const initial=menu.getBoundingClientRect();writes=0;let drift=0;const timeline=[];
    for(let i=0;i<20;i++){
     await pause(20);const b=menu.getBoundingClientRect();drift=Math.max(drift,Math.abs(b.left-initial.left),Math.abs(b.top-initial.top));timeline.push({x:b.x,y:b.y,anchor:trigger.getBoundingClientRect().toJSON()});
    }
    samples.push({theme:name,level,factor:frame.getZoomFactor(),writes,drift,rect:initial.toJSON(),timeline});
    assert(writes===0&&drift<.05,'原生展开静止无定位写入/漂移 '+name+' '+level);
    assert(menu.firstElementChild===first,'原生菜单节点身份保持 '+name+' '+level);
    assert(initial.top>=35&&initial.left>=3&&initial.right<=innerWidth-3&&initial.bottom<=footer.getBoundingClientRect().top,'原生菜单避开底栏并在视口内 '+name+' '+level);
    assert(menu.contains(document.elementFromPoint(initial.left+initial.width/2,initial.top+20)),'终端不遮挡菜单命中 '+name+' '+level);
   }
  }
  frame.setZoomLevel(0);window.dispatchEvent(new Event('resize'));await pause(120);
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'popup_refresh_menu'}));await pause(300);
  monitor.disconnect();monitor=undefined;
  document.getElementById('close-sidebar-menu-btn')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));await pause(80);
  assert(menu.getBoundingClientRect().height===0,'原生关闭图标关闭菜单');
  for(const [button_id,popup_id]of [['footer-word-count','footer-word-count-info'],['footer-spell-check','spell-check-panel']]){
   const button=document.getElementById(button_id),popup=document.getElementById(popup_id);button.click();await pause(250);
   assert(popup.getBoundingClientRect().height>20,'原生快捷入口展开 '+button_id);
   writes=0;monitor=new MutationObserver(records=>writes+=records.length);monitor.observe(popup,{attributes:true,attributeFilter:['style']});await pause(400);
   assert(writes===0,'同类原生浮层静止无定位写入 '+popup_id);monitor.disconnect();monitor=undefined;
   button.click();await pause(80);assert(popup.getBoundingClientRect().height===0,'同类原生入口关闭 '+popup_id);
  }
  command('terminal_kill');
  assert(fs.readFileSync(front,'utf8')===original,'正文磁盘不变');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'原始Typora1.14.10/本机Windows11；宿主事件合成触发，未到场Win10及其他电脑需现场确认'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
 finally{monitor?.disconnect();}
})();
