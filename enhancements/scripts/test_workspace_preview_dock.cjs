// 真实 Chromium 指针拖动及生产预览；临时文件，不改用户窗口。
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{editor_plugins}=require('./editor_bundle.cjs');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_preview_dock_')),checks=[];let win;
const delay=ms=>new Promise(r=>setTimeout(r,ms)),check=(name,value)=>{assert.ok(value,name);checks.push(name);};
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 fs.writeFileSync(path.join(evidence,'target.md'),'# Target\n\nPreview text');
 fs.writeFileSync(path.join(evidence,'index.html'),`<style>:root{--sidebar-width:300px}html,body{margin:0;height:100%;overflow:hidden}body{--typ-ribbon-width:48px;--typ-sidedock-width:0px;--typ-workspace-top:35px;--typ-footer-height:30px;--bg-color:white;--text-color:#222;--side-bar-bg-color:#fafafa}.typ-workspace-root{position:absolute;left:48px;right:0;top:35px;bottom:30px}.pin-outline .typ-workspace-root{left:348px}#typora-sidebar{position:absolute;left:-1000px;width:var(--sidebar-width);top:35px;bottom:0}.pin-outline #typora-sidebar{left:48px}#sidebar-content{position:absolute;top:0;left:0;right:0;bottom:30px}#write{padding:30px}.typ-ribbon{width:48px}</style><body><nav class="typ-ribbon"></nav><div id="typora-sidebar"><div id="sidebar-content">资源管理器</div></div><div class="typ-workspace-root"><article id="write"><a href="target.md">Local link</a><p>Other text</p></article></div>`);
 win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});await win.loadFile(path.join(evidence,'index.html'));
 const evaluate=source=>win.webContents.executeJavaScript(source,true);
 const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export * from "./src/workspace_link_dock";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await evaluate(bundle.outputFiles[0].text+';void 0;');
 await evaluate(`window.reqnode=require;window.shows=0;window.core={Notice:class{},WorkspaceView:class{},app:{workspace:{eachLeaves(){},sidebar:{show(){shows++}}},viewManager:{registerView(){return()=>{}}}}};window.source=${JSON.stringify(path.join(evidence,'source.md'))};window.files={fs:require('fs'),path_api:require('path'),current_file:()=>source,editor_state:()=>({file_path:source}),copy(){},open_file:async()=>{}};window.binding=qa.bind_workspace_link_dock(core,files);window.dock=document.querySelector('.workspace-link-dock');window.select_link=()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#write a'));getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));};select_link();`);
 await delay(200);
 check('侧栏收起时独立展示且不调用show',await evaluate(`!dock.hidden&&shows===0&&!document.body.classList.contains('pin-outline')&&dock.parentElement===document.body`));
 check('正文避让预览且预览只读',await evaluate(`document.querySelector('.typ-workspace-root').getBoundingClientRect().left>=dock.getBoundingClientRect().right-1&&!dock.querySelector('[contenteditable=true]')`));
 await evaluate(`document.body.classList.add('pin-outline')`);await delay(100);
 check('展开功能栏在预览上方分配空间',await evaluate(`document.querySelector('#sidebar-content').getBoundingClientRect().bottom<=dock.getBoundingClientRect().top+1`));
 check('侧栏背景不遮挡工具栏',await evaluate(`(()=>{const b=dock.getBoundingClientRect();return dock.contains(document.elementFromPoint(b.left+10,b.top+14));})()`));
 const drag=async(edge,dx,dy)=>{
  const before=await evaluate(`({w:dock.offsetWidth,h:dock.offsetHeight})`),point=await evaluate(`(()=>{const b=dock.querySelector('[data-edge="${edge}"]').getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+b.height/2}})()`),zoom=win.webContents.getZoomFactor();
  const x=Math.round(point.x*zoom),y=Math.round(point.y*zoom);
  win.webContents.sendInputEvent({type:'mouseMove',x,y});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x,y});await delay(30);
  win.webContents.sendInputEvent({type:'mouseMove',x:x+Math.round(dx*zoom),y:y+Math.round(dy*zoom)});await delay(50);
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:x+Math.round(dx*zoom),y:y+Math.round(dy*zoom)});await delay(60);
  const after=await evaluate(`({w:dock.offsetWidth,h:dock.offsetHeight})`);
  check('真实拖动 '+edge+' zoom '+zoom,Math.abs(after.w-before.w-(edge.includes('east')?dx:0))<=2&&Math.abs(after.h-before.h+(edge.includes('north')?dy:0))<=2);
 };
 for(const zoom of [1,1.25,1.5]){win.webContents.setZoomFactor(zoom);await delay(100);await drag('north',0,-12);await drag('east',12,0);await drag('north-east',12,-12);}
 win.webContents.setZoomFactor(1);await delay(100);
 await evaluate(`document.body.classList.remove('pin-outline')`);await delay(80);check('收起功能栏保留预览和预览内容',await evaluate(`!dock.hidden&&!!dock.querySelector('.workspace-lookup-markdown')&&shows===0`));
 await evaluate(`dock.querySelector('[aria-label="关闭链接预览"]').click();document.dispatchEvent(new Event('pointerup'))`);await delay(200);
 check('关闭释放空间且同一选区不复活',await evaluate(`dock.hidden&&!document.body.classList.contains('has-workspace-link-preview')&&document.querySelector('.typ-workspace-root').getBoundingClientRect().left===48`));
 for(let i=0;i<20;i++){
  await evaluate(`getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'))`);await delay(90);await evaluate('select_link()');await delay(100);
  check('新选择可重新打开 '+i,await evaluate('!dock.hidden'));await evaluate(`dock.querySelector('[aria-label="关闭链接预览"]').click()`);
 }
 await evaluate(`getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'))`);await delay(90);await evaluate('select_link()');await delay(100);
 await evaluate(`dock.querySelector('[data-edge="east"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));document.body.style.setProperty('--bg-color','#222');window.dispatchEvent(new Event('linux-note-workspace-context-changed'))`);await delay(80);
 check('切库关闭预览并清理内容',await evaluate(`dock.hidden&&!dock.querySelector('.workspace-lookup-markdown')`));
 await evaluate('binding.dispose()');check('销毁移除面板和共享尺寸状态',await evaluate(`!document.querySelector('.workspace-link-dock')&&!document.body.style.getPropertyValue('--workspace-preview-column')`));
 fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks,cycles:20},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));
}).catch(error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(evidence,'error.txt'),String(error.stack));}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
