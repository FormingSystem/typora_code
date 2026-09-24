// 原始宿主生产预览：真实回环网页与用户提供的公开GitHub页面。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),http=reqnode('http'),base=__CASE_ROOT__,checks=[],live={};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const wait=async(fn,label,limit=200)=>{for(let i=0;i<limit;i++){if(fn())return;await pause(50);}throw Error(label);};
 let server,tls_server,cross_server,cross_address,sockets=new Set();
 try{
  server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.setHeader('X-Frame-Options','DENY');response.setHeader('Content-Security-Policy',"frame-ancestors 'none'");
   if(request.url==='/redirect'){response.writeHead(302,{Location:'/page'});response.end();return;}
   if(request.url==='/bad'){response.writeHead(503);response.end('<h1>unavailable</h1>');return;}
   if(request.url==='/slow'){setTimeout(()=>response.end('<h1>slow</h1>'),1200);return;}
   if(request.url==='/next'){response.end('<h1>Next</h1>');return;}
   if(request.url?.startsWith('/form')){response.end('<h1>Form accepted</h1>');return;}
   response.end('<a id="cross" href="'+cross_address+'/next">Cross origin</a><h1>Browser preview</h1><a id="next" href="/next">Next</a><form action="/form"><input name="q" value="test"><button>Go</button></form><script>localStorage.setItem("browser-preview-test","ok");document.cookie="test=ok";<\/script>');
  });server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  cross_server=http.createServer(server.listeners('request')[0]);cross_server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise(resolve=>cross_server.listen(0,'127.0.0.1',resolve));cross_address='http://127.0.0.1:'+cross_server.address().port;
  tls_server=reqnode('https').createServer({key:fs.readFileSync(path.join(base,'network_tls/test_server_key.pem')),cert:fs.readFileSync(path.join(base,'network_tls/test_server.pem'))},(_request,response)=>response.end('untrusted'));tls_server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise(resolve=>tls_server.listen(0,'127.0.0.1',resolve));
  const address='http://127.0.0.1:'+server.address().port,source=path.join(base,'workspace/web.md');
  const markdown=['# Browser','[网页]('+address+'/redirect)','[故障]('+address+'/bad)','[缓慢]('+address+'/slow)','[GitHub](https://github.com/FormingSystem/typora_code)','[TLS](https://localhost:'+tls_server.address().port+')'].join('\n\n');
  fs.writeFileSync(source,markdown);await pause(1600);await files.open_file(source);await wait(()=>document.querySelector('#write a[href]'),'no links');await pause(300);
  const leaf=core.app.workspace.activeLeaf,before=fs.readFileSync(source,'utf8');
  const pick=index=>{const link=document.querySelectorAll('#write a[href]')[index];link.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0}));const range=document.createRange();range.selectNodeContents(link);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));};
  const dock=()=>document.querySelector('.workspace-link-dock'),panel=()=>dock().querySelector('.workspace-link-preview'),guest=()=>panel()?.querySelector('webview');
  pick(0);await wait(()=>guest()?.dataset.loadState==='loaded','guest not loaded');
  assert(!panel().querySelector('iframe'),'生产预览使用独立guest');
  let view=guest();const safety=await view.executeJavaScript('({heading:document.querySelector("h1").textContent,node:typeof require,process:typeof process,bridge:typeof JSBridge,storage:localStorage.getItem("browser-preview-test"),cookie:document.cookie,popup:window.open("about:blank")===null})');
  assert(safety.heading==='Browser preview','拒绝iframe页面仍可正常显示');assert(safety.node==='undefined'&&safety.process==='undefined'&&safety.bridge==='undefined','网页无Node和宿主接口');assert(safety.storage==='ok'&&safety.cookie.includes('test=ok'),'脚本与独立网页存储可用');assert(safety.popup,'网页不能创建弹出窗口');assert(view.getAttribute('partition')==='typora-code-web-preview','网页会话隔离');
  assert(getComputedStyle(view).display==='flex'&&view.getBoundingClientRect().height>30,'网页实际可见且使用flex布局');
  assert(panel().querySelector('.workspace-link-web-status').hidden,'成功后收起加载提示');
  await view.executeJavaScript('document.querySelector("#next").click()',true);await wait(()=>view.getURL().endsWith('/next')&&view.dataset.loadState==='loaded','next failed');
  live.navigation={can_go_back_type:typeof view.canGoBack,url:view.getURL(),panel_state:panel().dataset.state};try{live.navigation.can_go_back=view.canGoBack();}catch(error){live.navigation.error=String(error);}await wait(()=>!panel().querySelector('[aria-label="预览后退 (Alt+←)"]').disabled,'back disabled').catch(async error=>{live.navigation.late_back=view.canGoBack();live.navigation.history=await view.executeJavaScript('history.length');throw error;});panel().querySelector('[aria-label="预览后退 (Alt+←)"]').click();await wait(()=>view.getURL().endsWith('/page')&&view.dataset.loadState==='loaded','back failed');assert(true,'按钮返回网页内部上一页');
  panel().querySelector('[aria-label="预览前进 (Alt+→)"]').click();await wait(()=>view.getURL().endsWith('/next')&&view.dataset.loadState==='loaded','forward failed');assert(true,'按钮前进网页内部下一页');
  panel().querySelector('[aria-label="重新加载"]').click();await pause(100);await wait(()=>view.dataset.loadState==='loaded','reload failed');assert(view.getURL().endsWith('/next'),'刷新当前网页而非原入口');
  panel().querySelector('[aria-label="预览后退 (Alt+←)"]').click();await wait(()=>view.getURL().endsWith('/page')&&view.dataset.loadState==='loaded','form source');await view.executeJavaScript('document.querySelector("form").requestSubmit()',true);await wait(()=>view.getURL().includes('/form?'),'form failed');assert(true,'网页表单提交可用');
  panel().querySelector('[aria-label="预览后退 (Alt+←)"]').click();await wait(()=>view.getURL()===address+'/page'&&view.dataset.loadState==='loaded','cross source');await view.executeJavaScript('document.querySelector("#cross").click()',true);await wait(()=>view.getURL()===cross_address+'/next'&&view.dataset.loadState==='loaded','cross load');panel().querySelector('[aria-label="预览后退 (Alt+←)"]').click();await wait(()=>view.getURL()===address+'/page'&&view.dataset.loadState==='loaded','cross back');panel().querySelector('[aria-label="预览前进 (Alt+→)"]').click();await wait(()=>view.getURL()===cross_address+'/next'&&view.dataset.loadState==='loaded','cross forward');assert(true,'跨来源网页前后导航');
  pick(1);await wait(()=>guest()?.dataset.loadState==='error','HTTP error missing');assert(panel().textContent.includes('503'),'HTTP错误明确反馈');
  pick(4);await wait(()=>guest()?.getAttribute('src')?.startsWith('https://localhost:')&&guest()?.dataset.loadState==='error','untrusted TLS was not rejected');live.tls_error=panel().querySelector('.workspace-link-web-status').textContent;assert(panel().textContent.includes('ERR_CERT'),'保留TLS证书校验且明确反馈');
  for(let i=0;i<20;i++){pick(0);await wait(()=>guest()?.dataset.loadState==='loaded','cycle load '+i);const old=guest(),status=panel().querySelector('.workspace-link-web-status');panel().querySelector('[aria-label="关闭链接预览"]').click();await wait(()=>dock().hidden,'close '+i);old.dispatchEvent(new Event('did-finish-load'));assert(!old.isConnected&&!document.querySelector('.workspace-link-dock webview'),'关闭清理guest '+i);}
  pick(2);await wait(()=>!!guest(),'slow missing');panel().querySelector('[aria-label="关闭链接预览"]').click();await pause(1500);assert(dock().hidden&&!dock().querySelector('webview'),'迟到加载不恢复已关闭窗口');
  pick(3);await wait(()=>!!guest(),'github missing');const github=guest();await wait(()=>['loaded','error'].includes(github.dataset.loadState),'github timed out',650).catch(error=>live.wait_error=String(error));
  live.state=github.dataset.loadState;live.message=panel().querySelector('.workspace-link-web-status').textContent;live.url=github.getURL();if(live.state==='loaded'){live.title=await github.executeJavaScript('document.title');live.text=await github.executeJavaScript('document.body.innerText.slice(0,250)');assert(live.title.includes('GitHub'),'用户GitHub页面真实显示');}
  assert(core.app.workspace.activeLeaf===leaf&&fs.readFileSync(source,'utf8')===before&&!File.changeCounter.isDocumentEdited(),'网页浏览不切主文件或修改正文');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,live,scope:'原始Typora真实guest、回环HTTP与公开GitHub；非物理键鼠'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,live},null,2));}
 finally{for(const socket of sockets)socket.destroy();server?.close();tls_server?.close();cross_server?.close();}
})();
