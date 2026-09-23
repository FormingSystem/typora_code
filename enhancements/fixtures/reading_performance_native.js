// 正式构建原始宿主的组合场景；程序滚动与真实硬件验收分别记录。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),cp=reqnode('child_process'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await pause(50);}throw Error('reading audit timeout');};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,audit=window.__reading_audit;
 const report=(status,error)=>fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status,error,checks,samples},null,2));
 try{
  await pause(2400);
  // 与反馈一致保留后台渲染/源码比较；这些是实际Git结果，不是空占位节点。
  const cwd=path.join(base,'workspace'),names=['review-a.md','review-b.md','review.js'];
  const before='# Review\n\n'+Array.from({length:180},(_,i)=>'paragraph '+i+'\n\n').join('');
  for(const name of names)fs.writeFileSync(path.join(cwd,name),name.endsWith('.js')?'// source\n'+Array.from({length:1000},(_,i)=>'const value_'+i+' = '+i+';\n').join(''):before);
  const git=args=>cp.execFileSync('git',['-c','user.name=Native QA','-c','user.email=native@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=.git/unused_hooks',...args],{cwd,windowsHide:true});
  git(['add','--',...names]);git(['commit','-m','test: reading performance fixture']);
  for(const name of names)fs.appendFileSync(path.join(cwd,name),'\nchanged\n');
  core.app.commands.run('linux_note:git_graph');await wait(()=>core.app.workspace.activeLeaf?.view.panel?.loaded);const panel=core.app.workspace.activeLeaf.view.panel;await wait(()=>!panel.pending);await panel.refresh();
  for(const name of names){await panel.workbench.open_file({path:name,status:'M'},'INDEX','WORKTREE',[{path:name,status:'M'}]);await wait(()=>name.endsWith('.js')?!!core.app.workspace.activeLeaf.view.editor:core.app.workspace.activeLeaf.view.editor?.markdown_preview?.container.dataset.ready==='true');}
  assert(document.querySelectorAll('.git-markdown-comparison').length===2||[...document.querySelectorAll('.git-markdown-diff')].length===2,'两个后台Markdown比较存在');
  const target=path.join(base,'workspace/preview.md');fs.writeFileSync(target,'# Preview\n\n'+Array.from({length:100},(_,i)=>'## Section '+i+'\n\n'+('preview paragraph '.repeat(30))+'\n\n').join(''));
  for(const count of [20,100,1000]){
   const source=path.join(base,'workspace/reading-'+count+'.md');fs.writeFileSync(source,'# Reading\n\n[Preview](preview.md)\n\n'+Array.from({length:count},(_,i)=>'## Section '+i+'\n\n'+('reading paragraph 中文排版 '.repeat(20))+'\n\n').join(''));
   await files.open_file(source);await wait(()=>File.bundle.filePath===source&&!File.isFileLoading());await pause(1800);
   const link=document.querySelector('#write a'),range=document.createRange();range.selectNodeContents(link);getSelection().removeAllRanges();getSelection().addRange(range);
   await wait(()=>document.querySelector('.workspace-link-dock .workspace-lookup-preview-body')?.dataset.previewKind==='markdown');await pause(1000);
   const main=document.querySelector('content'),preview=document.querySelector('.workspace-link-dock .workspace-lookup-preview-body');
   for(const [name,node]of [['main',main],['preview',preview],['idle',null],...(count===1000?[['host-state',null]]:[])]){
    main.scrollTop=main.scrollHeight-main.clientHeight-2500;await pause(300);
    audit.stats={};audit.bounds=0;audit.ranges=0;audit.styles=0;const frames=[];let last=performance.now(),running=true;
    const frame=now=>{frames.push(now-last);last=now;if(running)requestAnimationFrame(frame);};requestAnimationFrame(frame);audit.enabled=true;
    for(let i=0;i<100;i++){if(node)node.scrollTop+=i<50?12:-12;if(name==='host-state')document.body.classList.toggle('qa-host-state',!!(i%2));await pause(16);}
    audit.enabled=false;running=false;
    samples.push({count,phase:name,bounds:audit.bounds,ranges:audit.ranges,styles:audit.styles,frames:[...frames].sort((a,b)=>a-b),callbacks:Object.entries(audit.stats).sort((a,b)=>b[1].total-a[1].total)});report('RUNNING');
    assert(File.bundle.filePath===source,'正文身份保持 '+count+' '+name);
    if(!fs.existsSync(path.join(base,'baseline'))&&['main','preview'].includes(name))assert(audit.bounds<12000,'100次滚动布局读取有界 '+count+' '+name);
   }
   document.querySelector('.workspace-link-dock [aria-label="关闭预览"]')?.click();
  }
  report('PASS');
 }catch(error){audit.enabled=false;report('FAIL',String(error.stack||error));}
})();
