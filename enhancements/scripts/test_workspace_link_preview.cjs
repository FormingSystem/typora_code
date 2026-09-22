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
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><style>h1{color:rgb(12,34,56)}</style></head><body><h1>网络内容</h1><a href="/other">no navigation</a><form action="/post"><input value="locked"><button>send</button></form><script>window.parent.preview_attack=1</script><iframe src="file:///C:/"></iframe></body></html>');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
  const html=path.join(evidence,'index.html');fs.writeFileSync(html,'<style>body{margin:0;display:flex;height:600px}#mount{width:320px;height:500px}#write{width:450px}.workspace-link-preview[hidden]{display:none!important}</style><section id="mount"></section><article id="write" contenteditable="true"><a href="target.md#target-heading">Local</a><a data-ref="ref">Reference</a></article>');
  win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false}});await win.loadFile(html);
  const evaluate=code=>win.webContents.executeJavaScript(code,true);
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export * from "./src/workspace_link_preview";export * from "./src/workspace_link_target";export * from "./src/workspace_link_selection";export * as monaco from "monaco-editor/editor/editor.api";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'qa',write:false});await evaluate(bundle.outputFiles[0].text+";void 0;");
  await evaluate(`window.reqnode=require;window.preview_attack=0;window.opened=[];window.web_opened=[];window.JSBridge={showInBrowser:url=>web_opened.push(url)};window.root=${JSON.stringify(evidence)};window.source=require('path').join(root,'source.md');window.files={fs:require('fs'),path_api:require('path'),current_file:()=>source,editor_state:()=>({file_path:source}),open_file:async(path,location)=>opened.push({path,location})};window.view=qa.create_link_preview(files);document.querySelector('#mount').append(view.container);window.link=href=>view.show({source,href});void 0;`);
  check('1000轮解析与协议边界',await evaluate(`(()=>{const p=require('path').win32;for(let i=0;i<1000;i++){if(qa.resolve_preview_link(p,'C:\\\\docs\\\\source.md','sub/a%20b.md#标题').path!=='C:\\\\docs\\\\sub\\\\a b.md')return false;}return qa.resolve_preview_link(p,'C:\\\\docs\\\\source.md','#标题').hash==='#标题';})()`));
  await evaluate('link("target.md#target-heading")');
  check('Markdown标题定位并渲染',await evaluate(`view.container.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('.lookup-target-block').textContent.includes('Target heading')`));
  check('预览没有可编辑区域',await evaluate(`!view.container.querySelector('[contenteditable=true]')&&opened.length===0`));
  await evaluate(`view.container.querySelector('button').click()`);
  check('显式打开源文件保留锚点',await evaluate(`opened.length===1&&opened[0].path.endsWith('target.md')&&opened[0].location.hash==='#target-heading'`));
  await evaluate('link("source.py")');check('源码Monaco只读',await evaluate(`qa.monaco.editor.getEditors().filter(e=>view.container.contains(e.getDomNode())).every(e=>e.getOption(qa.monaco.editor.EditorOption.readOnly))`));
  await evaluate(`link(${JSON.stringify(url+'/redirect')})`);
  check('HTTP重定向获取真实网页',await evaluate(`view.container.querySelector('iframe').srcdoc.includes('网络内容')`));
  check('网页沙箱无脚本同源权限',await evaluate(`view.container.querySelector('iframe').getAttribute('sandbox')===''&&preview_attack===0`));
  check('危险节点及交互属性清理',await evaluate(`(()=>{const d=new DOMParser().parseFromString(view.container.querySelector('iframe').srcdoc,'text/html');return !d.querySelector('script,iframe,form,a[href]')&&d.querySelector('input').disabled&&d.querySelector('style').textContent.includes('12,34,56');})()`));
  await evaluate(`link(${JSON.stringify(url+'/bad')})`);check('失败可见且可重试',await evaluate(`view.container.dataset.state==='error'&&view.container.textContent.includes('503')&&[...view.container.querySelectorAll('button')].some(n=>n.textContent==='重新加载')`));
  await evaluate(`link(${JSON.stringify(url+'/large')})`);check('网页大小上限',await evaluate(`view.container.textContent.includes('2 MiB')`));
  await evaluate(`link(${JSON.stringify(url+'/slow')});link('target.md')`);await new Promise(r=>setTimeout(r,600));check('迟到网页不覆盖新目标',await evaluate(`!view.container.querySelector('iframe')&&view.container.querySelector('.workspace-lookup-markdown')!==null`));
  await evaluate(`link('javascript:alert(1)')`);check('拒绝执行协议',await evaluate(`view.container.dataset.state==='error'`));
  await evaluate(`window.commands=[];window.callbacks=new Map();window.leaves=[];window.previews=[];window.is_visible=true;window.File={editor:{nodeMap:{link_list:{getHrefByRef:()=> 'target.md'}}}};window.core={Notice:class{},WorkspaceView:class{constructor(leaf){this.leaf=leaf}},app:{workspace:{activeLeaf:{},eachLeaves:cb=>leaves.forEach(leaf=>{cb(leaf)})},commands:{run:(id,args)=>commands.push({id,args})},viewManager:{registerView:(id,fn)=>{callbacks.set(id,fn);return()=>callbacks.delete(id)}}}};window.binding=qa.bind_workspace_link_selection(core,files,()=>is_visible,r=>previews.push(r));window.select_link=()=>{const a=document.querySelector('#write a'),range=document.createRange();range.selectNodeContents(a);const s=getSelection();s.removeAllRanges();s.addRange(range);};select_link();`);
  await new Promise(r=>setTimeout(r,160));check('可见搜索侧栏收到选择',await evaluate(`previews.length===1&&previews[0].href==='target.md#target-heading'`));
  await evaluate(`document.dispatchEvent(new Event('selectionchange'))`);await new Promise(r=>setTimeout(r,160));check('同链接选择去重',await evaluate('previews.length===1'));
  for(const direction of ['right','down']){
    await evaluate(`document.querySelector('#write a').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:60}));[...document.querySelectorAll('[role=menuitem]')].find(n=>n.textContent.includes('${direction==='right'?'左右':'上下'}')).click();`);
    check('分屏命令 '+direction,await evaluate(`commands.at(-1).id==='core.workspace:split-${direction}'`));
  }
  await evaluate('is_visible=false;binding.reset();select_link()');await new Promise(r=>setTimeout(r,160));check('隐藏侧栏不加载',await evaluate('previews.length===1'));
  for(let i=0;i<20;i++)await evaluate(`(()=>{const uri=commands.at(-1).args[0],leaf={state:{path:uri},parent:{removeTab(){}}};const v=callbacks.get('linux_note.link_preview')(leaf);leaf.view=v;leaves.push(leaf);document.body.append(v.containerEl);v.onOpen();leaves.pop();v.onClose();v.containerEl.remove();})()`);
  await evaluate('binding.dispose();view.dispose()');check('销毁释放视图注册和Monaco',await evaluate(`callbacks.size===0&&qa.monaco.editor.getEditors().length===0`));
  fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks,split_cycles:20},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));
}).catch(error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(evidence,'error.txt'),String(error.stack));}).finally(()=>{win?.destroy();server?.close();app.exit(process.exitCode||0);});
