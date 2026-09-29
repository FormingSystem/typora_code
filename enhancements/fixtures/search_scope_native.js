// Isolate the original host: full-text search scope, file types, ignore switch, and memory model.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<500;i++){if(fn())return;await pause(20);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口就绪');await pause(500);
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,root=files.context_root();
  assert(root===path.join(base,'workspace'),'隔离工作区');
  reqnode('child_process').execFileSync('git',['init','--quiet',root],{windowsHide:true});
  fs.mkdirSync(path.join(root,'.cache/deep'),{recursive:true});fs.writeFileSync(path.join(root,'.gitignore'),'.cache/\n');
  for(const file of ['.cache/deep/main.c','.cache/closed.c','.cache/closed.h'])fs.writeFileSync(path.join(root,file),'BSP_CLK_Init();\n');
  const target=path.join(root,'.cache/deep/main.c');await files.open_file(target);
  await wait(()=>core.app.workspace.activeLeaf.view.file_path===target,'打开源码');
  core.app.commands.run('linux_note:search');
  const panel=document.querySelector('.linux-note-workspace-search'),query=panel.querySelector('[aria-label="搜索内容"]'),include=panel.querySelector('[aria-label="包含的文件"]'),exclude=panel.querySelector('[aria-label="排除的文件"]');
  const set=(node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));};
  const count=()=>panel.querySelectorAll('.workspace-search-match').length;
  const ready=async expected=>{await pause(300);await wait(()=>panel.dataset.state==='ready'&&count()===expected,'搜索结果 '+expected);assert(true,'搜索结果 '+expected);};
  set(include,'*.c');set(query,'BSP_CLK_Init');await ready(1);
  assert(panel.querySelector('.workspace-search-file').dataset.path===target,'*.c搜到已打开忽略目录文件');
  const ignore=panel.querySelector('[aria-label="使用 .gitignore 和默认排除设置"]');ignore.click();await ready(2);
  assert([...panel.querySelectorAll('.workspace-search-file')].some(node=>node.dataset.path.endsWith('closed.c')),'未打开文件参与整个工程搜索');
  set(exclude,'deep');await ready(1);assert(panel.querySelector('.workspace-search-file').dataset.path.endsWith('closed.c'),'排除目录生效');
  set(include,'*.h');await ready(1);assert(panel.querySelector('.workspace-search-file').dataset.path.endsWith('closed.h'),'文件类型切换');
  set(exclude,'');set(include,'*.c');ignore.click();await ready(1);
  const editor=core.app.workspace.activeLeaf.view.editor.focused_editor();editor.executeEdits('fixture',[{range:editor.getModel().getFullModelRange(),text:'BSP_CLK_Init();\nBSP_CLK_Init();\n'}]);
  set(query,'BSP_CLK_Init');await ready(2);assert(fs.readFileSync(target,'utf8')==='BSP_CLK_Init();\n','内存搜索不修改磁盘');
  panel.querySelectorAll('.workspace-search-match')[1].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  await wait(()=>editor.getPosition()?.lineNumber===2,'内存匹配定位');assert(true,'双击内存结果定位当前模型第二行');
  for(let i=0;i<20;i++){set(include,'*.h');await ready(0);set(include,'*.c');await ready(2);}
  await core.app.workspace.activeLeaf.view.load_file();set(query,'BSP_CLK_Init');await ready(1);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'隔离原始宿主DOM事件；未测物理键鼠及其他平台。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
})();
