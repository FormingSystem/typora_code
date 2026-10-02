// Observe native fence geometry after shrinking a previously foldable block.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  File.option.showLineNumbersForFence=true;
  const long=Array.from({length:80},(_,i)=>'echo line_'+i+' abcdefghijklmnopqrstuvwxyz '.repeat(i<65&&i%3===0?12:1)).join('\n');
  const file=path.join(base,'workspace/shrink.md');fs.writeFileSync(file,'# Shrink\n\n```bash\n'+long+'\n```\n\nFollowing paragraph.\n','utf8');await files.open_file(file);
  const fence=document.querySelector('#write .md-fences');fence.scrollIntoView({block:'center'});
  await wait(()=>fence.querySelector('.linux-note-code-toggle'),'long fence ready');
  let input_id=0;const key=async key=>{const id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'key',key,width:innerWidth,height:innerHeight}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/, '')).id===id;}catch{return false;}},'native key delivered');};
  const cm=fence.querySelector('.CodeMirror').CodeMirror;
  cm.focus();for(let i=0;i<8;i++){fence.querySelector('.CodeMirror-scroll').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-120}));await pause(60);}
  let refreshed_after_exit=0;const native_refresh=cm.refresh;cm.refresh=function(...args){if(!fence.classList.contains('linux-note-code-collapsible'))refreshed_after_exit++;return native_refresh.apply(this,args);};
  const measure=label=>{
   const scroller=fence.querySelector('.CodeMirror-scroll'),wrapper=fence.querySelector('.CodeMirror'),line=[...fence.querySelectorAll('.CodeMirror-code pre')].at(-1),range=document.createRange();range.selectNodeContents(line);
   const text=range.getBoundingClientRect(),clips=[];
   for(let node=line.parentElement;node&&node!==fence.parentElement;node=node.parentElement){const css=getComputedStyle(node);if(/hidden|auto|scroll|clip/.test(css.overflowY)){const r=node.getBoundingClientRect();clips.push({class:node.className,top:r.top,bottom:r.bottom,overflow:css.overflowY});}}
   const bottom=Math.min(...clips.map(c=>c.bottom));const sample={label,class:fence.className,text:text.toJSON(),clips,clipped:text.bottom-bottom,info:cm.getScrollInfo(),model_top:cm.doc.scrollTop,scroll_top:scroller.scrollTop,wrapper:wrapper.getBoundingClientRect().toJSON(),doc_height:cm.doc.height,lines:cm.lineCount(),refreshed_after_exit};samples.push(sample);return sample;
  };
  for(const theme of ['vscode2026_light.css','vscode2026_dark.css']){
   ClientCommand.setTheme(theme,theme);await pause(300);
   for(const zoom of [1,1.25]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(150);
    for(const expanded of [false,true])for(const count of [9,1,4]){
     cm.setValue(long);await pause(200);const toggle=fence.querySelector('.linux-note-code-toggle');assert(!!toggle,'foldable before shrink');if(expanded!==fence.classList.contains('is-code-expanded'))toggle.click();await pause(80);
     fence.scrollIntoView({block:'center'});cm.focus();cm.scrollTo(null,cm.getScrollInfo().height);await pause(80);
     refreshed_after_exit=0;cm.setSelection({line:0,ch:0},{line:cm.lineCount()-count,ch:0});await key(8);
     measure('immediate '+theme+'/'+zoom+'/'+expanded+'/'+count);await new Promise(requestAnimationFrame);measure('frame');await pause(250);
     const sample=measure('settled '+theme+'/'+zoom+'/'+expanded+'/'+count);assert(sample.clipped<=0.75,'last line fully visible '+sample.label+' clipped='+sample.clipped);
     assert(cm.lineCount()===count,'content shrink retained');assert(!fence.classList.contains('linux-note-code-collapsible')&&refreshed_after_exit>0,'fold exit invalidates native measurements');
     const short_text=cm.getValue(),selection=JSON.stringify(cm.listSelections()),refreshes=refreshed_after_exit;await pause(100);assert(refreshed_after_exit===refreshes,'idle scan does not repeat native refresh');assert(JSON.stringify(cm.listSelections())===selection&&cm.hasFocus(),'measurement preserves selection and focus');
     ClientCommand.undo();await pause(160);samples.push({label:"undo",connected:fence.isConnected,expected_length:long.length,actual_length:cm.getValue().length});assert(cm.getValue()===long,'undo restores full code');ClientCommand.redo();await pause(200);assert(cm.getValue()===short_text,'redo restores shortened code');assert(measure('redo').clipped<=0.75,'redo final line complete');
    }
   }
  }
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
