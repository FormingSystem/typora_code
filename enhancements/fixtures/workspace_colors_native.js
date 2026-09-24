// 原始Typora独立副本；验证正式颜色资产，不修改用户桌面/偏好。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error(label);};
 const color=selector=>{const el=typeof selector==='string'?document.querySelector(selector):selector;if(!el)throw Error('缺少 '+selector);const s=getComputedStyle(el);return{bg:s.backgroundColor,fg:s.color,border:s.borderTopColor,rect:el.getBoundingClientRect().toJSON()};};
 const capture=async stage=>{fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));await pause(350);};
 const file=path.join(base,'workspace/colors.md'),text='# 工作台颜色与阅读\n\n正文使用共享明暗主题，标题层级清晰。\n\n> 引用说明\n\n| 项目 | 值 |\n| --- | --- |\n| 正文 | `代码` |\n\n## 模块分隔\n\n- 侧栏与工作内容\n- 终端与正文\n- 设置与浮层\n\n```js\nconsole.log("主题保持");\n```\n';
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口准备超时');await pause(800);
  fs.writeFileSync(file,text);await files.open_file(file);await wait(()=>File.bundle.filePath===file&&!File.isFileLoading(),'文档未打开');await pause(200);
  core.app.commands.run('linux_note:terminal_toggle');await wait(()=>document.querySelector('.linux-note-terminal')?.dataset.state==='running','终端未启动');await pause(300);
  const terminal=document.querySelector('.linux-note-terminal'),sidebar=core.app.workspace.sidebar;
  for(const [theme,name,mode]of [['cpp_github-consolas.css','Cpp Github Consolas','light'],['night.css','Night','dark']]){
   await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(800);document.querySelector('#ty-suppress-mode-warning-close-btn')?.click();
   assert(document.documentElement.dataset.workspaceColors===mode,'宿主实际主题 '+mode);
   const chrome=mode==='light'?'rgb(250, 250, 253)':'rgb(25, 26, 27)',content=mode==='light'?'rgb(255, 255, 255)':'rgb(18, 19, 20)';
   const entry={mode,body:color(document.body),write:color('#write'),panels:[]};samples.push(entry);
   entry.heading=color('#write h1');entry.paragraph=color('#write p');entry.quote=color('#write blockquote');
   assert(entry.write.bg===content,'正文编辑器背景 '+mode);
   assert(entry.heading.fg===(mode==='light'?'rgb(0, 105, 204)':'rgb(187, 190, 191)')&&(mode==='light'?entry.heading.fg!==entry.paragraph.fg:entry.heading.fg===entry.paragraph.fg),'明暗标题前景规则 '+mode);
   assert(getComputedStyle(document.querySelector('#write h1')).fontWeight==='600','标题字重 '+mode);
   assert(entry.quote.bg===(mode==='light'?'rgb(234, 234, 234)':'rgb(36, 37, 38)'),'引用背景角色 '+mode);
   for(const id of ['core.file-explorer','core.search','core.outline','linux_note:source_control','typora_code:community_plugins','typora_code:remote_ssh']){
    const button=document.querySelector('.typ-ribbon-item[data-id="'+id+'"]');assert(button,'活动栏入口 '+id);
    if(id==='core.file-explorer')core.app.commands.run('linux_note:file_explorer');else button.click();await pause(450);const panel=sidebar.activePanel;assert(panel&&sidebar.isShown,'点击入口展开 '+id);
    const target=panel.containerEl,paint=target.querySelector('.linux-note-workspace-explorer,.linux-note-workspace-search,.linux-note-git-source-control,.workspace-community-manager,.workspace-ssh-sidebar')||target;
    const computed=color(paint);let surface=paint;while(color(surface).bg==='rgba(0, 0, 0, 0)'&&surface.parentElement)surface=surface.parentElement;
    computed.painted_background=color(surface).bg;entry.panels.push({id,...computed});
    assert(computed.painted_background===chrome,'面板框架背景 '+mode+' '+id+' '+computed.painted_background);
    assert(target.getBoundingClientRect().width>100,'真实连接面板 '+id);
    await wait(()=>{const r=target.getBoundingClientRect();return target.contains(document.elementFromPoint(r.left+r.width/2,r.top+Math.min(150,r.height/2)));},'实际可见命中 '+id);assert(true,'实际可见命中 '+id);
   }
   entry.terminal=color(terminal);assert(entry.terminal.bg===chrome&&terminal===document.querySelector('.linux-note-terminal'),'终端主题更新且实例保持 '+mode);
   core.app.commands.run('linux_note:file_explorer');await pause(180);
   entry.tab=color('.workspace-tab-strip');entry.footer=color('footer.ty-footer');
   assert(entry.tab.bg===chrome&&entry.footer.bg===chrome,'标签/底栏框架一致 '+mode);
   await capture('colors_workspace_'+mode);
   core.app.commands.run('typora_code:settings');await wait(()=>document.querySelector('.workspace-settings'),'设置未打开');await pause(150);
   entry.settings=color('.workspace-settings');entry.categories=color('.workspace-settings-categories');entry.dialog=color('.workspace-settings-modal .git-graph-dialog');
   assert(entry.settings.bg===content&&entry.categories.bg===chrome,'设置分类与内容层次 '+mode);
   assert(color('#write').bg===entry.write.bg&&color('#write').fg===entry.write.fg,'打开功能不改正文样式 '+mode);
   await capture('colors_settings_'+mode);
   document.querySelector('.workspace-settings-modal .workspace-dialog-close').click();await pause(120);
   editor.library.refreshMenuVisibility();const trigger=document.querySelector('#sidebar-menu-btn>.sidebar-footer-item');trigger.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));trigger.click();await pause(180);
   const menu=document.getElementById('sidebar-files-menu');entry.menu=color(menu);assert(entry.menu.rect.height>20&&entry.menu.bg===(mode==='light'?'rgb(250, 250, 253)':'rgb(32, 33, 34)'),'原生文件菜单浮层配色 '+mode);
   const first=menu.firstElementChild;let writes=0;const monitor=new MutationObserver(r=>writes+=r.length);monitor.observe(document.documentElement,{attributes:true,attributeFilter:['data-workspace-colors']});await pause(400);monitor.disconnect();
   assert(writes===0&&first===menu.firstElementChild,'静止主题无刷新且菜单节点保持 '+mode);
   await capture('colors_menu_'+mode);document.getElementById('close-sidebar-menu-btn').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));await pause(100);
  }
  for(const theme of ['github.css','newsprint.css','night.css','cpp_github-consolas.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(800);
   const managed=theme==='night.css'||theme==='cpp_github-consolas.css';
   assert(document.documentElement.hasAttribute('data-workspace-colors')===managed,'实际主题范围 '+theme);
   if(!managed){
    const before=color('#write'),heading=color('#write h1');const style=document.createElement('style');style.textContent=':root{--workspace-markdown-heading:rgb(1,2,3)}';document.head.append(style);await pause(60);
    assert(color('#write').bg===before.bg&&color('#write h1').fg===heading.fg,'其他主题不使用自有标题变量 '+theme);style.remove();
   }
   await capture('scope_'+theme.replace('.css',''));
  }
  assert(fs.readFileSync(file,'utf8')===text,'正文磁盘字节不变');core.app.commands.run('linux_note:terminal_kill');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'原始Typora1.14.10、Windows11独立副本；通过宿主命令/合成事件，未现场Win10或物理鼠标验收'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
