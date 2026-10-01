// R072.5: Verify native-owned preferences surfaces, not just their root background.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const wait=async(test,label)=>{for(let index=0;index<300;index++){if(await test())return;await pause(30);}throw Error(label);};
 const read_page=async(view)=>view.executeJavaScript(`(()=>{const style=node=>node?{background:getComputedStyle(node).backgroundColor,text:getComputedStyle(node).color,rect:node.getBoundingClientRect().toJSON()}:null;return {ready:typeof window.setThemeForNode==='function'&&typeof window.setIsDarkMode==='function',mode:document.body.className,theme:document.querySelector('#user-theme')?.getAttribute('href'),root:style(document.documentElement),content:style(document.querySelector('.window-content')),pane:style(document.querySelector('.pane')),active:style(document.querySelector('.nav-group-item.active')),style_count:document.querySelectorAll('style').length,inputs:document.querySelectorAll('input').length,dark_media:matchMedia('(prefers-color-scheme:dark)').matches};})()`);
 const capture=async(stage)=>{stage=stage.replace(/[^a-z0-9_]/g,'_');fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage===stage;}catch{return false;}},'screenshot '+stage);};
 const view=()=>document.querySelector('#uni-preference-panel-view');
 const verify=async(label,dark)=>{
  const page=await read_page(view());samples.push({label,page});
  assert(page.ready&&page.content&&page.pane,label+' native page ready');
  assert(page.mode.split(' ').includes(dark?'dark':'light'),label+' native mode');
  assert(page.content.background==='rgba(0, 0, 0, 0)',label+' content uses native transparent surface');
  assert(page.pane.background==='rgba(0, 0, 0, 0)',label+' pane uses native transparent surface');
  assert(page.content.rect.width>0&&page.content.rect.height>0&&page.inputs>0,label+' real visible form');
  const rgb=page.root.background.match(/[\d.]+/g).map(Number);assert((rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<128)===dark,label+' root background follows theme');
  return page;
 };
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window readiness');
  const original=File.editor.getMarkdown();let stable_view;
  for(const theme of ['vscode2026_dark.css','cpp_github-consolas_dark.css','night.css','vscode2026_light.css','cpp_github-consolas_light.css']){
   const dark=theme.includes('dark')||theme==='night.css';
   ClientCommand.setTheme(theme,theme);await pause(800);
   ClientCommand.showPreferencePanel();
   await wait(async()=>{try{return (await read_page(view())).content;}catch{return false;}},'preferences readiness');await pause(400);
   await capture('native_preferences_'+theme.replace('.css',''));
   const before=await verify(theme+' standalone',dark);const current=view();
   if(stable_view)assert(current===stable_view,theme+' original webview retained');else stable_view=current;
   File.megaMenu.applyTheme();await pause(300);
   const after=await verify(theme+' native apply',dark);assert(after.style_count===before.style_count,theme+' no injected skin');
   for(let round=0;round<4;round++){
    const next_dark=round%2!==0,next=next_dark?'vscode2026_dark.css':'vscode2026_light.css';
    ClientCommand.setTheme(next,next);await pause(400);
    await wait(async()=>{try{const p=await read_page(view());return p.mode.split(' ').includes(next_dark?'dark':'light')&&p.theme.endsWith('/'+next);}catch{return false;}},'native theme switch');
    await verify(theme+' open switch '+round,next_dark);
   }
   const image_tab=await view().executeJavaScript(`(()=>{const item=Array.from(document.querySelectorAll('.nav-group-item')).find(node=>/^(图像|Image)$/.test(node.textContent.trim()));if(!item)return false;item.click();return true;})()`);
   assert(image_tab,theme+' native image category opens');await pause(150);
   const frame=reqnode('electron').webFrame,original_zoom=frame.getZoomFactor();
   try{for(const zoom of [1,1.25]){frame.setZoomFactor(zoom);await pause(200);await verify(theme+' image zoom '+zoom,true);}}finally{frame.setZoomFactor(original_zoom);}
   File.megaMenu.closePreferencePanel();await pause(100);
   ClientCommand.setTheme(theme,theme);await pause(600);
   core.app.commands.run('typora_code:settings');await wait(()=>document.querySelector('[data-settings-owner=native]'),'hosted settings entry');
   document.querySelector('[data-settings-owner=native]').click();await pause(350);
   await verify(theme+' hosted',dark);assert(view()===stable_view,theme+' hosted page retains owner');
   await capture('native_preferences_hosted_'+theme.replace('.css',''));
   document.querySelector('.workspace-settings-modal .workspace-dialog-close').click();await pause(100);
   assert(!document.body.classList.contains('show-preference-panel'),theme+' close restores native state');
  }
  assert(File.editor.getMarkdown()===original,'source Markdown unchanged');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'Original Typora1.14.10 native commands and DOM input, five themes, 20 open-page transitions, image category at 100/125 percent zoom, standalone and hosted screenshots; physical input and other host versions not covered'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
})();
