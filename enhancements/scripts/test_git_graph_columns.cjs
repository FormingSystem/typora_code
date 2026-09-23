// 实际Graph组件与Chromium输入；仓库读写端口替身，列宽持久化用独立profile。
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('esbuild'),{editor_plugins}=require('./editor_bundle.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_graph_columns_'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[];
const ev=source=>win.webContents.executeJavaScript(source);
const check=async(label,source)=>{assert(await ev(source),label);checks.push(label);};
const selector=key=>'.git-graph-column-'+key+' .git-graph-column-resize';
const measure=()=>ev(`(()=>{const keys=['graph','subject','date','author','hash'];return Object.fromEntries(keys.map(key=>{const n=document.querySelector('.git-graph-column-'+key),r=n.getBoundingClientRect();return[key,{left:r.left,right:r.right,width:r.width}]}));})()`);
const point=async key=>{const r=await ev(`document.querySelector(${JSON.stringify(selector(key))}).getBoundingClientRect().toJSON()`),zoom=win.webContents.getZoomFactor();return{x:Math.round((r.left+r.width/2)*zoom),y:Math.round((r.top+r.height/2)*zoom)};};
const start=async key=>{const p=await point(key);win.webContents.sendInputEvent({type:'mouseMove',...p});await pause(20);win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});await pause(15);return p;};
const move=async(p,delta)=>{win.webContents.sendInputEvent({type:'mouseMove',x:p.x+Math.round(delta*win.webContents.getZoomFactor()),y:p.y,button:'left'});await pause(25);};
const end=async(p,delta)=>{win.webContents.sendInputEvent({type:'mouseUp',x:p.x+Math.round(delta*win.webContents.getZoomFactor()),y:p.y,button:'left',clickCount:1});await pause(25);};
const key=async(name,modifiers=[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:name.replace(/^Arrow/,''),modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode:name.replace(/^Arrow/,''),modifiers});await pause(20);};
const aligned=()=>check('header and rows align',`[...panel.header.children].filter(n=>n.getBoundingClientRect().width).every(n=>{const key=[...n.classList].find(c=>c.startsWith('git-graph-column-')).replace('git-graph-column-',''),row=panel.list.querySelector('.git-graph-row'),cell=key==='graph'?row.firstElementChild:row.querySelector('.git-graph-'+key),a=n.getBoundingClientRect(),b=cell.getBoundingClientRect();return Math.abs(a.left-b.left)<1&&(key==='graph'||Math.abs(a.width-b.width)<1);})`);
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1200,height:850,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
 const html=path.join(root,'index.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}</style>');await win.loadFile(html);
 win.webContents.debugger.attach();await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {git_graph_panel} from "./src/git_graph_panel";export {graph_defaults,load_graph_settings} from "./src/git_graph_settings";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'qa',loader:{'.css':'text'},write:false});await ev(bundle.outputFiles[0].text);
 await ev(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../dist/workspace.css'),'utf8'))};document.head.append(s);document.documentElement.setAttribute('data-linux-note-typora-enhancements','ready');window._options={displayLang:'zh-CN'};window.panel=new qa.git_graph_panel({runner:()=>({run:async()=>'',cancel(){}}),path_api:require('node:path')},'column-fixture');document.body.append(panel.container);panel.container.style.cssText='position:fixed;left:0;top:0;width:1100px;height:700px';panel.state={root:panel.root,head:'1'.repeat(40),branch:'main',refs:[],commits:Array.from({length:30},(_,i)=>({hash:String(i+1).padStart(40,'0'),parents:i<29?[String(i+2).padStart(40,'0')]:[],author:'QA author',date:'2026-09-19T10:00:00Z',subject:'column '+i})),changes:[],stashes:[],remotes:[],more:false,operation:''};window.saves=0;window.saved=panel.persist_settings.bind(panel);panel.persist_settings=()=>{saves++;saved()};panel.render_history();})()`);
 await check('three real boundaries, hash adjusts from left','document.querySelectorAll(".git-graph-column-resize").length===3&&document.querySelector("[data-left-column=author][data-right-column=hash]")&&!document.querySelector(".git-graph-column-hash .git-graph-column-resize")');
 await check('initial accessibility width matches rendered cell','[...document.querySelectorAll(".git-graph-column-resize")].every(n=>Math.abs(Number(n.getAttribute("aria-valuenow"))-n.parentElement.getBoundingClientRect().width)<1)');
 await ev('panel.container.style.display="none";window.dispatchEvent(new Event("resize"));void 0');await pause(40);
 await ev('panel.container.style.width="1000px";panel.container.style.display="";void 0');await pause(60);
 await check('hidden tab restore refreshes actual accessibility width','[...document.querySelectorAll(".git-graph-column-resize")].every(n=>Math.abs(Number(n.getAttribute("aria-valuenow"))-n.parentElement.getBoundingClientRect().width)<1)');
 for(const zoom of [1,1.25])for(const theme of ['light','dark']){
  win.webContents.setZoomFactor(zoom);await ev(`panel.container.style.width='${zoom===1?1100:880}px';document.documentElement.dataset.workspaceFileIconTheme='${theme}';document.body.style.cssText='--bg-color:${theme==='dark'?'#181818':'#fff'};--text-color:${theme==='dark'?'#ddd':'#222'}';void 0`);await pause(70);
  for(const [left,right]of [['subject','date'],['date','author'],['author','hash']])for(const delta of [-20,20]){
   const before=await measure(),count=await ev('saves'),p=await start(left);await move(p,delta);const during=await measure();await end(p,delta);
   assert(Math.abs(during[left].right-before[left].right-delta)<1.2,`${left} ${theme} ${zoom}: boundary follows delta ${delta}`);
   assert(Math.abs(during[left].width-before[left].width-delta)<1.2,left+' grows with pointer');assert(Math.abs(during[right].width-before[right].width+delta)<1.2,right+' gives adjacent space');
   for(const other of ['graph','subject','date','author','hash'].filter(k=>k!==left&&k!==right))assert(Math.abs(during[other].width-before[other].width)<1.2,other+' unaffected');
   assert.equal(await ev('saves'),count+1,'one save per completed drag');await aligned();checks.push(`${theme}/${zoom} ${left}/${right} ${delta}`);
  }
  fs.writeFileSync(path.join(root,'columns_'+theme+'_'+zoom+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 win.webContents.setZoomFactor(1);await ev('panel.container.style.width="1100px";void 0');await pause(60);
 for(const reason of ['Escape','cancel','lost','refresh','close']){
  const before=await ev('JSON.stringify(panel.settings.column_widths)'),count=await ev('saves'),p=await start('author');await move(p,-20);
  if(reason==='Escape')await key('Escape');
  else await ev(reason==='refresh'?'panel.render_history();void 0':reason==='close'?'panel.close();void 0':`(()=>{const n=document.querySelector(${JSON.stringify(selector('author'))});n.dispatchEvent(new PointerEvent('${reason==='cancel'?'pointercancel':'lostpointercapture'}',{pointerId:1,bubbles:true}));})()`);
  await end(p,-20);assert.equal(await ev('JSON.stringify(panel.settings.column_widths)'),before,reason+' rolls back');assert.equal(await ev('saves'),count,reason+' zero save');checks.push(reason+' cancels drag');
 }
 await ev('document.querySelector("[data-left-column=author]").focus();void 0');let before=await measure();await key('ArrowLeft');let after=await measure();assert.equal(Math.round(after.hash.width-before.hash.width),10);before=after;await key('ArrowRight',['shift']);after=await measure();assert.equal(Math.round(after.hash.width-before.hash.width),-50);checks.push('keyboard changes hash and author in 10/50px steps');
 await check('persisted settings reload','JSON.stringify(qa.load_graph_settings(localStorage,panel.root).column_widths)===JSON.stringify(panel.settings.column_widths)');
 await ev(`(()=>{const n=document.querySelector('[data-left-column=author]');for(let i=0;i<200;i++)n.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));})()`);
 await check('left boundary stops at minimum','panel.settings.column_widths.author===40&&panel.settings.column_widths.hash>=40');
 await ev(`(()=>{const n=document.querySelector('[data-left-column=author]');for(let i=0;i<200;i++)n.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));})()`);
 await check('right boundary stops at minimum','panel.settings.column_widths.hash===40&&panel.settings.column_widths.author>=40');
 await ev('window.saved_before={...panel.settings.column_widths};panel.persist_settings=()=>{throw Error("fixture quota")};document.querySelector("[data-left-column=author]").focus();void 0');await key('ArrowLeft');
 await check('save failure restores values and reports','JSON.stringify(panel.settings.column_widths)===JSON.stringify(saved_before)&&panel.status.textContent.includes("fixture quota")');await ev('panel.persist_settings=()=>{saves++;saved()};void 0');
 for(const hidden of [['date'],['author'],['date','author'],['date','author','hash']]){
  await ev(`for(const k of ['date','author','hash'])panel.settings['show_'+k]=!${JSON.stringify(hidden)}.includes(k);panel.render_history();void 0`);await aligned();
  assert.equal(await ev('document.querySelectorAll(".git-graph-column-resize").length'),3-hidden.length);
  if(hidden.length===2){const p=await start('subject'),before=await measure();await move(p,-20);await end(p,-20);const after=await measure();assert(Math.abs(after.hash.width-before.hash.width-20)<1);}
 }
 await ev('for(const k of ["date","author","hash"])panel.settings["show_"+k]=true;panel.settings.column_widths={...qa.graph_defaults.column_widths};panel.render_history();panel.container.style.width="420px";panel.list.scrollLeft=panel.list.scrollWidth;void 0');await pause(60);await aligned();
 const narrow=await start('author');await move(narrow,-20);await end(narrow,-20);await aligned();checks.push('narrow scrolled viewport preserves matching columns');
 await ev('window.previous_state=panel.state;window.original_refresh=panel.refresh;panel.refresh=async()=>{};void 0');
 const switching=await start('author'),switch_saves=await ev('saves');await move(switching,-20);await ev('panel.switch_repo(require("node:path").resolve("second-fixture"))');await end(switching,-20);
 await check('switch repository discards old drag and handlers','panel.root===require("node:path").resolve("second-fixture")&&document.querySelectorAll(".git-graph-column-resize").length===0&&JSON.stringify(panel.settings.column_widths)===JSON.stringify(qa.graph_defaults.column_widths)');assert.equal(await ev('saves'),switch_saves);
 await ev('panel.state={...previous_state,root:panel.root};panel.refresh=original_refresh;panel.render_history();void 0');
 await ev('panel.container.style.width="1100px";panel.list.scrollLeft=0;panel.render_history();document.querySelector("[data-left-column=author]").focus();void 0');await pause(30);
 const iterations=process.env.TYPORA_TEST_PURPOSE==='stress'?Number(process.env.TYPORA_STRESS_ITERATIONS||20):20;
 await ev('window.original_resize_observer=ResizeObserver;window.active_column_observers=0;ResizeObserver=class extends original_resize_observer {constructor(callback){super(callback);active_column_observers++;this.live=true;}disconnect(){if(this.live)active_column_observers--;this.live=false;super.disconnect();}};void 0');
 const stress=await ev(`(()=>{const start=performance.now(),nodes=document.querySelectorAll('*').length,initial=JSON.stringify(panel.settings.column_widths);for(let i=0;i<${iterations};i++){panel.render_history();const handle=document.querySelector('[data-left-column=author]');for(const key of ['ArrowLeft','ArrowRight'])handle.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));}return{iterations:${iterations},elapsed_ms:performance.now()-start,nodes_before:nodes,nodes_after:document.querySelectorAll('*').length,observers:active_column_observers,drift:initial!==JSON.stringify(panel.settings.column_widths)}})()`);assert.equal(stress.drift,false);assert.equal(stress.nodes_after,stress.nodes_before);assert.equal(stress.observers,1);
 const dying=await start('author');await move(dying,-20);const count=await ev('saves');await ev('panel.dispose();void 0');await end(dying,-20);assert.equal(await ev('saves'),count);await check('dispose removes handles and layout observer','!document.querySelector(".git-graph-column-resize")&&active_column_observers===0');await ev('ResizeObserver=original_resize_observer;void 0');
 fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({status:'PASS',checks,stress,scope:'实际Graph、真实Chromium拖动/键盘；压力为renderer键盘事件；Git端口替身'},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence:root,stress}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error('evidence '+root);win?.destroy();app.exit(1);});
