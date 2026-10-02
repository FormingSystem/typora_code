// R071.7: native single-pane fence editing with document and frame diagnostics.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[],errors=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<500;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],workspace=core.app.workspace,files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const scenario_path=path.join(base,'edit_scenario.json'),scenario=fs.existsSync(scenario_path)?JSON.parse(fs.readFileSync(scenario_path,'utf8')):{};
 const cycles=Math.max(1,Math.min(1000,scenario.cycles||100)),interval_ms=Math.max(0,Math.min(60000,scenario.interval_ms||0)),started=performance.now();
 let mutations=0,head_mutations=0,frames=0,stopped=false,trusted_inputs=0,input_id=0,trusted_saves=0;
 const on_key=event=>{if(event.isTrusted&&event.ctrlKey&&event.code==='KeyS')trusted_saves++;};
 const on_input=event=>{if(event.isTrusted)trusted_inputs++;};
 document.addEventListener('keydown',on_key,true);document.addEventListener('input',on_input,true);
 const original_active=File.isActiveWindow;
 const send=async(kind,value)=>{const id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind,...value,width:innerWidth,height:innerHeight,x:100,y:200}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id}catch{return false}},'input delivered');await pause(80);};
 const body_observer=new MutationObserver(records=>{mutations+=records.length;});body_observer.observe(document.body,{subtree:true,childList:true,characterData:true});
 const head_observer=new MutationObserver(records=>{head_mutations+=records.length;});head_observer.observe(document.head,{subtree:true,childList:true,characterData:true});
 const on_error=event=>errors.push({message:event.message,stack:String(event.error?.stack||'')});window.addEventListener('error',on_error);
 const tick=()=>{frames++;if(!stopped)requestAnimationFrame(tick);};requestAnimationFrame(tick);
 const sample=(stage)=>{const write=document.querySelector('#write'),content=document.querySelector('content');const item={stage,frames,mutations,head_mutations,markdown_length:File.editor.getMarkdown().length,node_count:File.editor.nodeMap.allNodes._set.length,write_children:write?.children.length,write_rect:write?.getBoundingClientRect().toJSON(),content_style:content?.getAttribute('style'),body_class:document.body.className,head_style_bytes:[...document.head.querySelectorAll('style')].reduce((n,s)=>n+s.textContent.length,0),heap:performance.memory?.usedJSHeapSize,errors:errors.length};samples.push(item);fs.writeFileSync(path.join(base,'edit_progress.json'),JSON.stringify({samples,errors},null,2));return item;};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const corpus=path.join(base,'workspace','corpus.md');
  const text='# Native editing sentinel\n\n'+Array.from({length:12},(_,i)=>`## Section ${i}\n\nStable paragraph ${i}.\n\n\x60\x60\x60tex\n\\frac{a_${i}}{b} + \\sum_{k=0}^{10} k\n\x60\x60\x60\n\n\x60\x60\x60bash\nfor file in *.md; do\n  echo "$file"\ndone\n\x60\x60\x60\n\n`).join('')+(fs.existsSync(corpus)?fs.readFileSync(corpus,'utf8'):'');
  const file=path.join(base,'workspace','code_edit.md');fs.writeFileSync(file,text,'utf8');await files.open_file(file);
  await wait(()=>!File.isFileLoading()&&document.querySelectorAll('#write .md-fences').length>=24,'native fences');await pause(400);
  assert(workspace.rootSplit.children.length===1,'single editor group');sample('initial');
  const baseline=File.editor.getMarkdown();
  // Explicit saves in a private desktop cannot acquire the user's foreground window.
  File.isActiveWindow=()=>true;
  for(let i=0;i<cycles;i++){
   const language=i%2?'bash':'tex',fences=[...document.querySelectorAll(`#write .md-fences[lang="${language}"]`)],fence=fences[Math.floor(i/2)%fences.length];fence.scrollIntoView({block:'center'});await pause(50);
   await wait(()=>fence.querySelector('.CodeMirror')?.CodeMirror,'code editor available');
   const cm=fence.querySelector('.CodeMirror').CodeMirror;cm.focus();cm.setCursor({line:0,ch:0});
   const before=cm.getValue(),events=trusted_inputs;await send('text',{text:'x'});
   assert(cm.getValue()==='x'+before&&trusted_inputs>events,'trusted input changes native fence '+i);
   const expected=File.editor.getMarkdown();
   assert(expected.includes('x'+before),'native memory retains typed fence '+i);
   const saves=trusted_saves;
   if(i%2)await files.save_active();else await send('save_key',{});
   assert(i%2||trusted_saves>saves,'trusted Ctrl+S delivered '+i);
   await wait(()=>fs.readFileSync(file,'utf8')===expected,'saved current content');
   assert(fs.readFileSync(file,'utf8')===expected,'explicit save writes current document '+i);
   await send('key',{key:8});
   assert(cm.getValue()===before,'backspace retains native fence '+i);
   assert(cm.getValue()===before,'fence content retained '+i);
   const state=sample('edit '+i);
   assert(File.editor.getMarkdown()===baseline,'complete document remains unchanged '+i);
   assert(state.markdown_length>text.length/2&&state.write_children>24&&state.node_count>24,'document retained '+i);
   assert(state.frames>0&&getComputedStyle(document.querySelector('content')).visibility!=='hidden','content remains visible '+i);
   await pause(interval_ms);
  }
  await pause(1000);sample('settled');
  await files.save_active();File.isActiveWindow=original_active;
  assert(fs.readFileSync(file,'utf8')===baseline,'isolated source restored after explicit saves');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'code_edit'}));
  await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage==='code_edit'}catch{return false}},'capture complete');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,errors,trusted_inputs,trusted_saves,cycles,elapsed_ms:performance.now()-started,input:'OS text, backspace and Ctrl+S messages to isolated host; alternating save service'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,errors},null,2));}
 finally{stopped=true;File.isActiveWindow=original_active;body_observer.disconnect();head_observer.disconnect();document.removeEventListener('keydown',on_key,true);document.removeEventListener('input',on_input,true);window.removeEventListener('error',on_error);}
})();
