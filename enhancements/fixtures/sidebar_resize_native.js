// R071.6: trusted container resizing in an isolated, original native host.
(async () => {
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__;
 const core=window[Symbol.for('typora-code:workspace')], files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const checks=[],samples=[],cleanup=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<600;i++){if(test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 let current,frame=0,input_id=0,last_frame=0,last_input=0;
 const write=()=>fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'RUNNING',checks,samples},null,2));
 try {
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const dismiss=()=>Array.from(document.querySelectorAll('.workspace-onboarding button')).find(node=>/^(跳过|Skip)$/.test(node.textContent.trim()))?.click();dismiss();
  const sidebar=core.app.workspace.sidebar;sidebar.show();
  const rect_original=Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect=function(){if(current){current.rects++;if(current.rects%100===1){const stack=new Error().stack.split('\n').slice(2,6).join('\n');current.stacks[stack]=(current.stacks[stack]||0)+1;}}return rect_original.call(this);};
  cleanup.push(()=>{Element.prototype.getBoundingClientRect=rect_original;});
  const event=ev=>{if(!current)return;if(ev.type==='pointermove'&&ev.buttons===1){current.inputs++;current.trusted+=Number(ev.isTrusted);last_input=performance.now();current.last_input=last_input;current.pending_input??=last_input;}else if(ev.type!=='pointermove'){current[ev.type]=(current[ev.type]||0)+1;}};
  for(const name of ['pointermove','resize','optimizedResize']){window.addEventListener(name,event,true);cleanup.push(()=>window.removeEventListener(name,event,true));}
  const tick=time=>{if(current){if(last_frame)current.gaps.push(time-last_frame);const width=document.querySelector('content').getBoundingClientRect().width;if(width!==current.width){current.width=width;current.last_geometry=performance.now();if(current.pending_input!==undefined){current.latencies.push(performance.now()-current.pending_input);current.pending_input=undefined;}}last_frame=time;}else last_frame=0;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);cleanup.push(()=>cancelAnimationFrame(frame));
  const resize=async (dx,sash=document.querySelector('#typora-sidebar-resizer'))=>{
   const r=sash.getBoundingClientRect(),id=++input_id;
   fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'drag',x:r.left+r.width/2,y:Math.max(140,r.top+60),dx,steps:100,interval:8,width:innerWidth,height:innerHeight}));
   await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id;}catch{return false;}},'drag receipt');
   await pause(850);
  };
  const short='# Resize fixture\n\nA short paragraph.\n';
  const cases=[['short',short],['paragraphs',short+'A wrapping paragraph with many words and a stable reading anchor. '.repeat(40).concat('\n\n').repeat(100)],...[20,100,1000].map(count=>['fences_'+count,short+Array.from({length:count},(_,i)=>'## Section '+i+'\n\n```c\nint value_'+i+' = '+i+';\n```\n\nParagraph after the fence.\n\n').join('')])];
  const repro=path.join(base,'workspace/repro.md');if(fs.existsSync(repro))cases.push(['reported',fs.readFileSync(repro,'utf8')]);
  for(const [name,text]of cases){
   const file=path.join(base,'workspace/resize_'+name+'.md');fs.writeFileSync(file,text,'utf8');await files.open_file(file);await pause(1600);dismiss();
   const owner=document.querySelector('content');owner.scrollTop=owner.scrollHeight*.7;await pause(700);
   const originals=[];
   for(const wrapper of document.querySelectorAll('#write .CodeMirror'))for(const method of ['refresh','setSize']){const cm=wrapper.CodeMirror,original=cm?.[method];if(!original)continue;cm[method]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{if(current){current[method]=(current[method]||0)+1;current.cm_ms+=performance.now()-start;current.last_work=performance.now();}}};originals.push(()=>{cm[method]=original;});}
   const before=File.editor.getMarkdown(),width=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'));
   current={name,inputs:0,trusted:0,rects:0,cm_ms:0,gaps:[],latencies:[],stacks:{},cm:document.querySelectorAll('#write .CodeMirror').length,start:performance.now(),width:owner.getBoundingClientRect().width};
   await resize(220);const wide=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'));await resize(-220);
   current.elapsed=performance.now()-current.start;current.tail_ms=Math.max(current.last_work||0,current.last_geometry||0,current.last_input)-current.last_input;samples.push(current);current=undefined;
   for(const restore of originals)restore();
   assert(wide>=width+200,name+': trusted drag resizes the sidebar');
   assert(samples.at(-1).trusted>5,name+': receives trusted pointer moves');
   assert(File.editor.getMarkdown()===before,name+': document unchanged');
   assert(Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'))-width)<3,name+': returning drag restores width');write();
  }
  // Native source remains a container-owned editor after removing synthetic window resize.
  const owner=document.querySelector('content'),original=File.editor.getMarkdown();
  File.toggleSourceMode();await pause(300);
  const cm=File.editor.sourceView.cm,selection=JSON.stringify(cm.listSelections());
  const source_scrolls=[],original_scroll=cm.scrollTo;
  cm.scrollTo=function(...args){if(source_scrolls.length<400)source_scrolls.push({time:performance.now(),args,stack:new Error().stack});return original_scroll.apply(this,args);};cleanup.push(()=>{cm.scrollTo=original_scroll;});
  const anchor=()=>{const info=cm.getScrollInfo();return cm.coordsChar({left:info.left,top:info.top+80},'local').line;};
  for(const theme of ['vscode2026_dark.css','vscode2026_light.css']){
   ClientCommand.setTheme(theme,theme);await pause(500);
   const line=anchor(),before=cm.getScrollInfo();await resize(160);await resize(-160);
   const after_line=anchor(),info=cm.getScrollInfo(),point=cm.coordsChar({left:info.left,top:info.top},'local'),coord=cm.charCoords(point,'local');samples.push({name:'source_position',theme,line,after_line,before,after:info,point,coord,roundtrip:cm.coordsChar({left:coord.left,top:coord.top},'local'),font:getComputedStyle(cm.getWrapperElement()).fontSize,source_scrolls:[...source_scrolls]});source_scrolls.length=0;
   assert(Math.abs(after_line-line)<=2,theme+': source keeps its visible logical line');
   assert(JSON.stringify(cm.listSelections())===selection,theme+': source cursor is unchanged');
   const a=owner.getBoundingClientRect(),b=document.querySelector('#typora-source').getBoundingClientRect();
   assert(['top','left','width','height'].every(key=>Math.abs(a[key]-b[key])<1),theme+': source shares the native group rectangle');
   assert(Math.abs(cm.display.lastWrapWidth-cm.getWrapperElement().clientWidth)<2,theme+': source scroll geometry refreshed');
  }
  const leaf=core.app.workspace.activeLeaf,group=leaf.parent,destination=core.split_workspace_group(leaf,'right');await pause(300);
  await resize(120);await resize(-120);
  const a=owner.getBoundingClientRect(),b=leaf.parent.tabContentEl.getBoundingClientRect();
  samples.push({name:'split_geometry',actual:a.toJSON(),expected:b.toJSON(),style:owner.getAttribute('style'),classes:owner.className,group:leaf.parent.containerEl.className});
  assert(['top','left','width','height'].every(key=>Math.abs(a[key]-b[key])<1),'native frame follows the resized split group');
  await resize(100,destination.resizeHandleEl);const expanded=owner.getBoundingClientRect().width;await resize(-100,destination.resizeHandleEl);
  assert(expanded>a.width+80&&Math.abs(owner.getBoundingClientRect().width-a.width)<3,'trusted editor split dragging updates the same native frame');
  destination.detach();await pause(250);File.toggleSourceMode();await pause(250);
  assert(File.editor.getMarkdown()===original,'source resizing and split movement preserve document content');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,current},null,2));}
 finally{for(const restore of cleanup.reverse())restore();}
})();
