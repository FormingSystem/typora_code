// Native first-party setup and first navigation start without a downloaded language server.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let index=0;index<2400;index++){if(fn())return;await pause(50);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')];await wait(()=>core.app.language_support&&core.app.extensions,'independent language service');
  const service=core.app.language_support;await service.ready;
  core.app.extensions.open();assert(document.querySelectorAll('.language-support-row').length===9,'nine independent language entries');
  assert(!document.querySelector('.workspace-community-manager'),'language view does not mount community manager');
  const id='typora_code.language_cmake',files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  const sample=path.join(base,'workspace','CMakeLists.txt'),helper=path.join(base,'workspace','helpers.cmake');
  fs.writeFileSync(sample,'set(PYTHON_EXECUTABLE python)\nmessage("${PYTHON_EXECUTABLE}")\ninclude(helpers.cmake)\n');fs.writeFileSync(helper,'function(sample)\nendfunction()\n');
  await files.open_file(sample);await wait(()=>core.app.workspace.activeLeaf.view?.loaded,'CMake source ready');
  const editor=core.app.workspace.activeLeaf.view.editor.focused_editor();
  const row=document.querySelector('[data-workspace-row-key="'+id+'"]');row.querySelector('.language-support-install').click();
  await wait(()=>service.list().find(item=>item.id===id).enabled,'installation registered');
  editor.setPosition({lineNumber:2,column:15});editor.focus();editor.getDomNode().dispatchEvent(new KeyboardEvent('keydown',{key:'F12',bubbles:true}));
  const current=()=>service.list().find(item=>item.id===id);
  await wait(()=>current().record||current().error,'automatic managed installation');
  const record=current().record;assert(record&&fs.existsSync(record.command),'install automatically downloads CMake: '+current().message);
  await wait(()=>editor.getPosition().lineNumber===1,'first definition waits for automatic setup');
  assert(editor.getPosition().lineNumber===1,'pending F12 reaches variable definition after preparation');
  editor.setPosition({lineNumber:3,column:14});editor.focus();editor.getDomNode().dispatchEvent(new KeyboardEvent('keydown',{key:'F12',bubbles:true}));
  await wait(()=>files.editor_state(core.app.workspace.activeLeaf).file_path===helper,'cross-file definition');assert(true,'CMake include opens exact helper file');
  const profile=service.profile(id,path.dirname(sample),'cmake');assert(profile.initialization_options.semantic_token===true,'CMake semantic initialization matches upstream client');
  core.app.extensions.open();row.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  await wait(()=>document.querySelector('.language-support-settings'),'independent settings');
  const click=(label,scope=document)=>{const button=[...scope.querySelectorAll('button')].find(item=>item.textContent===label);assert(button&&!button.disabled,'enabled action: '+label);button.click();};
  const panel=document.querySelector('.language-support-settings');assert(!panel.closest('.workspace-community-settings-root'),'settings do not use community SettingTab');
  click('配置外部工具及语言参数…',panel);await pause(100);click('将已安装工具链填入配置草稿');assert(document.querySelector('[data-field=command]').value===record.command,'managed command in optional draft');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));await pause(100);assert(!document.querySelector('.source-outline-settings'),'cancel advanced draft');
  for(const theme of ['night.css','github.css']){await JSBridge.invoke('setting.setCurTheme',theme,theme==='night.css'?'Night':'Github');File.setTheme(theme);await pause(250);const input=panel.querySelector('input[type=checkbox]');input.focus();assert(document.activeElement===input,'settings keyboard focus: '+theme);const box=panel.querySelector('.git-graph-dialog').getBoundingClientRect();assert(box.width>100&&box.left>=0&&box.right<=innerWidth+1&&box.bottom<=innerHeight+1,'settings viewport bounds: '+theme);}
  click('清除受管分析环境',panel);assert(current().removing&&current().busy,'clear owns the language lifecycle');let rejected=false;try{await service.retry(id);}catch{rejected=true;}assert(rejected,'retry cannot race with clear');await wait(()=>!current().record&&!current().busy,'clear environment');assert(!fs.existsSync(record.directory)&&!panel.querySelector('input[type=checkbox]').checked,'clear opts out and removes only owned files');
  await service.set_enabled(id,false);await service.set_enabled(id,true);await pause(500);assert(!current().record&&!current().busy,'re-enable respects cleared automatic opt-out');
  await service.uninstall(id);assert(!current().installed,'independent uninstall removes registration');assert(!core.app.community_plugins.service.list().some(item=>item.id===id),'language was never registered in community');
  core.app.extensions.open();
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,limits:'Windows x64 original Typora 1.14.10; real CMake server, synthetic DOM actions/F12. Other recipes use prior clean-PATH evidence; dynamic project variables remain server-dependent.'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
})();
