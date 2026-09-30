// R020.2: Verify production buttons in an isolated native host, without touching user windows.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const wait=async(test,label)=>{for(let i=0;i<300;i++){if(test())return;await pause(30);}throw Error(label);};
 const sample=node=>{const style=getComputedStyle(node),range=document.createRange();range.selectNodeContents(node);return {text:node.textContent,title:node.title,outline:style.outlineStyle,color:style.outlineColor,width:style.outlineWidth,offset:style.outlineOffset,rect:node.getBoundingClientRect().toJSON(),text_rect:range.getBoundingClientRect().toJSON()};};
 const visible=node=>{const rect=node.getBoundingClientRect();if(rect.width<=0||rect.height<=0||rect.top<0||rect.bottom>innerHeight||getComputedStyle(node).visibility!=='visible'||getComputedStyle(node).opacity==='0')return false;const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return hit===node||node.contains(hit);};
 const operation=node=>!node.matches('[role^=menuitem],[role=tab],[role=treeitem],[role=option],[data-workspace-selected],[data-workspace-interaction=menu],[data-workspace-interaction=row],[data-workspace-interaction=tab],[data-workspace-interaction=activity]')&&!node.closest('[data-workspace-interaction=none],.monaco-editor,.CodeMirror,.xterm,#write');
 const verify=(root,label)=>{const buttons=[...root.querySelectorAll('button')].filter(node=>visible(node)&&operation(node));assert(buttons.length>0,label+'存在可见操作');for(const node of buttons){const paint=sample(node);samples.push({label,...paint});assert(paint.outline==='solid'&&paint.color==='rgb(112, 112, 112)',label+'静止边线 '+(node.title||node.textContent));}return buttons;};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'独立窗口未就绪');await pause(600);
  for(const theme of ['vscode2026_dark.css','cpp_github-consolas_dark.css','night.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(650);
   document.activeElement?.blur();assert(document.documentElement.dataset.workspaceColors==='dark','真实暗主题 '+theme);
   for(const id of ['core.search','linux_note:source_control','typora_code:remote_ssh']){
    document.querySelector('.typ-ribbon-item[data-id="'+id+'"]')?.click();await pause(350);document.activeElement?.blur();
    verify(core.app.workspace.sidebar.activePanel.containerEl,theme+' '+id);
   }
   core.app.commands.run('linux_note:terminal_toggle');await pause(400);document.activeElement?.blur();
   verify(document.querySelector('.terminal-panel-header'),theme+' 终端');
   core.app.commands.run('linux_note:terminal_toggle');
   core.app.commands.run('typora_code:settings');await wait(()=>document.querySelector('.workspace-settings'),'设置未打开');await pause(250);document.activeElement?.blur();
   const modal=document.querySelector('.workspace-settings-modal');const buttons=verify(modal,theme+' 设置与弹窗');
   const before=buttons.map(node=>sample(node));
   const neutral=document.createElement('style');neutral.textContent='html body [data-workspace-surface] button{outline-width:0!important}';document.head.append(neutral);buttons.forEach((node,index)=>{const actual=sample(node);assert(JSON.stringify(actual.rect)===JSON.stringify(before[index].rect)&&JSON.stringify(actual.text_rect)===JSON.stringify(before[index].text_rect),'同一主题边线不改变几何 '+theme+' '+index);});neutral.remove();
   for(let round=0;round<4;round++){
    const light=round%2===0;const next=light?'vscode2026_light.css':theme;
    File.setTheme(next);await pause(160);
    assert(document.documentElement.dataset.workspaceColors===(light?'light':'dark'),'原生主题切换 '+theme+' '+round);
    buttons.forEach((node,index)=>{const after=sample(node);assert(node.isConnected,'切换保留按钮身份 '+theme+' '+round+' '+index);if(theme!=='night.css')assert(JSON.stringify(after.rect)===JSON.stringify(before[index].rect)&&JSON.stringify(after.text_rect)===JSON.stringify(before[index].text_rect),'同排版明暗按钮几何不变 '+theme+' '+round+' '+index);if(light)assert(after.color!=='rgb(112, 112, 112)'||after.outline!=='solid','浅色撤销共享轮廓 '+index);});
   }
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'button_boundary_'+theme.replace('.css','')}));await pause(450);
   modal.querySelector('.workspace-dialog-close').click();await pause(100);
  }
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'独立Typora 1.14.10正式资产；宿主命令与DOM点击，物理输入及其他平台未验收'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
