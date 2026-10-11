// Production host with trusted Chromium guest keys, not physical OS keyboard input.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),http=reqnode('http'),base=__CASE_ROOT__,checks=[],live={};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const trace=label=>fs.writeFileSync(path.join(base,'find_trace.json'),JSON.stringify({label,checks,live},null,2));
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{trace(m);if(!v)throw Error(m);checks.push(m);};
 const wait=async(fn,label)=>{for(let i=0;i<220;i++){if(fn())return;await pause(50);}throw Error(label);};
 let server;const sockets=new Set();
 try{
  trace('start');
  server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html; charset=utf-8');response.setHeader('X-Frame-Options','DENY');response.end('<h1>Preview search</h1><p>Needle 中文</p><div style="height:1500px"></div><p>needle 中文</p><a href="/next">Next</a>'+(request.url==='/next'?'<p>needle</p>':''));});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address='http://127.0.0.1:'+server.address().port,source=path.join(base,'workspace/find.md');
  fs.writeFileSync(path.join(base,'workspace/find_target.md'),'# Local\n\nNeed**le** 中文\n\nneedle 中文\n');
  fs.writeFileSync(source,'# Find\n\n[网页]('+address+'/page)\n\n[本地](find_target.md)\n');
  await pause(1600);await files.open_file(source);await wait(()=>document.querySelectorAll('#write a[href]').length===2,'source links');await pause(300);
  const original=fs.readFileSync(source,'utf8');
  const pick=index=>{const link=document.querySelectorAll('#write a[href]')[index];link.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0}));const range=document.createRange();range.selectNodeContents(link);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));};
  const dock=()=>document.querySelector('.workspace-link-dock'),panel=()=>dock()?.querySelector('.workspace-link-preview'),guest=()=>panel()?.querySelector('webview');
  const bar=()=>panel()?.querySelector('.workspace-preview-find'),status=()=>panel()?.querySelector('.workspace-preview-find-status').textContent;
  const query=async value=>{const input=bar().querySelector('input');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));await pause(150);};
  const capture=async stage=>{fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'' )).stage===stage;}catch{return false;}},'capture '+stage);};
  pick(0);await wait(()=>guest()?.dataset.loadState==='loaded','guest loaded');let view=guest();
  live.preload=view.getAttribute('preload');live.events=[];view.addEventListener('ipc-message',event=>live.events.push({channel:event.channel,args:event.args}));view.addEventListener('found-in-page',event=>live.events.push(event.result));
  const native_find=view.findInPage.bind(view),native_stop=view.stopFindInPage.bind(view);view.findInPage=(query,options)=>{const id=native_find(query,options);live.events.push({call:'find',query,options,id});return id;};view.stopFindInPage=action=>{live.events.push({call:'stop',action});return native_stop(action);};
  live.safety=await view.executeJavaScript('({node:typeof require,process:typeof process,bridge:typeof JSBridge,ipc:typeof ipcRenderer})');
  assert(Object.values(live.safety).every(value=>value==='undefined'),'web page has no Node or host bridge');
  await view.executeJavaScript('window.addEventListener("keydown",e=>window.last_trusted=e.isTrusted);document.body.tabIndex=0;document.body.focus()');
  const guest_key=async(code,modifiers=[])=>{view.focus();await view.sendInputEvent({type:'keyDown',keyCode:code,modifiers});await view.sendInputEvent({type:'keyUp',keyCode:code,modifiers});await pause(150);};
  await guest_key('f',['control']);await wait(()=>bar()&&!bar().hidden,'guest Ctrl F did not open preview find');
  assert(document.activeElement===bar().querySelector('input'),'trusted guest Ctrl F focuses preview input');
  await query('needle');await wait(()=>status()==='1/2','native needle matches: '+status());assert(true,'native case insensitive find count');
  await capture('web_find');
  bar().querySelector('[aria-label="下一个匹配（Enter）"]').click();await wait(()=>status()==='2/2','next native match');assert(await view.executeJavaScript('scrollY>1000'),'native next match scrolls guest content');
  bar().querySelector('[aria-label="下一个匹配（Enter）"]').click();trace('button wrap');await wait(()=>status()==='1/2','button wrap');assert(true,'button wraps search');
  trace('before F3');await guest_key('F3');live.f3={status:status(),active:document.activeElement.tagName};trace('after F3');await wait(()=>status()==='2/2','guest F3 next');assert(true,'trusted guest F3 advances search');
  await guest_key('F3',['shift']);await wait(()=>status()==='1/2','guest shift F3');assert(true,'trusted guest Shift F3 searches backwards');
  await guest_key('F3',['shift']);await wait(()=>status()==='2/2','guest reverse wrap');assert(true,'trusted guest reverse wrap');
  await query('中文');await wait(()=>status()==='1/2','Chinese matches');assert(true,'native Chinese search');
  await query('missing-value');await wait(()=>status()==='无结果','no result');assert(true,'native no results');
  await guest_key('F3');await wait(()=>status()==='无结果','repeat no results');assert(true,'F3 with no results remains responsive');
  await query('needle');await wait(()=>status()==='1/2','before navigation');
  await view.executeJavaScript('document.querySelector("a").click()');await wait(()=>view.getURL().endsWith('/next')&&status()==='1/3','query retained on navigation');assert(bar().querySelector('input').value==='needle','navigation reuses query and recomputes matches');
  panel().querySelector('[aria-label="重新加载"]').click();await pause(200);await wait(()=>view.dataset.loadState==='loaded'&&status()==='1/3','reload query');assert(true,'reload recomputes retained query');
  await guest_key('Escape');assert(bar().hidden&&!dock().hidden,'guest Escape closes find without closing preview');
  await view.executeJavaScript('document.dispatchEvent(new KeyboardEvent("keydown",{key:"f",ctrlKey:true,bubbles:true}))');await pause(100);assert(bar().hidden,'web content cannot synthesize privileged find shortcut');
  for(let i=0;i<20;i++){panel().querySelector('[data-preview-find-open]').click();await query('needle');await wait(()=>status()==='1/3','cycle '+i);bar().querySelector('[aria-label="关闭查找（Esc）"]').click();assert(bar().hidden,'find close cycle '+i);}
  pick(1);await wait(()=>!!panel()?.querySelector('.workspace-lookup-markdown'),'local load');panel().querySelector('[data-preview-find-open]').click();await query('needle');await wait(()=>status()==='1/2','cross inline reader matches');
  assert([...CSS.highlights.keys()].some(name=>name.startsWith('preview-find-')),'local reader paints native highlight ranges');
  await capture('document_find');
  await query('中文');await wait(()=>status()==='1/2','local Chinese');assert(true,'local Chinese matching');
  panel().querySelector('[aria-label="关闭链接预览"]').click();await wait(()=>dock().hidden,'preview close');assert(![...CSS.highlights.keys()].some(name=>name.startsWith('preview-find-')),'closing preview clears all owned highlights');
  assert(fs.readFileSync(source,'utf8')===original&&!File.changeCounter.isDocumentEdited(),'preview search preserves main document');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,live,scope:'Typora 1.14.10 production guest; trusted Chromium key events; no physical OS input'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,live},null,2));}
 finally{for(const socket of sockets)socket.destroy();server?.close();}
})();
