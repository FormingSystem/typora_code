// Real Chromium pointer dragging and production preview; temporary files, do not change user window.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{editor_plugins}=require('./editor_bundle.cjs');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_preview_dock_')),checks=[];let win;
const delay=ms=>new Promise(r=>setTimeout(r,ms)),check=(name,value)=>{assert.ok(value,name);checks.push(name);};
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 fs.writeFileSync(path.join(evidence,'target.md'),'# Target\n\nPreview text');
 fs.writeFileSync(path.join(evidence,'index.html'),`<style>:root{--sidebar-width:300px}html,body{margin:0;height:100%;overflow:hidden}body{--typ-ribbon-width:48px;--typ-sidedock-width:0px;--typ-workspace-top:35px;--typ-footer-height:30px;--bg-color:white;--text-color:#222;--side-bar-bg-color:#fafafa}.typ-workspace-root{position:absolute;left:48px;right:0;top:35px;bottom:30px}.pin-outline .typ-workspace-root{left:348px}#typora-sidebar{position:absolute;left:-1000px;width:var(--sidebar-width);top:35px;bottom:0}.pin-outline #typora-sidebar{left:48px}#sidebar-content{position:absolute;top:0;left:0;right:0;bottom:30px}#write{padding:30px}.typ-ribbon{width:48px}</style><body class="typ-ribbon--enable"><div id="typora-sidebar-resizer"></div><nav class="typ-ribbon"></nav><div id="typora-sidebar"><div id="sidebar-content">资源管理器</div></div><div class="typ-workspace-root"><article id="write"><a href="target.md">Local link</a><p>Other text</p></article></div>`);
 win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});await win.loadFile(path.join(evidence,'index.html'));
 const evaluate=source=>win.webContents.executeJavaScript(source,true);
 const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export * from "./src/workspace_link_dock";export * from "./src/workspace_sidebar_sash";export {create_terminal_panel} from "./src/terminal_panel";export {default as terminal_css} from "./src/terminal_workspace.css";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await evaluate(bundle.outputFiles[0].text+';void 0;');
 await evaluate(`window.reqnode=require;window.shows=0;window.core={Notice:class{},WorkspaceView:class{},app:{workspace:{eachLeaves(){},sidebar:{get isShown(){return document.body.classList.contains("pin-outline")},show(){shows++;document.body.classList.add("pin-outline")},hide(){document.body.classList.remove("pin-outline")}}},viewManager:{registerView(){return()=>{}}}}};window.source=${JSON.stringify(path.join(evidence,'source.md'))};window.files={fs:require('fs'),path_api:require('path'),current_file:()=>source,editor_state:()=>({file_path:source}),copy(){},open_file:async()=>{}};window.sash_binding=qa.install_workspace_sidebar_sash({sidebar:core.app.workspace.sidebar,save_width(){}});window.binding=qa.bind_workspace_link_dock(core,files);window.dock=document.querySelector('.workspace-link-dock');window.select_link=()=>{document.querySelector('#write a').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));const range=document.createRange();range.selectNodeContents(document.querySelector('#write a'));getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));};select_link();`);
 await delay(200);
 check('侧栏收起时独立展示且不调用show',await evaluate(`!dock.hidden&&shows===0&&!document.body.classList.contains('pin-outline')&&dock.parentElement===document.body`));
 check('正文保持正常宽度且预览只读',await evaluate(`document.querySelector('.typ-workspace-root').getBoundingClientRect().left===48&&!dock.querySelector('[contenteditable=true]')`));
 await evaluate(`document.body.classList.add('pin-outline')`);await delay(100);
 check('展开功能栏在预览上方分配空间',await evaluate(`document.querySelector('#sidebar-content').getBoundingClientRect().bottom<=dock.getBoundingClientRect().top+1`));
 check('侧栏背景不遮挡工具栏',await evaluate(`(()=>{const b=dock.getBoundingClientRect();return dock.contains(document.elementFromPoint(b.left+10,b.top+14));})()`));
 const drag=async(edge,dx,dy)=>{
  await evaluate(`window.resize_events=[];window.root_changes=0;window.resize_event=e=>resize_events.push(e.type);for(const name of ['beforeResize','resize','optimizedResize'])window.addEventListener(name,resize_event);window.root_observer=new MutationObserver(records=>root_changes+=records.length);for(const node of [document.body,document.documentElement])root_observer.observe(node,{attributes:true,attributeFilter:['style']});window.original_editor=document.querySelector('.typ-workspace-root').getBoundingClientRect().toJSON();window.original_content=document.querySelector('#write').innerHTML;`);
  const before=await evaluate(`({w:dock.offsetWidth,h:dock.offsetHeight})`),point=await evaluate(`(()=>{const b=dock.querySelector('[data-edge="${edge}"]').getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+b.height/2}})()`),zoom=win.webContents.getZoomFactor();
  const x=Math.round(point.x*zoom),y=Math.round(point.y*zoom);
  win.webContents.sendInputEvent({type:'mouseMove',x,y});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x,y});await delay(30);
  win.webContents.sendInputEvent({type:'mouseMove',x:x+Math.round(dx*zoom),y:y+Math.round(dy*zoom)});await delay(50);
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:x+Math.round(dx*zoom),y:y+Math.round(dy*zoom)});await delay(60);
  const after=await evaluate(`({w:dock.offsetWidth,h:dock.offsetHeight})`);
  check('真实拖动 '+edge+' zoom '+zoom,Math.abs(after.w-before.w-(edge.includes('east')?dx:0))<=2&&Math.abs(after.h-before.h+(edge.includes('north')?dy:0))<=2);
  check('拖动只更新预览及侧栏占位 '+edge+' '+zoom,await evaluate(`resize_events.length===0&&root_changes===0&&JSON.stringify(original_editor)===JSON.stringify(document.querySelector('.typ-workspace-root').getBoundingClientRect().toJSON())&&original_content===document.querySelector('#write').innerHTML&&!dock.hasAttribute('data-preview-resizing')`));
  await evaluate(`root_observer.disconnect();for(const name of ['beforeResize','resize','optimizedResize'])window.removeEventListener(name,resize_event);`);
 };
 for(const zoom of [1,1.25,1.5]){win.webContents.setZoomFactor(zoom);await delay(100);await drag('north',0,-12);await drag('east',12,0);await drag('north-east',12,-12);
  check('加宽预览不挤动正文 '+zoom,await evaluate(`document.querySelector('.typ-workspace-root').getBoundingClientRect().left===348`));
  check('主侧栏分界线不穿过预览 '+zoom,await evaluate(`(()=>{const sash=document.querySelector('#typora-sidebar-resizer'),b=sash.getBoundingClientRect(),d=dock.getBoundingClientRect(),hit=document.elementFromPoint(b.left+3,d.top+60);return b.bottom<=d.top+1&&dock.contains(hit)&&hit!==sash})()`));}
 win.webContents.setZoomFactor(1);await delay(100);
 // Keep the real capture active while exercising cancellation and queued-frame ownership.
 for(const end of ['pointercancel','lostpointercapture','blur','Escape']){
  const p=await evaluate(`(()=>{const r=dock.querySelector('[data-edge=east]').getBoundingClientRect();return{x:Math.round(r.left+2),y:Math.round(r.top+12)}})()`);
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});await delay(20);
  check('拖动状态建立 '+end,await evaluate(`dock.dataset.previewResizing==='east'`));
  await evaluate(`window.active_handle=dock.querySelector('[data-edge=east]');window.pointer_id=1;window.cancel_width=dock.offsetWidth;active_handle.dispatchEvent(new PointerEvent('pointermove',{pointerId:pointer_id,clientX:900,clientY:200,bubbles:true}));${end==='blur'?"window.dispatchEvent(new Event('blur'))":end==='Escape'?"active_handle.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))":`active_handle.dispatchEvent(new PointerEvent('${end}',{pointerId:pointer_id,bubbles:true}))`};`);
  await delay(50);check('取消丢弃待处理尺寸 '+end,await evaluate(`!dock.hasAttribute('data-preview-resizing')&&dock.offsetWidth===cancel_width`));
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p});await delay(20);
 }
 await evaluate(`window.key_width=dock.offsetWidth;dock.querySelector('[data-edge=east]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`);
 check('键盘默认步长10',await evaluate('dock.offsetWidth===key_width+10'));
 await evaluate(`dock.querySelector('[data-edge=east]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,bubbles:true}));`);
 check('键盘Shift步长50',await evaluate('dock.offsetWidth===key_width-40'));
 for(const count of [20,100,1000]){
  const p=await evaluate(`(()=>{const r=dock.querySelector('[data-edge=east]').getBoundingClientRect();return{x:Math.round(r.left+2),y:Math.round(r.top+12)}})()`);
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});await delay(20);
  check('同帧输入合并 '+count,await evaluate(`(()=>{const handle=dock.querySelector('[data-edge=east]'),before=dock.offsetWidth;for(let i=0;i<${count};i++)document.body.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:${p.x}+i%20,clientY:${p.y},bubbles:true}));const deferred=dock.offsetWidth===before;document.body.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:${p.x}+10,clientY:${p.y},bubbles:true}));return deferred&&dock.offsetWidth===before+10&&!dock.hasAttribute('data-preview-resizing');})()`));
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p});await delay(30);
 }
 // Real production panel and independent dock exist simultaneously, verify drawing and hit by coordinate rather than just comparing z-index.
 await evaluate(`{const style=document.createElement('style');style.textContent=qa.terminal_css;document.head.append(style);window.terminal_panel=qa.create_terminal_panel(()=>{});terminal_panel.show();dock.querySelector('[aria-label="固定链接预览"]').click();}`);await delay(100);
 for(const dark of [false,true])for(const zoom of [1,1.5])for(const maximized of [false,true]){
  win.webContents.setZoomFactor(zoom);await evaluate(`document.body.style.setProperty('--side-bar-bg-color','${dark?'#181818':'#fafafa'}');if(terminal_panel.maximized!==${maximized})terminal_panel.maximize();`);await delay(120);
  const hit=await evaluate(`(()=>{const d=dock.getBoundingClientRect(),t=terminal_panel.container.getBoundingClientRect(),x=(Math.max(d.left,t.left)+Math.min(d.right,t.right))/2,y=(Math.max(d.top,t.top)+Math.min(d.bottom,t.bottom))/2;return {overlap:Math.min(d.right,t.right)>Math.max(d.left,t.left)&&Math.min(d.bottom,t.bottom)>Math.max(d.top,t.top),preview:dock.contains(document.elementFromPoint(x,y)),terminal:terminal_panel.container.contains(document.elementFromPoint(t.right-20,t.bottom-20)),toolbar:dock.contains(document.elementFromPoint(d.left+30,d.top+14))}})()`);
  check('浮动预览覆盖终端且保留两者命中 '+[dark,zoom,maximized],hit.overlap&&hit.preview&&hit.terminal&&hit.toolbar);
 }
 win.webContents.setZoomFactor(1);await delay(100);
 await evaluate(`dock.querySelector('[aria-label="关闭链接预览"]').click()`);await delay(80);
 check('关闭预览恢复原重叠区终端命中',await evaluate(`(()=>{const t=terminal_panel.container.getBoundingClientRect();return dock.hidden&&terminal_panel.container.contains(document.elementFromPoint(t.left+15,t.bottom-25))})()`));
 await evaluate(`getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'))`);await delay(100);await evaluate('select_link()');await delay(150);
 check('先开终端再开预览仍在上方',await evaluate(`(()=>{const d=dock.getBoundingClientRect(),t=terminal_panel.container.getBoundingClientRect();return !dock.hidden&&dock.contains(document.elementFromPoint((Math.max(d.left,t.left)+Math.min(d.right,t.right))/2,d.bottom-25))})()`));
 await evaluate(`terminal_panel.dispose();document.body.style.setProperty('--side-bar-bg-color','#fafafa')`);
 await evaluate(`document.body.classList.remove('pin-outline')`);await delay(80);check('收起功能栏保留预览和预览内容',await evaluate(`!dock.hidden&&!!dock.querySelector('.workspace-lookup-markdown')&&shows===0`));
 await evaluate(`dock.querySelector('[aria-label="关闭链接预览"]').click();document.dispatchEvent(new Event('pointerup'))`);await delay(200);
 check('关闭释放空间且同一选区不复活',await evaluate(`dock.hidden&&!document.body.classList.contains('has-workspace-link-preview')&&document.querySelector('.typ-workspace-root').getBoundingClientRect().left===48`));
 check('关闭预览恢复主分隔条范围',await evaluate(`document.querySelector('#typora-sidebar-resizer').getBoundingClientRect().bottom===innerHeight`));
 for(let i=0;i<20;i++){
  await evaluate(`getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'))`);await delay(90);await evaluate('select_link()');await delay(100);
  check('新选择可重新打开 '+i,await evaluate('!dock.hidden'));await evaluate(`dock.querySelector('[aria-label="关闭链接预览"]').click()`);
 }
 await evaluate(`getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'))`);await delay(90);await evaluate('select_link()');await delay(100);
 const closing_point=await evaluate(`(()=>{const r=dock.querySelector('[data-edge=east]').getBoundingClientRect();return{x:Math.round(r.left+2),y:Math.round(r.top+12)}})()`);
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...closing_point});await delay(20);
 await evaluate(`document.body.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:900,clientY:200,bubbles:true}));window.closed_style=dock.getAttribute('style');document.body.style.setProperty('--bg-color','#222');window.dispatchEvent(new Event('linux-note-workspace-context-changed'))`);await delay(80);
 check('切库关闭预览并清理内容',await evaluate(`dock.hidden&&!dock.querySelector('.workspace-lookup-markdown')`));
 check('关闭取消待处理帧和指针捕获',await evaluate(`dock.getAttribute('style')===closed_style&&!dock.hasAttribute('data-preview-resizing')&&!dock.querySelector('[data-edge=east]').hasPointerCapture(1)&&!document.querySelector('#typora-sidebar').style.getPropertyValue('--workspace-preview-height')`));
 win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...closing_point});
 await evaluate('binding.dispose();sash_binding.dispose()');check('销毁移除面板和共享尺寸状态',await evaluate(`!document.querySelector('.workspace-link-dock')&&!document.body.style.getPropertyValue('--workspace-preview-width')`));
 fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks,cycles:20},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));
}).catch(error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(evidence,'error.txt'),String(error.stack));}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
