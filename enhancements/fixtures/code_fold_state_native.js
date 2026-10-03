// R068.13: explicit native fence choices survive document reconstruction.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<500;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 let input_id=0;const click=async node=>{node.scrollIntoView({block:'center'});await pause(120);const r=node.getBoundingClientRect(),id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'click',width:innerWidth,height:innerHeight,x:r.left+r.width/2,y:r.top+r.height/2}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id;}catch{return false}},'click delivered');};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  document.addEventListener('pointerdown',event=>{const button=event.target.closest?.('.linux-note-code-toggle');if(!button)return;const start=performance.now();requestAnimationFrame(()=>samples.push({trusted:event.isTrusted,next_frame_ms:performance.now()-start,expanded:button.getAttribute('aria-expanded')}));},true);
  const code=Array.from({length:65},(_,i)=>'echo line_'+i).join('\n'),text='# Fold state\n\n```\n'+code+'\n```\n\n## Between\n\n```\n'+code+'\n```\n',a=path.join(base,'workspace/a.md'),b=path.join(base,'workspace/b.md');
  fs.writeFileSync(a,text,'utf8');fs.writeFileSync(b,'# Other file\n\nPlain text.\n','utf8');
  const fences=()=>[...document.querySelectorAll('#write .md-fences')];
  const open=async target=>{await files.open_file(target);await wait(()=>File.bundle.filePath===target&&!File.isFileLoading()&&fences().length===(target===a?2:0),'native file loaded');for(const fence of fences()){fence.scrollIntoView({block:'center'});await wait(()=>fence.querySelector('.linux-note-code-toggle'),'fold ready');}await pause(200);};
  await open(a);await click(fences()[0].querySelector('.linux-note-code-toggle'));assert(fences()[0].classList.contains('is-code-expanded'),'explicitly expanded first fence');assert(!fences()[1].classList.contains('is-code-expanded'),'duplicate second fence independent');
  for(let i=0;i<20;i++){
   await open(b);assert(fences().length===0,'other file isolated '+i);
   await open(a);assert(fences()[0].classList.contains('is-code-expanded'),'returned expansion '+i);assert(!fences()[1].classList.contains('is-code-expanded'),'duplicate remains collapsed '+i);
   await files.open_file(a,{line:5});await pause(150);assert(fences()[0].classList.contains('is-code-expanded'),'same file location '+i);
   assert(File.editor.getMarkdown().trim()===text.trim(),'native content unchanged '+i);
  }
  await click(fences()[0].querySelector('.linux-note-code-toggle'));await open(b);await open(a);assert(!fences()[0].classList.contains('is-code-expanded'),'explicit collapse retained');
  assert(fs.readFileSync(a,'utf8')===text&&fs.readFileSync(b,'utf8')==='# Other file\n\nPlain text.\n','disk content unchanged');
  await click(fences()[1].querySelector('.linux-note-code-toggle'));
  const cm=fences()[1].querySelector('.CodeMirror').CodeMirror;cm.setValue(code+'\necho edited');await pause(200);
  const edited=File.editor.getMarkdown();assert(await files.save_active(),'save isolated edited document');await pause(200);
  await open(b);await open(a);assert(!fences()[0].classList.contains('is-code-expanded')&&fences()[1].classList.contains('is-code-expanded'),'edited duplicate retains its own expansion');assert(File.editor.getMarkdown()===edited,'edited native text retained');
  assert(await files.close_leaf(core.app.workspace.activeLeaf),'close isolated document');await open(b);await open(a);assert(fences()[1].classList.contains('is-code-expanded'),'closed preview resource retains workspace choice');
  assert(fs.readFileSync(a,'utf8').trim()===edited.trim(),'only explicit isolated save changed disk');

  assert(samples.length>=3&&samples.every(sample=>sample.trusted),'trusted controls and next-frame timings captured');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,diagnostic:{path:File.bundle.filePath,busy:File.isFileLoading(),switching:File._onFileSwitching,parse:File._onInitParse,active:core.app.workspace.activeLeaf?.state,leaves:(()=>{const result=[];core.app.workspace.eachLeaves(leaf=>{result.push({path:leaf.state.path,editor:leaf.view.isEditor?.(),cls:leaf.containerEl.className,parentactive:leaf.parent.activeLeaf===leaf,root:leaf.view.containerEl.className});});return result;})(),write:document.querySelector('#write')?.getBoundingClientRect().toJSON()}},null,2));}
})();
