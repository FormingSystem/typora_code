// Original host, exclusive repository, actual diff layout and confirmed file writes.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),cp=reqnode('child_process'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[];
 let panel;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async fn=>{for(let i=0;i<600;i++){if(fn())return;await pause(30);}throw Error('Native interaction timeout');},assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 try{
  const core=window[Symbol.for('typora-code:workspace')],app=core.app;
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json'))&&!File.isFileLoading());
  const git=args=>cp.execFileSync('git',['-c','user.name=Native QA','-c','user.email=native@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=.git/unused_hooks',...args],{cwd:root,windowsHide:true});
  git(['config','core.autocrlf','true']);
  const file='long.md',target=path.join(root,file),original='Long source '.repeat(120)+'\n';fs.writeFileSync(target,original);git(['add','--',file]);git(['commit','-m','test: native source wrapping']);fs.writeFileSync(target,original+'Changed\n');
  app.commands.run('linux_note:git_graph');await wait(()=>app.workspace.activeLeaf?.view.panel?.loaded);panel=app.workspace.activeLeaf.view.panel;await wait(()=>!panel.pending);
  await panel.workbench.open_file({path:file,status:'M'},'INDEX','WORKTREE',[{path:file,status:'M'}]);await wait(()=>!!app.workspace.activeLeaf?.view.editor?.editor?.getLineChanges());
  const diff=app.workspace.activeLeaf.view.editor;diff.set_markdown_mode(false);diff.apply_wrap(true);diff.editor.updateOptions({renderSideBySide:true,useInlineViewWhenSpaceIsLimited:true});
  for(let i=0;i<20;i++){for(const width of [400,1000]){diff.body.style.width=width+'px';diff.editor.layout({width,height:600});await pause(50);}for(const editor of [diff.editor.getOriginalEditor(),diff.editor.getModifiedEditor()])assert(editor.getScrollWidth()<=editor.getLayoutInfo().width+2,'wrapped side cycle '+i);}
  diff.body.style.width='';
  for(let i=0;i<20;i++){fs.writeFileSync(target,original+'Changed '+i+'\n');await panel.refresh();panel.discard_confirmation.open([file],'file',file);await wait(()=>document.querySelector('[data-git-discard-state=ready]'));const choice=document.querySelector('[data-git-discard-scope=all]');assert(!!choice&&!choice.disabled,'confirmation available '+i);choice.click();await wait(()=>!panel.writing&&!panel.pending&&!document.querySelector('[data-git-discard-state]'));assert(fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n')===original,'confirmed disk restoration '+i);assert(!panel.state.changes.some(item=>item.path===file),'refreshed file status '+i);}
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,scope:'Original host with DOM commands/clicks, actual Git and layout; no physical OS input or user files'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks,notice:panel?.workbench.notice.textContent,pending:panel?.pending,writing:panel?.writing,dirty:File.changeCounter.isDocumentEdited(),can_change:panel?.host.can_change_files(),changes:panel?.state?.changes,git_status:cp.execFileSync('git',['status','--porcelain=v1'],{cwd:root,windowsHide:true}).toString(),git_diff:cp.execFileSync('git',['diff','--','long.md'],{cwd:root,windowsHide:true}).toString(),git_config:cp.execFileSync('git',['config','--get','core.autocrlf'],{cwd:root,windowsHide:true}).toString()},null,2));}
})();
