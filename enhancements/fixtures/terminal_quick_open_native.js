// Exercise the installed window router with real native terminal views.
(async()=>{
 const fs=window.reqnode('fs'),path=window.reqnode('path'),crypto=window.reqnode('crypto'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<600;i++){if(fn())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const press=(key,code,options={})=>{for(const type of ['keydown','keyup'])document.activeElement.dispatchEvent(new KeyboardEvent(type,{key,code,keyCode:key.length===1?key.toUpperCase().charCodeAt(0):key==='Enter'?13:key==='Escape'?27:0,bubbles:true,cancelable:true,...options}));};
 let surface,original_input;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  const initial=File.editor.getMarkdown(),target=path.join(files.context_root(),'terminal_target.md');fs.writeFileSync(target,'# Terminal target\n\nunchanged\n','utf8');
  const picker=()=>document.querySelector('.workspace-quick-open'),input=()=>picker().querySelector('input');
  core.app.commands.run('linux_note:terminal_toggle');await wait(()=>document.querySelector('.linux-note-terminal')?.getAttribute('aria-busy')==='false','terminal ready');
  document.querySelector('#write').focus();press('p','KeyP',{ctrlKey:true});assert(!picker().hidden&&document.activeElement===input(),'visible terminal does not block editor Ctrl+P');press('Escape','Escape');
  core.app.commands.run('linux_note:terminal_move_editor');surface=core.app.workspace.activeLeaf.view.entry.surface;original_input=surface.actions.input;const writes=[],shell_input=()=>writes.filter(data=>!/^\x1b\[[IO]$/.test(data)).join('');surface.actions.input=data=>writes.push(data);
  for(const placement of ['editor','panel']){
   if(placement==='panel')core.app.commands.run('linux_note:terminal_move_panel');
   for(let i=0;i<10;i++){
    surface.focus();writes.length=0;press('p','KeyP',{ctrlKey:true});assert(!picker().hidden&&document.activeElement===input(),placement+' picker focused '+i);assert(shell_input()==='',placement+' no PTY leak '+i+' '+JSON.stringify(writes));
    press('Escape','Escape');assert(picker().hidden&&document.activeElement===surface.term.textarea,placement+' Escape restores terminal '+i);
   }
  }
  surface.focus();writes.length=0;press('c','KeyC',{ctrlKey:true});assert(shell_input()==='\x03','Ctrl+C still interrupts terminal');
  surface.focus();press('p','KeyP',{ctrlKey:true,shiftKey:true});await wait(()=>document.activeElement?.matches('.typ-command-modal input'),'command palette');assert(shell_input()==='\x03','command palette does not send PTY');press('Escape','Escape');
  surface.focus();press('p','KeyP',{ctrlKey:true});input().value='terminal_target';input().dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>picker().querySelector('.workspace-quick-open-result'),'file result');
  press('Enter','Enter');await wait(()=>File.bundle.filePath===target,'selected document loaded');assert(picker().hidden,'file selection closes picker');assert(File.editor.getMarkdown().includes('Terminal target'),'selected Markdown rendered');assert(fs.readFileSync(target,'utf8')==='# Terminal target\n\nunchanged\n','disk file unchanged');assert(initial.includes('原文必须保持'),'original fixture loaded');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(_options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'Original Typora renderer keyboard events; terminal input port recorded instead of sending test control keys to shell; physical keyboard not tested.'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
 finally{if(surface&&original_input)surface.actions.input=original_input;}
})();
