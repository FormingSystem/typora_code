// 企业CA/代理配置与宿主Node真实请求；只访问独立回环服务器。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),https=reqnode('https'),http=reqnode('http'),net=reqnode('net'),base=__CASE_ROOT__,checks=[];
 const app=window[Symbol.for('typora-code:workspace')].app,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const fixture=path.join(base,'network_tls'),ca_file=path.join(fixture,'test_ca.pem'),sockets=new Set(),servers=[];
 const track=server=>{servers.push(server);server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});return server;};
 const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
 try{
  await pause(2000);app.commands.run('typora_code:settings');await pause(150);
  const change=(key,value)=>{const input=document.querySelector('[data-setting="network.'+key+'"]');assert(!!input,'网络设置存在 '+key);input.value=value;input.dispatchEvent(new Event('change'));};
  const read=()=>app.settings.get('workspace_network');
  const picker=document.querySelector('[data-setting="network.ca_file"]').closest('.workspace-setting-row').querySelector('input[type=file]');assert(!!picker&&picker.accept.includes('.cer'),'证书使用系统文件选择控件');picker.dispatchEvent(new Event('change'));assert(!read(),'取消选择不写配置');
  change('https_proxy_url','http://user:secret@localhost:1234');assert(!read(),'含密码代理拒绝保存');
  change('ca_file',path.join(base,'missing.pem'));assert(!read(),'无效CA不覆盖旧设置');
  change('ca_file',ca_file);assert(read().ca_file===ca_file,'企业CA路径保存');
  const origin=track(https.createServer({key:fs.readFileSync(path.join(fixture,'test_server_key.pem')),cert:fs.readFileSync(path.join(fixture,'test_server.pem'))},(_req,res)=>res.end('native TLS')));await listen(origin);
  const proxy=track(http.createServer());proxy.on('connect',(req,client,head)=>{assert(req.url==='api.github.com:443','真实代理收到GitHub CONNECT');const upstream=net.connect(origin.address().port,'127.0.0.1',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});client.on('end',()=>client.destroy());client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());upstream.on('error',()=>client.destroy());});const port=await listen(proxy);
  const plain_origin=track(http.createServer((_req,res)=>res.end('native HTTP')));await listen(plain_origin);let forwards=0;
  const forward_proxy=track(http.createServer((req,res)=>{forwards++;const target=new URL(req.url);assert(target.protocol==='http:','HTTP代理收到完整目标URL');const upstream=http.get({agent:false,hostname:'127.0.0.1',port:plain_origin.address().port,path:target.pathname},response=>response.pipe(res));upstream.on('error',error=>res.destroy(error));}));const forward_port=await listen(forward_proxy);
  // 模拟升级前的持久化配置，重开设置必须即时呈现两个迁移字段。
  app.settings.set_and_save('workspace_network',{proxy_mode:'manual',proxy_url:'http://127.0.0.1:'+port,ca_file});
  document.querySelector('.workspace-settings-modal .workspace-dialog-close')?.click();await pause(80);assert(!document.querySelector('.workspace-settings-modal'),'关闭释放旧设置表单');app.commands.run('typora_code:settings');await pause(80);
  for(const key of ['http_proxy_url','https_proxy_url'])assert(document.querySelector('[data-setting="network.'+key+'"]').value==='http://127.0.0.1:'+port,'旧地址呈现在 '+key);
  change('http_proxy_url','http://127.0.0.1:'+forward_port);assert(!('proxy_url' in read())&&read().https_proxy_url==='http://127.0.0.1:'+port,'修改HTTP单独保存并移除旧键，HTTPS不变');
  const saved=JSON.stringify(read());change('https_proxy_url','socks5://localhost:1');assert(JSON.stringify(read())===saved,'HTTPS地址保存失败保持两个字段');

  change('https_proxy_url','http://127.0.0.1:'+port);change('proxy_mode','manual');assert(read().proxy_mode==='manual','手动代理保存');
  const network=reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_network.cjs'));
  const address='http://localhost:'+plain_origin.address().port+'/test',transport=network.create_agent(address,read());
  try{const result=await new Promise((resolve,reject)=>http.get(address,{...transport,family:4},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve(text));}).on('error',reject));assert(result==='native HTTP'&&forwards===1,'宿主正式资产使用独立HTTP代理');}finally{transport.agent.destroy();}
  const service=reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs'));
  let failed=false;try{await service.download('https://api.github.com/test',{network:{...read(),ca_file:''}});}catch{failed=true;}assert(failed,'宿主Node无CA拒绝企业TLS');
  assert((await service.download('https://api.github.com/test',{network:read()})).toString()==='native TLS','宿主正式资产经代理与CA完成真实TLS');
  assert(forwards===1,'HTTPS下载没有误用HTTP代理');
  document.querySelector('.workspace-settings-modal .workspace-dialog-close')?.click();
  // 关闭并重新打开，确认持久化所有者继续提供设置。
  document.querySelector('.workspace-settings-modal .workspace-dialog-close')?.click();await pause(80);assert(!document.querySelector('.workspace-settings-modal'),'关闭释放旧设置表单');app.commands.run('typora_code:settings');await pause(80);
  assert(document.querySelector('[data-setting="network.ca_file"]').value===ca_file,'重开设置保留CA');
  for(const key of ['http_proxy_url','https_proxy_url'])assert(document.querySelector('[data-setting="network.'+key+'"]').value===read()[key],'重开设置保留独立字段 '+key);
  change('http_proxy_url','');assert(read().http_proxy_url===''&&read().https_proxy_url==='http://127.0.0.1:'+port,'清空HTTP不修改HTTPS');
  change('proxy_mode','direct');change('ca_file','');assert(read().ca_file===''&&read().proxy_mode==='direct','可恢复直连和默认信任链');
  assert(fs.existsSync(ca_file),'恢复设置不删除证书');assert(!File.changeCounter.isDocumentEdited(),'网络配置不改正文草稿');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,node:reqnode('process').versions.node,limits:'独立原始宿主和回环TLS/代理；未连接企业现场，文件选择取消为DOM事件'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks},null,2));}
 finally{for(const socket of sockets)socket.destroy();for(const server of servers)server.close();}
})();
