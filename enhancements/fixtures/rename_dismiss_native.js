// R028.1: Native outside-click dismissal, using an isolated document and host.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let n=0;n<400;n++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const file=path.join(base,'workspace/front.md'),original=fs.readFileSync(file,'utf8');await files.open_file(file);
  let input_id=0;const clicks=[];document.addEventListener('click',event=>clicks.push({trusted:event.isTrusted,target:event.target.closest?.('[data-id]')?.getAttribute('data-id')}),true);
  const send=async(kind,values)=>{const id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind,width:innerWidth,height:innerHeight,...values}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id}catch{return false}},'input acknowledgement');await pause(100);};
  const click=async node=>{const r=node.getBoundingClientRect();assert(r.width>0&&r.height>0,'visible click target');await send('click',{x:r.left+r.width/2,y:r.top+r.height/2});};
  const input=()=>document.querySelector('.workspace-explorer-rename');
  for(let round=0;round<6;round++){
   const tree_visible=()=>{const tree=document.querySelector('.workspace-explorer-tree');return tree&&tree.getBoundingClientRect().height>0;};
   if(!tree_visible())await click(document.querySelector('[data-id="core.file-explorer"]'));
   await wait(tree_visible,'explorer visible');
   const row=[...document.querySelectorAll('.workspace-explorer-row')].find(node=>node.dataset.path===file);assert(!!row,'isolated file row');await click(row);
   const tree=document.querySelector('.workspace-explorer-tree');tree.focus();tree.dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true}));await wait(input,'rename mounted');
   input().select();await send('text',{text:'unconfirmed.md'});assert(input().value==='unconfirmed.md','native draft typing');
   const target=round%3===0?document.querySelector('[data-id="core.outline"]'):round%3===1?document.querySelector('[data-id="core.search"]'):document.querySelector('#write h1');
   await click(target);await wait(()=>!input(),'outside cancelled');assert(!fs.existsSync(path.join(base,'workspace/unconfirmed.md'))&&fs.readFileSync(file,'utf8')===original,'cancel leaves file and bytes unchanged');
   assert(!document.documentElement.hasAttribute('data-workspace-dismissal-active'),'dismissal owner released');
   samples.push({round,target:target.getAttribute('data-id')||'document',active_panel:core.app.workspace.sidebar.activePanel?.ribbonButton?.id,last_click:clicks.at(-1)});
   if(round%3!==2)assert(core.app.workspace.sidebar.activePanel?.ribbonButton?.id!=='linux_note:file_explorer','activity action runs on same click');
  }
  assert(samples.every(sample=>sample.last_click?.trusted)&&samples.some(sample=>sample.target==='core.outline'&&sample.active_panel==='core.outline')&&samples.some(sample=>sample.target==='core.search'&&sample.active_panel==='linux_note:search'),'trusted outline and search actions received');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'Original Typora 1.14.10; F2 entry dispatched at the production tree; external mouse and draft text use native message input; no user documents changed.'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
