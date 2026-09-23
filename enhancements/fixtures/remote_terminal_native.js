// 正式构建、原生Typora和真实SSH；认证只取运行器环境，不进入证据。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[];
 const env=reqnode('process').env,target=env.TYPORA_TEST_SSH_TARGET,password=env.TYPORA_TEST_SSH_PASSWORD;
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<600;i++){if(fn())return;await pause(30);}throw Error(label);};
 const command=name=>core.app.commands.run('linux_note:'+name);
 const button=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);
 const text=entry=>Array.from({length:entry.surface.term.buffer.active.length},(_,i)=>entry.surface.term.buffer.active.getLine(i)?.translateToString()+(entry.surface.term.buffer.active.getLine(i+1)?.isWrapped?'':'\n')).join('');
 const enter=entry=>{const node=entry.surface.term.textarea;for(const type of ['keydown','keyup'])node.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));};
 const send=async(entry,line,marker)=>{entry.surface.term.paste(line);enter(entry);await wait(()=>text(entry).includes(marker),'远程终端命令未完成');};
 const authenticate=async entry=>{await pause(600);await send(entry,"printf 'AUTH_%s\\n' OK",'AUTH_OK');assert(!document.querySelector('[role=dialog] input[aria-label="SSH认证信息"]'),'终端复用当前连接认证，无重复密码输入');assert(!text(entry).includes('password:'),'密码认证不进入终端输出');};
 const active_entry=async()=>{command('terminal_move_editor');await wait(()=>core.app.workspace.activeLeaf?.view.entry,'终端编辑组未出现');const entry=core.app.workspace.activeLeaf.view.entry;command('terminal_move_panel');return entry;};
 const assets=path.join(_options.userDataPath,'typora_code/assets/remote'),api=reqnode(path.join(assets,'remote_ssh_service.cjs'));
 const version=JSON.parse(fs.readFileSync(path.join(_options.userDataPath,'typora_code/assets/update/runtime.json'),'utf8')).node_version;
 const service=api.create_remote_ssh({asset_root:assets,node_path:path.join(_options.userDataPath,'linux_note_enhancements/terminal_runtime/node',version,'node.exe'),authenticate:async prompt=>{if(/yes\/no|fingerprint/iu.test(prompt))throw Error('测试要求已信任主机');return password;}});
 let root='',panel,local,remote,result;
 try{
  if(!target||!password)throw Error('需要明确的SSH测试目标和内存凭据');await pause(1000);
  const original_path=File.bundle.filePath,original=fs.readFileSync(original_path);
  const identity=await api.resolve_connection_identity(target);
  const credentials=reqnode(path.join(assets,'remote_ssh_credentials.cjs')).create_credential_store(path.join(_options.userDataPath,'typora_code','ssh_credentials'));
  const directory=reqnode(path.join(assets,'remote_ssh_connections.cjs')).create_connection_store(path.join(_options.userDataPath,'typora_code','ssh_credentials'));
  await credentials.save(identity.key,password);await directory.save({target,host_name:'验收虚拟机',name:'日常用户',folder:'',port:0});
  const hello=await service.connect(target);root=hello.home+'/.typora-terminal-'+crypto.randomUUID()+" 中文 ' ${NOT_LOCAL}";await service.request('mkdir',{path:root});
  core.app.commands.run('typora_code:remote_ssh');await wait(()=>document.querySelector('.workspace-ssh-sidebar'),'SSH侧栏未出现');panel=document.querySelector('.workspace-ssh-sidebar');await wait(()=>panel.querySelector('.workspace-ssh-account-open'),'连接记录未出现');panel.querySelector('.workspace-ssh-account-open').click();
  await wait(()=>files.context_root().includes('remote_cache'),'远端工作区未挂载');
  command('open_folder');await wait(()=>document.querySelector('input[aria-label="远程路径"]'),'远端文件夹选择器未打开');
  const picker=document.querySelector('input[aria-label="远程路径"]');picker.value=root;picker.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await wait(()=>!button(picker.closest('[role=dialog]'),'打开').disabled,'远端目录未列出');button(picker.closest('[role=dialog]'),'打开').click();await wait(()=>files.context_root().endsWith(path.basename(root)),'主资源根未切换');
  assert(document.querySelector('.workspace-titlebar-search span').textContent==='SSH: '+identity.user,'顶栏显示远端用户名');
  command('terminal_toggle');remote=await active_entry();
  assert(remote.session.launch_profile?.remote.target===target,'活动栏创建远端终端');
  await authenticate(remote);await send(remote,"printf 'DIR=%s\\n' \"$PWD\"",'DIR='+root);assert(text(remote).includes('DIR='+root),'实际Shell位于选定远端目录');
  for(let i=0;i<20;i++)await send(remote,"printf 'CYCLE_%s\\n' "+i,'CYCLE_'+i);assert(true,'真实SSH连续20轮命令输出');
  await send(remote,"printf 'remote write' > proof.txt; printf 'WRITE_%s\\n' DONE",'WRITE_DONE');const proof=await service.request('read',{path:root+'/proof.txt'});assert(reqnode('buffer').Buffer.from(proof.data,'base64').toString()==='remote write','默认终端写入由独立SSH通道回读确认');
  command('terminal_split');const split=await active_entry();assert(split.session.launch_profile.remote.remote_path===root,'原生拆分保留远端目录');await authenticate(split);await send(split,"printf 'SPLIT=%s\\n' \"$PWD\"",'SPLIT='+root);command('terminal_kill');
  remote.surface.term.reset();command('terminal_restart');await wait(()=>remote.session.state==='running','远程重启未启动');await authenticate(remote);await send(remote,"printf 'RESTART=%s\\n' \"$PWD\"",'RESTART='+root);assert(true,'原生重启仍在远端');
  button(panel,'断开 / 取消').click();const count=document.querySelectorAll('.linux-note-terminal').length;command('terminal');await wait(()=>document.querySelector('.git-graph-dialog')?.textContent.includes('SSH尚未连接'),'断线缺少明确失败');assert(document.querySelectorAll('.linux-note-terminal').length===count,'断线默认新建不产生本机终端');button(document.querySelector('.git-graph-dialog'),'关闭').click();
  assert(fs.readFileSync(original_path).equals(original),'本地原始Markdown保持原字节');
  assert(!text(remote).includes(password+'\n'),'认证未作为终端输出回显');
  await service.request('remove',{path:root+'/proof.txt'});await service.request('remove',{path:root});root='';
  result={status:'PASS',checks,command_cycles:20,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(_options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'系统凭据命名空间隔离、连接别名和免重复认证；Windows原生宿主连接单一Linux虚拟机；身份和PTY真实执行，其他远程工作区功能由独立主工作区原生套件验收'};
 }catch(error){result={status:'ERROR',error:String(error.stack||error),checks};}
 finally{command('terminal_kill');command('terminal_kill');try{if(root&&service.state()==='connected'){try{await service.request('remove',{path:root+'/proof.txt'});}catch{}await service.request('remove',{path:root});}}finally{service.dispose();const credentials=reqnode(path.join(assets,'remote_ssh_credentials.cjs')).create_credential_store(path.join(_options.userDataPath,'typora_code','ssh_credentials'));for(const key of await credentials.storage.list(''))await credentials.storage.remove(key);}}
 fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify(result,null,2));
})();
