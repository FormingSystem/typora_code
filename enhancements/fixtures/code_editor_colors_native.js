// 使用真实宿主CodeMirror创建光标和选区；不修改用户文档。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error(label);};
 const text='# 编辑状态\n\n```c\np = rcu_dereference(table[id]);\nconst char *s = "hello";\n```\n\n```bash\nmkdir -p build/learning-tools\necho $?\n```\n\n```\np = plain;\n```\n',file=path.join(base,'workspace/editor.md');
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口准备');fs.writeFileSync(file,text);await files.open_file(file);
  await wait(()=>document.querySelector('.md-fences[lang=c] .CodeMirror')?.CodeMirror,'原生围栏');
  for(const mode of ['dark','light','night','dark']){
   const theme=mode==='night'?'night.css':'vscode2026_'+mode+'.css';await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(700);
   for(const lang of ['c','bash','plain']){
    const fence=(lang==='plain'?[...document.querySelectorAll('.md-fences')].find(n=>!n.getAttribute('lang')):document.querySelector('.md-fences[lang='+lang+']'));fence.scrollIntoView({block:'center'});await pause(250);
    const node=fence.querySelector('.CodeMirror'),cm=node.CodeMirror;cm.refresh();cm.setOption('cursorBlinkRate',0);cm.focus();cm.setCursor({line:0,ch:4});await pause(150);
    const before=cm.getValue(),cursor=node.querySelector('.CodeMirror-cursor');assert(!!cursor,'真实光标 '+mode+' '+lang);
    const color=getComputedStyle(cursor).borderLeftColor;assert(color===(mode==='dark'?'rgb(187, 190, 191)':mode==='night'?'rgb(174, 175, 173)':'rgb(32, 32, 32)'),'光标颜色 '+mode+' '+lang+' '+color);
    cm.setSelection({line:0,ch:0},{line:0,ch:10});await pause(150);
    const selected=node.querySelector('.CodeMirror-selected');assert(!!selected,'真实选区 '+mode+' '+lang);
    assert(getComputedStyle(selected).backgroundColor===(mode==='dark'?'rgba(39, 103, 130, 0.867)':mode==='night'?'rgb(38, 79, 120)':'rgba(0, 105, 204, 0.25)'),'聚焦选区 '+mode+' '+lang);
    assert([...node.querySelectorAll('.CodeMirror-line')].every(n=>getComputedStyle(n).backgroundColor==='rgba(0, 0, 0, 0)'),'行背景不遮选区 '+mode+' '+lang);
    cm.getInputField().blur();await pause(80);assert(getComputedStyle(selected).backgroundColor===(mode==='dark'?'rgba(39, 103, 130, 0.376)':mode==='night'?'rgb(58, 61, 65)':'rgba(0, 105, 204, 0.1)'),'失焦选区 '+mode+' '+lang);
    assert(cm.getValue()===before,'内容保持 '+mode+' '+lang);samples.push({mode,lang,color,selected:getComputedStyle(selected).backgroundColor});
    cm.focus();cm.setCursor({line:0,ch:4});
   }
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'editor_'+mode}));await pause(300);
  }
  assert(fs.readFileSync(file,'utf8')===text,'磁盘正文不变');assert(document.querySelectorAll('#typora-code-official-code-theme').length===1,'主题样式唯一');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,asset_sha256:reqnode('crypto').createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex')},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks,samples},null,2));}
})();
