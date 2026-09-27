// 原始宿主的实际齿轮菜单；只操作隔离窗口，测量文字而非仅看外框。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),frame=reqnode('electron').webFrame,base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 try{
  for(let n=0;n<500&&!fs.existsSync(path.join(base,'window_bounds_ready.json'));n++)await pause(20);
  const constraint=document.createElement('style');document.head.append(constraint);
  const original=document.querySelector('#write').innerHTML;
  const geometry=()=>{const style=getComputedStyle(document.querySelector('#write'));return Object.fromEntries(['fontFamily','fontSize','lineHeight','paddingLeft','paddingRight','maxWidth'].map(key=>[key,style[key]]));};
  let light_geometry;
  for(const theme of ['cpp_github-consolas_light.css','cpp_github-consolas_dark.css','night.css']){
   frame.setZoomFactor(1);await pause(100);
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(300);
   if(theme.includes('_light'))light_geometry=geometry();
   if(theme.includes('_dark')){
    const bg=getComputedStyle(document.body).backgroundColor,fg=getComputedStyle(document.querySelector('#write')).color;
    checks.push({name:'Dark原生正文2026 Dark配色',pass:bg==='rgb(18, 19, 20)'&&fg==='rgb(187, 190, 191)'});
    checks.push({name:'Light/Dark字体与正文几何一致',pass:JSON.stringify(light_geometry)===JSON.stringify(geometry())});samples.push({theme,bg,fg,geometry:geometry()});
   }
   for(const zoom of [1,.9,1.25])for(const constrained of [false,true]){
    constraint.textContent=constrained?'.git-graph-menu[role=menu].workspace-preferences-menu{width:190px}':'';
    frame.setZoomFactor(zoom);await pause(100);document.querySelector('.workspace-preferences-trigger').click();
    const menu=document.querySelector('.workspace-preferences-menu');if(!menu)throw Error('没有齿轮菜单');
    const rows=[...menu.querySelectorAll('button')].map(row=>{const node=row.querySelector('.git-menu-label'),shortcut=row.querySelector('.git-menu-shortcut'),range=document.createRange();range.selectNodeContents(node);const style=getComputedStyle(row);return {text:node.textContent,lines:range.getClientRects().length,row:row.getBoundingClientRect().toJSON(),label:node.getBoundingClientRect().toJSON(),text_rect:range.getBoundingClientRect().toJSON(),shortcut:shortcut.getBoundingClientRect().toJSON(),font:style.font,padding:style.padding,columns:style.gridTemplateColumns,gap:style.columnGap};});
    samples.push({theme,zoom,constrained,width:menu.getBoundingClientRect().width,rows});
    checks.push({name:'两项实际菜单单行 '+theme+'/'+zoom+'/'+constrained,pass:rows.every(row=>row.lines===1)});
    checks.push({name:'实际文字未裁切 '+theme+'/'+zoom+'/'+constrained,pass:rows.every(row=>row.text_rect.right<=row.label.right+.5&&row.text_rect.bottom<=row.label.bottom+.5)});
    document.querySelector('.workspace-preferences-trigger').click();
    const paragraph=[...document.querySelectorAll('.workspace-titlebar-menu>button')].find(node=>node.textContent==='段落');paragraph.click();await pause(50);
    const popup=document.querySelector('.workspace-titlebar-popup');
    if(!popup)throw Error('没有段落菜单');
    const labels=[...popup.querySelectorAll('.workspace-titlebar-label')];
    samples.push({kind:'paragraph',theme,zoom,constrained,width:popup.getBoundingClientRect().width,client:popup.clientWidth,labels:labels.map(node=>{const range=document.createRange();range.selectNodeContents(node);return{text:node.textContent,lines:range.getClientRects().length,text_rect:range.getBoundingClientRect().toJSON(),label:node.getBoundingClientRect().toJSON()};})});
    checks.push({name:'段落菜单实际文字完整 '+theme+'/'+zoom+'/'+constrained,pass:labels.every(node=>{const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect(),box=node.getBoundingClientRect();return range.getClientRects().length===1&&rect.right<=box.right+.5;})});
    const without=popup.querySelector('[data-menu-shortcut=false]');
    checks.push({name:'无快捷键行完整利用宽度 '+theme+'/'+zoom+'/'+constrained,pass:!!without&&Math.abs(without.getBoundingClientRect().right-without.querySelector('.workspace-titlebar-label').getBoundingClientRect().right-parseFloat(getComputedStyle(without).paddingRight))<1});
    paragraph.click();
   }
  }
  checks.push({name:'切主题/菜单保持原文',pass:document.querySelector('#write').innerHTML===original});
  constraint.remove();frame.setZoomFactor(1);await JSBridge.invoke('setting.setCurTheme','cpp_github-consolas_dark.css','cpp_github-consolas_dark.css');File.setTheme('cpp_github-consolas_dark.css');await pause(200);document.querySelector('.workspace-preferences-trigger').click();
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:checks.every(check=>check.pass)?'PASS':'FAIL',checks,samples,theme_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'themes/cpp_github-consolas_dark.css'))).digest('hex'),asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex')},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,samples,error:String(error),stack:error.stack},null,2));}
})();
