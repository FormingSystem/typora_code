// R023.1: production search previews in an isolated original Typora host.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[],wheel_samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<500;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 let input_id=0;
 const wheel=async(body)=>{
  const rect=body.getBoundingClientRect(),id=++input_id;
  let input_time=0,first_frame_ms=0,last_scroll=0;
  const on_wheel=event=>{if(event.isTrusted&&!input_time)input_time=performance.now();};
  const on_scroll=()=>{if(!input_time)return;last_scroll=performance.now();if(!first_frame_ms)requestAnimationFrame(()=>{if(!first_frame_ms)first_frame_ms=performance.now()-input_time;});};
  body.addEventListener('wheel',on_wheel,true);body.addEventListener('scroll',on_scroll,true);
  fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'wheel',x:rect.left+rect.width/2,y:rect.top+rect.height/2,delta:-1200,width:innerWidth,height:innerHeight}));
  await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id;}catch{return false;}},'wheel delivery');await pause(250);
  body.removeEventListener('wheel',on_wheel,true);body.removeEventListener('scroll',on_scroll,true);
  wheel_samples.push({id,kind:body.dataset.previewKind,first_frame_ms,scroll_tail_ms:last_scroll?last_scroll-input_time:null,trusted:!!input_time});
 };
 const capture=async(stage)=>{fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage===stage;}catch{return false;}},'capture');};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const original=File.editor.getMarkdown(),original_path=files.current_file();
  const corpus=Array.from({length:100},(_,i)=>`Section ${i}: native_outline with ordinary **content**.\n\n`).join('');
  fs.writeFileSync(path.join(base,'workspace/outline.md'),corpus,'utf8');
  fs.writeFileSync(path.join(base,'workspace/outline.c'),Array.from({length:100},(_,i)=>`int native_outline_${i} = ${i};`).join('\n'),'utf8');
  await pause(600);
  window.dispatchEvent(new CustomEvent('linux-note-search-selection',{detail:{query:'native_outline'}}));
  const panel=()=>document.querySelector('.linux-note-workspace-search');
  await wait(()=>panel()?.dataset.state==='ready'&&panel().querySelectorAll('.workspace-search-match').length===200,'200 search matches');
  const preview=()=>panel().querySelector('.workspace-lookup-preview-body');
  for(const theme of ['vscode2026_light.css','vscode2026_dark.css']){
   ClientCommand.setTheme(theme,theme);await pause(600);
   const rows=[...panel().querySelectorAll('.workspace-search-file[data-path$="outline.md"] .workspace-search-match')];
   rows[20].click();await wait(()=>preview()?.dataset.previewPath?.endsWith('outline.md'),'Markdown preview');await pause(200);
   const shadow=preview().querySelector('.workspace-lookup-markdown').shadowRoot;
   assert(shadow.querySelectorAll('mark[data-lookup-match]').length===100,theme+': all Markdown matches');
   const anchor=rows[20].dataset.matchId,mark=shadow.querySelector('.lookup-anchor-match'),ordinary=shadow.querySelector('mark:not(.lookup-anchor-match)');
   assert(getComputedStyle(mark).backgroundColor!==getComputedStyle(ordinary).backgroundColor,theme+': distinct anchor color');
   let trusted=0;const listener=event=>{if(event.isTrusted)trusted++;};preview().addEventListener('wheel',listener);
   await wheel(preview());preview().removeEventListener('wheel',listener);
   const current=panel().querySelector('.workspace-search-match[aria-current="location"]');
   assert(trusted>0,theme+': trusted wheel');assert(current?.dataset.matchId!==anchor,theme+': reading position moves');
   assert(panel().querySelector('.workspace-search-match.is-selected')?.dataset.matchId===anchor,theme+': explicit selection retained');
   const row=current.getBoundingClientRect(),list=panel().querySelector('.workspace-search-results').getBoundingClientRect();
   assert(row.top>=list.top-1&&row.bottom<=list.bottom+1,theme+': result outline follows locally');
   panel().querySelector('.workspace-search-return-anchor').click();await pause(180);
   const a=mark.getBoundingClientRect(),b=preview().getBoundingClientRect();assert(a.top>=b.top&&a.bottom<=b.bottom,theme+': return reveals anchor');
   assert(panel().querySelector('.workspace-search-match[aria-current="location"]')?.dataset.matchId===anchor,theme+': return synchronizes reading marker');
   samples.push({theme,anchor_color:getComputedStyle(mark).backgroundColor,other_color:getComputedStyle(ordinary).backgroundColor,trusted});await capture('search_'+theme.replace('.css',''));
  }
  panel().querySelectorAll('.workspace-search-file[data-path$="outline.c"] .workspace-search-match')[20].click();
  await wait(()=>preview()?.dataset.previewKind==='source','source preview');await pause(200);
  const source_anchor=panel().querySelector('.workspace-search-match.is-selected').dataset.matchId;
  assert(preview().querySelectorAll('.lookup-search-match').length>1,'source displays multiple visible highlights');
  await wheel(preview());assert(panel().querySelector('.workspace-search-match[aria-current="location"]').dataset.matchId!==source_anchor,'source reading outline follows');
  assert(panel().querySelector('.workspace-search-match.is-selected').dataset.matchId===source_anchor,'source explicit anchor retained');
  panel().querySelector('.workspace-search-return-anchor').click();await pause(160);
  assert(panel().querySelector('.workspace-search-match[aria-current="location"]').dataset.matchId===source_anchor,'source returns to explicit anchor');
  assert(File.editor.getMarkdown()===original&&files.current_file()===original_path,'search never changes main document or file');
  assert(fs.readFileSync(path.join(base,'workspace/outline.md'),'utf8')===corpus,'search preserves file bytes');
  const origin=path.join(base,'workspace/link_origin.md');fs.writeFileSync(origin,'# Link origin\n\n[Preview](outline.md)\n','utf8');await files.open_file(origin);await pause(600);
  const link=document.querySelector('#write a[href="outline.md"],#write a[data-href="outline.md"]');assert(!!link,'native link source exists');
  link.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));const range=document.createRange();range.selectNodeContents(link);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);link.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));
  const dock=document.querySelector('.workspace-link-dock');await wait(()=>!dock.hidden&&dock.querySelector('.workspace-link-preview')?.dataset.state==='ready','floating link ready');
  await wait(()=>dock.querySelector('.workspace-lookup-markdown')?.shadowRoot.querySelectorAll('mark[data-lookup-match]').length===100,'floating ordinary highlights');
  const link_shadow=dock.querySelector('.workspace-lookup-markdown').shadowRoot;
  assert(!link_shadow.querySelector('mark.lookup-anchor-match')&&!dock.querySelector('.workspace-search-return-anchor'),'link preview has no search anchor or return control');
  const sidebar_position=panel().querySelector('.workspace-search-match[aria-current="location"]').dataset.matchId;
  await wheel(dock.querySelector('.workspace-lookup-preview-body'));
  assert(panel().querySelector('.workspace-search-match[aria-current="location"]').dataset.matchId===sidebar_position,'floating scroll does not drive the search outline');
  assert(files.current_file()===origin&&File.editor.getMarkdown().includes('[Preview](outline.md)'),'link search highlights retain native source and selected link');
  await capture('floating_link_plain_search');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,wheel_samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,wheel_samples},null,2));}
})();
