// 原始Typora副本的正式入口；合成renderer指针事件，不冒充物理鼠标验收。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const root=document.documentElement,core=window[Symbol.for('typora-code:workspace')];
 const front=path.join(base,'workspace/front.md'),body=fs.readFileSync(front,'utf8');
 try{
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  for(let i=0;i<200&&root.dataset.linuxNoteTyporaEnhancements!=='ready';i++)await pause(25);
  assert(root.dataset.workspaceScrollbars==='auto','正式启动入口已接入全局滚动条行为');
  for(let i=0;i<60;i++)fs.writeFileSync(path.join(base,'workspace','scroll_'+i+'.md'),'# 临时滚动条验证\n','utf8');
  const sidebar=core.app.workspace.sidebar;
  const panel=sidebar.panels.find(p=>p.containerEl?.classList.contains('linux-note-workspace-explorer'));
  if(sidebar.activePanel!==panel)sidebar.switch(panel.constructor);sidebar.show();
  panel.containerEl.querySelector('[title="刷新资源管理器"]')?.click();
  let tree;
  for(let i=0;i<100;i++){tree=panel.containerEl.querySelector('.workspace-explorer-tree');if(tree?.scrollHeight>tree?.clientHeight)break;await pause(50);}
  assert(tree?.scrollHeight>tree?.clientHeight,'真实资源管理器产生可滚动内容');
  const read=()=>Number(getComputedStyle(tree).getPropertyValue('--workspace-scrollbar-opacity'));
  const initial_width=tree.clientWidth,write_node=document.querySelector('#write');
  tree.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));await pause(180);
  assert(read()>.99,'原生宿主悬停显示');
  tree.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}));
  for(const delay of [300,400,300,600]){await pause(delay);samples.push({delay,opacity:read()});}
  assert(read()===0&&!tree.style.getPropertyValue('--workspace-scrollbar-opacity'),'空闲隐藏并清理属性');
  assert(samples.some(s=>s.opacity>0&&s.opacity<1),'真实系统偏好下原生引擎必须存在中间透明度');
  for(let i=0;i<20;i++){
   tree.scrollTop=i%2?0:70;await pause(25);
   tree.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
   tree.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}));
  }
  await pause(1500);
  assert(tree.clientWidth===initial_width&&getComputedStyle(tree,'::-webkit-scrollbar').width==='8px','显隐不改变原生区域宽度与公共滑块尺寸');
  assert(tree.getAnimations().length===0&&!tree.style.getPropertyValue('--workspace-scrollbar-opacity'),'20次交互后没有动画及属性残留');
  assert(document.querySelector('#write')===write_node&&fs.readFileSync(front,'utf8')===body&&!File.changeCounter.isDocumentEdited(),'原文、编辑节点和未保存状态保持');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,iterations:20,reduced_motion:matchMedia('(prefers-reduced-motion: reduce)').matches,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,scope:'原始宿主正式入口；renderer合成指针与真实Explorer，非物理鼠标'},null,2),'utf8');
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2),'utf8');}
})();
