// Render original GIF frames in the unmodified host; sample actual native screenshots.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),http=reqnode('http'),base=__CASE_ROOT__,checks=[],frames={};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let server;const sockets=new Set();
 const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await pause(50);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  const gif=Buffer.from(JSON.parse(fs.readFileSync(path.join(base,'animated_image.json'),'utf8')).base64,'base64');
  const root=path.join(base,'workspace'),target=path.join(root,'动图 space.gif'),source=path.join(root,'animation.md');fs.writeFileSync(target,gif);
  server=http.createServer((request,response)=>{response.setHeader('Content-Type','image/gif');response.end(gif);});server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const remote='http://127.0.0.1:'+server.address().port+'/animation.gif';
  const text='# Animation\n\n![Local](动图%20space.gif)\n\n![Remote]('+remote+')\n\n[Local link](动图%20space.gif)\n\n[Web link]('+remote+')\n';fs.writeFileSync(source,text);
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window prepared');await files.open_file(source);await wait(()=>document.querySelectorAll('#write img').length===2&&[...document.querySelectorAll('#write img')].every(image=>image.complete&&image.naturalWidth===32),'native document GIFs');await pause(400);
  const capture=async(stage,element)=>{
   const rect=element.getBoundingClientRect(),x=(rect.left+rect.width/2)/innerWidth,y=(rect.top+rect.height/2)/innerHeight;
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'' )).stage===stage;}catch{return false;}},'capture '+stage);
   const name=fs.readdirSync(base).find(name=>name.startsWith('stage_'+stage+'_')&&name.endsWith('.png'));if(!name)throw Error('Missing screenshot '+stage);
   const image=reqnode('electron').nativeImage.createFromPath(path.join(base,name)),size=image.getSize(),bitmap=image.toBitmap(),offset=(Math.floor(y*size.height)*size.width+Math.floor(x*size.width))*4;
   return [...bitmap.subarray(offset,offset+3)];
  };
  const animated=async(label,element)=>{
   const colors=[];frames[label]=colors;
   for(let i=0;i<12;i++){await pause(85);colors.push(await capture(label+'_'+i,element));if(colors.some(([b,g,r])=>r>220&&b<30&&g<30)&&colors.some(([b,g,r])=>b>220&&r<30&&g<30))break;}
   assert(colors.some(([b,g,r])=>r>220&&b<30&&g<30)&&colors.some(([b,g,r])=>b>220&&r<30&&g<30),label+' renders both original frames');
  };
  await animated('document_local',document.querySelectorAll('#write img')[0]);await animated('document_http',document.querySelectorAll('#write img')[1]);
  document.querySelector('#write img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0}));await wait(()=>document.querySelector('.reading-media-content img')?.naturalWidth===32,'full-screen ready');await animated('document_fullscreen',document.querySelector('.reading-media-content img'));document.querySelector('.reading-media-viewer [data-action="close"]').click();
  const pick=index=>{const link=[...document.querySelectorAll('#write a[href]')].filter(link=>!link.querySelector('img'))[index];link.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0}));const range=document.createRange();range.selectNodeContents(link);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));};
  pick(0);await wait(()=>['ready','error'].includes(document.querySelector('.workspace-link-dock .workspace-link-preview')?.dataset.state),'local preview settles');
  const panel=document.querySelector('.workspace-link-dock .workspace-link-preview');assert(!!panel.querySelector('.workspace-preview-image img'),'local image link enters image preview: '+panel.textContent);await animated('linked_local',panel.querySelector('.workspace-preview-image img'));
  assert(panel.querySelector('[data-preview-find-open]').disabled,'image search is disabled');panel.querySelector('.workspace-preview-image img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0}));await wait(()=>document.querySelector('.reading-media-content img')?.naturalWidth===32,'linked full-screen');await animated('linked_fullscreen',document.querySelector('.reading-media-content img'));document.querySelector('.reading-media-viewer [data-action="zoom-in"]').click();await animated('linked_zoom',document.querySelector('.reading-media-content img'));document.querySelector('.reading-media-viewer [data-action="close"]').click();
  pick(1);await wait(()=>panel.querySelector('webview')?.dataset.loadState==='loaded','HTTP image guest');await animated('linked_http',panel.querySelector('webview'));
  panel.querySelector('[aria-label="关闭链接预览"]').click();assert(!File.changeCounter.isDocumentEdited()&&fs.readFileSync(source,'utf8')===text&&fs.readFileSync(target).equals(gif),'document and GIF bytes unchanged');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,frames,scope:'Original Typora, native PrintWindow screenshots; DOM gestures, not physical OS pointer input'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks,frames,links:[...document.querySelectorAll('#write a[href]')].map(link=>link.outerHTML),preview:document.querySelector('.workspace-link-dock')?.outerHTML,selection:getSelection().toString()},null,2));}
 finally{for(const socket of sockets)socket.destroy();server?.close();}
})();
