// 原始宿主、正式构建、临时正文；不操作用户窗口或用户文件。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const a=path.join(base,'workspace/nav_a.md'),b=path.join(base,'workspace/nav_b.md'),encoded=path.join(base,'workspace/nav space#%.md'),code=path.join(base,'workspace/nav.txt');
 const text=title=>'# '+title+'\n\n[文内](#终点) [跨文](nav_b.md#终点)\n\n'+Array.from({length:35},(_,i)=>'段落 '+i+'，阅读导航测试。\n\n').join('')+'## 终点\n\n结束。\n';
 const originals=new Map([[a,text('来源')],[b,text('目标')],[encoded,text('编码目标')],[code,Array.from({length:100},(_,i)=>'line '+(i+1)).join('\n')]]);
 for(const [file,value]of originals)fs.writeFileSync(file,value);
 const snapshot=()=>({file:files.current_file(),cursor:File.editor.selection.buildUndo(),top:document.querySelector('content').scrollTop,back:document.documentElement.dataset.linuxNoteHistoryBack,forward:document.documentElement.dataset.linuxNoteHistoryForward});
 const travel=async direction=>{window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction}}));await pause(850);};
 const link=async url=>{const key=typeof File.editor.tryOpenUrl_==='function'?'tryOpenUrl_':'tryOpenUrl';File.editor[key](url);await pause(700);};
 try{
  for(let i=0;i<100&&(File.isFileLoading()||!File.bundle.filePath.endsWith('front.md'));i++)await pause(50);await pause(2400);
  await files.open_file(a);await pause(600);
  const origin=document.querySelector('#write p');File.editor.undo.exeCommand({type:'cursor',id:origin.getAttribute('cid'),start:0,end:0});document.querySelector('content').scrollTop=0;await pause(150);
  const before=snapshot();
  const anchor=document.querySelector('#write a[href^="#"]');assert(!!anchor,'原生渲染链接存在');
  anchor.dispatchEvent(new MouseEvent('click',{ctrlKey:true,bubbles:true,cancelable:true,button:0}));await pause(700);
  const target=snapshot();samples.push({before,target,internal_link:typeof File.editor.tryOpenUrl_});
  assert(target.top>before.top+200,'同文链接跳到远端标题');
  await travel(-1);assert(Math.abs(snapshot().top-before.top)<3,'后退恢复链接来源滚动');assert(snapshot().cursor.id===before.cursor.id,'后退恢复链接来源光标');
  await travel(1);assert(Math.abs(snapshot().top-target.top)<3,'前进恢复标题滚动');
  await link('nav_b.md#终点');assert(files.current_file()===b,'跨文件标题链接打开目标');const cross=snapshot();
  await travel(-1);assert(files.current_file()===a,'跨文后退一次即回来源');
  await travel(1);assert(files.current_file()===b&&Math.abs(snapshot().top-cross.top)<3,'跨文前进恢复标题位置');
  await link(encodeURIComponent(path.basename(encoded))+'#'+encodeURIComponent('终点'));assert(files.current_file()===encoded,'URL空格百分号和井号路径只解码一次');
  await travel(-1);assert(files.current_file()===b,'编码文件链接仍返回正确来源');
  await files.open_file(code);await pause(650);let editor=core.app.workspace.activeLeaf.view.editor.focused_editor();
  editor.setPosition({lineNumber:30,column:3});editor.revealLineInCenter(30);await pause(150);
  editor.setPosition({lineNumber:31,column:2});editor.revealLineInCenter(31);await pause(150);
  await travel(-1);assert(editor.getPosition().lineNumber===30,'源码明确近邻跳转可后退');
  await travel(1);assert(editor.getPosition().lineNumber===31,'源码近邻跳转可前进');
  await files.open_file(a);await pause(550);await travel(-1);assert(files.current_file()===code,'Markdown后退到源码');
  assert(editor.getPosition().lineNumber===31,'跨编辑器保留源码行列');
  await travel(1);assert(files.current_file()===a,'源码前进到Markdown');
  for(let i=0;i<10;i++){await travel(-1);assert(files.current_file()===code,'反复返回源码 '+i);await travel(1);assert(files.current_file()===a,'反复前进Markdown '+i);}
  const code_leaf=[...(()=>{const leaves=[];core.app.workspace.eachLeaves(leaf=>leaves.push(leaf));return leaves;})()].find(leaf=>leaf.view.editor?.focused_editor()===editor);
  await files.close_leaf(code_leaf);await pause(150);await travel(-1);
  assert(files.current_file()===code,'已关闭源码标签可由历史重开');
  assert(core.app.workspace.activeLeaf.view.editor.focused_editor().getPosition().lineNumber===31,'重开保留源码行列');
  const left=core.app.workspace.activeLeaf;
  await files.open_file(code,{line:60,column:4},'right');await pause(600);const right=core.app.workspace.activeLeaf;
  assert(left!==right&&left.parent!==right.parent,'同源码在独立编辑组打开');
  await travel(-1);assert(core.app.workspace.activeLeaf===left,'跨组后退恢复原编辑组');
  assert(left.view.editor.focused_editor().getPosition().lineNumber===31,'原编辑组光标不被另一组覆盖');
  await travel(1);assert(core.app.workspace.activeLeaf===right,'跨组前进恢复目标编辑组');
  assert(right.view.editor.focused_editor().getPosition().lineNumber===60,'目标组保留明确行列');
  let failed=false;try{await files.open_file(path.join(base,'workspace/missing.md'));}catch{failed=true;}
  assert(failed&&core.app.workspace.activeLeaf===right,'失效链接不替换当前编辑器');
  await travel(-1);assert(core.app.workspace.activeLeaf===left,'失效链接不污染返回位置');
  for(const [file,value]of originals)assert(fs.readFileSync(file,'utf8')===value,'导航未修改正文 '+path.basename(file));
  assert(!File.changeCounter.isDocumentEdited(),'导航未产生Markdown草稿');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'原始Typora1.14.10正式构建，内部链接入口和公共历史命令；物理键盘由Electron隔离用例覆盖，不代表真人输入或跨平台验收'},null,2));
 }catch(error){samples.push(snapshot());fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
