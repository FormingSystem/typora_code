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
    if(req.url==='/bad'){res.writeHead(503);res.end();return;}
    if(req.url==='/large'){res.setHeader('Content-Type','text/html');res.end('x'.repeat(2*1024*1024+1));return;}
    if(req.url==='/slow'){setTimeout(()=>{res.setHeader('Content-Type','text/html');res.end('<p>OLD SLOW</p>');},450);return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><style>h1{color:rgb(12,34,56)}</style></head><body><h1>网络内容</h1><a href="/other">no navigation</a><form action="/post"><input value="locked"><button>send</button></form><script>try{window.parent.preview_attack=1}catch{};parent.postMessage({preview_test:true,node:typeof require},"*")</script><iframe src="file:///C:/"></iframe></body></html>');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
  const html=path.join(evidence,'index.html');fs.writeFileSync(html,'<style>body{margin:0;display:flex;height:600px}#mount{width:320px;height:500px}#write{width:450px}.workspace-link-preview[hidden]{display:none!important}</style><section id="mount"></section><article id="write" contenteditable="true"><a href="target.md#target-heading">Local</a><a data-ref="ref">Reference</a></article>');
  win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});await win.loadFile(html);
  const evaluate=code=>win.webContents.executeJavaScript(code,true);
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export * from "./src/workspace_link_preview";export * from "./src/workspace_link_target";export * from "./src/workspace_link_selection";export * as monaco from "monaco-editor/editor/editor.api";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await evaluate(bundle.outputFiles[0].text+";void 0;");
  await evaluate(`window.reqnode=require;window.preview_attack=0;window.web_message=null;window.addEventListener("message",e=>{if(e.data?.preview_test)web_message={origin:e.origin,node:e.data.node}});window.opened=[];window.web_opened=[];window.JSBridge={showInBrowser:url=>web_opened.push(url)};window.root=${JSON.stringify(evidence)};window.source=require('path').join(root,'source.md');window.files={fs:require('fs'),path_api:require('path'),current_file:()=>source,editor_state:()=>({file_path:source}),open_file:async(path,location)=>opened.push({path,location})};window.view=qa.create_link_preview(files,{close:()=>view.clear()});document.querySelector('#mount').append(view.container);window.link=href=>view.show({source,href});void 0;`);
  check('1000轮解析与协议边界',await evaluate(`(()=>{const p=require('path').win32;for(let i=0;i<1000;i++){if(qa.resolve_preview_link(p,'C:\\\\docs\\\\source.md','sub/a%20b.md#标题').path!=='C:\\\\docs\\\\sub\\\\a b.md')return false;}return qa.resolve_preview_link(p,'C:\\\\docs\\\\source.md','#标题').hash==='#标题';})()`));
  await evaluate('link("target.md#target-heading")');
  check('Markdown标题定位并渲染',await evaluate(`view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('.lookup-target-block').textContent.includes('Target heading')`));
  check('预览没有可编辑区域',await evaluate(`!view.container.querySelector('[contenteditable=true]')&&opened.length===0`));
  await evaluate(`window.scale_slider=view.container.querySelector('[aria-label="预览字号比例"]');scale_slider.value='115';scale_slider.dispatchEvent(new Event('input',{bubbles:true}));`);
  check('链接Markdown滑条比例与文字同步',await evaluate(`view.container.querySelector('.workspace-preview-scale-value').value==='115%'&&view.container.querySelector('.workspace-lookup-preview').dataset.previewScale==='115'`));
  await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,bubbles:true,cancelable:true}))`);
  await new Promise(r=>setTimeout(r,20));check('链接滚轮同步滑条和百分比',await evaluate(`scale_slider.value==='120'&&view.container.querySelector('.workspace-preview-scale-value').value==='120%'`));
  await evaluate(`view.container.querySelector('[aria-label="打开源文件"]').click()`);
  check('显式打开源文件保留锚点',await evaluate(`opened.length===1&&opened[0].path.endsWith('target.md')&&opened[0].location.hash==='#target-heading'`));
  fs.writeFileSync(path.join(evidence,'target.md'),'# First\n\n[中文链接](%E4%B8%AD%E6%96%87.md#next) [锚点](#bottom) [引用][ref] [失败](missing.md)\n\n'+Array.from({length:70},(_,i)=>`段落 ${i} 阅读位置保持。\n\n`).join('')+'## Bottom\n\n结尾\n\n[ref]: 中文.md#next');
  fs.writeFileSync(path.join(evidence,'中文.md'),'# Next\n\n[返回](target.md)\n\n'+Array.from({length:70},(_,i)=>`目标 ${i}\n\n`).join(''));
  const idle=async()=>{for(let i=0;i<150;i++){if(await evaluate(`view.container.dataset.state!=='loading'`))return;await new Promise(r=>setTimeout(r,20));}throw Error('preview load timeout');};
  const click_link=async label=>{await evaluate(`[...view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelectorAll('[role=link]')].find(n=>n.textContent===${JSON.stringify(label)}).click()`);await idle();};
  const travel=async key=>{await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').focus()`);win.webContents.sendInputEvent({type:'keyDown',keyCode:key,modifiers:['alt']});win.webContents.sendInputEvent({type:'keyUp',keyCode:key,modifiers:['alt']});await new Promise(r=>setTimeout(r,60));await idle();};
  await evaluate('link("target.md")');
  await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').scrollTop=450;window.before_scroll=view.container.querySelector('.workspace-lookup-preview-body').scrollTop;window.before_open_count=opened.length;`);
  await click_link('中文链接');
  check('预览内部中文相对链接和锚点导航且不打开标签',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')&&opened.length===before_open_count`));
  await travel('Left');
  check('真实Alt左恢复原文件和阅读位置',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('target.md')&&Math.abs(view.container.querySelector('.workspace-lookup-preview-body').scrollTop-before_scroll)<3`));
  await travel('Right');check('真实Alt右恢复目标',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));
  await travel('Left');await click_link('锚点');check('文内标题链接',await evaluate(`view.container.querySelector('.lookup-target-block')===null&&view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('.lookup-target-block').textContent.includes('Bottom')`));
  await travel('Left');await click_link('引用');check('引用式链接沿当前预览文件解析',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));
  await travel('Left');await click_link('失败');check('失败保留旧内容并提供反馈',await evaluate(`view.container.dataset.state==='error'&&view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('target.md')`));
  for(let i=0;i<20;i++){await click_link('中文链接');await travel('Left');}
  check('20轮链接往返保持只读且没有创建工作区文件',await evaluate(`opened.length===before_open_count&&!view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('[contenteditable=true]')`));
  await evaluate(`link('中文.md')`);await travel('Left');check('外部新选择清空上一会话历史',await evaluate(`view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));
  await evaluate(`window.second=qa.create_link_preview(files);document.body.append(second.container);second.show({source,href:'target.md'})`);await travel('Right');check('两个预览历史隔离',await evaluate(`second.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('target.md')&&view.container.querySelector('.workspace-lookup-preview-body').dataset.previewPath.endsWith('中文.md')`));await evaluate('second.dispose()');
  await evaluate(`link('target.md');`);
  check('缩放和文件操作同一行',await evaluate(`(()=>{const scale=view.container.querySelector('.workspace-preview-scale-controls').getBoundingClientRect(),open=view.container.querySelector('[aria-label="打开源文件"]').getBoundingClientRect();return Math.abs(scale.top-open.top)<4&&scale.right<=open.left})()`));
  await evaluate(`document.querySelector('#mount').style.width='170px'`);await new Promise(r=>setTimeout(r,80));
  check('170px单行保留滑条比例与文件操作',await evaluate(`(()=>{const t=view.container.querySelector('[role=toolbar]'),b=t.getBoundingClientRect();return [...t.querySelectorAll('input,output,.git-icon-button')].filter(n=>n.getClientRects().length&&getComputedStyle(n).display!=='none').every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1})})()`));
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

  await evaluate('link("source.py")');check('源码Monaco只读',await evaluate(`qa.monaco.editor.getEditors().filter(e=>view.container.contains(e.getDomNode())).every(e=>e.getOption(qa.monaco.editor.EditorOption.readOnly))`));
  await evaluate(`scale_slider.value='95';scale_slider.dispatchEvent(new Event('input',{bubbles:true}));`);
  check('源码预览滑条同步真实编辑器',await evaluate(`view.container.querySelector('.workspace-preview-scale-value').value==='95%'&&view.container.querySelector('.workspace-lookup-preview').dataset.previewScale==='95'`));
  await evaluate(`link(${JSON.stringify(url+'/redirect')})`);
  for(let i=0;i<100;i++){if(await evaluate('!!web_message'))break;await new Promise(r=>setTimeout(r,20));}
  check('真实网页脚本在opaque沙箱执行且没有Node',await evaluate(`web_message?.origin==='null'&&web_message.node==='undefined'`));
  check('网页不展示不生效的文字比例控件',await evaluate(`view.container.querySelector('.workspace-preview-scale-controls').hidden`));
  check('真实URL经Chromium加载而非HTML快照',await evaluate(`view.container.querySelector('iframe').src.endsWith('/redirect')&&!view.container.querySelector('iframe').srcdoc`));
  check('网页可运行布局脚本但无同源及宿主权限',await evaluate(`view.container.querySelector('iframe').getAttribute('sandbox')==='allow-scripts'&&preview_attack===0`));
  check('文件与关闭图标保持快捷操作和可访问名称',await evaluate(`view.container.querySelectorAll('[role=toolbar]>.git-icon-button svg').length===3&&[...view.container.querySelectorAll('[role=toolbar] button')].every(n=>!n.textContent&&n.getAttribute('aria-label'))`));
  check('失败与被拒绝内嵌均有浏览器入口',await evaluate(`view.container.textContent.includes('浏览器')&&!!view.container.querySelector('[aria-label="在默认浏览器打开"]')`));
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
  await evaluate('binding.dispose();view.dispose()');check('销毁释放视图注册和Monaco',await evaluate(`callbacks.size===0&&qa.monaco.editor.getEditors().length===0`));
  fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks,split_cycles:20},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));
}).catch(error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(evidence,'error.txt'),String(error.stack));}).finally(()=>{win?.destroy();server?.close();app.exit(process.exitCode||0);});
