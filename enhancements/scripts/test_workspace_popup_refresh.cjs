// 真实Chromium布局：重复通知不能把小数像素误差变成持续定位循环。
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_popup_refresh_'));app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();
let win;const checks=[],samples=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
const read=s=>win.webContents.executeJavaScript(s),check=(value,label)=>{assert(value,label);checks.push(label);};
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{contextIsolation:false,offscreen:true,backgroundThrottling:false}});
 const html=path.join(evidence,'fixture.html');fs.writeFileSync(html,`<!doctype html><style>*{box-sizing:border-box}body{margin:0;font:13px system-ui;--bg-color:white;--text-color:black}#top-titlebar{height:35px}#typora-sidebar{width:200px}footer.ty-footer{position:fixed;left:203.333px;bottom:0;right:0;height:23.333px;container-type:inline-size;display:flex;justify-content:flex-end;background:#eee}#ty-sidebar-footer{width:100px}#sidebar-menu-btn,#footer-word-count,#footer-spell-check{display:inline-block;width:30px;height:23px}#sidebar-files-menu,#footer-word-count-info,#spell-check-panel{display:none;background:white;border:1px solid #aaa;padding:6px;width:320px;margin:0}.files #sidebar-files-menu,.words #footer-word-count-info,.language #spell-check-panel{display:block}li{height:24px;list-style:none}.workspace-hover-surface{background:white}</style><body class="show-footer"><div id="top-titlebar"></div><aside id="typora-sidebar"></aside><footer class="ty-footer" data-workspace-footer="ready"><div id="ty-sidebar-footer"><div id="sidebar-menu-btn">…<ul id="sidebar-files-menu" tabindex="-1">${Array.from({length:60},(_,i)=>'<li><button>目录 '+i+'</button></li>').join('')}</ul></div></div><span id="footer-word-count">字数</span><div id="footer-word-count-info">统计</div><span id="footer-spell-check">语言</span></footer><div id="spell-check-panel"><button>中文</button></div><button id="hover-anchor" style="position:fixed;right:120px;bottom:1px">缩放</button></body>`);
 await win.loadFile(html);
 const bundle=await build({stdin:{contents:'export {bind_workspace_native_toolbar} from "./src/workspace_native_toolbar";export {create_workspace_popup_refresh} from "./src/workspace_popup_refresh";export {bind_workspace_footer_popups} from "./src/workspace_footer_popups";export {bind_workspace_hover} from "./src/workspace_hover";export {default as css} from "./src/workspace_footer.css";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});await read(bundle.outputFiles[0].text);
 await read(`const style=document.createElement('style');style.textContent=qa.css;document.head.append(style);window.binding=qa.bind_workspace_footer_popups(document.querySelector('footer'),document.querySelector('#ty-sidebar-footer'),document.querySelector('aside'));window.writes=0;window.monitor=new MutationObserver(records=>writes+=records.length);monitor.observe(document.body,{attributes:true,attributeFilter:['style'],subtree:true});void 0`);
 for(const zoom of [1,1.2,1.25,1.5]){
  win.webContents.setZoomFactor(zoom);
  for(const [mode,id]of [['files','sidebar-files-menu'],['words','footer-word-count-info'],['language','spell-check-panel']]){
   await read(`document.body.className='show-footer ${mode}';window.menu=document.getElementById('${id}');menu.focus();menu.scrollTop=150;void 0`);await delay(180);
   await read('writes=0');await delay(300);
   const sample=await read(`({writes,box:menu.getBoundingClientRect().toJSON(),scroll:menu.scrollTop,style:menu.getAttribute('style')})`);samples.push({zoom,mode,...sample});
   check(sample.writes===0,'idle popup makes zero style writes at '+zoom+' '+mode+': '+JSON.stringify(sample));
   const stress=await read(`(async()=>{
     const initial=menu.getBoundingClientRect(),scroll=menu.scrollTop,focused=document.activeElement;let drift=0;writes=0;
     for(let i=0;i<20;i++){
       document.body.classList.toggle('dark',i%2===0);
       for(let j=0;j<50;j++)document.body.setAttribute('class',document.body.className);
       await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
       const b=menu.getBoundingClientRect();drift=Math.max(drift,Math.abs(b.x-initial.x),Math.abs(b.y-initial.y));
     }
     return {drift,writes,identity:menu===document.getElementById('${id}'),scroll:scroll===menu.scrollTop,focus:focused===document.activeElement};
   })()`);
   samples.push({zoom,mode,stress});check(stress.drift<.05&&stress.identity&&stress.scroll&&stress.focus&&stress.writes<=100,'1000 redundant notifications keep geometry/focus/scroll and bounded writes '+zoom+' '+mode+': '+JSON.stringify(stress));
  }
 }
 win.webContents.setZoomFactor(1);win.setContentSize(520,420);await delay(70);
 await read(`document.body.className='show-footer files';window.menu=document.getElementById('sidebar-files-menu');window.original=menu.firstElementChild;menu.scrollTop=100;original.querySelector('button').focus({preventScroll:true});window.saved_scroll=menu.scrollTop;void 0`);await delay(80);
 await read(`menu.lastElementChild.firstElementChild.firstChild.data='异步更新目录内容';void 0`);await delay(90);
 check(await read('original===menu.firstElementChild&&document.activeElement===original.firstElementChild&&menu.scrollTop===saved_scroll'),'async content update keeps selected node and scroll');
 await read(`while(menu.children.length>2)menu.lastElementChild.remove();void 0`);await delay(90);
 check(await read(`(()=>{const r=menu.getBoundingClientRect(),a=document.getElementById('sidebar-menu-btn').getBoundingClientRect();return r.height<100&&r.bottom<=a.top-2&&r.left>=3&&r.right<=innerWidth-3})()`),'shrinking content reanchors in narrow viewport');
 await read(`document.body.className='show-footer words';window.words=document.getElementById('footer-word-count-info');words.firstChild.data='多行统计内容'.repeat(120);void 0`);await delay(80);
 check(await read('words.getBoundingClientRect().height>40'),'characterData update refreshes visible native popup');
 await read(`document.body.className='show-footer';void 0`);await delay(80);await read('writes=0');await delay(150);
 check(await read('writes===0&&!menu.getClientRects().length&&!document.querySelector("footer").hasAttribute("data-workspace-footer-popup-open")'),'closing cancels visual ownership without reopen');
 await read(`window.calls=0;window.owner=document.createElement('div');document.body.append(owner);window.scheduler=qa.create_workspace_popup_refresh(()=>{calls++;owner.style.width=(20+calls)+'px';});scheduler.observe_mutations(owner,{attributes:true,attributeFilter:['style']});scheduler.observe_size(owner);for(let i=0;i<1000;i++)scheduler.schedule();void 0`);await delay(100);
 check(await read('calls===1'),'1000 shared refresh requests merge and own resize/mutation do not feed back');
 await read(`owner.style.width='30px';scheduler.dispose();void 0`);await delay(70);check(await read('calls===1'),'dispose cancels pending external observation');
 await read(`window.anchor=document.getElementById('hover-anchor');window.renders=0;window.hover=qa.bind_workspace_hover(anchor,()=>undefined,{interactive:true});window.target={anchor,label:'测试浮层',preferred_side:'above',render(content){renders++;content.innerHTML='<button>保留焦点</button><div id="async-content">'+('内容 '.repeat(1000))+'</div>';}};hover.show(target);void 0`);await delay(100);
 await read(`window.tip=document.querySelector('.workspace-hover-surface');window.focused=tip.querySelector('button');focused.focus({preventScroll:true});tip.scrollTop=150;window.saved_scroll=tip.scrollTop;writes=0;void 0`);await delay(180);
 check(await read('writes===0&&tip.scrollTop===saved_scroll'),'scrollable hover is idle without natural-size measurement loops');
 await read('for(let i=0;i<1000;i++)hover.reposition();void 0');await delay(100);
 check(await read('renders===1&&tip===document.querySelector(".workspace-hover-surface")&&tip.scrollTop===saved_scroll&&document.activeElement===focused'),'hover coalesces layout without rebuilding or resetting focus/scroll');
 await read(`document.getElementById('async-content').textContent='短内容';void 0`);await delay(100);
 check(await read('tip.getBoundingClientRect().height<100&&renders===1'),'hover async shorter content drops obsolete size constraint');
 await read(`hover.reposition();hover.hide();void 0`);await delay(70);check(await read('!document.querySelector(".workspace-hover-surface")'),'closing queued hover cannot resurrect it');
 await read(`hover.dispose();window.area=document.createElement('main');area.className='typ-workspace-root';area.style.cssText='position:fixed;left:40px;right:0;top:40px;bottom:30px';document.body.append(area);window.toolbar=document.createElement('div');toolbar.className='ty-editor-toolbar';toolbar.style.cssText='position:fixed;width:180px;height:32px';document.body.append(toolbar);window.source_active=false;window.files={source_editor_active:()=>source_active,core:{app:{workspace:{activeLeaf:{containerEl:area,state:{path:'/fixture.md'}},on(event,callback){window.active_changed=callback;return()=>{window.active_changed=undefined;};}}}}};window.toolbar_binding=qa.bind_workspace_native_toolbar(files,{File:{bundle:{filePath:'/fixture.md'},editor:{toolbar:{dom:toolbar}}}});void 0`);await delay(100);
 await read('writes=0');await delay(150);check(await read('writes===0&&toolbar.dataset.workspaceNativeToolbar==="ready"'),'native reading toolbar uses convergent idle layout');
 await read('source_active=true;active_changed();void 0');await delay(70);check(await read('!toolbar.getClientRects().length'),'toolbar suspends outside native Markdown');
 await read('source_active=false;active_changed();area.style.bottom="180px";void 0');await delay(100);
 check(await read('toolbar.getBoundingClientRect().bottom<=area.getBoundingClientRect().bottom-7&&toolbar.getClientRects().length>0'),'toolbar resumes and respects resized reading area');
 await read('active_changed();toolbar_binding.dispose();void 0');await delay(70);check(await read('!toolbar.hasAttribute("data-workspace-native-toolbar")&&!toolbar.style.getPropertyValue("--workspace-toolbar-left")&&!active_changed'),'toolbar disposal removes pending refresh and restores adaptation');
 await read('binding.dispose();monitor.disconnect();void 0');
 check(await read('!menu.hasAttribute("data-workspace-footer-popup")&&!menu.style.getPropertyValue("--workspace-popup-left")'),'native disposal restores original attributes and styles');
 fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));win.destroy();app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks,samples},null,2));console.error(error,evidence);if(win)win.destroy();app.exit(1);});
