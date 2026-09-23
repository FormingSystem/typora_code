(async()=>{
 const base=__CASE_ROOT__,fs=reqnode('fs'),path=reqnode('path');
 const root=path.join(base,'workspace'),checks=[],trace=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,workspace=core.app.workspace;
 const wait=async(fn,label)=>{for(let n=0;n<800;n++){if(await fn())return;await pause(25);}throw Error('timeout '+label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const stable=()=>!File.isFileLoading()&&!File._onInitParse&&!File._onFileSwitching;
 const leaves=()=>{const out=[];workspace.eachLeaves(x=>{out.push(x)});return out;};
 const first_record=path.join(base,'restart_phase_one.json'),phase=fs.existsSync(first_record)?2:1;
 const original=File.updateChangeCount;
 File.updateChangeCount=function(...args){const result=original.apply(this,args);if(File.changeCounter.isDocumentEdited())trace.push({args,file:File.bundle.filePath,stack:new Error().stack,text:File.editor.getMarkdown(),saved:File.bundle.savedContent});return result;};
 const report=(status,error)=>fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status,phase,checks,trace,error,file:File.bundle.filePath,dirty:File.changeCounter.isDocumentEdited(),init_file:_options.initFilePath,leaves:leaves().map(x=>x.state.path)},null,2));
 try{
  await wait(()=>document.documentElement.dataset.linuxNoteTyporaEnhancements==='ready'&&stable(),'ready');
  if(phase===1){
   await JSBridge.invoke('setting.put','restoreWhenLaunch',2);
   const opened=[];
   for(let i=0;i<30;i++){
    const file=path.join(root,'opened-'+i+'.md');
    let text='---\nid: restart_'+i+'\ntitle: "第'+i+'章 重启验收"\nkind: reference\ntopics:\n  - linux\n---\n\n# 第'+i+'章\n\n';
    for(let j=0;j<40;j++)text+='## 小节'+j+'\n\n只打开不编辑的正文段落。\n\n```c\nint value = '+j+';\n```\n\n|键|值|\n|-|-|\n|页面|'+i+'|\n\n';
    const corpus=path.join(base,'corpus',i+'.md');
    if(fs.existsSync(corpus))text=fs.readFileSync(corpus,'utf8').replace(/^\ufeff/,'').replace(/\r\n/g,'\n');
    if(i%2)text=text.replace(/\n/g,'\r\n');if(i%3===0)text='\ufeff'+text;
    fs.writeFileSync(file,text);await files.open_file(file,{preview:false});
    await wait(()=>stable()&&File.bundle.filePath===file,'open '+i);await pause(80);
    files.keep_open(workspace.activeLeaf);opened.push(file);
    assert(!File.changeCounter.isDocumentEdited(),'实际打开第'+i+'个Markdown后未修改');
   }
   await pause(15000);
   assert(leaves().length===31,'正常关闭前31个实际打开标签');
   assert(!File.changeCounter.isDocumentEdited()&&!trace.length,'等待15秒未产生保存提示或脏状态');
   fs.writeFileSync(first_record,JSON.stringify({opened,active:File.bundle.filePath,checks}));
  }else{
   const saved=JSON.parse(fs.readFileSync(first_record,'utf8'));
   const visible=File.bundle.filePath;
   for(let i=0;i<60;i++){
    await pause(250);
    assert(!File.changeCounter.isDocumentEdited(),'重启观察'+i+'未出现脏状态');
    assert(File.bundle.filePath===visible,'重启观察'+i+'未被后台文件切走');
   }
   await wait(()=>leaves().length===31,'restore all labels');
   assert(visible===saved.active,'无文件参数启动恢复正常退出前的活动文件');
   assert(!trace.length,'重启过程中未调用造成脏状态的修改接口');
   for(const file of saved.opened){
    await files.open_file(file,{preview:false});await wait(()=>stable()&&File.bundle.filePath===file,'reopen '+file);await pause(50);
    assert(!File.changeCounter.isDocumentEdited(),'重启后逐页浏览未修改 '+path.basename(file));
   }
  }
  report('PASS');window.close();
 }catch(error){report('ERROR',String(error.stack));}
})();
