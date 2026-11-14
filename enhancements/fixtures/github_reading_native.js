// R074.10: inspect real host typography and code surfaces without replacing editors.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<400;i++){if(test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  const text='# GitHub reading\n\n## Heading two\n\n### Heading three\n\n#### Heading four\n\n##### Heading five\n\n###### Heading six\n\n正文大小与代码框。Inline `value`.\n\n> 引用保持原样。\n\n```cpp\n// comment\nint main() {\n  const char *name = "hello";\n  return 42;\n}\n```\n\nTail.\n';
  const file=path.join(base,'workspace','github-reading.md');fs.writeFileSync(file,text,'utf8');await files.open_file(file);
  await wait(()=>File.bundle.filePath===file&&!File.isFileLoading(),'document loaded');
  await wait(()=>document.querySelector('#write .CodeMirror')?.CodeMirror,'code editor');
  const model=document.querySelector('#write .CodeMirror').CodeMirror,source=model.getValue();
  for(const theme of ['vscode_default_light.css','vscode_2026_default_light.css','vscode_default_dark.css','vscode_2026_default_dark.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(650);
   const root=document.querySelector('#write'),fence=root.querySelector('.md-fences'),cm=fence.querySelector('.CodeMirror'),quote=root.querySelector('blockquote');
   const style=getComputedStyle(fence),bg=theme.endsWith('_dark.css')?'rgb(21, 27, 35)':'rgb(246, 248, 250)';
   const sample={theme,font:getComputedStyle(root).fontSize,quote_border:getComputedStyle(quote).borderLeftWidth,quote_background:getComputedStyle(quote).backgroundColor,background:style.backgroundColor,radius:style.borderRadius,padding:style.padding,inner:getComputedStyle(cm).backgroundColor};samples.push(sample);
   fs.writeFileSync(path.join(base,'github-samples.json'),JSON.stringify(samples,null,2));
   assert(sample.font==='16px',theme+' body 16px');const probe=document.createElement('div');probe.style.borderLeft='5px solid';root.append(probe);assert(sample.quote_border===getComputedStyle(probe).borderLeftWidth,theme+' quote border unchanged at host DPI');probe.remove();
   for(const [i,size] of [32,24,20,16,14,13.6].entries())assert(Math.abs(parseFloat(getComputedStyle(root.querySelector('h'+(i+1))).fontSize)-size)<0.01,theme+' heading '+(i+1)+' GitHub size');
   assert(sample.background===bg&&sample.radius==='6px'&&style.paddingLeft==='16px',theme+' GitHub code surface');
   assert(sample.inner==='rgba(0, 0, 0, 0)',theme+' inner editor transparent');
   const gutter=cm.querySelector('.CodeMirror-gutters');if(gutter)assert(getComputedStyle(gutter).backgroundColor===bg,theme+' gutter follows surface');
   assert(cm.CodeMirror===model&&model.getValue()===source,theme+' model and code preserved');
   model.focus();model.setCursor({line:0,ch:0});model.replaceRange(' ',{line:0,ch:0});await pause(400);ClientCommand.undo();await pause(400);assert(model.getValue()===source,theme+' edit undo');
  }
  const root=document.querySelector('#write'),paragraph=root.querySelector('p');paragraph.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true}));await pause(250);
  assert(parseFloat(getComputedStyle(root).fontSize)>16,'saved content font owner still handles changes');
  for(const [i,ratio] of [2,1.5,1.25,1,.875,.85].entries())assert(Math.abs(parseFloat(getComputedStyle(root.querySelector('h'+(i+1))).fontSize)-parseFloat(getComputedStyle(root).fontSize)*ratio)<0.01,'heading '+(i+1)+' follows body size');
  paragraph.dispatchEvent(new WheelEvent('wheel',{deltaY:100,ctrlKey:true,bubbles:true,cancelable:true}));await pause(150);
  await files.save_active();assert(fs.readFileSync(file,'utf8')===text,'source bytes preserved');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,samples,error:String(error.stack||error)},null,2));}
})();
