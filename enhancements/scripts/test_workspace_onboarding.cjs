const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_onboarding_ui_'));
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let window;
app.whenReady().then(async()=>{
 window=new BrowserWindow({width:1200,height:900,show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true}});
 await window.loadURL('data:text/html,<html data-workspace-colors="light"><body style="margin:0"><button id="original">original focus</button><div class="workspace-titlebar-left" style="position:fixed;top:0;left:40px;width:400px;height:35px"></div><nav class="workspace-titlebar-menu" style="height:35px"></nav><div class="typ-ribbon" style="position:fixed;left:0;top:40px;width:40px;height:650px"></div><div class="typ-workspace-tab-header" style="position:fixed;left:50px;top:40px;width:800px;height:30px"></div><content style="position:fixed;top:80px;left:60px;width:900px;height:600px"></content></body></html>');
 const bundle=await build({stdin:{contents:'export {show_workspace_onboarding} from "./src/workspace_onboarding_view";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'tour_api',write:false,loader:{'.css':'text'}});
 await window.webContents.executeJavaScript(bundle.outputFiles[0].text);
 const evaluate=code=>window.webContents.executeJavaScript(code);
 await evaluate(`document.head.append(Object.assign(document.createElement('style'),{textContent:${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/workspace_colors.css'),'utf8'))}}));window.checks=[];window.check=(v,n)=>{if(!v)throw Error(n);checks.push(n)};window.pause=ms=>new Promise(r=>setTimeout(r,ms));window.button=t=>[...document.querySelectorAll('.workspace-onboarding button')].find(b=>b.textContent===t);window.start=()=>{document.querySelector('#original').focus();window.tour=tour_api.show_workspace_onboarding(()=>window.manual_opened=true)};start();void 0`);
 const inspect=`const panel=document.querySelector('.workspace-onboarding .git-graph-dialog'),r=panel.getBoundingClientRect();check(r.left>=0&&r.top>=0&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5,'card within viewport '+innerWidth+' step '+i);check(document.querySelectorAll('.workspace-onboarding').length===1,'single dialog');check(button(i===9?'完成':'下一步').getBoundingClientRect().bottom<=innerHeight,'next visible');`;
 for(const [width,height,dark,zoom] of [[1200,900,false,1],[440,480,true,1],[1000,720,true,1.25]]){
  window.setSize(width,height);window.webContents.setZoomFactor(zoom);
  await evaluate(`document.documentElement.dataset.workspaceColors=${JSON.stringify(dark?'dark':'light')};tour.close();start();void 0`);
  await evaluate(`(async()=>{for(let i=0;i<10;i++){await pause(60);${inspect} if(i===3){check(!document.querySelector('.workspace-onboarding-demo').hidden,'tabs demonstration');button('暂停示意')?.click();check(document.querySelector('.workspace-onboarding-demo').dataset.paused==='true','pause demonstration');}if(i<9)button('下一步').click();}button('上一步').click();check(document.querySelector('.workspace-onboarding').dataset.step==='8','previous step');button('下一步').click();button('完成').click();check(!document.querySelector('.workspace-onboarding'),'finish cleanup');})()`);
 }
 await evaluate(`start();void 0`);await new Promise(r=>setTimeout(r,60));window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await new Promise(r=>setTimeout(r,80));
 await evaluate(`check(!document.querySelector('.workspace-onboarding'),'trusted Escape exits');check(document.activeElement.id==='original','Escape restores focus');start();button('操作说明与快捷键').click();check(window.manual_opened&&!document.querySelector('.workspace-onboarding'),'manual action closes before opening');start();button('跳过').click();check(!document.querySelector('.workspace-onboarding'),'skip exits');`);
 await window.webContents.debugger.attach('1.3');
 await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await evaluate(`start();button('下一步').click();button('下一步').click();button('下一步').click();check(button('系统已减少动画').disabled,'reduced motion disables animation toggle');check(getComputedStyle(document.querySelector('.workspace-onboarding-phase')).animationName==='none','reduced motion removes actual CSS animation');tour.close();start();void 0`);
 await new Promise(r=>setTimeout(r,40));
 await evaluate(`check(document.activeElement===button('下一步'),'initial keyboard focus is next');check(getComputedStyle(document.querySelector('.git-graph-dialog')).backgroundColor==='rgb(24, 24, 24)'||getComputedStyle(document.querySelector('.git-graph-dialog')).backgroundColor!== 'rgb(255, 255, 255)','dark card uses dark surface');`);
 await window.webContents.debugger.detach();
 fs.writeFileSync(path.join(root,'dark.png'),(await window.webContents.capturePage()).toPNG());
 await evaluate(`tour.close();document.querySelector('.typ-ribbon').remove();start();button('下一步').click();button('下一步').click();void 0`);
 await new Promise(r=>setTimeout(r,50));
 await evaluate(`check(!document.querySelector('.workspace-onboarding-hint').hidden,'missing target explains entry');check(document.querySelector('.workspace-onboarding-highlight').hidden,'missing target removes stale ring');tour.close();`);
 const result=await evaluate('({checks})');fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log('PASS onboarding UI '+result.checks.length+' checks '+root);window.destroy();app.quit();
}).catch(error=>{console.error(error);window?.destroy();app.exit(1);});
