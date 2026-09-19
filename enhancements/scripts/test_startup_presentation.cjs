const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'typora_presentation_'));
app.setPath('userData',path.join(temp,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});let window;
app.whenReady().then(async()=>{
 const head=fs.readFileSync(path.join(__dirname,'../runtime_head.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
 const css=fs.readFileSync(path.join(__dirname,'../dist/workspace.css'),'utf8');
 for(const theme of ['light','dark'])for(const outcome of ['ready','failure','timeout']){
  const html=path.join(temp,theme+'_'+outcome+'.html');
  fs.writeFileSync(html,`<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style><script>window.real_timeout=setTimeout;window.setTimeout=(fn,ms)=>{if(ms===15000){window.deadline=fn;return 0;}return real_timeout(fn,ms)};</script><script>${head}</script></head><body class="typora-node unibody-window" style="--text-color:${theme==='dark'?'#ddd':'#333'};background:${theme==='dark'?'#222':'#fff'}"><div id="top-titlebar"><button id="w-close">Close</button><span id="title-text">Native</span></div><content>Saved document</content><div id="typora-sidebar">Native sidebar</div><footer class="ty-footer">Native footer</footer></body></html>`,'utf8');
  window=new BrowserWindow({show:false,width:900,height:600,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});await window.loadFile(html);
  const run=source=>window.webContents.executeJavaScript(source);
  assert.equal(await run('getComputedStyle(document.querySelector("content")).visibility'),'hidden');
  assert.equal(await run('getComputedStyle(document.querySelector("#w-close")).visibility'),'visible','加载阶段窗口控制仍可见');
  assert((await run('getComputedStyle(document.body,"::after").content')).includes('正在加载工作台'));
  fs.writeFileSync(path.join(temp,theme+'_'+outcome+'_loading.png'),(await window.webContents.capturePage()).toPNG());
  await run(outcome==='ready'?'document.documentElement.dataset.linuxNoteWorkspaceBrowser="ready"':outcome==='failure'?'document.documentElement.dataset.typoraCodeStartup="error"':'deadline()');
  await run('new Promise(resolve=>requestAnimationFrame(resolve))');
  assert.equal(await run('getComputedStyle(document.querySelector("content")).visibility'),'visible');
  assert.equal(await run('document.querySelector("content").textContent'),'Saved document');
  assert.equal(await run('document.documentElement.dataset.typoraCodePresentation'),outcome==='ready'?'ready':'error');
  if(outcome!=='ready')assert.equal(await run('getComputedStyle(document.querySelector("#title-text")).visibility'),'visible','失败恢复原生标题');
  await run('document.documentElement.dataset.linuxNoteWorkspaceBrowser="loading"');
  assert.equal(await run('getComputedStyle(document.querySelector("content")).visibility'),'visible','一次性启动控制已清理，不因后续目录切换重新遮挡');
  window.destroy();window=null;
 }
 console.log('Startup presentation PASS: readiness, failure, deadline, controls, content preservation, one-shot cleanup. '+temp);app.exit(0);
}).catch(error=>{console.error(error);window?.destroy();app.exit(1)});
