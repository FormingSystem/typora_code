// 原始宿主只读浏览：LF/CRLF/BOM/末尾换行、光标及关闭，不改用户文档。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],states=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const wait=async(fn)=>{for(let i=0;i<200;i++){if(fn())return;await pause(30);}throw Error('等待文档超时');};
 try{
  await pause(700);
  for(const extension of ['md','txt'])for(const eol of ['\n','\r\n'])for(const bom of ['', '\ufeff'])for(const tail of ['',eol]){
   const text=bom+['# 标题','','只读浏览，保留正文。','', '```text','code','```'].join(eol)+tail;
   const file=path.join(base,'workspace','browse-'+states.length+'.'+extension);fs.writeFileSync(file,text,'utf8');
   await files.open_file(file);await wait(()=>!files.editor_state(core.app.workspace.activeLeaf).busy);await pause(300);
   const leaf=core.app.workspace.activeLeaf,initial=files.editor_state(leaf);
   const state={extension,eol,bom:!!bom,tail:!!tail,initial,saved:File.bundle.savedContent,markdown:File.editor.getMarkdown(),counter:File.changeCounter.isDocumentEdited()};states.push(state);
   assert(!initial.dirty,'仅打开不标记修改 '+states.length);
   if(extension==='md'){
    const node=[...document.querySelectorAll('#write p')].find(node=>node.textContent.includes('只读浏览'));
    for(let i=0;i<20;i++){node.dispatchEvent(new MouseEvent('click',{bubbles:true,button:0}));const range=document.createRange();range.selectNodeContents(node);range.collapse(i%2===0);window.getSelection().removeAllRanges();window.getSelection().addRange(range);await pause(10);assert(!files.editor_state(leaf).dirty,'光标不改变脏状态 '+states.length+'/'+i);}
   }
   const closing=files.close_leaf(leaf);await pause(100);assert(!document.querySelector('[data-workspace-tab-close]'),'未编辑关闭不要求保存 '+states.length);assert(await closing,'正常关闭 '+states.length);
   assert(fs.readFileSync(file,'utf8')===text,'原始字节保持 '+states.length);
  }
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,states},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,states,error:String(error.stack||error)},null,2));}
})();
