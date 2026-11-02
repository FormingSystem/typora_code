// R087: verify original-host fence ownership and bundled renderers on a private desktop.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],timings=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<1000;i++){if(await test())return;await pause(25);}throw Error(label);};
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
   if(['react','html_live','javascript_live'].includes(format))fence.querySelectorAll('.visual-code-toolbar button')[2].click();
   await wait(()=>fence.querySelector('[data-visual-state]'),'result '+format);
   const view=fence.querySelector('.visual-code-view');assert(view.dataset.visualState==='ready',format+': '+view.querySelector('.visual-code-error').textContent);
   assert(fence.querySelector('iframe').getAttribute('sandbox')==='allow-scripts',format+' isolated');
   assert(fs.readFileSync(file,'utf8')===text,format+' disk preserved');
   const model=fence.querySelector('.CodeMirror').CodeMirror;assert(model.getValue().trim()===source.trim(),format+' native source preserved');
   timings.push({format,render_ms:performance.now()-start});
   if(format==='svg'||format==='graphviz'){await pause(300);fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'visual_'+format}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage==='visual_'+format}catch{return false}},'capture '+format);}
   if(format==='svg'){
    const original=model.getValue();model.focus();model.setCursor({line:0,ch:0});model.replaceRange(' ',{line:0,ch:0});await pause(400);assert(model.getValue()!==original,'native edit');await files.save_active();assert(fs.readFileSync(file,'utf8').includes(' '+source),'native save includes edit');assert(!fs.readFileSync(file,'utf8').includes('visual-code'),'render UI excluded from saved source');ClientCommand.undo();await pause(400);assert(model.getValue()===original,'native undo');await files.save_active();assert(fs.readFileSync(file,'utf8').includes(source),'undo save preserves source');
    fence.querySelector('.visual-code-view button').click();assert(fence.classList.contains('visual-code-source-hidden'),'source toggle');fence.querySelector('.visual-code-view button').click();assert(!fence.classList.contains('visual-code-source-hidden'),'source restored');
   }
  }
  await files.open_file(path.join(base,'workspace','front.md'));await pause(500);assert(!document.querySelector('#write .visual-code-frame'),'native disposal');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,timings},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,timings,error:String(error.stack||error)},null,2));}
})();
