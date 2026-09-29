// Production quick open with the original host's external area; events are dispatched by the isolated DOM, not physical mouse acceptance.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 try{
  for(let n=0;n<500&&!fs.existsSync(path.join(base,'window_bounds_ready.json'));n++)await pause(20);
  const trigger=document.querySelector('.workspace-titlebar-search');
  const bar=document.querySelector('#top-titlebar'),region=()=>getComputedStyle(bar).webkitAppRegion;
  checks.push({name:'空闲允许原生拖窗',pass:region()==='drag'});
  const selectors=['#write','#typora-sidebar','.workspace-titlebar-window-title','.workspace-preferences-trigger',...Array(20).fill('#top-titlebar')];
  for(const selector of selectors){
   trigger.click();await pause(200);const popup=document.querySelector('.workspace-quick-open'),target=document.querySelector(selector);
   if(!target)throw Error('Missing '+selector);
   samples.push({selector,open:!popup.hidden,region:region()});
   checks.push({name:selector+'打开后顶栏接收外点',pass:!popup.hidden&&region()==='no-drag'});
   for(const type of ['pointerdown','mousedown'])target.dispatchEvent(new (type.startsWith('pointer')?PointerEvent:MouseEvent)(type,{bubbles:true,composed:true,cancelable:true,button:0}));
   checks.push({name:selector+'按下关闭且释放前不交给拖窗',pass:popup.hidden&&region()==='no-drag'});
   for(const type of ['pointerup','mouseup','click'])target.dispatchEvent(new (type.startsWith('pointer')?PointerEvent:MouseEvent)(type,{bubbles:true,composed:true,cancelable:true,button:0}));
   await pause(100);checks.push({name:selector+'外点关闭',pass:popup.hidden});
   for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'Escape',bubbles:true}));
   await pause(20);checks.push({name:selector+'完整退出恢复拖动',pass:region()==='drag'});
  }
  const paragraph=[...document.querySelectorAll('.workspace-titlebar-menu>button')].find(node=>node.textContent==='段落');
  paragraph.click();await pause(40);checks.push({name:'菜单也释放顶栏原生拖动区',pass:region()==='no-drag'});
  for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'Escape',bubbles:true}));
  checks.push({name:'菜单Esc恢复原生拖动',pass:region()==='drag'});
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:checks.every(item=>item.pass)?'PASS':'FAIL',checks,samples,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex')},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,samples,error:String(error),stack:error.stack},null,2));}
})();
