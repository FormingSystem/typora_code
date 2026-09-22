// 原生独立副本、正式资产及真实SSH；凭据仅从运行器环境读取，不写入证据。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[],samples=[];
 const env=reqnode('process').env,target=env.TYPORA_TEST_SSH_TARGET,password=env.TYPORA_TEST_SSH_PASSWORD;
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error(label);};
 const assets=path.join(_options.userDataPath,'typora_code/assets/remote'),api=reqnode(path.join(assets,'remote_ssh_service.cjs'));
 const version=JSON.parse(fs.readFileSync(path.join(_options.userDataPath,'typora_code/assets/update/runtime.json'),'utf8')).node_version;
 const service=api.create_remote_ssh({asset_root:assets,node_path:path.join(_options.userDataPath,'linux_note_enhancements/terminal_runtime/node',version,'node.exe'),authenticate:async prompt=>{if(/yes\/no|fingerprint/iu.test(prompt))throw Error('实机测试要求已信任主机');return password;}});
 let root='',file='',remote_leaf;
 const button=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);
 try{
  if(!target||!password)throw Error('未提供显式SSH测试目标和内存凭据');
  await pause(1200);const hello=await service.connect(target);root=hello.home+'/.typora-code-test-'+crypto.randomUUID();await service.request('mkdir',{path:root});
  file=root+'/远程 空格.md';await service.request('create',{path:file,data:reqnode('buffer').Buffer.from('# 远程测试\n\n**原文**\n').toString('base64')});
  const original_root=files.context_root(),original_file=File.bundle.filePath,original=fs.readFileSync(original_file);
  core.app.commands.run('typora_code:remote_ssh');await wait(()=>document.querySelector('.workspace-ssh-sidebar'),'远程侧栏未出现');
  const panel=document.querySelector('.workspace-ssh-sidebar');panel.querySelector('input').value=target;
  const connect=async()=>{button(panel,'连接').click();await wait(()=>document.querySelector('[role=dialog] input[type=password]'),'密码对话框未出现');const input=document.querySelector('[role=dialog] input[type=password]');input.value=password;button(input.closest('[role=dialog]'),'连接').click();await wait(()=>panel.dataset.connection==='connected'&&panel.querySelector('.workspace-ssh-row'),'未完成连接和目录加载');};
  await connect();assert(panel.getAttribute('aria-busy')==='false','连接结束进度清理');
  const row=[...panel.querySelectorAll('.workspace-ssh-row')].find(n=>n.title===root);assert(row,'真实远程测试目录可见');row.click();await wait(()=>[...panel.querySelectorAll('.workspace-ssh-row')].some(n=>n.title===file),'项目目录未加载');
  [...panel.querySelectorAll('.workspace-ssh-row')].find(n=>n.title===file).click();await wait(()=>core.app.workspace.activeLeaf?.view.loaded,'远程编辑器未加载');remote_leaf=core.app.workspace.activeLeaf;
  const view=remote_leaf.view;assert(view.read_text().includes('原文'),'读取远程Markdown正文');assert(files.context_root()===original_root,'远程文件不改变本地工作区身份');
  assert(files.current_file()==='','远程身份不伪装为本地绝对路径');
  for(let i=0;i<20;i++){view.editor.models[0].setValue('# 远程测试\n\n保存 '+i+'\n');assert(files.editor_state(remote_leaf).dirty,'公共文件层识别远程草稿 '+i);assert(await files.save_active(),'公共保存入口 '+i);const read=await service.request('read',{path:file});assert(reqnode('buffer').Buffer.from(read.data,'base64').toString()===view.read_text(),'真实SSH回读 '+i);}
  await view.toggle_preview();await wait(()=>view.containerEl.querySelector('.workspace-lookup-markdown')?.shadowRoot?.textContent.includes('保存 19'),'Markdown预览未渲染');assert(!view.reader.container.querySelector('[contenteditable=true]'),'远程Markdown阅读预览只读');await view.toggle_preview();
  for(const [theme,name] of [['github.css','Github'],['night.css','Night']]){await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(180);for(const zoom of [1,1.25]){reqnode('electron').webFrame.setZoomFactor(zoom);await pause(100);const toolbar=view.toolbar.getBoundingClientRect();assert([...view.toolbar.querySelectorAll('button')].every(n=>{const b=n.getBoundingClientRect();return b.width>0&&b.left>=toolbar.left-1&&b.right<=toolbar.right+1;}),'远程工具操作完整 '+name+'/'+zoom);samples.push({theme:name,zoom,color:getComputedStyle(panel).color,toolbar:toolbar.toJSON()});}}
  reqnode('electron').webFrame.setZoomFactor(1);
  view.editor.models[0].setValue('本地尚未提交的草稿');const latest=await service.request('read',{path:file});await service.request('write',{path:file,version:latest.version,data:reqnode('buffer').Buffer.from('其他会话的修改').toString('base64')});
  assert(!await files.save_active(),'远程冲突拒绝覆盖');assert(view.read_text()==='本地尚未提交的草稿'&&view.dirty(),'冲突保留草稿');
  button(panel,'断开 / 取消').click();assert(!await files.save_active(),'断线保存明确失败');assert(view.dirty(),'断线仍保留草稿');
  let settled=false;const closing=files.close_leaf(remote_leaf).then(value=>{settled=value;});await wait(()=>document.querySelector('[data-workspace-tab-close]'),'未保存关闭缺少确认');
  const dialog=document.querySelector('[data-workspace-tab-close]');assert(!settled,'未确认前保留远程标签');button(dialog,'不保存并关闭').click();await closing;await pause(50);assert(view.disposed,'关闭真正释放远程编辑器');remote_leaf=undefined;
  assert(fs.readFileSync(original_file).equals(original),'本地正文保持原字节');assert(files.context_root()===original_root,'远程断线和关闭不切本地工作区');
  service.disconnect();assert(!document.querySelector('[role=dialog] input[type=password]'),'密码对话框与输入已清理');
  samples.push({viewport:{width:innerWidth,height:innerHeight,dpi:devicePixelRatio},asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(_options.userDataPath,'typora_code/workbench.js'))).digest('hex')});
  // 清理仅限本夹具创建的随机目录。
  await service.connect(target);await service.request('remove',{path:file});file='';await service.request('remove',{path:root});root='';
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,write_cycles:20,limits:'原生renderer点击/Monaco输入；单一Linux虚拟机，未代表全部SSH平台或VS Code扩展宿主'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
 finally{try{if(service.state()==='connected'){if(file)await service.request('remove',{path:file});if(root)await service.request('remove',{path:root});}}finally{service.dispose();}}
})();
