// Two original host windows share an isolated profile; histories must remain local.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[],trace=[],originals=new Map();
 let leader=false;try{fs.writeFileSync(path.join(base,'navigation_leader'),'owner',{flag:'wx'});leader=true;}catch(error){if(error.code!=='EEXIST')throw error;}
 const role=leader?'main':'child',root=path.join(base,'workspace');fs.mkdirSync(root,{recursive:true});
 const state=()=>({role,file:files.current_file(),native:File.bundle.filePath,root:files.context_root(),busy:[File._onInitParse,File._onFileSwitching],back:document.documentElement.dataset.linuxNoteHistoryBack,forward:document.documentElement.dataset.linuxNoteHistoryForward,focus:document.hasFocus(),active:File.isActiveWindow?.()});
 const wait=async(fn,label,limit=15000)=>{const start=Date.now();while(Date.now()-start<limit){if(await fn())return;await pause(40);}throw Error(label+JSON.stringify(state()));};
 const log=label=>{trace.push({label,...state()});fs.writeFileSync(path.join(base,'navigation_'+role+'.json'),JSON.stringify({checks,trace},null,2));};
 const assert=(value,label)=>{log(label);if(!value)throw Error(label);checks.push(label);};
 const docs=['a','b','c'].map(name=>path.join(base,'workspace','shared_'+name+'.md'));
 const write=file=>{fs.mkdirSync(path.dirname(file),{recursive:true});const content='# '+path.basename(file)+'\n\nContent.\n';fs.writeFileSync(file,content);originals.set(file,content);};
 for(const file of docs)write(file);
 const channel=new BroadcastChannel('typora-code:navigation-qa:'+base);
 let child_ready=false;
 channel.onmessage=async event=>{
  if(event.data==='ready')child_ready=true;
  if(event.data==='probe'&&!leader){try{await probe();channel.postMessage('passed');}catch(error){fs.writeFileSync(path.join(base,'child_error.json'),JSON.stringify({error:String(error.stack||error),state:state()}));channel.postMessage('failed');}}
  if(event.data==='close'&&!leader){channel.postMessage('closing');window.close();}
 };
 async function probe(){
  for(let i=0;i<3;i++){await files.open_file(docs[i]);await wait(()=>File.bundle.filePath===docs[i]&&!File.isFileLoading(),'open');await pause(700);log('open '+i);}
  for(let i=0;i<3;i++){let leaf;core.app.workspace.eachLeaves(item=>{if(item.state.path===docs[i])leaf=item;});core.app.workspace.activeLeaf=leaf.parent.toggleTab(leaf.state.path);await wait(()=>File.bundle.filePath===docs[i]&&!File.isFileLoading(),'tab');await pause(700);log('tab '+i);}
  assert(document.documentElement.dataset.linuxNoteHistoryBack==='true','history has back');
  window.focus();await pause(150);document.querySelector('#write').focus();
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}));
  await wait(()=>files.current_file()===docs[1],'Alt back');await pause(600);assert(true,'Alt back stays in window');
  const buttons=[...document.querySelectorAll('.workspace-titlebar-history')];buttons[1].click();
  await wait(()=>files.current_file()===docs[2],'button forward');await pause(600);assert(true,'button forward stays in window');
  const outside=['a','b','c'].map(name=>path.join(base,role+'_outside_'+name,name+'.md'));
  for(const file of outside){write(file);await files.open_file(file,{preview:true});await wait(()=>files.current_file()===file&&!File.isFileLoading(),'outside open');await pause(250);}
  assert(document.documentElement.dataset.linuxNoteHistoryBack==='true','automatic folder following retains history');
  const travel=async(direction,target,keyboard)=>{
   if(keyboard){document.querySelector('#write').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:direction<0?'ArrowLeft':'ArrowRight',altKey:true,bubbles:true,cancelable:true}));}
   else document.querySelectorAll('.workspace-titlebar-history')[direction<0?0:1].click();
   await wait(()=>files.current_file()===target&&!File.isFileLoading(),'cross-folder travel');await pause(150);
  };
  for(let round=0;round<20;round++){await travel(-1,outside[1],round%2===0);await travel(1,outside[2],round%2!==0);assert(true,'cross-folder back/forward '+round);}
  const source=path.join(base,role+'_outside_source','code.txt');write(source);await files.open_file(source);await pause(500);
  await travel(-1,outside[2],false);await travel(1,source,false);assert(true,'source and Markdown share window navigation');
  await travel(-1,outside[2],false);
  let rejected=false;try{await files.open_file(path.join(base,'missing.md'));}catch{rejected=true;}
  assert(rejected&&files.current_file()===outside[2],'missing target preserves active file');
  await travel(1,source,false);assert(true,'failed open preserves forward history');
  assert([...originals].every(([file,content])=>fs.readFileSync(file,'utf8')===content),'document bytes unchanged');
 }
 try{
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  if(!leader){channel.postMessage('ready');return;}
  await probe();log('before second window');
  await JSBridge.invoke('setting.put','restoreWhenLaunch',2);
  const child_root=path.join(base,'child_workspace');fs.mkdirSync(child_root,{recursive:true});
  await JSBridge.invoke('app.openFile',null,{mountFolder:child_root,anchor:'#navigation-probe'});
  await wait(()=>child_ready,'second renderer ready');log('after second window');
  const before_child=state();
  let response='';channel.addEventListener('message',event=>{if(['passed','failed','closing'].includes(event.data))response=event.data;});channel.postMessage('probe');
  await wait(()=>response,'child probe',120000);assert(response==='passed','child navigation works');
  assert(files.current_file()===before_child.file&&files.context_root()===before_child.root&&document.documentElement.dataset.linuxNoteHistoryBack===before_child.back&&document.documentElement.dataset.linuxNoteHistoryForward===before_child.forward,'child navigation leaves main resource, root and direction state unchanged');
  await probe();assert(true,'main navigation survives second window');
  channel.postMessage('close');await wait(()=>response==='closing','child close request');await pause(700);
  await files.open_file(docs[0]);await files.open_file(docs[1]);await pause(300);document.querySelectorAll('.workspace-titlebar-history')[0].click();
  await wait(()=>files.current_file()===docs[0]&&!File.isFileLoading(),'main after child close request');await pause(200);assert(true,'main history works after child close request; native window inventory verifies closure');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,trace,input:'Two native windows; DOM Alt and toolbar events'},null,2));
 }catch(error){log('failure');fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,trace},null,2));}
})();
