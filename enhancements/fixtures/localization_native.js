// Exercise saved locale through the real core, renderer, services, and settings transaction.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 const locale=JSON.parse(fs.readFileSync(path.join(base,'expected_locale.json'),'utf8'));
 const core=window[Symbol.for('typora-code:workspace')],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const digest=file=>reqnode('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const front=path.join(base,'workspace/front.md'),before=digest(front),editor_node=editor.writingArea;
 try{
  for(let index=0;index<200&&document.documentElement.dataset.linuxNoteTyporaEnhancements!=='ready';index++)await pause(25);
  assert(document.documentElement.dataset.linuxNoteTyporaEnhancements==='ready','Resident renderer ready');
  assert(core.app.i18n.locale===locale,'Saved language loaded before renderer initialization');
  const english=locale==='en';
  core.app.commands.run('typora_code:settings');await pause(150);
  const modal=document.querySelector('.workspace-settings-modal');assert(modal,'Real settings command opens one dialog');
  const select=modal.querySelector('[data-setting="language.display_language"]');
  assert(select&&select.value===locale,'Language control reflects the persisted owner');
  const labels=Array.from(select.options,option=>option.textContent);
  assert(labels.length===3&&labels.some(label=>english?/English/.test(label):/英文/.test(label)),'Localized language choices');
  assert(english?!/[\u3400-\u9fff]/.test(modal.textContent):/[\u3400-\u9fff]/.test(modal.textContent),'Settings prose uses the selected language');
  const module=reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_service_i18n.cjs'));
  module.set_workspace_service_locale(locale);
  const service_message=module.workspace_service_text('service_4e250292edfe');
  assert(service_message===(english?'Invalid plugin identifier.':'插件标识无效。'),'Background service uses the same locale');
  select.value=english?'zh-cn':'en';select.dispatchEvent(new Event('change',{bubbles:true}));await pause(50);
  const saved=JSON.parse(fs.readFileSync(path.join(_options.userDataPath,'typora_code/settings/workspace.json'),'utf8'));
  assert(saved.settings.displayLang===(english?'zh-cn':'en'),'Language change persisted through the real transaction');
  assert(core.app.i18n.locale===locale&&editor.writingArea===editor_node,'Saving language preserves current locale and document node until restart');
  const refreshed=modal.querySelector('[data-setting="language.display_language"]');
  refreshed.value=locale;refreshed.dispatchEvent(new Event('change',{bubbles:true}));
  assert(modal.getBoundingClientRect().right<=innerWidth+1,'Settings stays inside the viewport');
  assert(modal.getBoundingClientRect().left>=0&&modal.scrollWidth<=modal.clientWidth+1,'Localized settings has no horizontal overflow');
  [...modal.querySelectorAll('.workspace-settings-categories button')].find(node=>node.textContent===(english?'Appearance':'外观')).click();
  const reset=modal.querySelector('[data-setting="appearance.reset_defaults"]');
  assert(reset?.textContent===(english?'Restore appearance defaults':'恢复外观默认配置')&&reset.getBoundingClientRect().right<=modal.getBoundingClientRect().right,'Localized appearance reset is visible within the settings panel');
  const stage='localization_'+locale.replace('-','_')+'_settings';
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}),'utf8');
  let captured=false;
  for(let index=0;index<200&&!captured;index++){
   try{captured=JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage===stage;}catch{}
   if(!captured)await pause(50);
  }
  assert(captured,'Native settings screenshot captured');
  modal.querySelector('.workspace-dialog-close').click();
  const original_invoke=JSBridge.invoke;let opened;
  JSBridge.invoke=function(name,...args){if(name==='app.openFile'){opened=args[0];return Promise.resolve();}return original_invoke.call(this,name,...args);};
  try{core.app.commands.run('typora_code:operation_manual');for(let index=0;index<40&&!opened;index++)await pause(25);}
  finally{JSBridge.invoke=original_invoke;}
  assert(opened?.endsWith(english?'user_guide.en.md':'user_guide.md')&&fs.existsSync(opened),'Offline manual route matches the loaded locale');
  assert(digest(front)===before&&!File.changeCounter.isDocumentEdited(),'Document bytes and saved state preserved');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',locale,checks,labels,service_message,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',locale,error:String(error.stack||error),checks},null,2),'utf8');}
})();
