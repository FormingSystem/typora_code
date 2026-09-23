// 真实临时文件/HTTP、Chromium沙箱及生产链接服务；编辑组端口由夹具记录。
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{editor_plugins}=require('./editor_bundle.cjs');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_link_preview_'));
const checks=[];let win,server;
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
app.whenReady().then(async()=>{
  fs.writeFileSync(path.join(evidence,'source.md'),'[Local](target.md#target-heading)');
  fs.writeFileSync(path.join(evidence,'target.md'),'# First\n\nFirst text.\n\n## Target heading\n\n**Linked content**\n');
  fs.writeFileSync(path.join(evidence,'source.py'),'print("readonly")\n');
  server=http.createServer((req,res)=>{
    if(req.url==='/redirect'){res.writeHead(302,{Location:'/page'});res.end();return;}
    if(req.url==='/denied'){res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");res.end('<p>denied</p>');return;}
    if(req.url==='/bad'){res.writeHead(503);res.end();return;}
    if(req.url==='/large'){res.setHeader('Content-Type','text/html');res.end('x'.repeat(2*1024*1024+1));return;}
    if(req.url==='/slow'){setTimeout(()=>{res.setHeader('Content-Type','text/html');res.end('<p>OLD SLOW</p>');},450);return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><style>h1{color:rgb(12,34,56)}</style></head><body><h1>网络内容</h1><a href="/other">no navigation</a><form action="/post"><input value="locked"><button>send</button></form><script>try{window.parent.preview_attack=1}catch{};parent.postMessage({preview_test:true,node:typeof require},"*")</script><iframe src="file:///C:/"></iframe></body></html>');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
  const html=path.join(evidence,'index.html');fs.writeFileSync(html,'<style>body{margin:0;display:flex;height:600px}#mount{width:320px;height:500px}#write{width:450px}.workspace-link-preview[hidden]{display:none!important}</style><section id="mount"></section><article id="write" contenteditable="true"><a href="target.md#target-heading">Local</a><a data-ref="ref">Reference</a></article>');
  win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});await win.loadFile(html);
  const evaluate=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(error){console.error("Renderer input:",code);throw error;}};
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export * from "./src/workspace_zoom";export * from "./src/workspace_link_preview";export * from "./src/workspace_link_target";export * from "./src/workspace_link_selection";export * as monaco from "monaco-editor/editor/editor.api";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await evaluate(bundle.outputFiles[0].text+";void 0;");
  await evaluate(`window.reqnode=require;window.preview_attack=0;window.web_message=null;window.addEventListener("message",e=>{if(e.data?.preview_test)web_message={origin:e.origin,node:e.data.node}});window.opened=[];window.web_opened=[];window.JSBridge={showInBrowser:url=>web_opened.push(url)};window.root=${JSON.stringify(evidence)};window.source=require('path').join(root,'source.md');window.files={fs:require('fs'),path_api:require('path'),current_file:()=>source,editor_state:()=>({file_path:source}),open_file:async(path,location)=>opened.push({path,location})};window.view=qa.create_link_preview(files,{close:()=>view.clear()});document.querySelector('#mount').append(view.container);window.link=href=>view.show({source,href});void 0;`);
  await evaluate(`window.host_zoom=0;window.zoom_binding=qa.bind_workspace_zoom_commands({commands:{register:()=>()=>{}}},{ClientCommand:{zoomIn:()=>host_zoom++,zoomOut:()=>host_zoom--}});void 0;`);
  check('1000轮解析与协议边界',await evaluate(`(()=>{const p=require('path').win32;for(let i=0;i<1000;i++){if(qa.resolve_preview_link(p,'C:\\\\docs\\\\source.md','sub/a%20b.md#标题').path!=='C:\\\\docs\\\\sub\\\\a b.md')return false;}return qa.resolve_preview_link(p,'C:\\\\docs\\\\source.md','#标题').hash==='#标题';})()`));
  await evaluate('link("target.md#target-heading")');
  check('Markdown标题定位并渲染',await evaluate(`view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('.lookup-target-block').textContent.includes('Target heading')`));
  await evaluate(`document.querySelector('#write').style.fontFamily='monospace';document.body.classList.add('qa-selected-theme')`);await new Promise(r=>setTimeout(r,60));
  check('链接及搜索共用阅读器继承当前正文主题字体',await evaluate(`getComputedStyle(view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('#write')).fontFamily===getComputedStyle(document.querySelector('#write')).fontFamily`));
  check('预览没有可编辑区域',await evaluate(`!view.container.querySelector('[contenteditable=true]')&&opened.length===0`));
  await evaluate(`window.scale_slider=view.container.querySelector('[aria-label="预览字号比例"]');scale_slider.value='115';scale_slider.dispatchEvent(new Event('input',{bubbles:true}));`);
  check('链接Markdown滑条比例与文字同步',await evaluate(`view.container.querySelector('.workspace-preview-scale-value').value==='115%'&&view.container.querySelector('.workspace-lookup-preview').dataset.previewScale==='115'`));
  await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,bubbles:true,cancelable:true}))`);
  await new Promise(r=>setTimeout(r,20));check('链接滚轮同步滑条和百分比',await evaluate(`scale_slider.value==='120'&&view.container.querySelector('.workspace-preview-scale-value').value==='120%'`));
  await evaluate(`window.isolated_second=qa.create_link_preview(files);document.body.append(isolated_second.container);isolated_second.show({source,href:'target.md'})`);
  await evaluate(`window.other_scale=isolated_second.container.querySelector('.workspace-lookup-preview').dataset.previewScale;window.main_text=document.querySelector('#write').innerHTML;view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('p').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:120,bubbles:true,composed:true,cancelable:true}))`);await new Promise(r=>setTimeout(r,50));
  check('Shadow内部Ctrl滚轮只修改命中实例',await evaluate(`host_zoom===0&&view.container.querySelector('.workspace-lookup-preview').dataset.previewScale==='115'&&isolated_second.container.querySelector('.workspace-lookup-preview').dataset.previewScale===other_scale&&document.querySelector('#write').innerHTML===main_text`));
  const preview_point=await evaluate(`(()=>{const r=view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('p').getBoundingClientRect();return{x:Math.round(r.left+20),y:Math.round(r.top+8)}})()`);
  win.webContents.sendInputEvent({type:'mouseWheel',...preview_point,deltaY:120,modifiers:['control'],canScroll:true});await new Promise(r=>setTimeout(r,100));
  check('真实Chromium鼠标命中预览而非主窗口',await evaluate(`host_zoom===0&&require('electron').webFrame.getZoomFactor()===1&&view.container.querySelector('.workspace-lookup-preview').dataset.previewScale==='120'&&isolated_second.container.querySelector('.workspace-lookup-preview').dataset.previewScale===other_scale`));
  await evaluate('isolated_second.dispose()');
  await evaluate(`view.container.querySelector('[aria-label="打开源文件"]').click()`);
  check('显式打开源文件保留锚点',await evaluate(`opened.length===1&&opened[0].path.endsWith('target.md')&&opened[0].location.hash==='#target-heading'`));
  fs.writeFileSync(path.join(evidence,'target.md'),'# First\n\n[中文链接](%E4%B8%AD%E6%96%87.md#next) [锚点](#bottom) [引用][ref] [失败](missing.md)\n\n'+Array.from({length:70},(_,i)=>`段落 ${i} 阅读位置保持。\n\n`).join('')+'## Bottom\n\n结尾\n\n[ref]: 中文.md#next');
  fs.writeFileSync(path.join(evidence,'中文.md'),'# Next\n\n[返回](target.md)\n\n'+Array.from({length:70},(_,i)=>`目标 ${i}\n\n`).join(''));
  const idle=async()=>{for(let i=0;i<150;i++){if(await evaluate(`view.container.dataset.state!=='loading'`))return;await new Promise(r=>setTimeout(r,20));}throw Error('preview load timeout');};
  const click_link=async label=>{await evaluate(`[...view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelectorAll('[role=link]')].find(n=>n.textContent===${JSON.stringify(label)}).click()`);await idle();};
  const travel=async key=>{await evaluate(`view.container.querySelector('.workspace-lookup-preview-body,.workspace-preview-directory-scroll').focus()`);win.webContents.sendInputEvent({type:'keyDown',keyCode:key,modifiers:['alt']});win.webContents.sendInputEvent({type:'keyUp',keyCode:key,modifiers:['alt']});await new Promise(r=>setTimeout(r,60));await idle();};
  await evaluate('link("target.md")');
  check('新预览两方向禁用',await evaluate(`[...view.container.querySelectorAll('[aria-label^=预览后退],[aria-label^=预览前进]')].every(n=>n.disabled)`));
  await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').scrollTop=450;window.before_scroll=view.container.querySelector('.workspace-lookup-preview-body').scrollTop;window.before_open_count=opened.length;`);
  await evaluate(`window.preview_link=[...view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelectorAll('[role=link]')].find(n=>n.textContent==='中文链接');window.preview_range=document.createRange();preview_range.selectNodeContents(preview_link);getSelection().removeAllRanges();getSelection().addRange(preview_range);preview_link.click()`);await idle();
  check('选中文字的普通单击不误跳转',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('target.md')`));
  await evaluate(`preview_link.dispatchEvent(new MouseEvent('click',{ctrlKey:true,bubbles:true,composed:true,cancelable:true}))`);await idle();
  check('Ctrl左键兼容且仍只在预览导航',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')&&opened.length===before_open_count`));
  await travel('Left');await evaluate('getSelection().removeAllRanges()');
  await evaluate(`[...view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelectorAll('[role=link]')].find(n=>n.textContent==='中文链接').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,composed:true,cancelable:true,clientX:150,clientY:100}));document.querySelector('[role=menuitem]').click()`);await idle();
  check('右键跳转链接复用当前预览历史',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')&&!document.querySelector('[role=menu]')`));await travel('Left');
  await click_link('中文链接');
  check('预览内部中文相对链接和锚点导航且不打开标签',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')&&opened.length===before_open_count`));
  await travel('Left');
  check('真实Alt左恢复原文件和阅读位置',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('target.md')&&Math.abs(view.container.querySelector('.workspace-lookup-preview-body').scrollTop-before_scroll)<3`));
  await travel('Right');check('真实Alt右恢复目标',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));
  await travel('Left');await click_link('锚点');check('文内标题链接',await evaluate(`view.container.querySelector('.lookup-target-block')===null&&view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('.lookup-target-block').textContent.includes('Bottom')`));
  await travel('Left');await click_link('引用');check('引用式链接沿当前预览文件解析',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));
  await travel('Left');await click_link('失败');check('失败保留旧内容并提供反馈',await evaluate(`view.container.dataset.state==='error'&&view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('target.md')`));
  const click_history=async direction=>{await evaluate(`view.container.querySelector('[aria-label^="${direction<0?'预览后退':'预览前进'}"]').click()`);await idle();};
  for(let i=0;i<20;i++){await click_link('中文链接');check('工具栏后退可用 '+i,await evaluate(`!view.container.querySelector('[aria-label^=预览后退]').disabled&&view.container.querySelector('[aria-label^=预览前进]').disabled`));await click_history(-1);await click_history(1);await click_history(-1);}
  check('20轮链接往返保持只读且没有创建工作区文件',await evaluate(`opened.length===before_open_count&&!view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('[contenteditable=true]')`));
  await evaluate(`link('中文.md')`);check('新选择重置按钮',await evaluate(`view.container.querySelector('[aria-label^=预览后退]').disabled&&view.container.querySelector('[aria-label^=预览前进]').disabled`));await travel('Left');check('外部新选择清空上一会话历史',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));
  await evaluate(`window.second=qa.create_link_preview(files);document.body.append(second.container);second.show({source,href:'target.md'})`);await travel('Right');check('两个预览历史隔离',await evaluate(`second.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('target.md')&&view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));await evaluate('second.dispose()');
  await evaluate(`link('target.md');`);
  check('缩放和文件操作同一行',await evaluate(`(()=>{const scale=view.container.querySelector('.workspace-preview-scale-controls').getBoundingClientRect(),open=view.container.querySelector('[aria-label="打开源文件"]').getBoundingClientRect();return Math.abs(scale.top-open.top)<4&&scale.right<=open.left})()`));
  await evaluate(`document.querySelector('#mount').style.width='170px'`);await new Promise(r=>setTimeout(r,80));
  check('170px单行保留比例与全部导航操作',await evaluate(`(()=>{const t=view.container.querySelector('[role=toolbar]'),b=t.getBoundingClientRect();return [...t.querySelectorAll('input,output,.git-icon-button')].filter(n=>n.getClientRects().length&&getComputedStyle(n).display!=='none').every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1})})()`));
  await evaluate(`document.querySelector('#mount').style.width='320px'`);
  await click_link('中文链接');await travel('Left');await click_link('锚点');await travel('Right');
  check('回退后新跳转截断原前进分支',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('target.md')`));
  await travel('Left');
  await evaluate(`[...view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelectorAll('[role=link]')].find(n=>n.textContent==='中文链接').focus()`);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await new Promise(r=>setTimeout(r,60));await idle();
  check('预览链接支持键盘Enter',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));
  await evaluate(`window.slow_ready=false;window.release_read=null;files.read_text=async file=>{if(file.endsWith('target.md')){slow_ready=true;await new Promise(resolve=>release_read=resolve);}return files.fs.readFileSync(file,'utf8')};window.old_show=link('target.md');void 0`);
  for(let i=0;i<100;i++){if(await evaluate('slow_ready'))break;await new Promise(r=>setTimeout(r,10));}
  await evaluate(`link('中文.md')`);await evaluate(`release_read();old_show`);
  check('新选择取消迟到读取且历史从新目标开始',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));await travel('Left');
  check('迟到结果不会恢复旧历史',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));
  await evaluate('delete files.read_text');


  fs.mkdirSync(path.join(evidence,'目录 空格'));fs.mkdirSync(path.join(evidence,'目录 空格','子目录'));
  fs.writeFileSync(path.join(evidence,'目录 空格','文件 # %25.md'),'# Directory file\n\n[继续](../target.md)\n');
  for(let i=0;i<1000;i++)fs.writeFileSync(path.join(evidence,'目录 空格',`item${i}.md`),'# '+i+'\n');
  const directory_click=async name=>{await evaluate(`[...view.container.querySelectorAll('[data-entry-name]')].find(n=>n.dataset.entryName===${JSON.stringify(name)}).click()`);await idle();};
  const directory_return=async()=>{await evaluate(`view.container.querySelector('.workspace-preview-directory-return').click()`);await idle();await new Promise(r=>setTimeout(r,40));};
  await evaluate(`link('目录%20空格')`);await idle();await new Promise(r=>setTimeout(r,40));
  check('目录无尾斜线进入一层资源列表',await evaluate(`view.container.querySelector('.workspace-preview-directory').dataset.directoryPath.endsWith('目录 空格')`));
  check('目录禁用源文件与缩放',await evaluate(`view.container.querySelector('[aria-label="打开源文件"]').disabled&&view.container.querySelector('.workspace-preview-scale-controls').hidden`));
  check('1000文件只绘制可见行并保留全部高度',await evaluate(`view.container.querySelectorAll('[data-entry-name]').length<60&&view.container.querySelector('.workspace-preview-directory-scroll').scrollHeight>=1002*26`));
  await directory_click('子目录');check('空子目录可返回父目录',await evaluate(`view.container.textContent.includes('此目录为空')&&!view.container.querySelector('.workspace-preview-directory-return').hidden`));await directory_return();
  await evaluate(`window.dir_scroll=view.container.querySelector('.workspace-preview-directory-scroll');dir_scroll.scrollTop=25000;dir_scroll.dispatchEvent(new Event('scroll'));`);await new Promise(r=>setTimeout(r,40));
  await evaluate(`view.container.querySelector('[data-entry-name]').focus()`);win.webContents.sendInputEvent({type:'keyDown',keyCode:'End'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'End'});await new Promise(r=>setTimeout(r,40));
  check('目录键盘End访问最后文件',await evaluate(`document.activeElement.dataset.virtualIndex==='1001'`));
  await evaluate(`(()=>{const names=reqnode('fs').readdirSync(reqnode('path').join(root,'目录 空格'),{withFileTypes:true}).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name,undefined,{numeric:true}));const scroller=view.container.querySelector('.workspace-preview-directory-scroll');scroller.scrollTop=names.findIndex(n=>n.name==='文件 # %25.md')*26;scroller.dispatchEvent(new Event('scroll'));})()`);await new Promise(r=>setTimeout(r,40));
  const dir_top=await evaluate(`view.container.querySelector('.workspace-preview-directory-scroll').scrollTop`);
  await directory_click('文件 # %25.md');
  check('特殊文件名原样预览并保留目录出口',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('文件 # %25.md')&&!view.container.querySelector('.workspace-preview-directory-return').hidden`));
  await evaluate(`view.container.querySelector('[aria-label="打开源文件"]').click()`);await idle();check('打开源文件指向当前目录文件',await evaluate(`opened.at(-1).path.endsWith('文件 # %25.md')`));
  await directory_return();await new Promise(r=>setTimeout(r,40));
  check('返回目录恢复滚动和焦点',Math.abs((await evaluate(`view.container.querySelector('.workspace-preview-directory-scroll').scrollTop`))-dir_top)<3&&await evaluate(`document.activeElement.dataset.entryName==='文件 # %25.md'`));
  for(let i=0;i<20;i++){await directory_click('文件 # %25.md');await directory_return();}
  check('20轮往返维持出口及可视行规模',await evaluate(`view.container.querySelectorAll('[data-entry-name]').length<60`));
  await directory_click('文件 # %25.md');await travel('Left');check('Alt左恢复目录',await evaluate(`!!view.container.querySelector('.workspace-preview-directory')`));await travel('Right');check('Alt右恢复文件及出口',await evaluate(`!!view.container.querySelector('.workspace-lookup-markdown')&&!view.container.querySelector('.workspace-preview-directory-return').hidden`));
  await click_link('继续');check('文件继续跳转仍可返回目录',await evaluate(`view.container.querySelector('.workspace-preview-directory-return').textContent.includes('目录 空格')`));await directory_return();
  await evaluate(`files.fs={...reqnode('fs'),promises:{...reqnode('fs').promises,readdir:async()=>{throw Error('EACCES test')}}};view.container.querySelector('[aria-label="重新加载"]').click()`);await idle();check('目录刷新失败保留列表及反馈',await evaluate(`!!view.container.querySelector('.workspace-preview-directory')&&view.container.textContent.includes('EACCES test')`));
  await evaluate(`files.fs=reqnode('fs');view.container.querySelector('[aria-label="重新加载"]').click()`);await idle();check('目录失败可重试恢复',await evaluate(`view.container.dataset.state==='ready'`));
  await evaluate(`window.release_dir=null;files.fs={...reqnode('fs'),promises:{...reqnode('fs').promises,readdir:async(...args)=>{await new Promise(resolve=>release_dir=resolve);return reqnode('fs').promises.readdir(...args)}}};window.slow_dir=link('目录%20空格');void 0`);
  for(let i=0;i<100;i++){if(await evaluate('!!release_dir'))break;await new Promise(r=>setTimeout(r,10));}
  await evaluate(`link('中文.md')`);await evaluate(`release_dir();slow_dir`);check('迟到目录不能覆盖新选择或恢复出口',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')&&view.container.querySelector('.workspace-preview-directory-return').hidden`));await evaluate(`files.fs=reqnode('fs');void 0`);


  await evaluate(`window.remote_root=require('path').join(root,'virtual_remote');window.remote_calls=[];files.fs={promises:{stat:async path=>{remote_calls.push('stat');return {isDirectory:()=>path===remote_root,isFile:()=>path!==remote_root,size:40}},readdir:async path=>{remote_calls.push('list');if(path!==remote_root)throw Error('wrong remote directory');return [{name:'remote.md',isDirectory:()=>false}]},readFile:async path=>{remote_calls.push('read');return Buffer.from('# Remote provider')}}};files.read_text=async()=> '# Remote provider';view.show({source,href:remote_root.split(require('path').sep).join('/')})`);await new Promise(r=>setTimeout(r,40));
  await directory_click('remote.md');check('目录与文件读取共用异步远端提供者不依赖本地副本',await evaluate(`remote_calls.includes('list')&&remote_calls.includes('read')&&view.container.querySelector('.workspace-lookup-markdown').shadowRoot.textContent.includes('Remote provider')`));await directory_return();
  check('远端提供者文件可回到对应目录',await evaluate(`view.container.querySelector('.workspace-preview-directory').dataset.directoryPath===remote_root`));
  await evaluate(`files.fs=reqnode('fs');delete files.read_text;void 0`);

  await evaluate('link("source.py")');check('源码Monaco只读',await evaluate(`qa.monaco.editor.getEditors().filter(e=>view.container.contains(e.getDomNode())).every(e=>e.getOption(qa.monaco.editor.EditorOption.readOnly))`));
  await evaluate(`scale_slider.value='95';scale_slider.dispatchEvent(new Event('input',{bubbles:true}));`);
  check('源码预览滑条同步真实编辑器',await evaluate(`view.container.querySelector('.workspace-preview-scale-value').value==='95%'&&view.container.querySelector('.workspace-lookup-preview').dataset.previewScale==='95'`));
  fs.writeFileSync(path.join(evidence,'web_entry.md'),'# 网页入口\n\n[网页]('+url+'/redirect)');await evaluate(`link('web_entry.md')`);await click_link('网页');await click_history(-1);check('网页入口可由按钮返回Markdown',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('web_entry.md')`));await click_history(1);
  for(let i=0;i<100;i++){if(await evaluate('!!web_message'))break;await new Promise(r=>setTimeout(r,20));}
  check('真实网页脚本在opaque沙箱执行且没有Node',await evaluate(`web_message?.origin==='null'&&web_message.node==='undefined'`));
  check('网页不展示不生效的文字比例控件',await evaluate(`view.container.querySelector('.workspace-preview-scale-controls').hidden`));
  check('真实URL经Chromium加载而非HTML快照',await evaluate(`view.container.querySelector('iframe').src.endsWith('/redirect')&&!view.container.querySelector('iframe').srcdoc`));
  check('网页可运行布局脚本但无同源及宿主权限',await evaluate(`view.container.querySelector('iframe').getAttribute('sandbox')==='allow-scripts'&&preview_attack===0`));
  check('文件与关闭图标保持快捷操作和可访问名称',await evaluate(`view.container.querySelectorAll('[role=toolbar]>.git-icon-button svg').length===5&&[...view.container.querySelectorAll('[role=toolbar] button')].every(n=>!n.textContent&&n.getAttribute('aria-label'))`));
  check('失败与被拒绝内嵌均有浏览器入口',await evaluate(`view.container.textContent.includes('浏览器')&&!!view.container.querySelector('[aria-label="在默认浏览器打开"]')`));
  await evaluate(`window.web_unhandled=0;window.on_web_unhandled=()=>web_unhandled++;window.addEventListener('unhandledrejection',on_web_unhandled);window.original_browser=JSBridge.showInBrowser;JSBridge.showInBrowser=async()=>{throw Error('browser-open-test')};view.container.querySelector('[aria-label="在默认浏览器打开"]').click();`);await new Promise(r=>setTimeout(r,50));
  check('默认浏览器启动失败由预览捕获不产生全局错误',await evaluate(`view.container.dataset.state==='error'&&view.container.textContent.includes('browser-open-test')&&web_unhandled===0`));
  await evaluate(`JSBridge.showInBrowser=original_browser;window.removeEventListener('unhandledrejection',on_web_unhandled);`);
  await evaluate(`window.web_before=document.querySelector('#write').innerHTML;window.detached_frame=view.container.querySelector('iframe');detached_frame.dispatchEvent(new Event('error'));`);
  check('网页错误只显示在所属预览且正文不变',await evaluate(`view.container.querySelector('.workspace-link-web-status').textContent.includes('加载失败')&&detached_frame.dataset.loadState==='error'&&document.querySelector('#write').innerHTML===web_before&&web_opened.length===0`));
  await evaluate(`link('target.md')`);
  check('离开网页清理回调和旧frame',await evaluate(`!detached_frame.isConnected&&detached_frame.onload===null&&detached_frame.onerror===null`));
  await evaluate(`[...view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelectorAll('[role=link]')][0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,composed:true,cancelable:true}));link('中文.md')`);
  check('新目标取消旧链接菜单',await evaluate(`!document.querySelector('[role=menu]')`));
  for(const endpoint of ['/denied','/bad']){
    await evaluate(`link(${JSON.stringify(url)}+${JSON.stringify(endpoint)})`);await new Promise(r=>setTimeout(r,100));
    check('真实HTTP '+endpoint+'响应留在沙箱且无正文回退',await evaluate(`!!view.container.querySelector('iframe')&&view.container.querySelector('iframe').src.endsWith(${JSON.stringify(endpoint)})&&document.querySelector('#write').innerHTML===web_before&&web_opened.length===0&&view.container.textContent.includes('浏览器')`));
  }
  await evaluate(`link(${JSON.stringify(url+'/slow')});link('target.md')`);await new Promise(r=>setTimeout(r,600));check('迟到网页不覆盖新目标',await evaluate(`!view.container.querySelector('iframe')&&view.container.querySelector('.workspace-lookup-markdown')!==null`));
  await evaluate(`link('javascript:alert(1)')`);check('拒绝执行协议',await evaluate(`view.container.dataset.state==='error'`));
  await evaluate(`window.commands=[];window.callbacks=new Map();window.leaves=[];window.previews=[];window.is_visible=true;window.File={editor:{nodeMap:{link_list:{getHrefByRef:()=> 'target.md'}}}};window.core={Notice:class{},WorkspaceView:class{constructor(leaf){this.leaf=leaf}},app:{workspace:{activeLeaf:{},eachLeaves:cb=>leaves.forEach(leaf=>{cb(leaf)})},commands:{run:(id,args)=>commands.push({id,args})},viewManager:{registerView:(id,fn)=>{callbacks.set(id,fn);return()=>callbacks.delete(id)}}}};window.binding=qa.bind_workspace_link_selection(core,files,()=>is_visible,r=>previews.push(r));window.select_link=()=>{const a=document.querySelector('#write a'),range=document.createRange();range.selectNodeContents(a);const s=getSelection();s.removeAllRanges();s.addRange(range);};select_link();`);
  await new Promise(r=>setTimeout(r,160));check('自动预览启用时收到选择',await evaluate(`previews.length===1&&previews[0].href==='target.md#target-heading'`));
  await evaluate(`document.dispatchEvent(new Event('selectionchange'))`);await new Promise(r=>setTimeout(r,160));check('同链接选择去重',await evaluate('previews.length===1'));
  for(const direction of ['right','down']){
    await evaluate(`document.querySelector('#write a').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:60}));[...document.querySelectorAll('[role=menuitem]')].find(n=>n.textContent.includes('${direction==='right'?'左右':'上下'}')).click();`);
    check('分屏命令 '+direction,await evaluate(`commands.at(-1).id==='core.workspace:split-${direction}'`));
  }
  await evaluate('is_visible=false;binding.reset();select_link()');await new Promise(r=>setTimeout(r,160));check('关闭自动预览不加载',await evaluate('previews.length===1'));
  for(let i=0;i<20;i++)await evaluate(`(()=>{const uri=commands.at(-1).args[0],leaf={state:{path:uri},parent:{removeTab(){}}};const v=callbacks.get('linux_note.link_preview')(leaf);leaf.view=v;leaves.push(leaf);document.body.append(v.containerEl);v.onOpen();leaves.pop();v.onClose();v.containerEl.remove();})()`);
  await evaluate('binding.dispose();view.dispose();zoom_binding.dispose()');check('销毁释放视图注册和Monaco',await evaluate(`callbacks.size===0&&qa.monaco.editor.getEditors().length===0`));
  fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks,split_cycles:20},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));
}).catch(error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(evidence,'error.txt'),String(error.stack));}).finally(()=>{win?.destroy();server?.close();app.exit(process.exitCode||0);});
