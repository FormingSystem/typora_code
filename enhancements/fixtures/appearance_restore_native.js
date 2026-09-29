(async()=>{
 const base=__CASE_ROOT__,fs=reqnode('fs'),path=reqnode('path'),frame=reqnode('electron').webFrame;
 const record=path.join(base,'appearance_phase.json'),saved=fs.existsSync(record)?JSON.parse(fs.readFileSync(record,'utf8')):null,phase=(saved?.phase||0)+1;
 const core=window[Symbol.for('typora-code:workspace')],checks=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m)},wait=async(fn,m)=>{for(let i=0;i<600;i++){if(fn())return;await pause(25);}throw Error(m);};
 const command=id=>core.app.commands.run('linux_note:'+id),panel=()=>document.querySelector('.typora-terminal-panel');
 const wheel=node=>node.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,bubbles:true,cancelable:true}));
 const body_size=()=>parseFloat(getComputedStyle(document.querySelector('#write')).fontSize)*frame.getZoomFactor();
 const terminal_entry=async()=>{command('terminal_move_editor');await wait(()=>core.app.workspace.activeLeaf?.view.entry,'terminal editor');const entry=core.app.workspace.activeLeaf.view.entry;command('terminal_move_panel');await pause(100);return entry;};
 const report=(status,error)=>fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status,phase,checks,error},null,2));
 try{
  await wait(()=>document.documentElement.dataset.linuxNoteTyporaEnhancements==='ready'&&!File.isFileLoading(),'startup');await pause(700);
  const original=File.editor.getMarkdown();
  if(phase===1){
   assert(panel().hidden,'first launch terminal is hidden');command('terminal_toggle');await wait(()=>document.querySelector('.linux-note-terminal')?.dataset.state==='running','shell');const entry=await terminal_entry();
   const baseline=body_size();wheel(document.querySelector('#write p')||document.querySelector('#write'));wheel(entry.surface.viewport);await pause(200);command('zoom_out');await pause(250);
   const sash=panel().querySelector('[role=separator]');sash.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp'}));await pause(100);
   panel().querySelector('.terminal-panel-actions button:nth-last-child(2)').click();await pause(100);
   assert(body_size()>baseline,'editor visual font grew');assert(entry.surface.term.options.fontSize*frame.getZoomFactor()>14,'terminal visual font grew');assert(panel().dataset.maximized==='true','panel maximized');
   fs.writeFileSync(record,JSON.stringify({phase,editor:body_size(),terminal:entry.surface.term.options.fontSize*frame.getZoomFactor(),factor:frame.getZoomFactor(),height:localStorage.getItem('linux-note-terminal-panel-height'),pid:entry.session.pid}));
  }else if(phase===2){
   await wait(()=>document.querySelector('.linux-note-terminal')?.dataset.state==='running','restored shell');
   assert(!panel().hidden&&panel().dataset.maximized==='true','visible maximized terminal restored in a new process');assert(Math.abs(frame.getZoomFactor()-saved.factor)<.001,'actual host zoom restored');assert(Math.abs(body_size()-saved.editor)<.05,'editor visual font restored without duplicate compensation');
   const entry=await terminal_entry();assert(Math.abs(entry.surface.term.options.fontSize*frame.getZoomFactor()-saved.terminal)<.01,'terminal font restored');assert(entry.session.pid!==saved.pid,'a fresh Shell replaces the closed process');assert(localStorage.getItem('linux-note-terminal-panel-height')===saved.height,'normal panel height restored');
   const pid=entry.session.pid;core.app.commands.run('typora_code:settings');await wait(()=>document.querySelector('[data-setting="appearance.reset_defaults"]'),'reset action');document.querySelector('[data-setting="appearance.reset_defaults"]').click();await pause(250);
   assert(frame.getZoomFactor()===1,'settings reset restores 100 percent');assert(panel().hidden&&panel().dataset.maximized==='false','settings reset hides and unmaximizes panel');assert(entry.session.pid===pid&&entry.session.state==='running','reset keeps the running Shell');assert(entry.surface.term.options.fontSize===14,'reset restores terminal base font');
   fs.writeFileSync(record,JSON.stringify({phase,editor:body_size()}));
   document.querySelector('.workspace-settings-modal .workspace-dialog-header button:last-child')?.click();
  }else{
   assert(panel().hidden&&!document.querySelector('.linux-note-terminal'),'reset hidden state survives next process without launching Shell');assert(frame.getZoomFactor()===1&&Math.abs(body_size()-saved.editor)<.05,'reset fonts and zoom survive next process');fs.writeFileSync(record,JSON.stringify({phase}));
  }
  assert(File.editor.getMarkdown()===original&&!File.changeCounter.isDocumentEdited(),'appearance preserves native document and clean state');report('PASS');window.close();
 }catch(error){report('FAIL',String(error.stack));}
})();
