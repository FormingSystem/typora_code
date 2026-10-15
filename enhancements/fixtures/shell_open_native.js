// The public shell command passes a quoted file or directory to the original host executable.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 try{
  if(path.resolve(_options.userDataPath).toLowerCase()!==path.resolve(base,'user_data').toLowerCase())throw Error('Native fixture must use its isolated profile.');
  const expected=JSON.parse(fs.readFileSync(path.join(base,'startup_target.json'),'utf8')).path;
  const directory=fs.statSync(expected).isDirectory(),core=window[Symbol.for('typora-code:workspace')];
  for(let index=0;index<300&&document.documentElement.dataset.linuxNoteTyporaEnhancements!=='ready';index++)await new Promise(resolve=>setTimeout(resolve,50));
  await new Promise(resolve=>setTimeout(resolve,1500));
  let actual;
  for(let index=0;index<600;index++){
   const files=core.app[Symbol.for('linux-note.workspace-files@v1')]?.host;
   actual=directory?files?.context_root():(core.app.workspace.activeLeaf?.view?.file_path||core.app.workspace.activeFile);
   if(actual===expected)break;await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(actual!==expected)throw Error('Expected '+expected+'; got '+actual);
  checks.push(directory?'native folder launch selects workspace':'native file launch opens exact resource');
  if(directory){
   const sidebar=core.app.workspace.sidebar;
   if(!sidebar.isShown||sidebar.activePanel?.ribbonButton?.id!=='linux_note:file_explorer')throw Error('Directory launch must show Explorer without a follow-up click.');
   const normalize=value=>path.normalize(String(value||'')).toLowerCase();
   for(let index=0;index<200&&normalize(document.querySelector('.workspace-explorer-root')?.title)!==normalize(expected);index++)await new Promise(resolve=>setTimeout(resolve,50));
   if(normalize(core.app.vault.path)!==normalize(expected)||normalize(document.querySelector('.workspace-explorer-root')?.title)!==normalize(expected))throw Error('Explorer or vault did not adopt the launch directory: '+JSON.stringify({expected,vault:core.app.vault.path,mount:File.getMountFolder(),initial:_options.mountFolder,roots:[...document.querySelectorAll('.workspace-explorer-root')].map(node=>({title:node.title,text:node.textContent})),buttons:[...document.querySelectorAll('.typ-ribbon-item')].map(node=>node.dataset.id)}));
   checks.push('visible Explorer root and shared vault agree with the launch directory');
   const children=[...document.querySelectorAll('.workspace-explorer-tree [data-path]')].filter(node=>normalize(path.dirname(node.dataset.path))===normalize(expected));
   if(fs.readdirSync(expected).some(name=>!name.startsWith('.'))&&!children.length)throw Error('Nonempty directory has no rendered child rows.');
   if(children.some(node=>!fs.existsSync(node.dataset.path)))throw Error('Explorer contains stale child paths.');
   checks.push('rendered child paths belong to the launch directory: '+children.length);
   const profile=JSON.parse(Buffer.from(fs.readFileSync(path.join(base,'user_data/profile.data'),'utf8'),'hex').toString('utf8'));
   if(profile.restoreWhenLaunch!=='2')throw Error('Directory launch changed the saved launch preference.');
   checks.push('saved native launch preference remains unchanged');
  }
  if(expected.endsWith('.cpp')){for(let index=0;index<400&&!core.app.workspace.activeLeaf.view.editor?.focused_editor()?.getModel();index++)await new Promise(resolve=>setTimeout(resolve,50));if(!core.app.workspace.activeLeaf.view.editor?.focused_editor()?.getModel())throw Error('Source file did not enter code editor: '+JSON.stringify(core.app.workspace.activeLeaf.state));}
  const leaves=[];core.app.workspace.eachLeaves(leaf=>{if(core.app[Symbol.for('linux-note.workspace-files@v1')].host.editor_state(leaf).file_path===expected)leaves.push(leaf);});if(!directory&&leaves.length!==1)throw Error('Startup resource must have one editor identity.');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,target:expected},null,2));
  if(fs.existsSync(path.join(base,'close_after_checks.json'))){await JSBridge.invoke('setting.put','restoreWhenLaunch','2');window.close();}
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
})();
