// Hidden Electron real xterm and wheel input; temporary configuration, do not start Shell.
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
 const bundle=await build({stdin:{contents:'export * from "./src/workspace_zoom";export * from "./src/reading_font_zoom";export * from "./src/workspace_content_zoom";export * from "./src/reading_reflow";export * from "./src/terminal_surface";export * from "./src/terminal_settings";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await read(bundle.outputFiles[0].text);
 await read(`window.frame=require('electron').webFrame;window.commands=new Map();window.zoom_calls=0;window.inputs=[];window.resizes=[];window.errors=[];window.configs=[];
 window.latency=[];window.measure_wheel=role=>window.addEventListener('wheel',e=>{const start=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>latency.push({role,trusted:e.isTrusted,next_frame_ms:performance.now()-start})));},{capture:true,once:true});
 window.runtime={reqnode:require,ClientCommand:{zoomIn(){zoom_calls++;frame.setZoomLevel(frame.getZoomLevel()+1)},zoomOut(){zoom_calls++;frame.setZoomLevel(frame.getZoomLevel()-1)}}};
 window.binding=qa.bind_workspace_zoom_commands({commands:{register(c){commands.set(c.id,c);return()=>commands.delete(c.id)}}},runtime);
 window.root=document.querySelector('#write');root.innerHTML=Array.from({length:80},(_,i)=>'<p id="p'+i+'">paragraph '+i+' '+'anchor words '.repeat(30)+'</p>').join('');
 window.scroller=document.querySelector('#reading');window.reflow=qa.bind_reading_reflow(scroller,root);window.font=qa.bind_reading_font_zoom(scroller,root);scroller.scrollTop=1600;
 window.store=qa.create_terminal_settings(localStorage,{profiles:()=>[],ready:async()=>{},refresh:async()=>{},warnings:()=>[]});
 window.view=new qa.terminal_surface(store.get(),{input:s=>inputs.push(s),resize:(c,r)=>resizes.push([c,r]),active(){},copy:async()=>{},error:e=>errors.push(String(e))});
 window.unsubscribe=store.subscribe(c=>{configs.push(c.font_size);view.apply_settings(c);});document.querySelector('#terminal').append(view.container);view.mount();
 window.wheel=(node,options={})=>{const e=new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,bubbles:true,cancelable:true,...options});node.dispatchEvent(e);return e.defaultPrevented;};
 window.top_text=()=>{const b=view.term.buffer.active;let y=b.viewportY;while(y>0&&b.getLine(y)?.isWrapped)y--;return b.getLine(y)?.translateToString(true).slice(0,8)};void 0;`);
 await pause(100);
 await read(String.raw`new Promise(r=>view.term.write(Array.from({length:220},(_,i)=>'line-'+String(i).padStart(3,'0')+' '+'text '.repeat(i%4===0?45:2)).join('\r\n'),r))`);await pause(80);
 await read('view.term.scrollToLine(80);window.line_before=top_text();window.anchor=qa.capture_reflow_anchor(scroller,root);');
 await check('wheel(view.viewport)','terminal takes Ctrl wheel before xterm scrolling');await pause(140);
 await check('store.get().font_size===14&&view.term.options.fontSize===15&&frame.getZoomLevel()===0&&inputs.length===0','terminal changes session font only, no shell input');
 await check('top_text()===line_before','terminal history logical line survives wrapped line reflow');
 for(let i=0;i<20;i++){
  await read(`wheel(view.viewport,{deltaY:${i%2?-120:120}})`);await pause(40);
 }
 await check('top_text()===line_before&&view.term.options.fontSize===15&&store.get().font_size===14&&errors.length===0','20 reciprocal wheel changes keep history content');
 await read('(async()=>{store.update({...store.get(),smooth_scrolling:true});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));view.container.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));view.term.scrollToBottom();})()');await until('view.term.buffer.active.viewportY===view.term.buffer.active.baseY');await pause(50);await read('wheel(view.viewport)');await pause(160);
 await check('view.term.buffer.active.viewportY===view.term.buffer.active.baseY','bottom remains following prompt');
 await read('view.term.scrollToLine(35)');await pause(160);await read('window.hidden_line=top_text();view.container.hidden=true;store.update({...store.get(),font_size:18})');await pause(50);
 await read('view.container.hidden=false;view.mount()');await pause(120);
 await check('top_text()===hidden_line','hidden terminal keeps anchor until remount');
 await read(String.raw`new Promise(r=>view.term.write('\x1b[?1049hfull screen application',r))`);await read('wheel(view.viewport)');await pause(80);
 await check('view.term.buffer.active.type==="alternate"&&errors.length===0','alternate screen font changes without fake history or input');
 await read(String.raw`new Promise(r=>view.term.write('\x1b[?1049l',r))`);
 await read('store.update({...store.get(),font_size:14});window.font_before=view.term.options.fontSize;window.config_count=configs.length;for(let i=0;i<1000;i++)wheel(view.viewport)');await pause(120);
 await check('configs.length===config_count&&view.term.options.fontSize===font_before+1','1000 queued wheel events coalesce without writing settings');
 for(const options of [{ctrlKey:false},{shiftKey:true},{altKey:true},{metaKey:true},{deltaY:0}])await check(`!wheel(view.viewport,${JSON.stringify(options)})`,'terminal preserves non-zoom modifiers '+JSON.stringify(options));
 // Real Chromium hit routing: Mouse at the terminal while focus remains in the document content.
 await read('root.tabIndex=0;root.focus();view.term.scrollToLine(50)');await pause(160);await read('window.real_line=top_text();window.font_before=view.term.options.fontSize');
 const point=await read('(()=>{const r=view.viewport.getBoundingClientRect();return{x:Math.round(r.left+40),y:Math.round(r.top+40)}})()');
 await read('measure_wheel("terminal")');
 win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:120,modifiers:['control'],canScroll:true});await pause(180);
 await check('view.term.options.fontSize===font_before+1&&top_text()===real_line&&frame.getZoomLevel()===0','real Ctrl wheel targets terminal despite body focus');
 await read('window.anchor=qa.capture_reflow_anchor(scroller,root);wheel(document.querySelector("#p10"))');await pause(180);
 await check('frame.getZoomLevel()===0&&zoom_calls===0&&parseFloat(getComputedStyle(root).fontSize)===19','plain paragraph changes content font without window zoom');
 await check('(()=>{const r=document.createRange();r.setStart(anchor.node,anchor.offset);r.setEnd(anchor.node,anchor.offset+1);return Math.abs(r.getBoundingClientRect().top-scroller.getBoundingClientRect().top-anchor.top)<3})()','body keeps reading character in viewport after zoom');
 const body_point=await read('(()=>{const r=scroller.getBoundingClientRect();return{x:80,y:Math.round(r.top+120)}})()');
 await read('measure_wheel("editor");window.trusted_body_size=parseFloat(getComputedStyle(root).fontSize)');
 win.webContents.sendInputEvent({type:'mouseWheel',...body_point,deltaY:120,modifiers:['control'],canScroll:true});await pause(150);
 await check('parseFloat(getComputedStyle(root).fontSize)===trusted_body_size+1&&latency.length===2&&latency.every(x=>x.trusted&&x.next_frame_ms<1000)','trusted Chromium wheel changes content and records next-frame latency for both domains');
 await read('frame.setZoomLevel(0)');await pause(100);
 // Events of Shadow document content pass through document capture listener, must first identify the outer preview owner.
 for(const kind of ['workspace-link-preview','workspace-lookup-preview']){
  await read(`window.before_preview_calls=zoom_calls;window.preview_root=document.createElement('section');preview_root.className='${kind}';document.body.append(preview_root);window.preview_shadow=preview_root.attachShadow({mode:'open'});preview_shadow.innerHTML='<article id="write"><p>Preview text</p></article>';window.preview_wheels=0;preview_root.addEventListener('wheel',e=>{preview_wheels++;e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});preview_shadow.querySelector('p').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,bubbles:true,composed:true,cancelable:true}));`);await pause(100);
  await check('zoom_calls===before_preview_calls&&preview_wheels===1',kind+' composed Shadow wheel stays with preview, not host');await read('preview_root.remove()');
 }
 const excluded=['<p><img></p>','<p><video></video></p>','<div class="md-diagram"><p>mermaid</p></div>','<p><input></p>','<p><span class="md-inline-math">math</span></p>'];
 for(const markup of excluded)await check(`(()=>{const x=document.createElement('div');x.innerHTML=${JSON.stringify(markup)};root.append(x);const result=wheel(x.querySelector('span,code,img,video,a,input')||x.querySelector('p'));x.remove();return !result})()`,'excluded child keeps gesture '+markup);
 await read('window.before_calls=zoom_calls;window.body_font=parseFloat(getComputedStyle(root).fontSize);for(let i=0;i<1000;i++)wheel(document.querySelector("#p10"))');await pause(140);
 await check('zoom_calls===before_calls&&parseFloat(getComputedStyle(root).fontSize)===body_font+1','1000 body wheel events coalesce into one content font change');
 await read('window.padding=document.createElement("content");padding.innerHTML="<article id=write style=height:20px>padding probe</article>";document.body.append(padding);window.padding_font=parseFloat(getComputedStyle(root).fontSize);wheel(padding)');await pause(80);
 await check('parseFloat(getComputedStyle(root).fontSize)===padding_font+1&&zoom_calls===before_calls','native editing area padding changes content font, not window');await read('padding.remove()');
 // Interface scaling compensation, new instance inheritance and restart-style re-binding.
 await read('window.body_size=parseFloat(getComputedStyle(root).fontSize);window.term_size=view.term.options.fontSize;window.line_before=top_text();commands.get("linux_note:zoom_in").callback()');await pause(180);
 await check('Math.abs(parseFloat(getComputedStyle(root).fontSize)*frame.getZoomFactor()-body_size)<.01&&Math.abs(view.term.options.fontSize*frame.getZoomFactor()-term_size)<.01','window zoom preserves both visual font sizes');
 await check('top_text()===line_before','window zoom keeps terminal history anchor');
 await read('window.next=new qa.terminal_surface(store.get(),{input(){},resize(){},active(){},copy:async()=>{},error(){}});window.second=document.createElement("article");second.style.fontSize="18px";scroller.append(second);window.second_font=qa.bind_reading_font_zoom(scroller,second);void 0');
 await check('next.term.options.fontSize===view.term.options.fontSize&&Math.abs(parseFloat(getComputedStyle(second).fontSize)-parseFloat(getComputedStyle(root).fontSize))<.01','new editor and terminal inherit session fonts after window zoom');
 await read('next.dispose();second_font.dispose();second.remove();commands.get("linux_note:zoom_out").callback()');await pause(100);
 await read('wheel(view.viewport);wheel(document.querySelector("#p10"));window.config_count=configs.length;window.before_calls=zoom_calls;view.dispose();binding.dispose();unsubscribe();store.dispose();font.dispose();reflow.dispose()');await pause(100);
 await check('configs.length===config_count&&zoom_calls===before_calls&&!document.querySelector(".xterm")','dispose cancels queued gestures and removes terminal');
 await read('frame.setZoomFactor(1.25);window.fresh=qa.bind_workspace_zoom_commands({commands:{register(c){return()=>{}}}},runtime);window.fresh_font=qa.bind_reading_font_zoom(scroller,root);window.fresh_term=new qa.terminal_surface(qa.terminal_defaults,{input(){},resize(){},active(){},copy:async()=>{},error(){}});void 0');
 await check('Math.abs(parseFloat(getComputedStyle(root).fontSize)-18)<.01&&fresh_term.term.options.fontSize===14','new window lifetime resets content adjustments at its current window factor');
 await read('fresh_font.dispose();fresh_term.dispose();fresh.dispose();frame.setZoomFactor(1)');
 const latency=await read('latency');fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks,latency},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,latency,evidence}));win.destroy();app.exit(0);
}).catch(async error=>{console.error(JSON.stringify({status:'FAIL',error:String(error.stack||error),checks,evidence}));if(win&&!win.isDestroyed()){fs.writeFileSync(path.join(evidence,'failure.png'),(await win.webContents.capturePage()).toPNG());win.destroy();}app.exit(1)});
