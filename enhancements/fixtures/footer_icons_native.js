(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],root=document.documentElement;
 const front=path.join(base,'workspace/front.md'),body=fs.readFileSync(front,'utf8');
 const sample=()=>['#sidebar-new-file-btn','#switch-file-list-btn','#sidebar-menu-btn>.sidebar-footer-item','#toggle-sourceview-btn'].map(selector=>{
  const node=document.querySelector(selector),b=node.getBoundingClientRect(),style=getComputedStyle(node);
  const icons=[...node.querySelectorAll('svg')].filter(n=>n.getBoundingClientRect().width>0).map(icon=>{const r=icon.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,dx:(r.left+r.right-b.left-b.right)/2,dy:(r.top+r.bottom-b.top-b.bottom)/2};});
  const matched=[];const collect=rules=>{for(const rule of rules){try{if(rule.selectorText&&node.matches(rule.selectorText)&&rule.style?.display)matched.push({selector:rule.selectorText,display:rule.style.display,priority:rule.style.getPropertyPriority("display")});else if(rule.cssRules)collect(rule.cssRules);}catch{}}};for(const sheet of document.styleSheets){try{collect(sheet.cssRules)}catch{}};
  return{selector,class_name:node.className,inline:node.getAttribute("style"),matched,width:b.width,height:b.height,display:style.display,padding:style.padding,icons};
 });
 try{
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  for(let i=0;i<200&&root.dataset.linuxNoteTyporaEnhancements!=='ready';i++)await pause(25);
  const sidebar=core.app.workspace.sidebar,panel=sidebar.panels.find(p=>p.containerEl?.classList.contains('linux-note-workspace-explorer'));
  if(sidebar.activePanel!==panel)sidebar.switch(panel.constructor);sidebar.show();await pause(150);
  samples.push({sidebar:document.querySelector('#typora-sidebar').className,actions:document.querySelector('#ty-sidebar-footer').className,controls:sample()});
  assert(samples[0].controls.every(c=>c.width>0&&c.height>0&&c.icons.length===1&&c.icons.every(i=>Math.abs(i.dx)<.6&&Math.abs(i.dy)<.6)),'实际原生文件/源码操作非悬停可见且字形居中');
  for(let index=0;index<20;index++){
   editor.library.switchTreeOrList(index%2===0);await pause(25);
   const controls=sample();samples.push({iteration:index,sidebar:document.querySelector("#typora-sidebar").className,actions:document.querySelector("#ty-sidebar-footer").className,controls});assert(controls.every(c=>c.width>0&&c.icons.length===1&&c.icons.every(i=>Math.abs(i.dx)<.6&&Math.abs(i.dy)<.6)),`原生列表/树状态切换 ${index+1} 保持可见与居中`);
  }
  const new_file=document.querySelector('#sidebar-new-file-btn');new_file.classList.add('hide');assert(new_file.getBoundingClientRect().width===0,'保留原生只读等业务hide状态');new_file.classList.remove('hide');
  assert(fs.readFileSync(front,'utf8')===body&&!File.changeCounter.isDocumentEdited(),'原文与未保存状态保持');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2),'utf8');}
})();
