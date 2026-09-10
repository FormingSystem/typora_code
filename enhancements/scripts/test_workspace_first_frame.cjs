const {app,BrowserWindow}=require('electron');const {build}=require('esbuild');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {pathToFileURL}=require('node:url');const assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'typora_static_styles_'));app.setPath('userData',path.join(temp,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});let window;
app.whenReady().then(async()=>{
 const {build_workspace_styles,static_workspace_css_plugin}=await import(pathToFileURL(path.join(__dirname,'build_workspace_styles.mjs')).href);
 const entry=path.join(temp,'active.ts'),active=path.join(__dirname,'../src/workspace_files.css'),unused=path.join(temp,'unused_modern.css');
 fs.writeFileSync(unused,'html[data-linux-note-workspace-chrome]{font-size:99px!important}','utf8');
 fs.writeFileSync(entry,'import active from '+JSON.stringify(active)+';import unused from '+JSON.stringify(unused)+';globalThis.fixture_style=active;','utf8');
 const assets=await build_workspace_styles({outdir:temp,entry_points:[entry]});assert.deepEqual(assets.style_inputs,[active],'tree-shaken unused Modern CSS is excluded from static output');
 const again=await build_workspace_styles({outdir:path.join(temp,'repeat'),entry_points:[entry]});assert(fs.readFileSync(assets.css_path).equals(fs.readFileSync(again.css_path)),'static closure ordering is deterministic');
 assert(!fs.existsSync(path.join(temp,'appearance_bootstrap.js')),'no no-op appearance asset');
 const production=await build_workspace_styles({outdir:path.join(temp,'production')});
 assert(production.style_inputs.includes(path.join(__dirname,'../src/workspace_entry.css')),'real workbench entry retains startup error CSS in its active closure');
 assert(fs.readFileSync(path.join(__dirname,'../dist/workspace.css'),'utf8').includes('.typora-code-startup-error'),'current release includes startup error CSS');
 const compiled=await build({stdin:{contents:'export {acquire_workspace_style} from "./src/workspace_styles";',resolveDir:path.join(__dirname,'..')},plugins:[static_workspace_css_plugin()],bundle:true,write:false,format:'iife',globalName:'qa'});
 for(const theme of ['light','dark']){
 const page=path.join(temp,theme+'.html');const color=theme==='light'?'#ffffff':'#121314';
 fs.writeFileSync(page,'<!doctype html><html><head><style>body{margin:0;background:'+color+';font:15px serif}#write{color:#135724}</style><script>localStorage.setItem("linux-note:workspace-ui-appearance:v1",JSON.stringify({font_family:"Consolas",font_size:17,document_margin_percent:9}));window.saved=localStorage.getItem("linux-note:workspace-ui-appearance:v1");</script><link id="typora-code-workspace-styles" rel="stylesheet" href="workspace.css"><script>window.head_state={sheet:!!document.querySelector("link").sheet,body_missing:!document.body};</script></head><body><div class="workspace-file-notice">Files</div><article id="write">Untouched Markdown</article><script>window.before_runtime={padding:getComputedStyle(document.querySelector(".workspace-file-notice")).padding,font:getComputedStyle(document.body).fontSize,markdown:getComputedStyle(document.querySelector("#write")).color,background:getComputedStyle(document.body).backgroundColor};window.before_style_count=document.querySelectorAll("style").length;</script></body></html>','utf8');
 window=new BrowserWindow({show:false,width:1100,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});await window.loadFile(page);const run=source=>window.webContents.executeJavaScript(source);
 assert.deepEqual(await run('head_state'),{sheet:true,body_missing:true},'static stylesheet ready before body parsing');
 assert.deepEqual(await run('before_runtime'),{padding:'16px',font:'15px',markdown:'rgb(19, 87, 36)',background:theme==='light'?'rgb(255, 255, 255)':'rgb(18, 19, 20)'},'first frame applies active styles and preserves host theme and scale');
 await run(compiled.outputFiles[0].text);await run('window.handle=qa.acquire_workspace_style("test-static-ownership","");void 0');
 assert(await run('document.querySelectorAll("style").length===before_style_count'),'no runtime stylesheet reinjection');
 assert(await run('!document.documentElement.hasAttribute("data-linux-note-workspace-chrome")&&!document.documentElement.hasAttribute("data-linux-note-ui-appearance")&&!document.documentElement.style.getPropertyValue("--linux-note-ui-font-size")'),'no Modern markers or font override');
 assert(await run('localStorage.getItem("linux-note:workspace-ui-appearance:v1")===saved'),'stored user reading preferences preserved');
 await run('handle.remove()');assert(await run('!!document.getElementById("typora-code-workspace-styles").sheet'),'cleanup preserves document-owned static CSS');
 await run('document.getElementById("typora-code-workspace-styles").remove()');assert(await run('(()=>{try{qa.acquire_workspace_style("missing","");return false}catch(error){return error.message.includes("stylesheet is missing")}})()'),'missing static asset fails explicitly');
 await run('new Promise((resolve,reject)=>{const link=document.createElement("link");link.rel="stylesheet";link.href="production/workspace.css";link.onload=()=>resolve(true);link.onerror=reject;document.head.append(link)})');
 assert.deepEqual(await run('(()=>{const error=document.createElement("div");error.className="typora-code-startup-error";error.textContent="Startup failure fixture";document.body.append(error);const style=getComputedStyle(error);return {position:style.position,z:style.zIndex,top:error.getBoundingClientRect().top}})()'),{position:'fixed',z:'2147483647',top:0},'real static CSS makes a startup failure visible above the host');
 window.destroy();window=null;
 }
 console.log('Static first frame PASS: active dependency closure, dead Modern exclusion, deterministic CSS, host theme/scale preserved, no bootstrap/reinjection, reading storage unchanged, cleanup and missing asset rejection. '+temp);app.exit(0);
}).catch(error=>{console.error(error);window?.destroy();app.exit(1)});
