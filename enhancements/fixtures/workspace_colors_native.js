// 原始Typora独立副本；验证正式颜色资产，不修改用户桌面/偏好。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error(label);};
 const color=selector=>{const el=typeof selector==='string'?document.querySelector(selector):selector;if(!el)throw Error('缺少 '+selector);const s=getComputedStyle(el);return{bg:s.backgroundColor,fg:s.color,border:s.borderTopColor,rect:el.getBoundingClientRect().toJSON()};};
 const capture=async stage=>{fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));await pause(350);};
 const file=path.join(base,'workspace/colors.md'),text='# 工作台颜色与阅读\n\n正文使用共享明暗主题，[跳转链接](https://example.com)，标题层级清晰。\n\n> 引用说明\n\n| 项目 | 值 |\n| --- | --- |\n| [表格链接](https://example.org) | `代码` |\n\n## 模块分隔\n\n- 侧栏与工作内容\n- 终端与正文\n- 设置与浮层\n\n```js\nconsole.log("主题保持");\n```\n';
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
   const appearance=()=>Object.fromEntries(['#write','#write h1','#write a[href]','#write td a[href]','#write p','#write blockquote','#write th','#write td','#write pre'].map(selector=>{const node=document.querySelector(selector);if(!node)return[selector,null];const c=getComputedStyle(node);return[selector,Object.fromEntries(['font-family','font-size','font-weight','line-height','color','background-color','border-top-width','border-top-style','border-top-color','padding-top','padding-left','margin-top','margin-bottom'].map(key=>[key,c.getPropertyValue(key)]))]}));
   const themed=appearance(),stylesheet=document.getElementById('typora-code-workspace-styles');
   assert(stylesheet,'实际静态样式入口');stylesheet.disabled=true;await pause(300);const original=appearance();stylesheet.disabled=false;await pause(300);
   for(const selector of Object.keys(original)){if(mode==='dark'&&(selector==='#write h1'||selector.includes('a[href]'))){assert(themed[selector].color===(selector==='#write h1'?'rgb(206, 145, 120)':'rgb(92, 164, 223)'),'Night标题/链接各用对应颜色 '+selector);themed[selector].color=original[selector].color;if(themed[selector]['border-top-width']==='0px')themed[selector]['border-top-color']=original[selector]['border-top-color'];}assert(JSON.stringify(themed[selector])===JSON.stringify(original[selector]),'正文沿原主题 '+mode+' '+selector+' '+JSON.stringify({actual:themed[selector],expected:original[selector]}));}
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
    const before=color('#write'),heading=color('#write h1'),link=color('#write a[href]');const style=document.createElement('style');style.textContent=':root{--workspace-markdown-heading:rgb(1,2,3);--workspace-markdown-link:rgb(3,2,1)}';document.head.append(style);await pause(60);
    assert(color('#write').bg===before.bg&&color('#write h1').fg===heading.fg&&color('#write a[href]').fg===link.fg,'其他主题不使用自有标题变量 '+theme);style.remove();
   }
   await capture('scope_'+theme.replace('.css',''));
  }

  const geometry=()=>Object.fromEntries(['#write','#write p','#write h1','#write h2','#write a','#write th','#write td','#write blockquote','#write pre','.md-fences .CodeMirror'].map(selector=>{const node=document.querySelector(selector);if(!node)return[selector,null];const c=getComputedStyle(node);return[selector,Object.fromEntries(['font-family','font-size','font-weight','font-style','line-height','padding-top','padding-left','margin-top','margin-bottom','border-top-width','border-left-width','border-top-style'].map(key=>[key,c.getPropertyValue(key)]))]}));
  const original_geometry=geometry();
  for(const [theme,mode] of [['cpp_github-consolas_light.css','light'],['cpp_github-consolas_dark.css','dark']]){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(900);
   assert(document.documentElement.dataset.workspaceColors===mode,'成对主题作用域 '+theme);
   const actual=geometry();samples.push({theme,geometry:actual});
   for(const selector of Object.keys(actual))assert(JSON.stringify(actual[selector])===JSON.stringify(original_geometry[selector]),'真实宿主Cpp字体/排版一致 '+theme+' '+selector+' '+JSON.stringify({actual:actual[selector],expected:original_geometry[selector]}));
   if(mode==='dark')assert(color(document.body).bg==='rgb(54, 59, 64)'&&color('#write p').fg==='rgb(184, 191, 198)','Dark参考Night配色');
   await capture('pair_'+mode);
  }
  core.app.commands.run('typora_code:custom_colors');await wait(()=>document.querySelector('[data-color-key=markdown_link]'),'自定义颜色表未打开');
  assert(document.querySelector('[data-color-picker=markdown_link]').getBoundingClientRect().width===30,'真实静态样式取色器宽度');
  const input=document.querySelector('[data-color-key=markdown_link]');input.value='#789ABC';input.dispatchEvent(new Event('input',{bubbles:true}));await pause(180);
  assert(color('#write a[href]').fg==='rgb(120, 154, 188)','真实宿主颜色立即生效');
  assert(core.app.settings.get('workspace_colors').themes.dark.markdown_link==='#789ABC','真实宿主设置落盘事务');
  assert(!document.querySelector('[data-color-action=save]'),'自动保存无保存按钮');
  await capture('custom_colors');document.querySelector('.workspace-dialog-close').click();
  core.app.commands.run('typora_code:custom_colors');await pause(120);
  assert(document.querySelector('[data-color-key=markdown_link]').value==='#789ABC','关闭重开保留颜色');
  document.querySelector('[data-color-action=inherit]').click();await pause(120);assert(color('#write a[href]').fg==='rgb(92, 164, 223)','真实宿主恢复默认颜色');document.querySelector('.workspace-dialog-close').click();
  const theme_button=[...document.querySelectorAll('.workspace-titlebar-menu>button')].find(node=>node.textContent==='主题');
  if(!theme_button)throw Error('未找到主题菜单按钮');theme_button.click();await pause(180);
  const labels=[...document.querySelectorAll('.workspace-titlebar-popup .workspace-titlebar-label')];
  assert(labels.some(node=>node.textContent==='CppGithubConsoles_Light')&&labels.some(node=>node.textContent==='CppGithubConsoles_Dark'),'真实主题菜单包含最终两名称');
  for(const node of labels){const range=document.createRange();range.selectNodeContents(node);const glyph=range.getBoundingClientRect(),box=node.getBoundingClientRect();assert(glyph.top>=box.top-0.5&&glyph.bottom<=box.bottom+0.5,'菜单真实文字未裁切 '+node.textContent);}
  await capture('pair_menu');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert(fs.readFileSync(file,'utf8')===text,'正文磁盘字节不变');core.app.commands.run('linux_note:terminal_kill');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'原始Typora1.14.10、Windows11独立副本；通过宿主命令/合成事件，未现场Win10或物理鼠标验收'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
