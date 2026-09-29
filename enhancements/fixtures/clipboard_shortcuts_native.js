// Native host command delivery with an isolated in-memory clipboard adapter.
(async()=>{
 const native_reqnode=window.reqnode,fs=native_reqnode('fs'),path=native_reqnode('path'),crypto=native_reqnode('crypto'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(fn,label)=>{for(let i=0;i<600;i++){if(fn())return;await pause(25);}throw Error(label);};
 const assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const clip={text:'fixture',reads:0,writes:0,readText(){this.reads++;return this.text;},writeText(value){this.writes++;this.text=value;}};
 const electron=native_reqnode('electron');
 const send=(key,options={})=>{const e=new KeyboardEvent('keydown',{key,code:'Key'+key.toUpperCase(),keyCode:key.toUpperCase().charCodeAt(0),which:key.toUpperCase().charCodeAt(0),ctrlKey:true,bubbles:true,cancelable:true,...options});document.activeElement.dispatchEvent(e);return e.defaultPrevented;};
 const paste_data=e=>{const data=new DataTransfer();data.setData('text/plain','native_paste_fixture');Object.defineProperty(e,'clipboardData',{value:data});};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');await pause(500);
  window.reqnode=name=>name==='electron'?new Proxy(electron,{get(target,key){return key==='clipboard'?clip:target[key];}}):native_reqnode(name);
  window.addEventListener('paste',paste_data,true);
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,root=files.context_root(),front=path.join(root,'front.md');
  const initial=File.editor.getMarkdown(),file=path.join(root,'clipboard.js');fs.writeFileSync(file,'const original = 1;','utf8');await files.open_file(file);
  await wait(()=>core.app.workspace.activeLeaf.view.editor?.focused_editor()?.getModel(),'source editor');
  const editor=core.app.workspace.activeLeaf.view.editor.focused_editor(),model=editor.getModel();editor.focus();
  for(let i=0;i<20;i++){
   model.setValue('original');model.setEOL(0);editor.setSelection(model.getFullModelRange());clip.text='中文'+i+'\nsecond';const reads=clip.reads;
   assert(send('v'),'source Ctrl+V handled '+i);await pause(20);assert(model.getValue()===clip.text&&clip.reads===reads+1,'single source paste '+i);
   send('z');assert(model.getValue()==='original','undo '+i);send('y');assert(model.getValue()===clip.text,'redo '+i);
  }
  editor.setSelection(model.getFullModelRange());send('c');assert(clip.text.replace(/\r/g,'')===model.getValue(),'source copy');send('x');assert(model.getValue()==='','source cut');send('z');
  editor.updateOptions({readOnly:true});const before=model.getValue();send('v');send('x');assert(model.getValue()===before,'readonly cannot mutate');editor.updateOptions({readOnly:false});
  await editor.getAction('editor.action.startFindReplaceAction').run();await pause(150);
  for(const part of ['find-part','replace-part']){
   const input=editor.getDomNode().querySelector('.'+part+' textarea');input.focus();input.select();clip.text='query_text';send('v');assert(input.value===clip.text&&model.getValue()===before,part+' paste owns input');input.select();send('c');assert(clip.text==='query_text',part+' copy');send('x');assert(input.value==='',part+' cut');send('z');assert(input.value==='query_text',part+' undo');
  }
  editor.getContribution('editor.contrib.findController').closeFindWidget();
  const input=document.createElement('input');document.body.append(input);input.focus();const reads=clip.reads;
  assert(!send('v'),'ordinary input Ctrl+V stays native');document.execCommand('insertText',false,'plain_input_fixture');assert(input.value==='plain_input_fixture'&&clip.reads===reads&&model.getValue()===before,'ordinary input text editing keeps source unchanged');input.remove();
  await files.open_file(front);await wait(()=>File.bundle.filePath===front,'markdown return');await pause(150);
  assert(File.editor.getMarkdown()===initial,'source clipboard never changes Markdown');
  const write=document.querySelector('#write'),p=write.querySelector('p');write.focus();const range=document.createRange();range.selectNodeContents(p);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  assert(!send('v'),'Markdown Ctrl+V stays native');ClientCommand.paste();await pause(150);assert(File.editor.getMarkdown().includes('native_paste_fixture'),'native Markdown paste still inserts');
  core.app.commands.run('linux_note:terminal_toggle');
  await wait(()=>document.querySelector('.linux-note-terminal')?.getAttribute('aria-busy')==='false','terminal ready');
  core.app.commands.run('linux_note:terminal_move_editor');
  const surface=core.app.workspace.activeLeaf.view.entry.surface,writes=[],original_input=surface.actions.input;
  try{
   surface.actions.input=data=>writes.push(data);surface.focus();clip.text='terminal_fixture';
   for(let i=0;i<20;i++){writes.length=0;send('v');assert(writes.join('')==='terminal_fixture','terminal Ctrl+V single paste '+i);}
   writes.length=0;send('v',{shiftKey:true});assert(writes.join('')==='terminal_fixture','terminal Ctrl+Shift+V');
   writes.length=0;send('c');assert(writes.join('')==='\x03','terminal Ctrl+C interrupt unchanged');
  }finally{surface.actions.input=original_input;}
  assert(fs.readFileSync(file,'utf8')==='const original = 1;','source changes not saved');assert(fs.readFileSync(front,'utf8').includes('原文必须保持'),'Markdown changes not saved');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(_options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'Native renderer key events, memory clipboard and native paste with fixed event data; no physical OS keyboard, image or rich-text clipboard validation.'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
 finally{window.reqnode=native_reqnode;window.removeEventListener('paste',paste_data,true);}
})();
