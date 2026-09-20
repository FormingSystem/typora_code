const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{build}=require('esbuild');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'typora_community_ui_'));app.setPath('userData',path.join(base,'profile'));app.disableHardwareAcceleration();let win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[];
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:920,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
 await win.loadURL('data:text/html,<html><head></head><body><button id="outside">outside</button></body></html>');
 const ev=s=>win.webContents.executeJavaScript(s),check=async(label,s)=>{assert(await ev(s),label);checks.push(label);};
 const bundle=await build({entryPoints:[path.join(__dirname,'../src/community_plugins.ts')],bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});await ev(bundle.outputFiles[0].text);
 await ev(`
 const css=document.createElement('style');css.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../dist/workspace.css'),'utf8'))};document.head.append(css);
 window._options={userDataPath:${JSON.stringify(base)},appVersion:'1.14.10'};window.records=[{id:'example.plugin',name:'示例插件',description:'完整描述',version:'1.0.0',repo:'example/plugin',enabled:false,running:false}];window.listeners=new Set();window.calls=[];window.disposed_count=0;
 window.fake={list:()=>records,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},start:async()=>{},dispose:async()=>{disposed_count++},catalog:async()=>[{id:'example.remote',name:'远程插件',description:'目录描述',repo:'example/remote'}],latest:async()=>({version:'1.0.0'}),set_enabled:async(id,value)=>{calls.push([id,value]);Object.assign(records.find(r=>r.id===id),{enabled:value,running:value});listeners.forEach(fn=>fn())},install_online:async(info)=>{records.push({...info,version:'1.0.0',enabled:false});listeners.forEach(fn=>fn())},uninstall:async(id)=>{records=records.filter(r=>r.id!==id);listeners.forEach(fn=>fn())}};
 window.reqnode=name=>name.endsWith('community_plugin_service.cjs')?{create_community_service:()=>fake,compare_version:()=>0}:name.endsWith('workspace_update_service.cjs')?{}:require(name);
 window.commands={};window[Symbol.for('typora-code:workspace')]={app:{commands:{register(command){commands[command.id]=command.callback;return()=>delete commands[command.id]}}},Notice:class{}};
 const saved_require=reqnode;window.reqnode=name=>name.endsWith('community_plugin_service.cjs')?{create_community_service(){throw Error('配置目录不可写')}}:saved_require(name);
 window.preflight_failure=false;try{qa.bind_community_plugins()}catch{preflight_failure=true;}window.reqnode=saved_require;void 0;
 `);
 await check('服务初始化失败不留下ABI、命令或样式','preflight_failure&&!window[Symbol.for("typora-plugin-core@v2")]&&!Object.keys(commands).length&&!document.getElementById("typora-code-style:community_plugins")');
 await ev(`window.binding=qa.bind_community_plugins();commands['typora_code:community_plugins']();void 0;
 `);await pause(100);
 const click=async text=>{await ev(`[...document.querySelectorAll('.workspace-community-manager button')].find(n=>n.textContent===${JSON.stringify(text)}).click();void 0`);await pause(40);};
 await check('管理页显示信任边界与已安装插件',`document.querySelector('.workspace-community-manager').textContent.includes('进程权限')&&document.querySelectorAll('.workspace-community-row').length===1`);
 await click('信任并启用');await check('启用只调用服务一次并显示最新状态','calls.length===1&&records[0].enabled&&document.querySelector(".workspace-community-row").textContent.includes("已启用")');
 await click('停用');await check('停用更新状态','calls.length===2&&!records[0].enabled');
 await ev(`const input=document.querySelector('input[type=search]');input.value='不存在';input.dispatchEvent(new Event('input'));void 0`);await check('搜索过滤当前插件','!document.querySelector(".workspace-community-row")');
 await ev(`document.querySelector('input[type=search]').value='';document.querySelector('input[type=search]').dispatchEvent(new Event('input'));void 0`);
 await click('社区目录');await click('安装');await click('已安装');await check('在线安装完成保持停用','records.length===2&&!records[1].enabled');
 await ev(`window.saved_catalog=fake.catalog;fake.catalog=async()=>{throw Error('网络失败验收')};void 0`);await click('社区目录');await check('网络错误可见且恢复控件','document.querySelector(".workspace-community-message").textContent.includes("网络失败验收")&&![...document.querySelectorAll(".workspace-community-toolbar button")].some(n=>n.disabled)');
 for(const theme of ['light','dark']){await ev(`document.documentElement.dataset.workspaceFileIconTheme='${theme}';void 0`);win.webContents.setZoomFactor(1.25);await pause(40);await check(theme+'缩放时管理窗口仍在视口内',`(()=>{const r=document.querySelector('.git-graph-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})()`);}
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await pause(60);await check('真实Escape关闭并清理订阅','!document.querySelector(".workspace-community-manager")&&listeners.size===0');
 await ev(`commands['typora_code:community_plugins']();window.finish_catalog=undefined;fake.catalog=()=>new Promise(resolve=>finish_catalog=resolve);void 0`);await click('社区目录');await check('异步期间防重复动作','[...document.querySelectorAll(".workspace-community-toolbar button")].every(n=>n.disabled)');
 await ev(`binding.dispose();finish_catalog([]);void 0`);await pause(60);await check('销毁后迟到结果不重开窗口且ABI清理','!document.querySelector(".workspace-community-manager")&&disposed_count===1&&!window[Symbol.for("typora-plugin-core@v2")]&&Object.keys(commands).length===0');
 console.log(JSON.stringify({status:'PASS',checks,evidence:base,scope:'真实Chromium窗口/键盘、共享对话框与服务端口替身'}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);win?.destroy();app.exit(1)});
