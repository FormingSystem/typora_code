// Trusted preview gestures run only in an independent original-host window.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),http=reqnode('http'),base=__CASE_ROOT__;
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const checks=[],samples=[],cleanup=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<500;i++){if(await test())return;await pause(20);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 let server,current,frame=0,input_id=0;
 const rect=node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const dismiss=()=>[...document.querySelectorAll('.workspace-onboarding button')].find(node=>/^(跳过|Skip)$/.test(node.textContent.trim()))?.click();dismiss();
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><style>body{font:16px monospace}p{height:50px}</style>'+Array.from({length:100},(_,i)=>'<p>Web preview line '+i+'</p>').join(''));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
  const record=event=>{if(!current)return;if(event.type==='pointermove'&&event.buttons===1){current.first_move??={id:event.pointerId,target:event.target.outerHTML?.slice(0,200)};current.inputs++;current.trusted+=Number(event.isTrusted);current.pending??=performance.now();current.last_input=performance.now();}else if(event.type!=='pointermove')current.events[event.type]=(current.events[event.type]||0)+1;};
  for(const name of ['pointermove','beforeResize','resize','optimizedResize']){window.addEventListener(name,record,true);cleanup.push(()=>window.removeEventListener(name,record,true));}
  const down=event=>{if(current)current.down={id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target.outerHTML?.slice(0,300),trusted:event.isTrusted};};window.addEventListener('pointerdown',down,true);cleanup.push(()=>window.removeEventListener('pointerdown',down,true));
  const tick=time=>{if(current){if(current.last_frame)current.gaps.push(time-current.last_frame);current.last_frame=time;const box=rect(document.querySelector('.workspace-link-dock'));if(box.join()!==current.box.join()){current.box=box;current.last_geometry=performance.now();if(current.pending!==undefined){current.latencies.push(performance.now()-current.pending);current.pending=undefined;}}const owner=document.querySelector('content');current.scroll_changes+=Number(owner.scrollTop!==current.scroll_top);current.geometry_changes+=Number(rect(owner).join()!==current.editor_box.join());}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);cleanup.push(()=>cancelAnimationFrame(frame));
  const input=async(request)=>{const id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,...request,width:innerWidth,height:innerHeight}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id;}catch{return false;}},'trusted input receipt');};
  for(const [count,theme,identity,kind] of [[20,'vscode_default_light.css','light','web'],[100,'vscode_2026_default_dark.css','dark_2026','web'],[1000,'vscode_default_dark.css','dark','web'],[20,'vscode_2026_default_light.css','light_2026','markdown']]){
   fs.writeFileSync(path.join(base,'workspace/local_preview.md'),'# Local preview\n\n```c\nint value = 42;\n```\n');const href=kind==='web'?url:'local_preview.md';
   const text='# Preview resize\n\n[Web preview]('+href+')\n\n'+Array.from({length:count},(_,i)=>'## Section '+i+'\n\nA paragraph before code.\n\n```c\nint value_'+i+' = '+i+';\n```\n\n').join('');
   const file=path.join(base,'workspace/preview_'+count+'.md');fs.writeFileSync(file,text);await files.open_file(file);ClientCommand.setTheme(theme,theme);await wait(()=>document.documentElement.dataset.workspaceCodeTheme===identity,'active theme '+identity);await pause(1500);dismiss();
   const owner=document.querySelector('content');owner.scrollTop=0;await pause(250);
   const link=[...document.querySelectorAll('#write a')].find(a=>a.getAttribute('href')===href);assert(!!link,'native link '+count);
   link.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0}));const range=document.createRange();range.selectNodeContents(link);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));
   const dock=document.querySelector('.workspace-link-dock');await wait(()=>!dock.hidden&&dock.querySelector(kind==='web'?'webview':'.workspace-lookup-markdown'),'web dock '+count);await pause(600);
   dock.querySelector('.workspace-link-preview-pin').click();owner.scrollTop=owner.scrollHeight*.6;await pause(600);
   const before=File.editor.getMarkdown(),originals=[];
   for(const node of document.querySelectorAll('#write .CodeMirror'))for(const method of ['refresh','setSize']){const cm=node.CodeMirror,original=cm?.[method];if(!original)continue;cm[method]=function(...args){if(current){current.editor_layouts++;current.last_layout=performance.now();}return original.apply(this,args);};originals.push(()=>{cm[method]=original;});}
   for(const [edge,dx,dy] of [['east',180,0],['north',0,-90],['north-east',-100,60]]){
    const handle=dock.querySelector('[data-edge="'+edge+'"]'),r=handle.getBoundingClientRect(),x=r.left+r.width/2,y=edge==='east'?r.top+12:r.top+r.height/2;
    current={count,theme,identity,kind,edge,hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,300),events:{},inputs:0,trusted:0,gaps:[],latencies:[],editor_layouts:0,scroll_changes:0,geometry_changes:0,scroll_top:owner.scrollTop,editor_box:rect(owner),box:rect(dock)};
    await input({kind:'drag',x,y,dx,dy,steps:100,interval:8});await pause(400);
    current.tail_ms=Math.max(0,(current.last_geometry||0)-(current.last_input||0));current.end={box:rect(dock),style:dock.getAttribute('style'),active:dock.dataset.previewResizing};samples.push(current);current=undefined;
    const sample=samples.at(-1);assert(sample.trusted>5,'trusted '+count+' '+edge);assert(sample.latencies.length>0,'overlay changed '+count+' '+edge);
    assert(!Object.keys(sample.events).length,'no global resize '+count+' '+edge+' '+JSON.stringify(sample.events));assert(!sample.geometry_changes&&!sample.scroll_changes,'editor stable '+count+' '+edge+' '+JSON.stringify({scroll:sample.scroll_changes,geometry:sample.geometry_changes}));assert(!sample.editor_layouts,'no editor relayout '+count+' '+edge);assert(File.editor.getMarkdown()===before,'content retained '+count+' '+edge);
   }
   for(const restore of originals)restore();
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'preview_resize_'+kind+'_'+count}));await pause(400);
   dock.querySelector('[aria-label="关闭链接预览"],[aria-label="Close link preview"]').click();assert(dock.hidden&&!dock.querySelector('webview'),'close releases guest '+count);
  }
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,current},null,2));}
 finally{for(const restore of cleanup.reverse())restore();server?.close();}
})();
