// R005.4/R071.7: split lifecycle and native restoration in a private host.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<500;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],workspace=core.app.workspace,files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const directory=path.join(base,'workspace'),left_file=path.join(directory,'left.md'),right_file=path.join(directory,'right.md');
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=40;canvas.getContext('2d').fillRect(0,0,64,40);fs.writeFileSync(path.join(directory,'image.png'),Buffer.from(canvas.toDataURL().split(',')[1],'base64'));
  const text=name=>Array.from({length:20},(_,i)=>`## ${name} heading ${i}\n\nParagraph ${i} with editable text.\n\n![local](image.png)\n\n\x60\x60\x60c\nint value_${i} = ${i};\n\x60\x60\x60\n\n`).join('');
  fs.writeFileSync(left_file,text('left'),'utf8');fs.writeFileSync(right_file,text('right'),'utf8');
  await files.open_file(left_file);await pause(300);
  const left=workspace.activeLeaf;await files.open_file(right_file,undefined,'right');await pause(500);
  assert(workspace.rootSplit.children.length===2,'split creates exactly two groups');
  let right;workspace.eachLeaves(leaf=>{if(leaf.state.path===right_file)right=leaf;});
  const preview=()=>[left,right].find(leaf=>!leaf.view.isEditor());
  const sample=stage=>({stage,left_native:left.view.isEditor(),right_native:right.view.isEditor(),left_top:left.view.getScroll().scrollTop,right_top:right.view.getScroll().scrollTop,preview_images:preview().view.containerEl.querySelectorAll('img').length,preview_cm:preview().view.containerEl.querySelectorAll('.CodeMirror').length,heap:performance.memory?.usedJSHeapSize,disposables:[left.view._disposables.length,right.view._disposables.length]});
  samples.push(sample('initial'));
  const target=preview(),first=target.view.containerEl.firstElementChild;target.view.applyScroll({scrollTop:450});
  const renderer=core.app.features.markdownRenderer,original=renderer.renderTo;let renders=0;renderer.renderTo=function(...args){renders++;return original.apply(this,args);};
  for(let i=0;i<20;i++)workspace.rootSplit.emit('layout-changed');await pause(250);samples.push({...sample('layout'),renders,same_node:first===target.view.containerEl.firstElementChild});
  assert(first===target.view.containerEl.firstElementChild,'unchanged layout preserves preview nodes');
  assert(renders===0,'unchanged layout performs no preview render');
  assert(target.view.getScroll().scrollTop>=440,'unchanged layout preserves scroll');
  await wait(()=>[...target.view.containerEl.querySelectorAll('img')].some(image=>image.complete&&image.naturalWidth===64),'relative image loads pixels');
  assert(target.view.containerEl.querySelectorAll('img').length===20,'relative images render in split');
  assert(target.view.containerEl.querySelectorAll('.CodeMirror').length===0,'inactive split has no code editor instances');
  const native=[left,right].find(leaf=>leaf.view.isEditor());
  for(let i=0;i<20;i++)core.app.features.markdownEditor.emit('edit');await pause(250);
  assert(renders===0,'unrelated native edits do not re-render inactive file');
  assert(fs.readFileSync(left_file,'utf8')===text('left')&&fs.readFileSync(right_file,'utf8')===text('right'),'test does not edit source');
  for(let i=0;i<100;i++){
    const next=preview(),old=[left,right].find(leaf=>leaf.view.isEditor());
    next.view._swapCommand.execute(old,next);
    await wait(()=>next.view.isEditor()&&getComputedStyle(document.querySelector('content')).visibility!=='hidden','swap completes');
    await pause(50);
    assert(File.bundle.filePath===next.state.path,'swap '+i+' retains document identity');
    assert(preview().view.containerEl.querySelectorAll('.CodeMirror').length===0,'swap '+i+' owns no inactive editors');
  }
  samples.push(sample('100 swaps'));
  assert(left.view._disposables.length<12&&right.view._disposables.length<12,'restoration callbacks remain bounded');
  renderer.renderTo=original;
  for(const theme of ['vscode2026_light.css','vscode2026_dark.css']){
    ClientCommand.setTheme(theme,theme);await pause(350);
    const native_heading=document.querySelector('#write h2'),preview_heading=preview().view.containerEl.querySelector('h2');
    const properties=['fontFamily','fontSize','fontWeight','color','lineHeight'];
    const actual=Object.fromEntries(properties.map(name=>[name,[getComputedStyle(native_heading)[name],getComputedStyle(preview_heading)[name]]]));
    samples.push({stage:theme,heading_styles:actual});
    assert(properties.every(name=>actual[name][0]===actual[name][1]),theme+' shared heading typography');
  }
  const sidebar=document.querySelector('#typora-sidebar');workspace.activeLeaf=preview();core.app.commands.run('linux_note:outline');await pause(250);
  const projection=sidebar.querySelector('.workspace-source-outline');
  assert(projection&&!projection.hidden,'inactive group has its own outline');
  const label=[...projection.querySelectorAll('button[data-symbol-name]')].find(node=>node.dataset.symbolName.endsWith('heading 10'));
  assert(label,'inactive outline contains target file headings');label.click();await pause(100);
  const chosen=preview().view.containerEl.querySelectorAll('h2')[10],box=chosen.getBoundingClientRect(),viewport=preview().containerEl.getBoundingClientRect();
  assert(box.top>=viewport.top&&box.top<viewport.top+60,'inactive outline jump retains visible heading');
  assert(projection.querySelector('[aria-selected="true"]')?.dataset.symbolOffset==='10','inactive outline keeps clicked heading');
  const scroller=preview().containerEl,rect=scroller.getBoundingClientRect();let input_time=0,first_frame_ms=0,last_scroll=0;
  const on_wheel=event=>{if(event.isTrusted&&!input_time)input_time=performance.now();};
  const on_scroll=()=>{if(!input_time)return;last_scroll=performance.now();if(!first_frame_ms)requestAnimationFrame(()=>{if(!first_frame_ms)first_frame_ms=performance.now()-input_time;});};
  scroller.addEventListener('wheel',on_wheel,true);scroller.addEventListener('scroll',on_scroll,true);
  fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id:1,kind:'wheel',x:rect.left+rect.width/3,y:rect.top+rect.height/2,delta:-600,width:innerWidth,height:innerHeight}));
  await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===1}catch{return false}},'trusted wheel');await pause(250);
  scroller.removeEventListener('wheel',on_wheel,true);scroller.removeEventListener('scroll',on_scroll,true);
  samples.push({stage:'trusted wheel',input_time,first_frame_ms,scroll_tail_ms:last_scroll?last_scroll-input_time:null});assert(input_time>0&&first_frame_ms>0,'native wheel changes split content by next observed frame');
  const preview_top=preview().view.getScroll().scrollTop;
  workspace.activeLeaf=[left,right].find(leaf=>leaf.view.isEditor());core.app.commands.run('linux_note:outline');await pause(100);
  const native_heading=document.querySelectorAll('#write h2')[10],cid=native_heading.getAttribute('cid');
  const native_label=[...sidebar.querySelectorAll('#outline-content .outline-label')].find(node=>node.dataset.ref===cid);
  assert(native_label,'native outline belongs to native document');native_label.click();await pause(150);
  const native_top=native_heading.getBoundingClientRect().top,header=workspace.activeLeaf.parent.containerEl.querySelector('.workspace-breadcrumbs').getBoundingClientRect();
  assert(native_top>=header.bottom&&native_top<header.bottom+40,'native outline click clears group navigation');
  assert(sidebar.querySelector('#outline-content .outline-active')?.dataset.ref===cid,'native outline keeps clicked heading through delayed callbacks');
  assert(Math.abs(preview().view.getScroll().scrollTop-preview_top)<2,'native outline jump leaves other pane position unchanged');
  samples.push({stage:'geometry',viewport:[innerWidth,innerHeight],groups:[left,right].map(leaf=>({group:leaf.parent.containerEl.getBoundingClientRect().toJSON(),content:leaf.containerEl.getBoundingClientRect().toJSON(),tabs:leaf.parent.containerEl.querySelector('.workspace-tab-strip')?.getBoundingClientRect().toJSON()})),sidebar:sidebar.getBoundingClientRect().toJSON()});
  for(const count of [20,100,1000]){
    const root=document.createElement('div');document.body.append(root);
    renderer.renderTo(Array.from({length:count},(_,i)=>'\x60\x60\x60js\nconst sample_'+i+' = '+i+';\n\x60\x60\x60').join('\n\n'),root,left_file);
    assert(root.querySelectorAll('pre > code').length===count,'static reading retains '+count+' complete code blocks');
    assert(!root.querySelector('.CodeMirror'),'static reading creates no editor for '+count+' blocks');
    renderer.release(root);root.remove();await pause(50);
  }
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'split'}));
  await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage==='split'}catch{return false}},'capture complete');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
