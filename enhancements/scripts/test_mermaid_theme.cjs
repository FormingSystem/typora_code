const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'typora-mermaid-theme-'));app.setPath('userData',path.join(dir,'profile'));app.disableHardwareAcceleration();const checks=[];let win;
const wait=ms=>new Promise(r=>setTimeout(r,ms)),ev=s=>win.webContents.executeJavaScript(s),check=async(s,label)=>{assert(await ev(s),label);checks.push(label);};
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1100,height:850,webPreferences:{contextIsolation:false,backgroundThrottling:false,offscreen:true}});
 const root=process.env.TYPORA_NATIVE_TEST_ROOT;
 fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html>${root?'<base href="'+pathToFileURL(path.join(root,'resources/window.html')).href+'">':''}<style>${fs.readFileSync(path.join(__dirname,'../dist/workspace.css'),'utf8')}body{background:#363b40;color:#bbb}#write{padding:20px}body.light{background:#fff;color:#222}</style><body><div id=write></div></body>`);
 win.webContents.on('console-message',(_e,_l,message)=>console.error('renderer:',message));
 await win.loadFile(path.join(dir,'index.html'));
 const bundle=await require('esbuild').build({plugins:require('./editor_bundle.cjs').editor_plugins(),stdin:{contents:`export {mermaid_theme_options,bind_native_mermaid_theme} from './src/reading_mermaid_theme';export {create_preview_diagrams} from './src/workspace_markdown_preview_render';export {open_reading_media} from './src/reading_media_viewer';`,resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});await ev(bundle.outputFiles[0].text);
 await ev(`document.documentElement.dataset.workspaceColors='dark';document.body.style.setProperty('--mermaid-theme','night');window.dark=qa.mermaid_theme_options();`);
 await check(`dark.theme==='dark'&&dark.themeVariables.darkMode===false`,'尚未加载时沿原生Night转换约定');
 await ev(`window.count=0;const observer=new MutationObserver(()=>count++);observer.observe(document.body,{childList:true,subtree:true});for(let i=0;i<1000;i++)qa.mermaid_theme_options();setTimeout(()=>observer.disconnect(),0);`);await wait(30);await check(`count===0`,'1000次读取不触发正文DOM观察循环');
 await ev(`window.options={theme:'dark',themeVariables:{darkMode:false}};window.loads=0;window.notices=0;window.original=()=>{loads++;};window.owner={loadMermaidTheme:original,getCurrentMermaidOptions:()=>options};window.File={editor:{diagrams:owner}};window.mermaidAPI={initialize(){throw Error('must not touch central')}};window.binding=qa.bind_native_mermaid_theme();binding.reconcile();owner.loadMermaidTheme();window.copy=qa.mermaid_theme_options();copy.theme='changed';`);
 await check(`options.theme==='dark'&&loads===1`,'读取原生快照且不改中央配置');await ev(`binding.dispose()`);await check(`owner.loadMermaidTheme===original`,'销毁还原宿主通知端口');
 if(root){
  await ev(`(async()=>{window.central_calls=0;window.mermaid={initialize(){central_calls++;throw Error('central touched')}};window.diagrams=qa.create_preview_diagrams();window.code=document.createElement('code');code.textContent='flowchart LR\\n A[设备] --> B[驱动]';window.pre=document.createElement('pre');pre.append(code);document.querySelector('#write').append(pre);window.current=true;window.rendered=await diagrams.render(code,800,false,()=>current);})()`);
  await check(`rendered&&document.querySelector('.lookup-diagram svg')&&central_calls===0`,'实际随宿主Mermaid隔离渲染，未重置中央实例');
  await check(`getComputedStyle(document.querySelector('.node rect')).fill!=='rgb(236, 236, 255)'`,'暗色预览采用内置Dark而非默认浅紫');
  await ev(`window.old=document.querySelector('.lookup-diagram svg');window.options={theme:'default',themeVariables:{}};document.body.classList.add('light');document.documentElement.dataset.workspaceColors='light';`);await wait(500);
  await check(`document.querySelector('.lookup-diagram svg')!==old&&getComputedStyle(document.querySelector('.node rect')).fill==='rgb(236, 236, 255)'`,'已显示预览跟随明暗更新');
  for(let i=0;i<20;i++)await ev(`document.body.classList.toggle('light',${i%2===0});document.documentElement.dataset.workspaceColors='${i%2===0?'light':'dark'}';`);await wait(500);
  await check(`document.querySelectorAll('.lookup-diagram svg').length===1`,'20次快速切换无重复SVG');
  await ev(`window.before=document.querySelector('#write').innerHTML;current=false;diagrams.dispose();document.body.classList.add('light');`);await wait(150);
  await check(`document.querySelector('#write').innerHTML===before&&document.querySelectorAll('iframe').length===0`,'关闭取消迟到更新并移除隔离实例');
 }
 console.log(JSON.stringify({status:'PASS',checks,actual_mermaid:Boolean(root),evidence:dir}));win.destroy();app.quit();
}).catch(error=>{console.error(error);win?.destroy();app.exit(1);});
