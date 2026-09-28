// 原生Markdown连续链接与Alt导航；隔离临时文档。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[],latencies=[];
 let native_clicks=0;document.addEventListener('click',event=>{if(event.isTrusted&&event.target.closest?.('.workspace-titlebar-history'))native_clicks++;},true);
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 document.addEventListener('pointerdown',event=>{
  if(!event.isTrusted||!event.target.closest?.('.workspace-titlebar-history'))return;
  const started=performance.now(),before=files.current_file(),sample={};latencies.push(sample);
  const frame=()=>{if(files.current_file()!==before&&sample.first_frame_ms===undefined)sample.first_frame_ms=performance.now()-started;if((document.documentElement.dataset.linuxNoteHistoryForward==='true'||document.documentElement.dataset.linuxNoteHistoryBack==='true')&&sample.first_frame_ms!==undefined){sample.ready_ms=performance.now()-started;return}if(performance.now()-started<5000)requestAnimationFrame(frame)};requestAnimationFrame(frame);
 },true);

 const snapshot=label=>samples.push({label,file:files.current_file(),back:document.documentElement.dataset.linuxNoteHistoryBack,forward:document.documentElement.dataset.linuxNoteHistoryForward,active:document.activeElement?.outerHTML.slice(0,400),modals:[...document.querySelectorAll('.reading-media-viewer,.modal.in,[role="dialog"][aria-modal="true"]')].map(n=>({html:n.outerHTML.slice(0,300),display:getComputedStyle(n).display,rect:n.getBoundingClientRect().toJSON()})),cursor:File.editor.selection.buildUndo(),busy:[File._onInitParse,File._onFileSwitching]});
 const assert=(value,label)=>{snapshot(label);if(!value)throw Error(label);checks.push(label)};
 try{
  while(!fs.existsSync(path.join(base,'window_bounds_ready.json')))await pause(30);await pause(2000);
  const docs=['a','sub/b','sub/deep/c','other/d'].map(x=>path.join(base,'workspace/'+x+'.md'));
  for(const name of docs)fs.mkdirSync(path.dirname(name),{recursive:true});
  window.addEventListener('linux-note-workspace-context-changed',()=>snapshot('context changed'));
  for(let i=0;i<docs.length;i++)fs.writeFileSync(docs[i],'# 文档'+i+'\n\n[继续]('+path.relative(path.dirname(docs[i]),docs[(i+1)%docs.length]).replace(/\\/g,'/')+')\n\n[网页](https://example.com/navigation-history)\n\n'+('正文段落。\n\n'.repeat(30)));
  const original_bytes=docs.map(file=>fs.readFileSync(file));
  await files.open_file(docs[0]);await pause(1000);
  for(let i=1;i<docs.length;i++){
   const link=document.querySelector('#write a');const range=document.createRange();range.selectNodeContents(link);range.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(range);await pause(150);for(const type of ['mousedown','mouseup','click'])link.dispatchEvent(new MouseEvent(type,{ctrlKey:true,bubbles:true,cancelable:true,button:0,buttons:type==='mousedown'?1:0,view:window}));
   await pause(1000);assert(files.current_file()===docs[i],'连续链接 '+i);
  }
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}));await pause(1100);assert(files.current_file()===docs[2],'链接后Alt返回来源');
  const buttons=[...document.querySelectorAll('.workspace-titlebar-history')];
  const click_button=async(button)=>{
   const box=button.getBoundingClientRect(),id=crypto.randomUUID(),before=native_clicks;
   fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'click',x:box.x+box.width/2,y:box.y+box.height/2,width:innerWidth,height:innerHeight}));
   const start=Date.now();while(Date.now()-start<3000&&native_clicks===before)await pause(30);
   assert(native_clicks===before+1,'顶栏可信鼠标点击 '+native_clicks);await pause(850);
  };
  snapshot('before toolbar');await click_button(buttons[1]);assert(files.current_file()===docs[3],'链接返回后顶栏前进');
  const original_browser=JSBridge.showInBrowser,opened=[];
  JSBridge.showInBrowser=url=>{opened.push(url);window.getSelection().removeAllRanges();document.querySelector('#write').blur();window.dispatchEvent(new Event('blur'));};
  try {
   await click_button(buttons[0]);assert(files.current_file()===docs[2],'网页前保留返回来源');
   const web_link=document.querySelector('#write a[href^="https:"]');assert(!!web_link,'原生网页链接存在');
   for(const type of ['mousedown','mouseup','click'])web_link.dispatchEvent(new MouseEvent(type,{ctrlKey:true,bubbles:true,cancelable:true,button:0,buttons:type==='mousedown'?1:0,view:window}));
   await pause(2000);window.dispatchEvent(new Event('focus'));document.querySelector('#write').focus();await pause(200);
   assert(opened.length===1&&opened[0]==='https://example.com/navigation-history','Ctrl链接交给浏览器端口一次');
   assert(files.current_file()===docs[2]&&document.documentElement.dataset.linuxNoteHistoryForward==='true','浏览器失焦与等待不清空文档前进');
   await click_button(buttons[1]);assert(files.current_file()===docs[3],'网页返回后顶栏前进');
  } finally {JSBridge.showInBrowser=original_browser;}
  for(let i=0;i<10;i++){
   await click_button(buttons[0]);assert(files.current_file()===docs[2],'顶栏连续后退 '+i);
   await click_button(buttons[1]);assert(files.current_file()===docs[3],'顶栏连续前进 '+i);
  }
  // 不在方向键之间睡眠：四文档完整逆序/正序，中途真实关闭目标标签。
  const transitions=[];
  const stop_trace=core.app.workspace.on('file:open',()=>{const file=File.bundle.filePath;if(docs.includes(file)&&transitions.at(-1)!==file)transitions.push(file);samples.push({event:'file:open',file,cursor:File.editor.selection.buildUndo()});});
  const wait_path=async target=>{const start=Date.now();while(files.current_file()!==target&&Date.now()-start<10000)await pause(20);await pause(250);assert(files.current_file()===target,'连续指令最终资源 '+path.basename(target));};
  const burst=keys=>{for(const key of keys)window.dispatchEvent(new KeyboardEvent('keydown',{key,altKey:true,bubbles:true,cancelable:true}));};
  const assert_trace=expected=>{samples.push({transitions:[...transitions],expected});assert(JSON.stringify(transitions)===JSON.stringify(expected),'连续指令每一步资源顺序');transitions.length=0;};
  burst(['ArrowLeft','ArrowLeft','ArrowLeft']);await wait_path(docs[0]);assert_trace([docs[2],docs[1],docs[0]]);
  const all_leaves=[];core.app.workspace.eachLeaves(leaf=>{all_leaves.push(leaf);});
  for(const target of [docs[1],docs[2]]){const leaf=all_leaves.find(leaf=>path.normalize(leaf.state.path)===target);assert(!!leaf,'关闭连续前进目标存在');assert(await files.close_leaf(leaf),'关闭连续前进目标');}
  burst(['ArrowRight','ArrowRight','ArrowRight']);await wait_path(docs[3]);assert_trace([docs[1],docs[2],docs[3]]);
  for(let i=0;i<20;i++){
   if(i%2){for(let step=0;step<3;step++){assert(!buttons[0].disabled,'快速顶栏后退可用 '+i+'/'+step);buttons[0].click();}}else burst(['ArrowLeft','ArrowLeft','ArrowLeft']);
   await wait_path(docs[0]);assert_trace([docs[2],docs[1],docs[0]]);
   if(i%2){for(let step=0;step<3;step++){assert(!buttons[1].disabled,'快速顶栏前进可用 '+i+'/'+step);buttons[1].click();}}else burst(['ArrowRight','ArrowRight','ArrowRight']);
   await wait_path(docs[3]);assert_trace([docs[1],docs[2],docs[3]]);
  }
  if(typeof stop_trace==='function')stop_trace();
  for(let i=0;i<docs.length;i++)assert(fs.readFileSync(docs[i]).equals(original_bytes[i]),'导航未改写临时正文 '+i);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS' ,checks,samples,latencies},null,2));
 }catch(error){snapshot('error');fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks,samples},null,2));}
})();
