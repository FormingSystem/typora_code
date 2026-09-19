// 共享滚动条：真实Chromium输入、正式静态样式、实际Monaco/xterm；只操作临时页面。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('esbuild'),{editor_plugins}=require('./editor_bundle.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_scrollbars_'));
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ev=source=>win.webContents.executeJavaScript(source);
const wait=async source=>{for(let i=0;i<150;i++){if(await ev(source))return;await pause(30);}throw Error('timeout '+source);};
const checks=[];
const check=async(label,source)=>{assert(await ev(source),label);checks.push(label);};
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1100,height:850,webPreferences:{offscreen:true,contextIsolation:false,backgroundThrottling:false}});
 const html=path.join(root,'index.html');
 fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:white}#matrix{display:flex;gap:12px}.probe{width:220px;height:140px;overflow:scroll;flex:none!important;padding:0!important;min-height:0!important}.fill{height:1000px;width:900px;background:linear-gradient(white,#eee)}#terminal{height:140px;width:450px}#diff{height:300px;width:1000px}#hidden{width:200px;height:20px;overflow:auto;scrollbar-width:none}</style><div id="matrix"></div><div id="hidden"><div class="fill"></div></div><div id="terminal"></div><div id="diff"></div>');
 await win.loadFile(html);
 await ev(`(()=>{let s=document.createElement('style');s.id='candidate';s.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../dist/workspace.css'),'utf8'))};document.head.append(s);document.documentElement.setAttribute('data-linux-note-typora-enhancements','ready');for(const name of ['workspace-explorer-tree','workspace-search-results','git-scm-history-list','workspace-titlebar-popup']){const node=document.createElement('div');node.className='probe '+name;node.style.position='static';node.style.minWidth='0';node.style.boxShadow='none';node.tabIndex=0;node.innerHTML='<div class="fill">'+name+'</div>';document.querySelector('#matrix').append(node);}window.p=document.querySelector('.probe');})()`);
 const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {git_diff_editor} from "./src/git_diff_editor";export {Terminal} from "@xterm/xterm";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});
 await ev(bundle.outputFiles[0].text);
 await ev(`window.term=new qa.Terminal({cols:60,rows:6,scrollback:200});term.open(document.querySelector('#terminal'));term.write(Array.from({length:100},(_,i)=>'line '+i+'\\r\\n').join(''));window.diff=new qa.git_diff_editor({title:'scroll.c',file:'scroll.c',left:'line\\n'.repeat(200),right:'modified\\n'+'line\\n'.repeat(200)});document.querySelector('#diff').append(diff.container);diff.container.style.height='280px';void 0`);
 await wait('document.querySelector("[data-diff-ready=true]")&&document.querySelector(".xterm-scrollable-element > .scrollbar > .slider")');
 for(const zoom of [1,1.25]){
  win.webContents.setZoomFactor(zoom);await pause(100);
  for(const theme of ['light','dark']){
   win.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});await pause(30);
   await ev(`document.documentElement.dataset.workspaceFileIconTheme='${theme}';document.body.style.background='${theme==='dark'?'#181818':'white'}';document.querySelectorAll('.probe').forEach(n=>n.scrollTop=0);void 0`);
   await check(theme+' '+zoom+' native horizontal/vertical shared geometry',`[...document.querySelectorAll('.probe')].every(n=>{const bar=getComputedStyle(n,'::-webkit-scrollbar'),thumb=getComputedStyle(n,'::-webkit-scrollbar-thumb'),s=getComputedStyle(n);return bar.width==='8px'&&bar.height==='8px'&&thumb.borderRadius==='4px'&&s.scrollbarWidth==='auto'&&s.scrollbarColor==='auto'&&thumb.backgroundColor==='${theme==='dark'?'rgba(168, 169, 170, 0.52)':'rgba(100, 100, 100, 0.753)'}';})`).catch(async error=>{console.error(await ev('[...document.querySelectorAll(".probe")].map(n=>({name:n.className,bar:getComputedStyle(n,"::-webkit-scrollbar").width,color:getComputedStyle(n,"::-webkit-scrollbar-thumb").backgroundColor,radius:getComputedStyle(n,"::-webkit-scrollbar-thumb").borderRadius}))'));throw error;});
   await check(theme+' hidden remains hidden','getComputedStyle(document.querySelector("#hidden")).scrollbarWidth==="none"');
   const point=await ev('(()=>{const b=p.getBoundingClientRect();return{x:Math.round(b.x+50),y:Math.round(b.y+50)}})()');
   win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaX:0,deltaY:-150,canScroll:true});await pause(100);
   await check(theme+' wheel scrolls actual container','p.scrollTop>0');
   await ev('p.scrollTop=0;p.focus();void 0');win.webContents.sendInputEvent({type:'keyDown',keyCode:'PageDown'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'PageDown'});await pause(200);
   await check(theme+' keyboard scrolls actual container','p.scrollTop>0');
   await ev('p.scrollTop=0;p.blur();void 0');await pause(100);
   const thumb=await ev(`(()=>{const b=p.getBoundingClientRect();return{x:Math.round((b.right-4)*${zoom}),y:Math.round((b.top+8)*${zoom})}})()`);
   win.webContents.sendInputEvent({type:'mouseMove',...thumb});await pause(70);
   fs.writeFileSync(path.join(root,'hover_'+theme+'_'+zoom+'.png'),(await win.webContents.capturePage()).toPNG());
   win.webContents.sendInputEvent({type:'mouseDown',...thumb,button:'left',clickCount:1});
   win.webContents.sendInputEvent({type:'mouseMove',x:thumb.x,y:thumb.y+45,button:'left'});await pause(50);
   fs.writeFileSync(path.join(root,'drag_'+theme+'_'+zoom+'.png'),(await win.webContents.capturePage()).toPNG());
   win.webContents.sendInputEvent({type:'mouseUp',x:thumb.x,y:thumb.y+45,button:'left',clickCount:1});await pause(100);
   await check(theme+' real thumb drag scrolls','p.scrollTop>0');
  }
 }
 await check('real xterm slider rounded','[...document.querySelectorAll(".xterm-scrollable-element > .scrollbar > .slider")].every(n=>getComputedStyle(n).borderRadius==="4px")');
 await check('real Monaco slider and diff join rounded',`[...document.querySelectorAll('.monaco-scrollable-element > .scrollbar > .slider')].length>0&&[...document.querySelectorAll('.monaco-scrollable-element > .scrollbar > .slider')].every(n=>getComputedStyle(n).borderTopLeftRadius==='4px'&&getComputedStyle(n).borderTopRightRadius===(n.matches('.monaco-diff-editor.has-diff-overview .modified-in-monaco-diff-editor .scrollbar.vertical > .slider')?'0px':'4px'))`);
 await ev('window.before=p.scrollTop;document.documentElement.removeAttribute("data-linux-note-typora-enhancements");void 0');
 await check('deactivation restores host drawing and retains position','getComputedStyle(p,"::-webkit-scrollbar-thumb").borderRadius!=="4px"&&p.scrollTop===before');
 await ev('document.documentElement.setAttribute("data-linux-note-typora-enhancements","failed");void 0');
 await check('startup failure leaves static rules inert','getComputedStyle(p,"::-webkit-scrollbar-thumb").borderRadius!=="4px"&&p.scrollTop===before');
 await ev('document.documentElement.setAttribute("data-linux-note-typora-enhancements","ready");void 0');
 const iterations=process.env.TYPORA_TEST_PURPOSE==='stress'?Number(process.env.TYPORA_STRESS_ITERATIONS||20):20;
 const stress=await ev(`(()=>{const count=document.querySelectorAll('*').length,styles=document.querySelectorAll('style').length,start=performance.now();for(let i=0;i<${iterations};i++){const n=document.createElement('div');n.className='probe';n.innerHTML='<div class="fill"></div>';document.body.append(n);n.scrollTop=100;if(n.scrollTop!==100||getComputedStyle(n,'::-webkit-scrollbar-thumb').borderRadius!=='4px')throw Error('dynamic scroll failure');n.remove();}return{iterations:${iterations},elapsed_ms:performance.now()-start,nodes_before:count,nodes_after:document.querySelectorAll('*').length,styles_before:styles,styles_after:document.querySelectorAll('style').length}})()`);
 assert.equal(stress.nodes_after,stress.nodes_before);assert.equal(stress.styles_after,stress.styles_before);checks.push('dynamic lifecycle no DOM/style growth');
 await ev('diff.dispose();term.dispose();void 0');
 fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({status:'PASS',checks,stress,scope:'真实Chromium输入；候选CSS、实际Monaco/xterm，无用户文档'},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence:root,stress}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error('evidence '+root);win?.destroy();app.exit(1);});
