// The public shell command passes a quoted file or directory to the original host executable.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[];
 try{
  const expected=JSON.parse(fs.readFileSync(path.join(base,'startup_target.json'),'utf8')).path;
  const directory=fs.statSync(expected).isDirectory(),core=window[Symbol.for('typora-code:workspace')];
  let actual;
  for(let index=0;index<600;index++){
   const files=core.app[Symbol.for('linux-note.workspace-files@v1')]?.host;
   actual=directory?files?.context_root():(core.app.workspace.activeLeaf?.view?.file_path||core.app.workspace.activeFile);
   if(actual===expected)break;await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(actual!==expected)throw Error('Expected '+expected+'; got '+actual);
  checks.push(directory?'native folder launch selects workspace':'native file launch opens exact resource');
  if(expected.endsWith('.cpp')){for(let index=0;index<400&&!core.app.workspace.activeLeaf.view.editor?.focused_editor()?.getModel();index++)await new Promise(resolve=>setTimeout(resolve,50));if(!core.app.workspace.activeLeaf.view.editor?.focused_editor()?.getModel())throw Error('Source file did not enter code editor: '+JSON.stringify(core.app.workspace.activeLeaf.state));}
  const leaves=[];core.app.workspace.eachLeaves(leaf=>{if(core.app[Symbol.for('linux-note.workspace-files@v1')].host.editor_state(leaf).file_path===expected)leaves.push(leaf);});if(!directory&&leaves.length!==1)throw Error('Startup resource must have one editor identity.');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,target:expected},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
})();
