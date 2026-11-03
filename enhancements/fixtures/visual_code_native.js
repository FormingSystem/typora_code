// R087: verify original-host fence ownership and bundled renderers on a private desktop.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],timings=[],edit_latency=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<1000;i++){if(await test())return;await pause(25);}throw Error(label);};
 let input_id=0;const click=async(node)=>{node.scrollIntoView({block:'center'});await pause(300);const r=node.getBoundingClientRect(),id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'click',width:innerWidth,height:innerHeight,x:r.left+Math.min(20,r.width/2),y:r.top+Math.min(12,r.height/2)}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id}catch{return false}},'trusted click');await pause(250);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  const samples=JSON.parse(fs.readFileSync(path.join(base,'visual_code_samples.json'),'utf8'));
  const aliases={graphviz:'dot',vega_lite:'vega-lite',react:'tsx',html_live:'html-live',javascript_live:'javascript-live'};
  for(const [format,source] of Object.entries(samples)){
   const file=path.join(base,'workspace','visual-'+format+'.md');
   const language=aliases[format]||format,text='# Visual QA\n\n```'+language+'\n'+source+'\n```\n\nTail.\n';
   fs.writeFileSync(file,text,'utf8');await files.open_file(path.join(base,'workspace','front.md'));await files.open_file(file);
   await wait(()=>File.bundle.filePath===file&&!File.isFileLoading(),'open '+format);
   await wait(()=>document.querySelector('#write .md-fences'),'fence '+format);
   const fence=document.querySelector('#write .md-fences');fence.scrollIntoView({block:'center'});const start=performance.now();
   if(['mermaid','flow','sequence'].includes(format)){await wait(()=>fence.querySelector('svg'),'native '+format);checks.push(format+' native rendered');continue;}
   await wait(()=>fence.querySelector('.visual-code-view'),'adapter '+format);
   if(['react','html_live','javascript_live'].includes(format))fence.querySelector('.visual-code-view>button').click();
   await wait(()=>['ready','error'].includes(fence.querySelector('.visual-code-view')?.dataset.visualState),'result '+format);
   const view=fence.querySelector('.visual-code-view');assert(view.dataset.visualState==='ready',format+': '+view.querySelector('.visual-code-error').textContent);
   assert(fence.querySelector('iframe').getAttribute('sandbox')==='allow-scripts',format+' isolated');
   assert(fs.readFileSync(file,'utf8')===text,format+' disk preserved');
   const model=fence.querySelector('.CodeMirror').CodeMirror;assert(model.getValue().trim()===source.trim(),format+' native source preserved');
   timings.push({format,render_ms:performance.now()-start});
   if(format==='svg'||format==='graphviz'){await pause(300);fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'visual_'+format}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage==='visual_'+format}catch{return false}},'capture '+format);}
   if(format==='svg'){
    const original=model.getValue();model.focus();model.setCursor({line:0,ch:0});model.replaceRange(' ',{line:0,ch:0});await pause(400);assert(model.getValue()!==original,'native edit');await files.save_active();assert(fs.readFileSync(file,'utf8').includes(' '+source),'native save includes edit');assert(!fs.readFileSync(file,'utf8').includes('visual-code'),'render UI excluded from saved source');ClientCommand.undo();await pause(400);assert(model.getValue()===original,'native undo');await files.save_active();assert(fs.readFileSync(file,'utf8').includes(source),'undo save preserves source');
    const cm=fence.querySelector('.CodeMirror');
    await click(document.querySelector('#write>p:last-child'));
    assert(!fence.classList.contains('md-focus'),'native selection leaves SVG');assert(getComputedStyle(cm).display==='none','native reading source hidden');
    await click(fence.querySelector('.visual-code-view'));if(!cm.contains(document.activeElement)){await pause(200);await click(fence.querySelector('.visual-code-view'));}
    assert(getComputedStyle(cm).display!=='none','diagram click opens native source');assert(cm.contains(document.activeElement),'diagram click focuses original model');
    assert(!fence.querySelector('.visual-code-toolbar'),'no permanent toolbar');assert(!!document.querySelector('.visual-code-enlarge'),'shared hover actions outside document');

   }
  }
  const portable_svg=path.join(base,'workspace','portable.svg'),portable_doc=path.join(base,'workspace','portable.md');
  fs.copyFileSync(path.join(_options.userDataPath,'typora_code/assets/help/assets/visual_pipeline.svg'),portable_svg);
  const portable_text='# Portable SVG\n\n![Application through driver](portable.svg)\n';fs.writeFileSync(portable_doc,portable_text,'utf8');await files.open_file(portable_doc);
  await wait(()=>File.bundle.filePath===portable_doc&&!File.isFileLoading(),'portable image document');
  await wait(()=>document.querySelector('#write img')?.naturalWidth===640,'relative SVG image decoded');await pause(200);
  const portable_image=document.querySelector('#write img');await wait(()=>getComputedStyle(portable_image).getPropertyValue('--reading-image-natural-width').trim()==='640px','portable image dimensions applied');
  const portable_style=getComputedStyle(portable_image),portable_border=['borderLeftWidth','borderRightWidth','paddingLeft','paddingRight'].reduce((sum,key)=>sum+(parseFloat(portable_style[key])||0),0);
  fs.writeFileSync(path.join(base,'portable-image.json'),JSON.stringify({natural:portable_image.naturalWidth,rect:portable_image.getBoundingClientRect().toJSON(),border:portable_border,settings:core.app.settings.get('reading_images')},null,2));
  assert(portable_image.getBoundingClientRect().width-portable_border<=640.5,'linked SVG does not stretch');assert(fs.readFileSync(portable_doc,'utf8')===portable_text,'portable image keeps Markdown reference');
  // R087.4: time renderer input independently from remote-desktop delivery and fixture polling.
  const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
  for(const scenario of [{name:'short',nodes:1,background:0},{name:'long',nodes:400,background:0},{name:'long_background',nodes:400,background:20}]){
   const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300">\n'+Array.from({length:scenario.nodes},(_,i)=>'<text x="'+(i%10)*60+'" y="'+(i%20)*15+'">node '+i+'</text>').join('\n')+'\n</svg>';
   const text='# Latency\n\n```svg\n'+source+'\n```\n\nTail.\n\n'+Array.from({length:scenario.background},()=>'```svg\n'+samples.svg+'\n```\n\nBackground.\n').join('\n');
   const file=path.join(base,'workspace','latency-'+scenario.name+'.md');fs.writeFileSync(file,text,'utf8');await files.open_file(file);
   await wait(()=>File.bundle.filePath===file&&!File.isFileLoading(),'latency document');
   const fence=document.querySelector('#write .md-fences'),tail=fence.nextElementSibling;fence.scrollIntoView({block:'start'});await wait(()=>fence.querySelector('[data-visual-state="ready"]'),'latency render');await pause(500);
   const cm=fence.querySelector('.CodeMirror'),model=cm.CodeMirror,original_refresh=model.refresh,original_focus=model.focus,focuses=[],refreshes=[],events=[],long_tasks=[];let pending,measuring=false;
   model.refresh=function(...args){const t=performance.now();try{return original_refresh.apply(this,args);}finally{refreshes.push(performance.now()-t);}};
   model.focus=function(...args){const t=performance.now();try{return original_focus.apply(this,args);}finally{focuses.push(performance.now()-t);}};
   const long_observer=new PerformanceObserver(list=>{for(const item of list.getEntries())long_tasks.push({start:item.startTime,duration:item.duration});});long_observer.observe({type:'longtask'});
   const capture=event=>{if(!measuring||!event.isTrusted||!fence.querySelector('.visual-code-view')?.contains(event.target))return;const started=performance.now(),count=refreshes.length;const item={trusted:event.isTrusted,started,was_focused:cm.contains(document.activeElement)};events.push(item);event.target.closest('.visual-code-view').addEventListener('mousedown',()=>{item.handler_ms=performance.now()-started;},{once:true});requestAnimationFrame(()=>{item.focused=cm.contains(document.activeElement);item.first_frame_ms=performance.now()-started;requestAnimationFrame(()=>{item.second_frame_ms=performance.now()-started;item.refresh_count=refreshes.length-count;item.refresh_ms=refreshes.slice(count).reduce((a,b)=>a+b,0);pending?.();pending=undefined;});});};
   document.addEventListener('mousedown',capture,true);
   const measured_click=async node=>{node.scrollIntoView({block:'center'});await pause(300);if(node.classList.contains('visual-code-view')){node=fence.querySelector('.visual-code-view');if(!node)return false;}const r=node.getBoundingClientRect(),id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'click',width:innerWidth,height:innerHeight,x:r.left+Math.min(20,r.width/2),y:r.top+Math.min(12,r.height/2)}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id}catch{return false}},'latency input');await pause(40);};
   try{
    for(let i=0;i<80&&events.length<20;i++){await measured_click(tail);if(cm.contains(document.activeElement)||fence.classList.contains('md-focus'))continue;fence.scrollIntoView({block:'center'});await wait(()=>fence.querySelector('[data-visual-state="ready"]'),'visible SVG');const done=new Promise(resolve=>pending=resolve);measuring=true;try{await measured_click(fence.querySelector('.visual-code-view'));await Promise.race([done,pause(2000)]);}finally{measuring=false;}}
    fs.writeFileSync(path.join(base,'latency-'+scenario.name+'.json'),JSON.stringify({events,refreshes,focuses,options:{viewportMargin:model.getOption('viewportMargin'),lineWrapping:model.getOption('lineWrapping')},focus_function:String(original_focus),connected:fence.isConnected,tail:tail.outerHTML.slice(0,400)},null,2));
    assert(events.length===20&&events.every(e=>!e.was_focused&&e.focused&&e.second_frame_ms!==undefined),scenario.name+' twenty trusted source activations');
    edit_latency.push({scenario:scenario.name,source_bytes:source.length,background_diagrams:scenario.background,samples:events,summary:{handler_p50:percentile(events.map(e=>e.handler_ms),.5),handler_p95:percentile(events.map(e=>e.handler_ms),.95),handler_max:Math.max(...events.map(e=>e.handler_ms)),frame_p95:percentile(events.map(e=>e.second_frame_ms),.95),refresh_count:events.reduce((a,e)=>a+e.refresh_count,0)},long_tasks,source_unchanged:model.getValue().trim()===source.trim()});
   }finally{model.refresh=original_refresh;model.focus=original_focus;document.removeEventListener('mousedown',capture,true);long_observer.disconnect();}
  }
  await files.open_file(path.join(base,'workspace','front.md'));await pause(500);assert(!document.querySelector('#write .visual-code-frame'),'native disposal');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,timings,edit_latency},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,timings,edit_latency,error:String(error.stack||error)},null,2));}
})();
