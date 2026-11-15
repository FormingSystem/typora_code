// R074.10: inspect real host typography and code surfaces without replacing editors.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<400;i++){if(test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  const selection_text='# Selection\n\n```bash\n# Windows UCRT64\n(\nset -e\n中文开头 abc\n'+Array.from({length:60},(_,i)=>'echo line_'+i).join('\n')+'\n```\n';
  const selection_file=path.join(base,'workspace','selection.md');fs.writeFileSync(selection_file,selection_text,'utf8');await files.open_file(selection_file);
  await wait(()=>File.bundle.filePath===selection_file&&!File.isFileLoading()&&document.querySelector('#write .CodeMirror')?.CodeMirror,'selection document loaded');
  await JSBridge.invoke('setting.setCurTheme','vscode_default_light.css','vscode_default_light.css');File.setTheme('vscode_default_light.css');await pause(650);
  const selection_fence=document.querySelector('#write .md-fences'),selection_cm=selection_fence.querySelector('.CodeMirror').CodeMirror;
  selection_cm.setOption('lineNumbers',true);selection_fence.scrollIntoView({block:'start'});await pause(500);
  let input_id=0;
  const input=async(kind,value)=>{const id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind,width:innerWidth,height:innerHeight,x:100,y:200,...value}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id}catch{return false}},'selection input delivered');await pause(120);};
  const glyph=(line,ch)=>{const node=selection_fence.querySelectorAll('.CodeMirror-code .CodeMirror-line')[line],walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text,offset=ch;while(text=walk.nextNode()){if(offset<text.length){const range=document.createRange();range.setStart(text,offset);range.setEnd(text,offset+1);return range.getBoundingClientRect();}offset-=text.length;}throw Error('glyph missing '+line+':'+ch);};
  const measurements=[];let trusted_drags=0;
  selection_fence.addEventListener('mousedown',event=>{if(event.isTrusted)trusted_drags++;});
  const inspect_selection=async(line,reverse,label)=>{
   const value=selection_cm.getLine(line),first=glyph(line,0),last=glyph(line,value.length-1),y=(first.top+first.bottom)/2;
   const from=reverse?last.right-1:first.left+1,to=reverse?first.left+1:last.right-1;
   await input('drag',{x:from,y,dx:to-from,dy:0,steps:20,interval:8});
   const entry={label,font:getComputedStyle(selection_fence).fontSize,zoom:reqnode('electron').webFrame.getZoomFactor(),first:first.toJSON(),cm:selection_cm.charCoords({line,ch:0},'window'),selected:selection_cm.getSelection(),highlight:[...selection_fence.querySelectorAll('.CodeMirror-selected')].map(n=>n.getBoundingClientRect().toJSON()),padding:selection_cm.display.cachedPaddingH};measurements.push(entry);
   fs.writeFileSync(path.join(base,'selection-measurements.json'),JSON.stringify(measurements,null,2));
   assert(entry.selected===value,label+' native drag includes first character');
   assert(entry.highlight.some(box=>box.left<=first.left+1&&box.right>=first.right-1&&box.top<=y&&box.bottom>=y),label+' highlight covers first glyph');
   assert(entry.padding.left===4&&entry.padding.right===4,label+' native measurement padding');
   assert(Math.abs(selection_cm.defaultTextHeight()-parseFloat(getComputedStyle(selection_fence.querySelector('.CodeMirror-line')).lineHeight))<.1,label+' native line-height probe');
  };
  for(const theme of ['vscode_default_light.css','vscode_2026_default_light.css','vscode_default_dark.css','vscode_2026_default_dark.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(450);
   for(const [i,delta]of [0,1,1,-1,-1].entries()){
    if(delta)document.querySelector('#write h1').dispatchEvent(new WheelEvent('wheel',{deltaY:delta>0?-100:100,ctrlKey:true,bubbles:true,cancelable:true}));await pause(180);
    await inspect_selection(i%2?3:2,i%2===0,theme+' step '+i);
    if(i===0){const stage=theme.replaceAll('.','_');fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage===stage}catch{return false}},'selection screenshot');}

   }
  }
  ClientCommand.zoomIn();await pause(250);selection_fence.scrollIntoView({block:'start'});await pause(150);await inspect_selection(2,true,'window zoom');ClientCommand.zoomOut();await pause(250);
  selection_cm.setOption('lineNumbers',false);selection_cm.setOption('lineWrapping',true);await pause(200);await inspect_selection(2,false,'no gutter wrapped');
  const first=glyph(2,0),y=(first.top+first.bottom)/2;await input('click',{x:first.left+1,y});assert(selection_cm.getCursor().line===2&&selection_cm.getCursor().ch===0,'native first-character click');
  const end=glyph(3,7);await input('drag',{x:first.left+1,y,dx:end.right-first.left-2,dy:(end.top+end.bottom)/2-y,steps:20,interval:8});assert(selection_cm.getSelection()==='set -e\n中文开头 abc','native multi-line drag includes both line starts');
  const boxes=[...selection_fence.querySelectorAll('.CodeMirror-selected')].map(n=>n.getBoundingClientRect());for(const line of [2,3]){const r=glyph(line,0);assert(boxes.some(b=>b.left<=r.left+1&&b.right>=r.right-1&&b.top<r.bottom&&b.bottom>r.top),'multi-line highlight covers line '+line);}
  const fold_button=selection_fence.querySelector('.linux-note-code-toggle');fold_button.click();await pause(150);await inspect_selection(2,true,'expanded');fold_button.click();await pause(150);await inspect_selection(2,false,'collapsed');
  assert(trusted_drags>=26,'trusted native mouse events observed');assert(selection_fence.querySelector('.CodeMirror').CodeMirror===selection_cm,'selection preserves editor identity');
  selection_cm.replaceRange('x',{line:2,ch:0});ClientCommand.undo();await pause(200);await files.save_active();assert(fs.readFileSync(selection_file,'utf8')===selection_text,'selection edit undo save bytes');
  fs.writeFileSync(path.join(base,'workspace','media.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#ff0000"/></svg>','utf8');
  const text='# GitHub reading\n\n## Heading two\n\n### Heading three\n\n#### Heading four\n\n##### Heading five\n\n###### Heading six\n\n正文大小与代码框。Inline `value`.\n\n> 引用保持原样。\n\n```cpp\n// comment long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word long_code_word \nint main() {\n  const char *name = "hello";\n  return 42;\n}\n```\n\n![media](media.svg)\n\n```mermaid\ngraph TD\n A[Diagram] --> B[Target]\n style A fill:#00ff00,stroke:#00ff00\n```\n\nTail.\n';
  const file=path.join(base,'workspace','github-reading.md');fs.writeFileSync(file,text,'utf8');await files.open_file(file);
  await wait(()=>File.bundle.filePath===file&&!File.isFileLoading(),'document loaded');
  await wait(()=>document.querySelector('#write .CodeMirror')?.CodeMirror,'code editor');
  const model=document.querySelector('#write .CodeMirror').CodeMirror,source=model.getValue();
  model.setOption('lineNumbers',true);model.setOption('lineWrapping',true);
  for(const theme of ['vscode_default_light.css','vscode_2026_default_light.css','vscode_default_dark.css','vscode_2026_default_dark.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(650);
   const root=document.querySelector('#write'),fence=root.querySelector('.md-fences'),cm=fence.querySelector('.CodeMirror'),quote=root.querySelector('blockquote');
   const style=getComputedStyle(fence),bg=theme.endsWith('_dark.css')?'rgb(21, 27, 35)':'rgb(246, 248, 250)';
   const sample={theme,font:getComputedStyle(root).fontSize,quote_border:getComputedStyle(quote).borderLeftWidth,quote_background:getComputedStyle(quote).backgroundColor,background:style.backgroundColor,radius:style.borderRadius,padding:style.padding,inner:getComputedStyle(cm).backgroundColor};samples.push(sample);
   fs.writeFileSync(path.join(base,'github-samples.json'),JSON.stringify(samples,null,2));
   assert(Math.abs(parseFloat(getComputedStyle(quote).paddingTop)-5.6)<.01,theme+' quotation vertical breathing room');
   assert(sample.font==='16px',theme+' body 16px');assert(getComputedStyle(cm).fontSize===sample.font,theme+' code matches body');
   const number=cm.querySelector('.CodeMirror-linenumber');if(number)assert(getComputedStyle(number).fontSize===sample.font,theme+' gutter matches body');const probe=document.createElement('div');probe.style.borderLeft='5px solid';root.append(probe);assert(sample.quote_border===getComputedStyle(probe).borderLeftWidth,theme+' quote border unchanged at host DPI');probe.remove();
   for(const [i,size] of [32,24,20,16,14,13.6].entries())assert(Math.abs(parseFloat(getComputedStyle(root.querySelector('h'+(i+1))).fontSize)-size)<0.01,theme+' heading '+(i+1)+' GitHub size');
   assert(sample.background===bg&&sample.radius==='6px'&&style.paddingLeft==='16px',theme+' GitHub code surface');
   assert(sample.inner==='rgba(0, 0, 0, 0)',theme+' inner editor transparent');
   const gutter=cm.querySelector('.CodeMirror-gutters');if(gutter)assert(getComputedStyle(gutter).backgroundColor===bg,theme+' gutter follows surface');
   assert(cm.CodeMirror===model&&model.getValue()===source,theme+' model and code preserved');
   model.focus();model.setCursor({line:0,ch:0});model.replaceRange(' ',{line:0,ch:0});await pause(400);ClientCommand.undo();await pause(400);assert(model.getValue()===source,theme+' edit undo');
  }
  await wait(()=>document.querySelector('#write .md-diagram svg'),'native Mermaid SVG');
  await wait(()=>{const c=document.querySelector('content .linux-note-reading-minimap canvas');if(!c)return false;try{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let red=0,green=0;for(let i=0;i<p.length;i+=4){if(p[i]>200&&p[i+1]<60&&p[i+2]<60)red++;if(p[i+1]>200&&p[i]<60&&p[i+2]<60)green++;}fs.writeFileSync(path.join(base,'media-diagnostic.json'),JSON.stringify({red,green,images:[...document.querySelectorAll('#write img')].map(i=>({src:i.currentSrc,complete:i.complete,width:i.naturalWidth})),svg:document.querySelector('#write .md-diagram svg')?.outerHTML,rail:document.querySelector('content .linux-note-reading-minimap')?.dataset}));return red>3&&green>3;}catch(error){fs.writeFileSync(path.join(base,'media-diagnostic.json'),String(error));return false;}},'native minimap image and Mermaid colored pixels');
  assert(true,'native image and Mermaid painted in minimap');
  const root=document.querySelector('#write'),paragraph=root.querySelector('p');paragraph.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true}));await pause(250);
  assert(parseFloat(getComputedStyle(root).fontSize)>16,'saved content font owner still handles changes');
  for(const [i,ratio] of [2,1.5,1.25,1,.875,.85].entries())assert(Math.abs(parseFloat(getComputedStyle(root.querySelector('h'+(i+1))).fontSize)-parseFloat(getComputedStyle(root).fontSize)*ratio)<0.01,'heading '+(i+1)+' follows body size');
  paragraph.dispatchEvent(new WheelEvent('wheel',{deltaY:100,ctrlKey:true,bubbles:true,cancelable:true}));await pause(150);
  for(const direction of [-1,-1,1,1,1,1,-1,-1]) {
   paragraph.dispatchEvent(new WheelEvent('wheel',{deltaY:direction<0?100:-100,ctrlKey:true,bubbles:true,cancelable:true}));await pause(200);
   const cm=root.querySelector('.CodeMirror'),size=getComputedStyle(root).fontSize;
   assert(getComputedStyle(cm).fontSize===size,'code tracks font '+size);
   const number=cm.querySelector('.CodeMirror-linenumber');if(number)assert(getComputedStyle(number).fontSize===size,'gutter tracks font '+size);
   assert(cm.CodeMirror===model&&model.getValue()===source,'font adjustment preserves model/source');
   const last=cm.querySelector('.CodeMirror-code')?.lastElementChild,box=cm.getBoundingClientRect();
   if(last)assert(last.getBoundingClientRect().bottom<=box.bottom+1,'final code line fits after font adjustment');
  }
  await files.save_active();assert(fs.readFileSync(file,'utf8')===text,'source bytes preserved');
  const fold_text='# Floating control\n\n```bash\n'+Array.from({length:65},(_,i)=>'echo line_'+i).join('\n')+'\n```\n',fold_file=path.join(base,'workspace','floating.md');
  fs.writeFileSync(fold_file,fold_text,'utf8');await files.open_file(fold_file);
  await wait(()=>document.querySelector('#write .linux-note-code-toggle'),'native fold control');
  const fold=document.querySelector('#write .md-fences'),toolbar=fold.querySelector('.linux-note-code-toolbar'),button=toolbar.querySelector('button');
  fold.scrollIntoView({block:'center'});await pause(200);
  const h=fold.getBoundingClientRect().height;toolbar.style.display='none';assert(Math.abs(fold.getBoundingClientRect().height-h)<.1,'floating control adds no native row');toolbar.style.removeProperty('display');
  assert(getComputedStyle(toolbar).position==='absolute','native control floats');
  const fold_model=fold.querySelector('.CodeMirror').CodeMirror;
  button.click();await pause(200);assert(fold.classList.contains('is-code-expanded'),'floating control expands');
  button.click();await pause(200);assert(fold.classList.contains('is-code-collapsed'),'floating control collapses');
  assert(fold.querySelector('.CodeMirror').CodeMirror===fold_model,'floating control preserves model');
  await files.save_active();assert(fs.readFileSync(fold_file,'utf8')===fold_text,'floating controls excluded from saved source');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,samples,error:String(error.stack||error)},null,2));}
})();
