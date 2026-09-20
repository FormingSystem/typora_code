(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  const core=window[Symbol.for('typora-code:workspace')];
  for(let i=0;i<200&&!core.app.community_plugins;i++)await pause(25);
  const bridge=core.app.community_plugins,service=bridge.service,abi=window[Symbol.for('typora-plugin-core@v2')];
  assert(abi.app===core.app,'社区ABI与现有工作台同一个App');
  const root=core.app.workspace.rootSplit.containerEl,write=editor.writingArea;
  const original=fs.readFileSync(path.join(base,'workspace/front.md'),'utf8');
  await service.install_archive(path.join(base,'community_plugin.zip'));
  const id='typora-community-plugin.codeblock-copy-button';
  assert(service.list()[0].id===id&&!service.list()[0].enabled&&!service.list()[0].running,'真实社区ZIP安装后默认停用不执行');
  const test_file=path.join(base,'workspace/plugin.md');fs.writeFileSync(test_file,'# 插件验收\n\n```js\nconst sample = 1;\n```\n','utf8');
  await core.app.openFile(test_file);await pause(250);
  for(let i=0;i<20;i++){
   await service.set_enabled(id,true);core.app.features.markdownEditor.postProcessor.processAll();await pause(30);
   assert(!!document.querySelector('#write .typ-block-operate-button'),'真实ES5社区插件产生复制按钮 '+i);
   if(i===0){const original_clipboard=editor.UserOp.setClipboard;let copied;editor.UserOp.setClipboard=(...args)=>{copied=args;};try{document.querySelector('#write .typ-block-operate-button').click();assert(copied?.[2]==='const sample = 1;','真实复制按钮取得当前代码，剪贴板端口替身不触碰用户剪贴板');}finally{editor.UserOp.setClipboard=original_clipboard;}}
   await service.set_enabled(id,false);
   assert(!document.querySelector('#write .typ-block-operate-button'),'停用清除注册按钮 '+i);
  }
  // 实际社区设置插件，避免仅用自制SettingTab证明兼容。
  const mapper_id='typora-community-plugin.codeblock-highlight-mapper',original_mode=window.getCodeMirrorMode;
  await service.install_archive(path.join(base,'community_mapper_plugin.zip'));
  await service.set_enabled(mapper_id,true);
  assert(window.getCodeMirrorMode!==original_mode,'实际语言映射插件独立注册功能');
  bridge.open_settings();
  [...document.querySelectorAll('.workspace-community-setting-list button')].find(n=>n.textContent==='Codeblock Highlight Mapper').click();
  const mapper_table=document.querySelector('.workspace-community-settings .typ-editable-table');
  assert(mapper_table?.querySelectorAll('tbody tr').length===3,'社区原始设置页实际渲染语言映射表');
  mapper_table.querySelector('tbody tr td').click();
  const mapper_inputs=mapper_table.querySelectorAll('tbody tr:first-child input');
  mapper_inputs[1].value='javascript';mapper_inputs[1].dispatchEvent(new Event('input',{bubbles:true}));
  await pause(2500);
  const mapper_config=path.join(_options.userDataPath,'typora_code/settings/data/'+mapper_id+'.json');
  assert(JSON.parse(fs.readFileSync(mapper_config,'utf8')).settings.mapper.dataviewjs==='javascript','实际社区PluginSettings保存编辑后的映射');
  await service.set_enabled(mapper_id,false);
  assert(!document.querySelector('.workspace-community-settings')&&window.getCodeMirrorMode===original_mode,'停用实际设置插件关闭其配置并恢复原函数');
  await service.set_enabled(mapper_id,true);bridge.open_settings();
  [...document.querySelectorAll('.workspace-community-setting-list button')].find(n=>n.textContent==='Codeblock Highlight Mapper').click();
  assert(document.querySelector('.workspace-community-settings').textContent.includes('javascript'),'重新启用实际社区插件读取独立保存的配置');
  await service.set_enabled(mapper_id,false);await service.uninstall(mapper_id);
  assert(fs.existsSync(mapper_config)&&core.app.workspace.rootSplit.containerEl===root,'卸载保留插件配置且工作台布局根不变');
  class Settings extends abi.SettingTab {get name(){return '测试设置'}onshow(){this.containerEl.replaceChildren();this.addSetting(item=>item.addText(input=>{input.value='保留';}));}}
  class Broken extends abi.Plugin {onload(){this.registerSettingTab(new Settings());const element=this.addStatusBarItem({hint:'失败清理',position:'right'});element.dataset.fixtureBroken='yes';this.registerCommand({id:'broken',title:'失败清理',scope:'global',callback(){}});throw Error('预期初始化失败');}}
  const broken=new Broken(core.app,{id:'fixture.broken',name:'Broken'});let failed=false;try{await broken.load();}catch{failed=true;}
  assert(failed&&!document.querySelector('[data-fixture-broken]'),'插件初始化失败也清理已登记底栏与设置资源');
  await service.install_archive(path.join(base,'community_api_plugin.zip'));
  window.fixture_constructor_failure=true;let constructor_failed=false;
  try{await service.set_enabled('fixture.public-api',true);}catch{constructor_failed=true;}finally{window.fixture_constructor_failure=false;}
  assert(constructor_failed&&!document.querySelector('[data-fixture-constructor-failure]'),'插件构造抛错也清理已登记资源');
  await service.set_enabled('fixture.public-api',true);
  core.app.commands.run('fixture.public-api:sample');assert(document.querySelector('[data-community-fixture]').textContent==='已执行','公共命令与共享底栏API可用');
  const extension_button=document.querySelector('[data-id="typora_code:community_plugins"]');
  assert(!!extension_button,'扩展活动栏入口存在');extension_button.click();await pause(100);
  const manager=document.querySelector('.workspace-community-manager'),sidebar=core.app.workspace.sidebar;
  assert(manager&&sidebar.activePanel.ribbonButton.id==='typora_code:community_plugins','活动栏打开实际扩展侧栏');
  const title=document.querySelector('.workspace-community-title').getBoundingClientRect(),body=manager.getBoundingClientRect();
  assert(title.height===35&&body.top>=title.bottom,'原生主题中标题与管理正文无重叠');
  assert(getComputedStyle(manager.querySelector('input[type=file]')).display==='none','宿主input规则不显示隐藏的ZIP选择器');
  const box=extension_button.getBoundingClientRect(),glyph=extension_button.querySelector('svg').getBoundingClientRect();
  assert(box.width===48&&box.height===48&&glyph.width===24&&glyph.height===24,'扩展复用48px槽位和24px官方图标');
  assert(extension_button.dataset.activityActive==='true','扩展选择状态由侧栏所有者提供');
  const search=manager.querySelector('input[type=search]');search.value='API';search.dispatchEvent(new Event('input'));
  for(let i=0;i<20;i++){core.app.commands.run('linux_note:file_explorer');core.app.commands.run('typora_code:community_plugins');}
  assert(document.querySelector('.workspace-community-manager')===manager&&search.value==='API','20次切换保留插件面板和筛选，不重建服务');
  document.querySelector('#typora-sidebar').classList.add('active-tab-files');await pause(30);
  assert(!document.querySelector('#typora-sidebar').classList.contains('active-tab-files'),'迟到宿主样式不覆盖扩展');
  search.value='';search.dispatchEvent(new Event('input'));
  document.querySelector('.workspace-preferences-trigger').click();
  [...document.querySelectorAll('.workspace-preferences-menu button')].find(n=>n.textContent.includes('插件设置')).click();
  assert(!!document.querySelector('.workspace-community-setting-list'),'左下齿轮打开插件设置选择页');
  document.querySelector('.workspace-community-setting-list button').click();
  assert(!!document.querySelector('.workspace-community-settings input'),'设置选择进入插件真实配置');

  const setting_button=[...document.querySelectorAll('.workspace-community-manager button')].find(button=>button.textContent==='设置'&&!button.disabled);setting_button.click();assert(document.querySelectorAll('.workspace-community-settings').length===1,'插件行和齿轮共用单个设置页');
  const input=document.querySelector('.workspace-community-settings input');assert(input.value==='初始值','上游SettingTab/SettingItem正确渲染设置');input.value='已保存';input.dispatchEvent(new Event('change',{bubbles:true}));await pause(1200);
  const config=path.join(_options.userDataPath,'typora_code/settings/data/fixture.public-api.json');assert(JSON.parse(fs.readFileSync(config,'utf8')).settings.message==='已保存','PluginSettings保存到独立用户目录');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));await pause(30);assert(!document.querySelector('.workspace-community-settings')&&!!document.querySelector('.workspace-community-manager'),'Escape只关闭顶层插件设置');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));await pause(30);
  setting_button.click();await service.set_enabled('fixture.public-api',false);assert(!document.querySelector('.workspace-community-settings'),'停用关闭该插件已打开的设置');assert(!document.querySelector('[data-community-fixture]'),'停用清理插件底栏');await service.uninstall('fixture.public-api');assert(fs.existsSync(config),'卸载保留个人设置');
  assert(core.app.workspace.rootSplit.containerEl===root&&editor.writingArea===write&&document.querySelectorAll('.typ-workspace-root').length===1,'接入/启停不重建工作台或原生编辑器');
  await service.uninstall(id);assert(!service.list().length,'卸载移除插件登记');
  const layout_samples=[];
  for(const [theme,name]of [['night.css','dark'],['github.css','light']]){
   await JSBridge.invoke('setting.setCurTheme',theme,name==='dark'?'Night':'Github');File.setTheme(theme);await pause(400);document.querySelector('#ty-suppress-mode-warning-close-btn')?.click();
   assert(document.documentElement.dataset.workspaceFileIconTheme===name,'实际主题已切换 '+name);
   for(const zoom of [1.25,1]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(100);
    const heading=document.querySelector('.workspace-community-title'),content=document.querySelector('.workspace-community-manager');
    const rect=heading.getBoundingClientRect(),body=content.getBoundingClientRect(),icon=extension_button.querySelector('svg').getBoundingClientRect();
    assert(Math.abs(rect.height-35)<.1&&rect.bottom<=body.top+.1&&body.bottom<=innerHeight+1,name+'/'+zoom+' 标题与滚动区不重叠且不超出视口');
    assert(icon.width===24&&icon.height===24&&getComputedStyle(heading).fontSize==='11px',name+'/'+zoom+' 图标和标题保持公共尺寸');
    assert(getComputedStyle(content.querySelector('input[type=file]')).display==='none',name+'/'+zoom+' 文件选择控件保持隐藏');
    layout_samples.push({theme:name,zoom,title_height:rect.height,content_top:body.top,content_bottom:body.bottom,font:getComputedStyle(content).fontFamily,color:getComputedStyle(content).color});
   }
  }
  extension_button.focus();extension_button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',code:'ArrowUp',altKey:true,bubbles:true,cancelable:true}));await pause(250);
  assert(extension_button.nextElementSibling?.dataset.id==='linux_note:source_control','扩展参与公共键盘排序');
  extension_button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',altKey:true,bubbles:true,cancelable:true}));await pause(250);
  assert(extension_button.previousElementSibling?.dataset.id==='linux_note:source_control','扩展排序可恢复');
  extension_button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));await pause(40);
  assert(!sidebar.isShown,'键盘Enter关闭当前扩展侧栏');
  extension_button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));await pause(40);
  assert(sidebar.isShown&&document.querySelector('.workspace-community-manager')===manager,'键盘Enter恢复同一扩展侧栏');
  assert(fs.readFileSync(path.join(base,'workspace/front.md'),'utf8')===original,'原用户文档字节保持');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,layout_samples,iterations:20,plugin:{id,version:'1.2.0',sha256:'41b52347fa526d23a5554813762309d368f440486c163c93885137229b44e704'},scope:'原始Typora独立副本，真实社区发行ZIP与公共ABI，renderer操作'},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks},null,2),'utf8');}
})();
