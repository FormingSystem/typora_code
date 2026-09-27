// 原始宿主的实际齿轮菜单；只操作隔离窗口，测量文字而非仅看外框。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),frame=reqnode('electron').webFrame,base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 try{
  for(let n=0;n<500&&!fs.existsSync(path.join(base,'window_bounds_ready.json'));n++)await pause(20);
  const constraint=document.createElement('style');document.head.append(constraint);
  for(const theme of ['cpp_github-consolas_light.css','cpp_github-consolas_dark.css','night.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(300);
   for(const zoom of [1,.9,1.25])for(const constrained of [false,true]){
    constraint.textContent=constrained?'.git-graph-menu[role=menu].workspace-preferences-menu{width:190px}':'';
    frame.setZoomFactor(zoom);await pause(100);document.querySelector('.workspace-preferences-trigger').click();
    const menu=document.querySelector('.workspace-preferences-menu');if(!menu)throw Error('没有齿轮菜单');
    const rows=[...menu.querySelectorAll('button')].map(row=>{const node=row.querySelector('.git-menu-label'),shortcut=row.querySelector('.git-menu-shortcut'),range=document.createRange();range.selectNodeContents(node);const style=getComputedStyle(row);return {text:node.textContent,lines:range.getClientRects().length,row:row.getBoundingClientRect().toJSON(),label:node.getBoundingClientRect().toJSON(),text_rect:range.getBoundingClientRect().toJSON(),shortcut:shortcut.getBoundingClientRect().toJSON(),font:style.font,padding:style.padding,columns:style.gridTemplateColumns,gap:style.columnGap};});
    samples.push({theme,zoom,constrained,width:menu.getBoundingClientRect().width,rows});
    checks.push({name:'两项实际菜单单行 '+theme+'/'+zoom+'/'+constrained,pass:rows.every(row=>row.lines===1)});
    checks.push({name:'实际文字未裁切 '+theme+'/'+zoom+'/'+constrained,pass:rows.every(row=>row.text_rect.right<=row.label.right+.5&&row.text_rect.bottom<=row.label.bottom+.5)});
    document.querySelector('.workspace-preferences-trigger').click();
   }
  }
  constraint.remove();frame.setZoomFactor(1);document.querySelector('.workspace-preferences-trigger').click();
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:checks.every(check=>check.pass)?'PASS':'FAIL',checks,samples,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex')},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,samples,error:String(error),stack:error.stack},null,2));}
})();
