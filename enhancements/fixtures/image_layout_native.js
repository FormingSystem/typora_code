// R031.2: original-host image sizing and global presentation settings.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<400;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  for(const [name,width,height]of [['small',64,40],['large',1800,900]]){
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#369';context.fillRect(0,0,width,height);
   fs.writeFileSync(path.join(base,'workspace',name+'.png'),Buffer.from(canvas.toDataURL('image/png').split(',')[1],'base64'));
  }
  const source='# Image layout\n\n![Small](small.png)\n\n![Large](large.png)\n\n<img src="small.png" style="width:100%" />\n\nTail text.\n';
  const file=path.join(base,'workspace/images.md');fs.writeFileSync(file,source,'utf8');await files.open_file(file);
  await wait(()=>document.querySelectorAll('#write img').length===3&&[...document.querySelectorAll('#write img')].every(image=>image.complete&&image.naturalWidth),'loaded images');
  const snapshot=()=>[...document.querySelectorAll('#write img')].map(image=>({outer:image.outerHTML,parent:image.parentElement.outerHTML,natural:[image.naturalWidth,image.naturalHeight],rect:image.getBoundingClientRect().toJSON(),width:getComputedStyle(image).width,display:getComputedStyle(image).display,margin:getComputedStyle(image).margin,zoom:getComputedStyle(image).zoom,rules:[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].filter(rule=>rule.selectorText&&image.matches(rule.selectorText)).map(rule=>rule.cssText);}catch{return [];}})}));
  for(const theme of ['vscode2026_light.css','vscode2026_dark.css']){ClientCommand.setTheme(theme,theme);await pause(400);samples.push({theme,images:snapshot()});}
  const images=()=>[...document.querySelectorAll('#write img')];
  assert(images()[0].getBoundingClientRect().width<80,'small image stays natural');
  assert(images()[2].getBoundingClientRect().width<80,'authored full width follows natural default');
  assert(images()[1].getBoundingClientRect().width<1800,'large image fits editor');
  const choose=async(scope,label)=>{
   const image=images()[0];image.scrollIntoView({block:'center'});await pause(80);
   File.editor.contextMenu.show(new MouseEvent('contextmenu',{clientX:200,clientY:300}),image);
   const item=document.querySelector('[data-key="typora-code-image-alignment"]');assert(item&&!item.classList.contains('hide'),'native image layout entry');item.querySelector('a').click();
   const find=(level,text)=>[...document.querySelectorAll('[data-menu-level="'+level+'"] button')].find(node=>node.textContent.trim()===text);
   assert(!!find(0,scope),'scope exists: '+scope);find(0,scope).click();assert(!!find(1,label),'choice exists: '+label);find(1,label).click();await pause(180);
  };
  await choose('全局图片对齐','靠右');
  assert(core.app.settings.get('reading_images').alignment==='right','global alignment persists');
  assert(!images()[0].style.margin,'global alignment does not add document style');
  await files.save_active();assert(fs.readFileSync(file,'utf8')===source,'global preferences do not modify source');
  const slider=document.querySelector('.reading-image-scale input');
  slider.value='150';slider.dispatchEvent(new Event('input',{bubbles:true}));await pause(80);
  assert(core.app.settings.get('reading_images').scale!==150,'slider preview is not persisted');
  assert(images()[0].getBoundingClientRect().width>95&&images()[0].getBoundingClientRect().width<110,'slider changes rendered size');
  slider.dispatchEvent(new Event('change',{bubbles:true}));assert(core.app.settings.get('reading_images').scale===150,'slider commits');
  slider.value='200';slider.dispatchEvent(new Event('input'));slider.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));slider.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));await pause(80);
  assert(images()[0].getBoundingClientRect().width<110,'Escape rolls back uncommitted slider');
  await choose('此图片对齐','靠左');
  assert(images()[0].style.marginLeft==='0px'&&images()[0].style.marginRight==='auto','single image uses native style editing');
  assert(!images()[1].style.margin&&core.app.settings.get('reading_images').alignment==='right','single override leaves other images and global setting');
  const edited=File.editor.getMarkdown();assert(edited.includes('margin:')&&edited.includes('small.png'),'document contains portable image alignment');
  ClientCommand.undo();await pause(200);assert(!images()[0].style.margin,'single native undo removes alignment');
  ClientCommand.redo();await pause(200);assert(images()[0].style.marginRight==='auto','single native redo restores alignment');
  await files.save_active();assert(fs.readFileSync(file,'utf8').includes('margin:'),'single alignment saves');
  const other=path.join(base,'workspace/other.md');fs.writeFileSync(other,'Other document','utf8');await files.open_file(other);await files.open_file(file);
  await wait(()=>images().length===3&&images()[0].complete,'reopened image');await pause(200);
  assert(images()[0].style.marginRight==='auto','single alignment survives reopen');
  await choose('此图片对齐','跟随全局');assert(!images()[0].style.margin,'follow global removes individual override');
  await files.save_active();assert(!fs.readFileSync(file,'utf8').includes('margin:'),'follow global saves removal');
  File.editor.imgEdit.zoomAction($(images()[0].closest('.md-image')),'50%');await pause(200);
  assert(parseFloat(getComputedStyle(images()[0]).zoom)===0.5,'native image zoom retained');
  samples.push({stage:'final',images:snapshot()});
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
