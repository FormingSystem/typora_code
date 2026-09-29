// Original Typora isolated copy; external application startup only records parameters, does not open the user VS Code.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),process=reqnode('process'),cp=reqnode('child_process'),base=__CASE_ROOT__,checks=[],calls=[],samples=[];
 const source=path.join(base,'workspace/front.md');if(File.bundle.filePath!==source)return;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(fn)=>{for(let i=0;i<150;i++){const value=fn();if(value)return value;await pause(40);}throw Error('等待菜单或树超时');};
 const old_path=process.env.PATH,original_spawn=cp.spawn;
 const app_dir=path.join(base,'fake-vscode'),application=path.join(app_dir,'Code.exe'),directory=path.join(base,'workspace','目录 空格');
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')));
  fs.mkdirSync(app_dir);fs.writeFileSync(application,'fixture');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'README.md'),'directory');process.env.PATH=app_dir;
  cp.spawn=function(file,args,options){if(file===application){calls.push({file,args,options});const child=new(reqnode('events').EventEmitter)();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}return original_spawn.call(this,file,args,options);};
  const core=window[Symbol.for('typora-code:workspace')],text=fs.readFileSync(source,'utf8'),dirty=File.isDirty;
  const native_open=async()=>{File.editor.contextMenu.show(new MouseEvent('contextmenu',{clientX:600,clientY:320}),document.querySelector('#write'));await pause(80);const item=document.querySelector('[data-key="typora-code-open-vscode"]');assert(item&&!item.classList.contains('hide'),'正文原生菜单有VS Code动作');assert(item.querySelector('img[data-product-icon=vscode]'),'正文有官方图标');return item;};
  for(const theme of ['cpp_github-consolas_light.css','cpp_github-consolas_dark.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(350);
   const item=await native_open(),icon=item.querySelector('img');await icon.decode();const r=icon.getBoundingClientRect();assert(r.width===16&&r.height===16,'原生菜单16px图标 '+theme);samples.push({theme,width:r.width,height:r.height});item.querySelector('a').click();await wait(()=>calls.length===samples.length);assert(calls.at(-1).args[1]===path.join(base,'workspace')&&calls.at(-1).args[2]===source,'正文传递原文件路径');
  }
  core.app.commands.run('linux_note:file_explorer');
  const row=await wait(()=>[...document.querySelectorAll('.workspace-explorer-row')].find(n=>n.dataset.path===source));
  const open_row=async(node,target)=>{node.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:160,clientY:350}));const item=await wait(()=>document.querySelector('.git-graph-menu [data-action="open_vscode"]'));assert(!item.disabled&&item.querySelector('img[data-product-icon=vscode]'),'树菜单动作可用且含图标');const before=calls.length;item.click();await wait(()=>calls.length===before+1);assert(calls.at(-1).args[1]===path.join(base,'workspace')&&calls.at(-1).args[2]===target,'树菜单打开准确目标');};
  await open_row(row,source);
  document.querySelector('.workspace-explorer-root [aria-label="刷新资源管理器"]')?.click();await pause(150);
  await open_row(await wait(()=>[...document.querySelectorAll('.workspace-explorer-row')].find(n=>n.dataset.path===directory)),path.join(directory,'README.md'));
  await open_row(document.querySelector('.workspace-explorer-root-name'),source);
  assert(calls.every(call=>call.options.shell===false&&!call.options.env.ELECTRON_RUN_AS_NODE),'全部菜单安全参数与独立应用环境');
  assert(File.isDirty===dirty&&fs.readFileSync(source,'utf8')===text,'正文和未保存状态不变');
  await native_open();fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'vscode_native_dark'}));await pause(550);File.editor.contextMenu.hide();
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,calls:calls.map(c=>({args:c.args,shell:c.options.shell})),samples,limits:'原生菜单使用合成鼠标事件；VS Code进程替身核对参数，未操作用户外部编辑器。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,rows:[...document.querySelectorAll('.workspace-explorer-row')].map(n=>({path:n.dataset.path,text:n.textContent})),error:String(error.stack||error)},null,2));}
 finally{process.env.PATH=old_path;cp.spawn=original_spawn;}
})();
