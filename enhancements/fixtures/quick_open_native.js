// 原始Typora副本运行候选构建；查询、打开仅使用专属临时工作区。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(await fn())return;await pause(30);}throw Error('timeout '+label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const picker=()=>document.querySelector('.workspace-quick-open');
 const open=async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'p',code:'KeyP',ctrlKey:true,bubbles:true,cancelable:true}));await wait(()=>picker()&&!picker().hidden,'Ctrl+P');};
 const query=async(value)=>{const input=picker().querySelector('input');input.value=value;input.dispatchEvent(new Event('input'));await wait(()=>!picker().querySelector('.workspace-quick-open-status').textContent.includes('正在'),'search');return input;};
 try{
  reqnode(path.join(window._options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  await wait(()=>files.current_file()===path.join(root,'front.md')&&!File.isFileLoading(),'initial');await pause(400);
  const originals=new Map();for(const name of ['samples/bringup/prj.conf','samples/bringup/README.md','samples/bringup/src/main.c','samples/bringup/tests.yaml','samples/bringup/CMakeLists.txt']){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'# Native fixture '+name+'\n','utf8');originals.set(file,fs.readFileSync(file,'utf8'));}
  await open();await query('samples/bringup');
  assert([...picker().querySelectorAll('.workspace-quick-open-name')].map(n=>n.textContent).join('|')==='prj.conf|README.md|main.c|tests.yaml|CMakeLists.txt','原生构建目录查询顺序与固定上游一致');
  assert([...picker().querySelectorAll('.workspace-quick-open-path .workspace-quick-open-highlight')].every(n=>n.textContent==='samples/bringup'),'每个路径命中片段均高亮');
  assert(getComputedStyle(picker().querySelector('.workspace-quick-open-result')).height==='22px','原生主题真实结果行22px');
  assert(picker().getBoundingClientRect().width===600,'原生候选宽600px：'+picker().getBoundingClientRect().width+'，视口'+innerWidth);
  const input=await query('README bringup');input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  await wait(()=>picker().hidden&&files.current_file()===path.join(root,'samples/bringup/README.md')&&!File.isFileLoading(),'open actual markdown');
  assert(File.editor.getMarkdown().includes('Native fixture samples/bringup/README.md'),'Enter实际加载选中的Markdown内容');
  for(let i=0;i<20;i++){await open();await query(i%2?'samples\\bringup':'main bringup');assert(picker().querySelectorAll('.workspace-quick-open-result').length>0,'连续查询 '+(i+1));for(const type of ['keydown','keyup'])picker().querySelector('input').dispatchEvent(new KeyboardEvent(type,{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));await wait(()=>picker().hidden,'Escape');}
  assert([...originals].every(([file,text])=>fs.readFileSync(file,'utf8')===text),'20轮查询和退出不修改任何临时文件内容');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',requirements:['R058'],checks,input:'原始Typora 1.14.10私有桌面、真实候选和宿主服务；非物理键盘'},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error.stack),html:picker()?.outerHTML},null,2),'utf8');}
})();
