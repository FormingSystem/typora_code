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
  bridge.open_manager();assert(!!document.querySelector('.workspace-community-manager'),'独立共享管理窗口可打开');
  const setting_button=[...document.querySelectorAll('.workspace-community-manager button')].find(button=>button.textContent==='设置');setting_button.click();
  const input=document.querySelector('.workspace-community-settings input');assert(input.value==='初始值','上游SettingTab/SettingItem正确渲染设置');input.value='已保存';input.dispatchEvent(new Event('change',{bubbles:true}));await pause(1200);
  const config=path.join(_options.userDataPath,'typora_code/settings/data/fixture.public-api.json');assert(JSON.parse(fs.readFileSync(config,'utf8')).settings.message==='已保存','PluginSettings保存到独立用户目录');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));await pause(30);assert(!document.querySelector('.workspace-community-settings')&&!!document.querySelector('.workspace-community-manager'),'Escape只关闭顶层插件设置');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));await pause(30);
  await service.set_enabled('fixture.public-api',false);assert(!document.querySelector('[data-community-fixture]'),'停用清理插件底栏');await service.uninstall('fixture.public-api');assert(fs.existsSync(config),'卸载保留个人设置');
  assert(core.app.workspace.rootSplit.containerEl===root&&editor.writingArea===write&&document.querySelectorAll('.typ-workspace-root').length===1,'接入/启停不重建工作台或原生编辑器');
  await service.uninstall(id);assert(!service.list().length,'卸载移除插件登记');
  assert(fs.readFileSync(path.join(base,'workspace/front.md'),'utf8')===original,'原用户文档字节保持');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,iterations:20,plugin:{id,version:'1.2.0',sha256:'41b52347fa526d23a5554813762309d368f440486c163c93885137229b44e704'},scope:'原始Typora独立副本，真实社区发行ZIP与公共ABI，renderer操作'},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks},null,2),'utf8');}
})();
