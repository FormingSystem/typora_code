// 正式共享绘制+实际DOM绑定；真实Chromium输入和像素采样，不触碰用户文件。
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{build}=require('esbuild');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'typora_scrollbar_fade_'));
app.setPath('userData',path.join(base,'profile'));app.disableHardwareAcceleration();let win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[],samples=[];
const ev=code=>win.webContents.executeJavaScript(code);
const check=async(label,code)=>{assert(await ev(code),label);checks.push(label);};
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:800,height:620,webPreferences:{offscreen:true,contextIsolation:false,backgroundThrottling:false}});
 const file=path.join(base,'index.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:white}.probe{width:220px;height:140px;overflow:scroll;margin:12px;outline:0}.fill{width:700px;height:1000px;background:white}#excluded{overflow:scroll;width:150px;height:70px}#unrelated{transition:color 7s;opacity:.7}</style><div id="probe" class="probe" tabindex="0"><div class="fill"></div></div><div id="unrelated">outside</div><div class="monaco-editor"><div id="excluded"><div class="fill"></div></div></div>');
 await win.loadFile(file);
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await ev(`const sheet=document.createElement('style');sheet.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../dist/workspace.css'),'utf8'))};document.head.append(sheet);document.documentElement.dataset.linuxNoteTyporaEnhancements='ready';window.probe=document.querySelector('#probe');void 0`);
 const bundle=await build({entryPoints:[path.join(__dirname,'../src/workspace_scrollbars.ts')],bundle:true,format:'iife',globalName:'qa',write:false});await ev(bundle.outputFiles[0].text);
 await ev('window.binding=qa.bind_workspace_scrollbars();void 0');
 const opacity='Number(getComputedStyle(probe).getPropertyValue("--workspace-scrollbar-opacity"))';
 const move=async(x,y)=>{win.webContents.sendInputEvent({type:'mouseMove',x,y});await pause(40);};
 const pixel=async(label)=>{
  const image=await win.webContents.capturePage({x:224,y:14,width:6,height:12});fs.writeFileSync(path.join(base,label+'.png'),image.toPNG());
  const bytes=image.toBitmap();let sum=0;for(let i=0;i<bytes.length;i+=4)sum+=bytes[i+2];const red=sum/(bytes.length/4);samples.push({label,red,opacity:await ev(opacity)});return red;
 };
 await check('生产显隐绑定已启用','document.documentElement.dataset.workspaceScrollbars==="auto"');
 await move(500,350);await check('空闲初始隐藏',opacity+'===0');
 await move(50,50);await pause(140);await check('悬停真实滚动区域显示',opacity+'>.99');const shown=await pixel('shown');
 await move(500,350);await pause(700);await check('离开后中间透明度渐变',opacity+'>.05&&'+opacity+'<.95');const middle=await pixel('middle');
 await pause(650);await check('淡出结束隐藏并释放局部状态',opacity+'===0&&!probe.style.getPropertyValue("--workspace-scrollbar-opacity")');const hidden=await pixel('hidden');
 assert(shown<middle&&middle<hidden&&hidden>245,JSON.stringify({shown,middle,hidden}));checks.push('真实滑块像素逐步淡出');
 await ev('probe.focus();void 0');win.webContents.sendInputEvent({type:'keyDown',keyCode:'PageDown'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'PageDown'});await pause(220);
 await check('区域外键盘滚动显示且确实滚动','probe.scrollTop>0&&'+opacity+'>.99');
 await move(50,50);await pause(200);await move(500,350);await pause(750);await move(50,50);await pause(180);await check('淡出中重新进入恢复',opacity+'>.99');
 await ev('probe.scrollTop=0;probe.blur();void 0');await pause(100);await move(228,20);win.webContents.sendInputEvent({type:'mouseDown',x:228,y:20,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:228,y:60,button:'left'});await pause(170);
 await check('原生滑块可拖动','probe.scrollTop>0');win.webContents.sendInputEvent({type:'mouseUp',x:228,y:60,button:'left',clickCount:1});
 await check('布局、其他过渡和正文透明度不变','probe.clientWidth===212&&getComputedStyle(probe).opacity==="1"&&getComputedStyle(document.querySelector("#unrelated")).transitionDuration==="7s"');
 await ev('document.querySelector("#excluded").scrollTop=50;void 0');await pause(60);await check('第三方滚动所有者未登记','!document.querySelector("#excluded").style.getPropertyValue("--workspace-scrollbar-opacity")');
 await ev(`window.regions=[];for(const name of ['workspace-explorer-tree','workspace-explorer-opened-list','workspace-timeline-list','workspace-search-results','git-scm-groups','git-scm-history-list','workspace-titlebar-popup']){const node=document.createElement('div');node.className=name;node.style.cssText='position:relative!important;width:160px!important;height:70px!important;min-height:0!important;max-height:70px!important;overflow:scroll!important;display:block!important;flex:none!important';node.innerHTML='<div style="height:400px;width:400px"></div>';document.body.append(node);regions.push(node);}void 0`);
 for(let i=0;i<7;i++){
  await ev(`regions[${i}].dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));void 0`);await pause(130);
  await check('同类区域 '+i+' 共用显隐',`Number(getComputedStyle(regions[${i}]).getPropertyValue('--workspace-scrollbar-opacity'))>.99`);
 }
 await ev(`regions.forEach(n=>{n.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}));n.remove();});void 0`);await pause(1450);
 await check('动态面板卸载后释放绘制状态','regions.every(n=>!n.style.getPropertyValue("--workspace-scrollbar-opacity")&&n.getAnimations().length===0)');
 for(const theme of ['light','dark']){
  win.webContents.setZoomFactor(1.25);await ev(`document.documentElement.dataset.workspaceFileIconTheme='${theme}';void 0`);await move(60,60);await pause(200);
  await check(theme+'缩放下保持公共几何',opacity+'>.99&&getComputedStyle(probe,"::-webkit-scrollbar-thumb").borderRadius==="4px"&&getComputedStyle(probe,"::-webkit-scrollbar").width==="8px"');
 }
 await ev('document.documentElement.classList.add("disable-animations");void 0');await move(600,400);await pause(720);await check('宿主关闭动画仍保留滚动条渐隐',opacity+'>0&&'+opacity+'<1');await pause(650);
 await ev('document.documentElement.classList.remove("disable-animations");void 0');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await move(60,60);await pause(150);await check('系统减少动画时正常显示',opacity+'===1');await move(600,400);await pause(720);await check('系统减少动画仍有渐隐中间帧',opacity+'>0&&'+opacity+'<1');await pause(650);await check('渐隐结束释放动画',opacity+'===0&&probe.getAnimations().length===0');
 await move(60,60);await pause(70);await ev('binding.dispose();void 0');await check('销毁恢复原生绘制并取消全部动画','!document.documentElement.hasAttribute("data-workspace-scrollbars")&&!probe.style.getPropertyValue("--workspace-scrollbar-opacity")&&probe.getAnimations().length===0');
 fs.writeFileSync(path.join(base,'results.json'),JSON.stringify({status:'PASS',checks,samples},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence:base,samples}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error('Evidence: '+base);win?.destroy();app.exit(1);});
