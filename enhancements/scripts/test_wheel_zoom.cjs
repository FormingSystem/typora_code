// 隐藏Electron真实xterm和滚轮输入；临时配置，不启动Shell。
const {app,BrowserWindow}=require('electron'),{build}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_wheel_zoom_')),checks=[];
app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();
let win;const pause=ms=>new Promise(r=>setTimeout(r,ms)),read=s=>win.webContents.executeJavaScript(s).catch(error=>{console.error('Renderer source:',s);throw error;});
const check=async(s,label)=>{assert(await read(s),label);checks.push(label);};
const until=async s=>{for(let i=0;i<100;i++){if(await read(s))return;await pause(20);}throw Error('Timed out: '+s);};
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1100,height:760,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
 win.webContents.on('console-message',event=>console.log(event.message));
 const html=path.join(evidence,'fixture.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>body{margin:0}#reading{height:350px;overflow:auto}#write{width:750px;margin:0 30px;font:18px/1.6 sans-serif}#terminal{height:350px;width:700px}.linux-note-terminal,.linux-note-terminal-viewport{height:100%}[hidden]{display:none!important}</style><section id="reading"><article id="write"></article></section><section id="terminal"></section>');await win.loadFile(html);
 await win.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../node_modules/@xterm/xterm/css/xterm.css'),'utf8'));
 const bundle=await build({stdin:{contents:'export * from "./src/workspace_zoom";export * from "./src/reading_reflow";export * from "./src/terminal_surface";export * from "./src/terminal_settings";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await read(bundle.outputFiles[0].text);
 await read(`window.frame=require('electron').webFrame;window.commands=new Map();window.zoom_calls=0;window.inputs=[];window.resizes=[];window.errors=[];window.configs=[];
 window.runtime={ClientCommand:{zoomIn(){zoom_calls++;frame.setZoomLevel(frame.getZoomLevel()+1)},zoomOut(){zoom_calls++;frame.setZoomLevel(frame.getZoomLevel()-1)}}};
 window.binding=qa.bind_workspace_zoom_commands({commands:{register(c){commands.set(c.id,c);return()=>commands.delete(c.id)}}},runtime);
 window.root=document.querySelector('#write');root.innerHTML=Array.from({length:80},(_,i)=>'<p id="p'+i+'">paragraph '+i+' '+'anchor words '.repeat(30)+'</p>').join('');
 window.scroller=document.querySelector('#reading');window.reflow=qa.bind_reading_reflow(scroller,root);scroller.scrollTop=1600;
 window.store=qa.create_terminal_settings(localStorage,{profiles:()=>[],ready:async()=>{},refresh:async()=>{},warnings:()=>[]});
 window.view=new qa.terminal_surface(store.get(),{input:s=>inputs.push(s),resize:(c,r)=>resizes.push([c,r]),active(){},copy:async()=>{},error:e=>errors.push(String(e)),font_size:size=>{configs.push(size);store.update({...store.get(),font_size:size});}});
 window.unsubscribe=store.subscribe(c=>view.apply_settings(c));document.querySelector('#terminal').append(view.container);view.mount();
 window.wheel=(node,options={})=>{const e=new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,bubbles:true,cancelable:true,...options});node.dispatchEvent(e);return e.defaultPrevented;};
 window.top_text=()=>{const b=view.term.buffer.active;let y=b.viewportY;while(y>0&&b.getLine(y)?.isWrapped)y--;return b.getLine(y)?.translateToString(true).slice(0,8)};void 0;`);
 await pause(100);
 await read(String.raw`new Promise(r=>view.term.write(Array.from({length:220},(_,i)=>'line-'+String(i).padStart(3,'0')+' '+'text '.repeat(i%4===0?45:2)).join('\r\n'),r))`);await pause(80);
 await read('view.term.scrollToLine(80);window.line_before=top_text();window.anchor=qa.capture_reflow_anchor(scroller,root);');
 await check('wheel(view.viewport)','terminal takes Ctrl wheel before xterm scrolling');await pause(140);
 await check('store.get().font_size===15&&view.term.options.fontSize===15&&frame.getZoomLevel()===0&&inputs.length===0','terminal changes shared persisted font only, no shell input');
 await check('top_text()===line_before','terminal history logical line survives wrapped line reflow');
 for(let i=0;i<20;i++){
  await read(`wheel(view.viewport,{deltaY:${i%2?-120:120}})`);await pause(40);
 }
 await check('top_text()===line_before&&store.get().font_size===15&&errors.length===0','20 reciprocal wheel changes keep history content');
 await read('store.update({...store.get(),smooth_scrolling:true});view.term.scrollToBottom()');await until('view.term.buffer.active.viewportY===view.term.buffer.active.baseY');await pause(50);await read('wheel(view.viewport)');await pause(160);
 await check('view.term.buffer.active.viewportY===view.term.buffer.active.baseY','bottom remains following prompt');
 await read('view.term.scrollToLine(35)');await pause(160);await read('window.hidden_line=top_text();view.container.hidden=true;store.update({...store.get(),font_size:18})');await pause(50);
 await read('view.container.hidden=false;view.mount()');await pause(120);
 await check('top_text()===hidden_line','hidden terminal keeps anchor until remount');
 await read(String.raw`new Promise(r=>view.term.write('\x1b[?1049hfull screen application',r))`);await read('wheel(view.viewport)');await pause(80);
 await check('view.term.buffer.active.type==="alternate"&&errors.length===0','alternate screen font changes without fake history or input');
 await read(String.raw`new Promise(r=>view.term.write('\x1b[?1049l',r))`);
 await read('store.update({...store.get(),font_size:100})');await pause(80);await read('window.config_count=configs.length;wheel(view.viewport)');await pause(60);
 await check('store.get().font_size===100&&configs.length===config_count&&frame.getZoomLevel()===0','upper bound consumes gesture without leaking window zoom');
 await read('store.update({...store.get(),font_size:6})');await pause(80);await read('wheel(view.viewport,{deltaY:120})');await pause(60);
 await check('store.get().font_size===6','lower bound is six pixels');
 await read('store.update({...store.get(),font_size:14});window.config_count=configs.length;for(let i=0;i<1000;i++)wheel(view.viewport)');await pause(120);
 await check('configs.length===config_count+1&&store.get().font_size===15','1000 queued wheel events coalesce into one font/layout update');
 for(const options of [{ctrlKey:false},{shiftKey:true},{altKey:true},{metaKey:true},{deltaY:0}])await check(`!wheel(view.viewport,${JSON.stringify(options)})`,'terminal preserves non-zoom modifiers '+JSON.stringify(options));
 // 真实Chromium命中路由：鼠标在终端而焦点仍在正文。
 await read('root.tabIndex=0;root.focus();view.term.scrollToLine(50)');await pause(160);await read('window.real_line=top_text()');
 const point=await read('(()=>{const r=view.viewport.getBoundingClientRect();return{x:Math.round(r.left+40),y:Math.round(r.top+40)}})()');
 win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:120,modifiers:['control'],canScroll:true});await pause(180);
 await check('store.get().font_size===16&&top_text()===real_line&&frame.getZoomLevel()===0','real Ctrl wheel targets terminal despite body focus');
 await read('window.anchor=qa.capture_reflow_anchor(scroller,root);wheel(document.querySelector("#p10"))');await pause(180);
 await check('frame.getZoomLevel()===1&&zoom_calls===1','plain paragraph delegates exactly one host window zoom');
 await check('(()=>{const r=document.createRange();r.setStart(anchor.node,anchor.offset);r.setEnd(anchor.node,anchor.offset+1);return Math.abs(r.getBoundingClientRect().top-scroller.getBoundingClientRect().top-anchor.top)<3})()','body keeps reading character in viewport after zoom');
 await read('frame.setZoomLevel(0)');await pause(100);
 // Shadow正文的事件会穿过document捕获监听，必须先识别外层预览所有者。
 for(const kind of ['workspace-link-preview','workspace-lookup-preview']){
  await read(`window.before_preview_calls=zoom_calls;window.preview_root=document.createElement('section');preview_root.className='${kind}';document.body.append(preview_root);window.preview_shadow=preview_root.attachShadow({mode:'open'});preview_shadow.innerHTML='<article id="write"><p>Preview text</p></article>';window.preview_wheels=0;preview_root.addEventListener('wheel',e=>{preview_wheels++;e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});preview_shadow.querySelector('p').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,bubbles:true,composed:true,cancelable:true}));`);await pause(100);
  await check('zoom_calls===before_preview_calls&&preview_wheels===1',kind+' composed Shadow wheel stays with preview, not host');await read('preview_root.remove()');
 }
 const excluded=['<pre class="md-fences"><span>code</span></pre>','<p><code>inline code</code></p>','<p><img></p>','<p><video></video></p>','<div class="md-diagram"><p>mermaid</p></div>','<p><a href="#">link</a></p>','<p><input></p>','<p><span class="md-inline-math">math</span></p>'];
 for(const markup of excluded)await check(`(()=>{const x=document.createElement('div');x.innerHTML=${JSON.stringify(markup)};root.append(x);const result=wheel(x.querySelector('span,code,img,video,a,input')||x.querySelector('p'));x.remove();return !result})()`,'excluded child keeps gesture '+markup);
 await read('window.before_calls=zoom_calls;for(let i=0;i<1000;i++)wheel(document.querySelector("#p10"))');await pause(140);
 await check('zoom_calls===before_calls+1','1000 body wheel events coalesce into one native zoom');
 await read('wheel(view.viewport);wheel(document.querySelector("#p10"));window.config_count=configs.length;window.before_calls=zoom_calls;view.dispose();binding.dispose();unsubscribe();store.dispose();reflow.dispose()');await pause(100);
 await check('configs.length===config_count&&zoom_calls===before_calls&&!document.querySelector(".xterm")','dispose cancels queued gestures and removes terminal');
 fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));win.destroy();app.exit(0);
}).catch(async error=>{console.error(JSON.stringify({status:'FAIL',error:String(error.stack||error),checks,evidence}));if(win&&!win.isDestroyed()){fs.writeFileSync(path.join(evidence,'failure.png'),(await win.webContents.capturePage()).toPNG());win.destroy();}app.exit(1)});
