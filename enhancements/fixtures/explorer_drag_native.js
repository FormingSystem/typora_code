// R002.1: real Typora document relocation through production Explorer drop events.
(async () => {
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 const core=window[Symbol.for('typora-code:workspace')],workspace=core.app.workspace,files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<500;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const row=target=>[...document.querySelectorAll('.workspace-explorer-row')].find(item=>item.dataset.path===target);
 const refresh=async()=>{document.querySelector('.workspace-explorer-root [data-git-icon="refresh"]').closest('button').click();await pause(350);};
 async function history_key(key,expected,missing){
  const tree=document.querySelector('.workspace-explorer-tree');tree.focus();
  const event=new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true,cancelable:true});tree.dispatchEvent(event);
  assert(event.defaultPrevented,'Explorer consumes file '+key);
  await wait(()=>fs.existsSync(expected)&&!fs.existsSync(missing),'history disk result');await pause(350);
 }
 async function drag(source,target,copy=false){
  await wait(()=>row(source)&&row(target),'drag rows visible');
  const origin=row(source),destination=row(target),data=new DataTransfer();
  assert(origin.draggable,'source draggable: '+path.basename(source));
  origin.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));
  const bounds=destination.getBoundingClientRect();
  destination.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data,ctrlKey:copy,clientY:bounds.top+bounds.height/2}));
  assert(document.querySelector('.workspace-explorer-tree').dataset.dropTarget===target,'target feedback');
  await pause(600);
  assert(row(target)?.getAttribute('aria-expanded')==='true','hover expands target');
  const receiver=row(target);
  receiver.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,ctrlKey:copy}));
  document.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data}));
  await wait(()=>fs.existsSync(path.join(target,path.basename(source)))&&(copy||!fs.existsSync(source)),'disk transfer');
  await pause(350);
 }
 try {
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const root=path.join(base,'workspace'),destination=path.join(root,'destination');fs.mkdirSync(destination);
  const source=path.join(root,'draft.txt'),moved=path.join(destination,'draft.txt');fs.writeFileSync(source,'original source\n');
  await files.open_file(source);await wait(()=>workspace.activeLeaf.view?.loaded,'source ready');
  const leaf=workspace.activeLeaf,view=leaf.view,model=view.editor.models[0];
  view.editor.focused_editor().executeEdits('fixture',[{range:model.getFullModelRange(),text:'unsaved source\n'}]);
  await wait(()=>files.editor_state(leaf).dirty,'source dirty');
  const version=model.getAlternativeVersionId();
  if(!workspace.sidebar.isShown||workspace.sidebar.activePanel?.ribbonButton?.id!=='linux_note:file_explorer')document.querySelector('[data-id="core.file-explorer"]').click();
  await wait(()=>document.querySelector('.workspace-explorer-tree'),'Explorer ready');await refresh();
  await drag(source,destination);
  assert(view.editor.models[0]===model&&model.getAlternativeVersionId()===version,'source model and undo version retained');
  assert(view.file_path===moved&&files.editor_state(leaf).dirty&&model.getValue()==='unsaved source\n','source draft and new path retained');
  assert(fs.readFileSync(moved,'utf8')==='original source\n','drag does not implicitly save source');
  await files.save_leaf(leaf);assert(fs.readFileSync(moved,'utf8')==='unsaved source\n'&&!fs.existsSync(source),'source save uses new path');
  await history_key('z',source,moved);
  assert(view.file_path===source&&view.editor.models[0]===model&&fs.readFileSync(source,'utf8')==='unsaved source\n','undo retains source model and saved edits');
  await history_key('y',moved,source);assert(view.file_path===moved&&view.editor.models[0]===model,'redo retains source model and path');
  const markdown=path.join(root,'native.md'),new_markdown=path.join(destination,'native.md');fs.writeFileSync(markdown,'# Original\n\nNative text.\n');
  await files.open_file(markdown);await wait(()=>File.bundle.filePath===markdown&&!File.isFileLoading(),'Markdown ready');
  File.reloadContent('# Draft\n\nUnsaved native text.\n',{delayRefresh:false,skipChangeCount:false,skipStore:true});
  await wait(()=>File.changeCounter.isDocumentEdited(),'Markdown dirty');
  const draft=File.editor.getMarkdown();await refresh();await drag(markdown,destination);
  assert(File.bundle.filePath===new_markdown&&File.changeCounter.isDocumentEdited()&&File.editor.getMarkdown()===draft,'native draft and path retained');
  assert(fs.readFileSync(new_markdown,'utf8').startsWith('# Original'),'drag does not implicitly save Markdown');
  await history_key('z',markdown,new_markdown);assert(File.bundle.filePath===markdown&&File.changeCounter.isDocumentEdited()&&File.editor.getMarkdown()===draft,'undo retains native dirty draft');
  await history_key('y',new_markdown,markdown);assert(File.bundle.filePath===new_markdown&&File.changeCounter.isDocumentEdited()&&File.editor.getMarkdown()===draft,'redo retains native dirty draft');
  const old_active=File.isActiveWindow;File.isActiveWindow=()=>true;
  try{await files.save_active();await wait(()=>!File.changeCounter.isDocumentEdited(),'Markdown saved');}finally{File.isActiveWindow=old_active;}
  assert(fs.readFileSync(new_markdown,'utf8').includes('Unsaved native text.')&&!fs.existsSync(markdown),'Markdown saves at new path');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'explorer_drag'}));await pause(600);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,input:'DOM drag and Ctrl+Z/Y events in original Typora; physical OS gesture not tested'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,tree:document.querySelector('.workspace-explorer-tree')?.outerHTML.slice(0,12000),status:document.querySelector('.workspace-explorer-status')?.textContent},null,2));}
})();
