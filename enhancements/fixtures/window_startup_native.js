// R040.5: shared settings read and persist the actual native startup owner.
(async () => {
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 const core=window[Symbol.for('typora-code:workspace')];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<400;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const control=()=>document.querySelector('[data-setting="window.startup_behavior"]');
 const read=async()=>JSON.parse(await JSBridge.invoke('setting.getExtraOption'));
 const disk=()=>JSON.parse(Buffer.from(fs.readFileSync(path.join(_options.userDataPath,'profile.data'),'utf8'),'hex').toString('utf8'));
 const close=()=>document.querySelector('.workspace-settings-modal .workspace-dialog-close')?.click();
 const show=async()=>{core.app.commands.run('typora_code:settings');await wait(()=>control()&&!control().disabled,'startup setting ready');};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const pinned=path.join(base,'workspace');await JSBridge.invoke('setting.put','pinFolder',pinned);
  for(const mode of [0,1,2,3]){
   await JSBridge.invoke('setting.put','restoreWhenLaunch',mode);await show();
   assert(control().value===String(mode),'native mode displayed '+mode);
   assert(String((await read()).restoreWhenLaunch)===String(mode),'opening settings preserves native mode '+mode);
   close();await pause(60);
  }
  await show();
  for(const mode of [0,2]){
   control().value=String(mode);control().dispatchEvent(new Event('change',{bubbles:true}));
   await wait(async()=>!control().disabled&&String((await read()).restoreWhenLaunch)===String(mode),'native preference saved');
   await wait(()=>String(disk().restoreWhenLaunch)===String(mode),'native preference persisted');
   assert((await read()).pinFolder===pinned,'other native folder preserved '+mode);
  }
  for(let i=0;i<20;i++){close();await pause(20);await show();assert(control().value==='2','reopened restore preference '+i);}
  for(const theme of ['vscode_default_dark.css','vscode_default_light.css']){
   ClientCommand.setTheme(theme,theme);await pause(300);
   const select=control(),label=select.closest('label'),bounds=select.getBoundingClientRect();
   assert(bounds.width>0&&bounds.height>0&&label.contains(select),'startup row visible '+theme);
   assert(select.value==='2','theme preserves startup choice '+theme);
  }
  const category=[...document.querySelectorAll('.workspace-settings-categories button')].find(node=>node.textContent==='窗口');category.click();await wait(()=>control()&&!control().disabled,'window category');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'window_startup'}));await pause(500);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,native_mode:(await read()).restoreWhenLaunch,disk_mode:disk().restoreWhenLaunch,input:'DOM selection in original Typora; native main-process persistence'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,body:document.querySelector('.workspace-settings')?.outerHTML.slice(0,10000)},null,2));}
})();
