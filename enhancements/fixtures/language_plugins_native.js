// Exercise packaged plugins, original SettingTab controls and a real portable CMake service.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let index=0;index<2400;index++){if(fn())return;await pause(50);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')];await wait(()=>core.app.community_plugins,'community bridge');
  const bridge=core.app.community_plugins,service=bridge.service,root=core.app.workspace.rootSplit.containerEl;
  const entries=service.builtin_catalog();assert(entries.length===9,'nine bundled marketplace plugins');
  await service.install_online(entries[0]);
  core.app.commands.run('typora_code:community_plugins');
  const click=(label,scope=document)=>{const button=[...scope.querySelectorAll('button')].find(item=>item.textContent===label);assert(button&&!button.disabled,'enabled action: '+label);button.click();};
  click('语言环境插件');assert(document.querySelectorAll('.workspace-community-row').length===9,'language catalog uses existing extension sidebar');
  for(const entry of entries){
   await service.install_online(entry);assert(!service.list().find(item=>item.id===entry.id).enabled,'installation preserves disabled choice: '+entry.id);
   await service.set_enabled(entry.id,true);bridge.open_settings();
   document.querySelector('[data-plugin-id="'+entry.id+'"].typ-nav__item').click();
   const panel=document.querySelector('.workspace-community-settings');
   assert(panel?.textContent.includes('下载并安装分析环境'),'real plugin SettingTab: '+entry.id);
   assert(panel.querySelector('input[type=checkbox]')?.checked,'managed use defaults on: '+entry.id);
   await service.set_enabled(entry.id,false);assert(!document.querySelector('.workspace-community-settings'),'disable releases settings: '+entry.id);
  }
  const id='typora_code.language_cmake';await service.set_enabled(id,true);bridge.open_settings();document.querySelector('[data-plugin-id="'+id+'"].typ-nav__item').click();
  const panel=document.querySelector('.workspace-community-settings'),directory=panel.querySelector('input[type=text]');
  directory.value=path.join(base,'workspace','tools');click('下载并安装分析环境',panel);
  const state_file=path.join(_options.userDataPath,'typora_code/language_environments/installed.json');
  const state=()=>fs.existsSync(state_file)?JSON.parse(fs.readFileSync(state_file,'utf8')).environments[id]:undefined;
  await wait(()=>state()||(![...panel.querySelectorAll('button')].find(item=>item.textContent==='下载并安装分析环境').disabled),'managed installation');
  const record=state();assert(record&&fs.existsSync(record.command),'native UI downloads portable CMake server: '+panel.textContent);
  click('配置外部工具及语言参数…',panel);await pause(100);
  click('将已安装工具链填入配置草稿');
  assert(document.querySelector('[data-field=command]').value===record.command,'managed tool command in editable draft');
  assert(JSON.parse(document.querySelector('[data-field=args]').value).includes('stdio'),'service specific arguments in draft');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));await pause(100);
  assert(!document.querySelector('.source-outline-settings'),'cancel closes draft');
  for(const theme of ['night.css','github.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme==='night.css'?'Night':'Github');File.setTheme(theme);await pause(250);
   const input=panel.querySelector('input[type=checkbox]');input.focus();assert(document.activeElement===input,'keyboard focus in original SettingTab: '+theme);
   const box=panel.getBoundingClientRect();assert(box.width>100&&box.left>=0&&box.right<=innerWidth+1&&box.bottom<=innerHeight+1,'settings bounds: '+theme);
  }
  click('清除受管分析环境',panel);await wait(()=>!state(),'clear managed environment');
  assert(!fs.existsSync(record.directory)&&!panel.querySelector('input[type=checkbox]').checked,'clear removes owned files and updates use choice');
  for(const entry of entries)await service.uninstall(entry.id);
  assert(!service.list().length&&core.app.workspace.rootSplit.containerEl===root,'uninstall clears plugins without rebuilding workspace');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,limits:'Windows x64 original Typora 1.14.10; DOM actions and actual CMake download. Other real services use separate clean-PATH tests.'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
})();
