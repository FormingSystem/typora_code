// 原始宿主独立副本；网络与安装用服务端口替身，不更新用户环境。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],user_data=window._options.userDataPath;
 const service=reqnode(path.join(user_data,'typora_code/assets/update/workspace_update_service.cjs'));
 const saved={check_update:service.check_update,start_update:service.start_update,status_of:service.status_of,cancel_update:service.cancel_update};
 const release=JSON.parse(fs.readFileSync(path.join(user_data,'typora_code/assets/update/release.json'),'utf8'));
 const document_file=path.join(base,'workspace/front.md'),before=fs.readFileSync(document_file,'utf8');
 const bars=()=>document.querySelectorAll('.git-graph-dialog [role=progressbar]');
 const popup=()=>document.querySelector('.git-graph-dialog-shade');
 let resolve_check,reject_check,check_count=0,phase='starting',bytes,total_bytes,install_count=0;
 try{
  service.check_update=()=>new Promise((resolve,reject)=>{resolve_check=resolve;reject_check=reject;check_count++;});
  service.start_update=()=>{install_count++;return 'fixture-job';};
  service.status_of=()=>({phase,message:'原生进度验收：'+phase,bytes,total_bytes});
  service.cancel_update=()=>{phase='cancelled';};
  // 等宿主首次文档切换完成；该切换本来会关闭打开期间的浮层。
  for(let i=0;i<100&&(File.isFileLoading()||!File.bundle.filePath.endsWith('front.md'));i++)await pause(50);
  await pause(2400);
  core.app.commands.run('typora_code:check_update');
  assert(bars().length===1&&!bars()[0].hidden,'检查命令立即呈现活动条');
  const transform=()=>getComputedStyle(bars()[0].firstElementChild).transform;
  const initial=transform();await pause(200);assert(transform()!==initial,'正式CSS在原生主题中实际运动');
  const candidate=JSON.parse(JSON.stringify(release));candidate.releases[0].sequence++;candidate.releases[0].version='9999.1';
  resolve_check({release:candidate,commit:'a'.repeat(40)});await pause(80);
  [...popup().querySelectorAll('button')].find(b=>b.textContent==='立即更新').click();
  for(const stage of ['starting','downloading','verifying','installing']){
   phase=stage;bytes=524288;total_bytes=stage==='downloading'?1048576:undefined;await pause(400);
   const bar=bars()[0],rect=bar.getBoundingClientRect(),style=getComputedStyle(bar),bit=getComputedStyle(bar.firstElementChild);
   assert(!bar.hidden&&rect.width>0&&style.height==='2px',stage+'进度可见且保持共享2px轨道');
   assert(stage==='downloading'?bar.getAttribute('aria-valuenow')==='50':!bar.hasAttribute('aria-valuenow'),stage+'百分比符合真实阶段');
   samples.push({phase:stage,bar:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},color:bit.backgroundColor,animation:bit.animationName});
  }
  phase='succeeded';await pause(400);assert(bars()[0].getAttribute('aria-valuenow')==='100','安装完成显示100%并结束活动');
  popup().querySelector('button').click();assert(bars().length===0&&install_count===1,'关闭清理且只提交一次安装');
  for(let i=0;i<20;i++){
   core.app.commands.run('typora_code:check_update');await pause(0);
   assert(bars().length===1,'重复检查只保留一个进度条 '+i);
   popup().querySelector('button').click();resolve_check(null);await pause(0);
  }
  assert(bars().length===0,'20次打开取消无遗留进度节点');
  for(let i=0;i<20;i++){
   core.app.commands.run('typora_code:check_update');await pause(0);reject_check(Error('原生重试验收：网络超时'));await pause(20);
   const retry=[...popup().querySelectorAll('button')].find(b=>b.textContent==='重试');assert(!!retry,'失败存在重试按钮 '+i);
   const rect=retry.getBoundingClientRect(),parent=retry.parentElement.getBoundingClientRect();assert(rect.width>0&&rect.height>0&&rect.left>=parent.left&&rect.right<=parent.right,'重试按钮完整位于操作区 '+i);
   const prior=check_count;retry.click();retry.click();await pause(0);assert(check_count===prior+1&&bars().length===1&&!bars()[0].hidden,'重试立即检查且只发一次 '+i);
   resolve_check(null);await pause(20);assert(popup().textContent.includes('最新发布版本'),'重试成功显示实际结果 '+i);popup().querySelector('button').click();
  }
  assert(fs.readFileSync(document_file,'utf8')===before,'原生文档磁盘正文保持');
  samples.push({viewport:{width:innerWidth,height:innerHeight,dpi:devicePixelRatio,zoom:reqnode('electron').webFrame.getZoomFactor()},asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(user_data,'typora_code/workbench.js'))).digest('hex')});
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'真实宿主正式资产；服务替身阶段，无联网或实际安装，无物理输入'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
 finally{Object.assign(service,saved);}
})();
