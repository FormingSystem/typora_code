// 原始宿主生产Graph；全部Git写入限定脚本生成的工作区与bare远端。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),cp=reqnode('child_process'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),wait=async(predicate,label)=>{for(let i=0;i<500;i++){if(predicate())return;await pause(30);}throw Error(label);},assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const git=(cwd,args)=>cp.execFileSync('git',['-c','core.hooksPath=.git/unused_hooks','-c','user.name=Native Range','-c','user.email=range@example.invalid','-c','commit.gpgsign=false',...args],{cwd,windowsHide:true,encoding:'utf8'}).trim();
 const save=(cwd,file)=>{fs.writeFileSync(path.join(cwd,file),'# '+file,'utf8');git(cwd,['add','--',file]);git(cwd,['commit','-m',file]);};
 try{
  await pause(1600);const app=window[Symbol.for('typora-code:workspace')].app,original=fs.readFileSync(path.join(root,'front.md'),'utf8');
  const remote=path.join(base,'remote.git'),peer=path.join(base,'peer');git(base,['clone','--bare',root,remote]);git(root,['remote','add','team/origin',remote]);const branch=git(root,['branch','--show-current']);git(root,['push','-u','team/origin',branch+':renamed']);git(base,['clone',remote,peer]);git(peer,['checkout','-b','peer','origin/renamed']);
  save(root,'out-one.md');save(root,'out-two.md');save(peer,'incoming.md');git(peer,['push','origin','peer:renamed']);git(root,['fetch','team/origin']);
  app.commands.run('linux_note:git_graph');await wait(()=>app.workspace.activeLeaf?.view.panel?.loaded,'graph');const graph_leaf=app.workspace.activeLeaf;let panel=graph_leaf.view.panel;await wait(()=>!panel.pending,'initial read');await panel.refresh();
  let history=panel.workbench.history;const range_row=kind=>history.list.querySelector('[data-history-range='+kind+']');
  assert(!!range_row('outgoing')&&!!range_row('incoming'),'侧栏双向差距节点');assert(panel.list.querySelectorAll('[data-history-range]').length===2,'完整Graph共用区间投影');
  assert(range_row('outgoing').textContent.includes(branch)&&range_row('incoming').textContent.includes('team/origin/renamed'),'实际本地分支与异名远端');
  assert(range_row('outgoing').querySelector('circle:last-of-type').style.strokeDasharray==='4, 2'||range_row('outgoing').querySelector('circle:last-of-type').style.strokeDasharray==='4,2','上游虚线圆节点');
  const outgoing=panel.state.tracking.merge_base,head=panel.state.head;
  range_row('outgoing').click();await wait(()=>history.list.querySelectorAll('[data-history-file]').length===2,'outgoing files');
  assert([...history.list.querySelectorAll('[data-history-file]')].map(row=>row.dataset.historyFile).sort().join(',')==='out-one.md,out-two.md','传出展开多笔汇总文件');
  assert(history.list.querySelectorAll('[data-workspace-selected=true]').length===1,'区间选择只有一条');
  const file=history.list.querySelector('[data-history-file="out-one.md"]');file.click();await wait(()=>panel.host.diff_source()?.file==='out-one.md','diff source');const source=panel.host.diff_source();assert(source.from===outgoing&&source.to===head,'文件diff保留共同祖先和本地端点');
  await panel.host.reveal_diff_source(source);history=app.workspace.sidebar.activePanel.panel.workbench.history;assert(document.querySelector('.git-scm-history [data-git-source-selected=true]')?.closest('[data-commit]').dataset.commit.startsWith('outgoing:')&&document.activeElement.dataset.historyFile==='out-one.md','定位来源回到传出组而非单笔提交');
  assert(history.list.querySelectorAll('[data-workspace-selected=true]').length===1,'文件选择替换父区间选择');
  range_row('incoming').click();await wait(()=>history.list.querySelector('[data-history-file="incoming.md"]'),'incoming file');assert(history.list.querySelectorAll('[data-history-file]').length===1,'传入不包含本地独有文件');
  const rows=[...history.list.querySelectorAll('.git-scm-history-commit')];range_row('incoming').focus();range_row('incoming').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert(document.activeElement===rows[rows.indexOf(range_row('incoming'))-1],'区间参与统一方向键导航 '+JSON.stringify({connected:history.list.isConnected,index:rows.indexOf(range_row('incoming')),active:document.activeElement?.outerHTML.slice(0,180)}));
  range_row('incoming').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert(!history.list.querySelector('[data-history-file]'),'键盘收起区间');
  const central=panel.list.querySelector('[data-history-range=outgoing]');central.click();await wait(()=>panel.details.querySelector('[data-file]'),'central details');assert(panel.from===outgoing&&panel.to===head,'完整Graph显示相同汇总比较');
  // 迟到文件读取只能更新仍属于同一展开代次的容器。
  panel=history.owner.panel;const run=panel.runner.run;let release;panel.runner.run=(cwd,args,...rest)=>args[0]==='diff'?new Promise(resolve=>{release=()=>resolve('A\0late.md\0');}):run(cwd,args,...rest);
  history.files_cache.clear();range_row('outgoing').click();await wait(()=>!!release,'late request');range_row('outgoing').click();release();await pause(80);assert(!history.list.querySelector('[data-history-file="late.md"]'),'收起后迟到结果不重开文件列表');panel.runner.run=run;
  panel.branches=['HEAD'];await panel.refresh();assert(!!range_row('outgoing')&&!range_row('incoming'),'HEAD筛选不显示远端组');panel.branches=[];await panel.refresh();
  git(root,['merge','--no-edit','team/origin/renamed']);await panel.refresh();assert(!!range_row('outgoing')&&!range_row('incoming'),'合并后的节点更新');git(root,['push','team/origin',branch+':renamed']);await panel.refresh();assert(!range_row('outgoing')&&!range_row('incoming'),'推送后差距节点清除');
  save(root,'out-again.md');await panel.refresh();assert(!!range_row('outgoing'),'新提交重新产生传出节点');
  assert(fs.readFileSync(path.join(root,'front.md'),'utf8')===original&&!File.changeCounter.isDocumentEdited(),'审阅保持主Markdown与脏状态');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,scope:'原始Typora真实Git和本地bare远端，DOM键鼠及受控迟到端口；无用户仓库网络操作'},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack||error)},null,2),'utf8');}
})();
