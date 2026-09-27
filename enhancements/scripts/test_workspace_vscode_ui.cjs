const {app,BrowserWindow}=require('electron'),{build}=require('esbuild'),fs=require('fs'),path=require('path'),os=require('os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_vscode_'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let view;
app.whenReady().then(async()=>{
 view=new BrowserWindow({show:false,width:900,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false}});
 await view.loadURL('data:text/html,'+encodeURIComponent('<style>body{margin:0}#context-menu{position:relative;width:300px}#context-menu a{display:block;line-height:24px}li{list-style:none}</style><div id="write">正文</div><ul id="context-menu"><li id="original">原生项</li></ul>'));
 const bundle=await build({stdin:{contents:'export * from "./src/workspace_open_vscode";export {workspace_menu} from "./src/workspace_widgets";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'vscode_api',write:false,loader:{'.css':'text'}});
 await view.webContents.insertCSS(fs.readFileSync(path.join(__dirname,"../src/git_graph.css"),"utf8"));
 await view.webContents.executeJavaScript(bundle.outputFiles[0].text);
 const result=await view.webContents.executeJavaScript(`(async()=>{
 const checks=[],calls=[],assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const real_fs=require('fs'),path=require('path'),root=${JSON.stringify(root)},code=path.join(root,'Code.exe'),file=path.join(root,'中文 & 文件.md');real_fs.writeFileSync(code,'fixture');real_fs.writeFileSync(file,'original');
 const child_process={spawn(exe,args,options){calls.push({exe,args,options});const child=new(require('events').EventEmitter)();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;},execFile(exe,args,options,callback){callback(Error('absent'));}};
 window.reqnode=name=>name==='child_process'?child_process:name==='process'?{platform:'win32',env:{PATH:root,ELECTRON_RUN_AS_NODE:'1'}}:require(name);
 let current=file,native_count=0;const notices=[];const core={Notice:class {constructor(message){notices.push(message);}}};window[Symbol.for('typora-code:workspace')]=core;
 const original=function(){native_count++;};window.File={editor:{contextMenu:{show:original,hide(){}}}};
 const files={current_file:()=>current,core},binding=vscode_api.bind_native_vscode_menu(files),body=document.querySelector('#write');
 File.editor.contextMenu.show(new MouseEvent('contextmenu'),body);
 let item=document.querySelector('[data-key="typora-code-open-vscode"]');assert(!item.classList.contains('hide'),'正文贡献可见');assert(document.querySelector('#original'),'保留原生菜单');
 const icon=item.querySelector('img');await icon.decode();assert(icon.naturalWidth===96&&icon.width===16&&icon.height===16,'官方原图缩放16px');
 item.querySelector('a').click();await new Promise(r=>setTimeout(r,50));assert(calls.length===1&&calls[0].args[1]===file,'正文实际传入当前文件');assert(calls[0].options.shell===false&&!calls[0].options.env.ELECTRON_RUN_AS_NODE,'无shell且隔离Electron环境');assert(real_fs.readFileSync(file,'utf8')==='original','不写正文');
 File.editor.contextMenu.show(new MouseEvent('contextmenu'),body);current='';item.querySelector('a').click();assert(calls.length===1,'切文档后过期入口不执行');File.editor.contextMenu.show(new MouseEvent('contextmenu'),body);assert(item.querySelector('a').getAttribute('aria-disabled')==='true','无路径草稿禁用');
 for(const dark of [false,true])for(const zoom of [1,1.25]){
 document.body.style.zoom=zoom;document.body.style.background=dark?'#181818':'#fff';const close=vscode_api.workspace_menu(new MouseEvent('contextmenu',{clientX:80,clientY:40}),[vscode_api.vscode_resource_entry(file),{title:'复制路径',action(){}}]);
 const rows=[...document.querySelectorAll('.git-graph-menu>button')],labels=rows.map(n=>n.querySelector('.git-menu-label').getBoundingClientRect());assert(labels[0].left===labels[1].left,'图标不改变文字列 '+dark+' '+zoom);assert(rows[0].querySelector('img[data-product-icon=vscode]'),'共享菜单含品牌标识');close();
 }
 binding.dispose();assert(File.editor.contextMenu.show===original&&!document.querySelector('[data-key="typora-code-open-vscode"]'),'销毁恢复包装与DOM');assert(native_count===3,'保留原生show调用');
 return {checks,calls:calls.length,notices};})()`);
 fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify(result,null,2));console.log('VS Code UI:',result.checks.length,'passed');view.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
