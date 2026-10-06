// R037.1: exercise production section controls with trusted input in an isolated host.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<400;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 let input_id=0,trusted_clicks=0;
 const record=event=>{if(event.isTrusted)trusted_clicks++;};
 const click=async node=>{const r=node.getBoundingClientRect(),id=++input_id;assert(r.width>0&&r.height>0,'visible input '+id);fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'click',width:innerWidth,height:innerHeight,x:r.left+Math.min(r.width/2,80),y:r.top+r.height/2}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id;}catch{return false;}},'native input '+id);await pause(120);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const dismiss=()=>[...document.querySelectorAll('.workspace-onboarding button')].find(node=>/^(跳过|Skip)$/.test(node.textContent.trim()))?.click();dismiss();
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const source=path.join(base,'workspace/timeline_source.md'),target=path.join(base,'workspace/timeline_target.md');
  const text='# Timeline preview\n\n[Target](timeline_target.md)\n\nIndependent section state.\n';fs.writeFileSync(source,text);fs.writeFileSync(target,'# Target\n\nPreview only.\n');
  await files.open_file(source);await pause(800);dismiss();
  if(!core.app.workspace.sidebar.isShown||core.app.workspace.sidebar.activePanel?.ribbonButton?.id!=='linux_note:file_explorer')await click(document.querySelector('[data-id="core.file-explorer"]'));
  const timeline=document.querySelector('.workspace-timeline'),toggle=timeline.querySelector('.workspace-section-title'),dock=document.querySelector('.workspace-link-dock');
  document.addEventListener('click',record,true);
  const open_preview=async()=>{const link=[...document.querySelectorAll('#write a')].find(node=>node.getAttribute('href')==='timeline_target.md');assert(!!link,'source link exists');await click(link);await wait(()=>!dock.hidden&&dock.querySelector('.workspace-lookup-markdown'),'trusted link opens preview');};
  for(const [theme,identity] of [['vscode_default_light.css','light'],['vscode_default_dark.css','dark'],['vscode_2026_default_light.css','light_2026'],['vscode_2026_default_dark.css','dark_2026']]){
   ClientCommand.setTheme(theme,theme);await wait(()=>document.documentElement.dataset.workspaceCodeTheme===identity,'theme '+identity);await pause(250);
   core.app.commands.run('linux_note:timeline');await pause(200);
   for(let cycle=0;cycle<5;cycle++){
    const before=toggle.getAttribute('aria-expanded');await open_preview();
    assert(toggle.getAttribute('aria-expanded')===before,'open preserves state '+identity+' '+cycle);
    if(cycle<2){fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'timeline_preview_'+identity+'_'+before}));await pause(250);}
    let activations=0;const activated=()=>activations++;toggle.addEventListener('click',activated);
    await click(toggle);toggle.removeEventListener('click',activated);
    const after=toggle.getAttribute('aria-expanded');samples.push({identity,cycle,before,after,activations,closed:dock.hidden});
    assert(activations===1&&after!==before&&dock.hidden,'one Timeline activation before dismissal '+identity+' '+cycle);
    assert(core.app.settings.get('workspace_timeline').collapsed===(after==='false'),'persisted choice '+identity+' '+cycle);
   }
   // Other section headers share the same outside-interaction path.
   for(const selector of ['.workspace-explorer-opened','.workspace-explorer-folders']){
    const header=document.querySelector(selector+' .workspace-section-title'),before=header.getAttribute('aria-expanded');await open_preview();await click(header);
    assert(header.getAttribute('aria-expanded')!==before&&dock.hidden,'independent section '+identity+' '+selector);
   }
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'timeline_'+identity}));await pause(250);
  }
  const collapsed=toggle.getAttribute('aria-expanded');await open_preview();
  dock.querySelector('[aria-label="关闭链接预览"],[aria-label="Close link preview"]').click();
  assert(toggle.getAttribute('aria-expanded')===collapsed,'explicit preview close preserves Timeline');
  await files.open_file(target);await pause(500);assert(toggle.getAttribute('aria-expanded')===collapsed,'following another file preserves Timeline');
  assert(fs.readFileSync(source,'utf8')===text,'source unchanged');assert(trusted_clicks>=55,'trusted input count '+trusted_clicks);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,trusted_clicks},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,trusted_clicks},null,2));}
 finally{document.removeEventListener('click',record,true);}
})();
