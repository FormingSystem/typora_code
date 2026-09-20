// 独立Node服务；renderer与后台worker复用同一发布协议，不访问用户工作区。
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https'),net=require('node:net'),child_process=require('node:child_process');
const repository='FormingSystem/typora_code',branch='main';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read_json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function write_json(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),'utf8');fs.renameSync(temp,file);}
function release_info(value){
 if(value?.schema!==1||!Array.isArray(value.releases)||!value.releases.length||value.releases.length>100)throw Error('更新公告格式无效。');
 let previous=Number.MAX_SAFE_INTEGER;
 for(const item of value.releases){
  if(!Number.isSafeInteger(item.sequence)||item.sequence<=0||item.sequence>=previous||typeof item.version!=='string'||!/^\d[\w.-]{0,63}$/.test(item.version)||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!Array.isArray(item.notes)||!item.notes.length||item.notes.length>50||item.notes.some(note=>typeof note!=='string'||!note.trim()||note.length>2000))throw Error('更新版本或公告内容无效。');
  previous=item.sequence;
 }
 return value;
}
function allowed_url(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!['api.github.com','raw.githubusercontent.com','codeload.github.com','github.com','release-assets.githubusercontent.com'].includes(url.hostname))throw Error('更新地址不属于允许的GitHub HTTPS来源。');return url;}
/** 总截止时间和字节上限覆盖重定向及慢速响应；下载不关闭TLS证书校验。 */
function download(url,{limit=1024*1024,file,signal,timeout_ms=30000,redirects=0,deadline=Date.now()+timeout_ms,on_progress=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  let settled=false,request,response,output,total=0;const chunks=[];
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
  const fail=error=>{if(settled)return;settled=true;cleanup();request?.destroy();response?.destroy();output?.destroy();reject(error);};
  const abort=()=>fail(Error('已取消更新。'));
  const timer=setTimeout(()=>fail(Error('更新服务器响应超时。')),Math.max(1,deadline-Date.now()));
  try{
   if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});
   request=https.get(allowed_url(url),{headers:{'User-Agent':'TyporaCode-Updater','Accept':'application/vnd.github+json'}},incoming=>{
    response=incoming;response.on('error',fail);
    if([301,302,303,307,308].includes(response.statusCode)){
     const location=response.headers.location;response.resume();
     if(!location||redirects>=4)return fail(Error('更新下载重定向异常。'));
     settled=true;cleanup();download(new URL(location,url).href,{limit,file,signal,deadline,redirects:redirects+1,on_progress}).then(resolve,reject);return;
    }
    if(response.statusCode!==200){response.resume();return fail(Error('更新服务器返回HTTP '+response.statusCode+'，请稍后重试。'));}
    if(Number(response.headers['content-length'])>limit)return fail(Error('更新下载超过体积上限。'));
    if(file){output=fs.createWriteStream(file,{flags:'wx'});output.on('error',fail);}
    response.on('data',chunk=>{
     if(settled)return;
     total+=chunk.length;if(total>limit)return fail(Error('更新下载超过体积上限。'));
     if(output){if(!output.write(chunk)){response.pause();output.once('drain',()=>response.resume());}}else chunks.push(chunk);
     on_progress(total);
    });
    response.on('aborted',()=>fail(Error('更新下载意外中断。')));
    response.on('end',()=>{
     const complete=()=>{if(settled)return;settled=true;cleanup();resolve(file||Buffer.concat(chunks));};
     if(output){output.once('finish',complete);output.end();}else complete();
    });
   });request.on('error',fail);
  }catch(error){fail(error);}
 });
}
function parse_json(bytes){return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}
async function check_update(current,{request=download,signal}={}){
 release_info(current);
 const head=parse_json(await request(`https://api.github.com/repos/${repository}/commits/${branch}`,{signal}));
 if(!/^[a-f0-9]{40}$/.test(head.sha))throw Error('更新提交身份无效。');
 const prefix=`https://raw.githubusercontent.com/${repository}/${head.sha}/`;
 const notes_bytes=await request(prefix+'enhancements/release.json',{signal});
 const latest=release_info(parse_json(notes_bytes));
 if(latest.releases[0].sequence<=current.releases[0].sequence)return null;
 const manifest=await request(prefix+'enhancements/dist/SHA256SUMS',{signal});
 return {commit:head.sha,release:latest,notes_sha256:digest(notes_bytes),manifest_sha256:digest(manifest),current:current.releases[0],archive_url:`https://codeload.github.com/${repository}/zip/${head.sha}`};
}
function powershell(){return path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');}
function child_environment(){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];return env;}
function execute(executable,args,options={}){
 return new Promise((resolve,reject)=>child_process.execFile(executable,args,{windowsHide:true,env:child_environment(),timeout:15000,maxBuffer:1024*1024,...options},(error,stdout,stderr)=>error?reject(Error((stderr||stdout||error.message).trim())):resolve(stdout.trim())));
}
async function session_identity(parent_pid=process.ppid,executable=process.execPath){
 if(process.platform!=='win32')throw Error('当前平台暂未支持自动安装。');
 if(!Number.isSafeInteger(parent_pid)||parent_pid<=0)throw Error('无法读取宿主进程身份。');
 const result=JSON.parse(await execute(powershell(),['-NoProfile','-NonInteractive','-Command',`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$p=Get-Process -Id ${parent_pid} -ErrorAction Stop; @{pid=$p.Id; started=$p.StartTime.ToUniversalTime().Ticks.ToString(); executable=$p.Path}|ConvertTo-Json -Compress`]));
 if(path.resolve(result.executable).toLowerCase()!==path.resolve(executable).toLowerCase()||!/^\d+$/.test(result.started))throw Error('宿主主进程身份不匹配。');
 return `${result.pid}-${result.started}`;
}
function claim_startup(state_root,session){
 if(!/^\d+-\d+$/.test(session))throw Error('无效更新会话。');
 fs.mkdirSync(state_root,{recursive:true});
 try{fs.writeFileSync(path.join(state_root,'session-'+session+'.json'),JSON.stringify({started_at:new Date().toISOString()}),{encoding:'utf8',flag:'wx'});return true;}
 catch(error){if(error.code==='EEXIST')return false;throw error;}
}
function validate_job_root(state_root,job){
 if(!/^[a-f0-9-]{36}$/.test(job))throw Error('无效更新任务。');
 const root=path.join(state_root,job);if(fs.lstatSync(root).isSymbolicLink())throw Error('更新目录不能是链接。');return root;
}
function status_of(state_root,job){
 const root=validate_job_root(state_root,job);let status;
 try{status=read_json(path.join(root,'status.json'));}catch(error){if(error.code==='ENOENT')return Date.now()-fs.statSync(root).mtimeMs>30000?{phase:'failed',message:'更新进程未能启动，请重试。'}:{phase:'starting',message:'正在启动更新…'};throw error;}
 if(!['succeeded','failed','cancelled'].includes(status.phase)&&status.pid){try{process.kill(status.pid,0);}catch(error){if(error.code==='ESRCH')return {...status,phase:'failed',message:'更新进程已结束但未确认安装完成，请查看日志并重试。'};}}
 return status;
}
function start_update({state_root,installed_root,user_data,host_root,node_path,plan}){
 if(process.platform!=='win32')throw Error('当前平台暂未支持自动安装。');
 release_info(plan.release);if(!/^[a-f0-9]{40}$/.test(plan.commit))throw Error('无效更新提交。');
 const job=crypto.randomUUID(),root=path.join(state_root,job);fs.mkdirSync(root,{recursive:true});
 for(const name of ['workspace_update_service.cjs','workspace_update_archive.ps1'])fs.copyFileSync(path.join(installed_root,'assets/update',name),path.join(root,name));
 write_json(path.join(root,'request.json'),{state_root,user_data,host_root,plan});
 const log=fs.openSync(path.join(root,'worker.log'),'a');let child;
 try{child=child_process.spawn(node_path,[path.join(root,'workspace_update_service.cjs'),'--worker',path.join(root,'request.json')],{detached:true,windowsHide:true,env:child_environment(),stdio:['ignore',log,log]});}
 finally{fs.closeSync(log);}
 child.on('error',error=>write_json(path.join(root,'status.json'),{phase:'failed',message:String(error.message)}));child.unref();return job;
}
function cancel_update(state_root,job){const root=validate_job_root(state_root,job);if(['starting','downloading','verifying'].includes(status_of(state_root,job).phase))fs.writeFileSync(path.join(root,'cancel'),'cancel','utf8');}
function validate_payload(root,plan){
 const release_path=path.join(root,'enhancements/release.json'),dist=path.join(root,'enhancements/dist');
 if(digest(fs.readFileSync(release_path))!==plan.notes_sha256||digest(fs.readFileSync(path.join(dist,'SHA256SUMS')))!==plan.manifest_sha256)throw Error('下载包与本次公告／资产清单不一致。');
 const info=release_info(read_json(release_path));if(info.releases[0].sequence!==plan.release.releases[0].sequence)throw Error('下载版本不一致。');
 if(digest(fs.readFileSync(path.join(dist,'assets/update/release.json')))!==plan.notes_sha256)throw Error('发布公告与构建版本不一致。');
 const seen=new Set();
 for(const line of fs.readFileSync(path.join(dist,'SHA256SUMS'),'utf8').trim().split(/\r?\n/)){
  const match=/^([a-f0-9]{64})  ([a-zA-Z0-9_./-]+)$/.exec(line);if(!match||match[2].split('/').some(part=>!part||part==='.'||part==='..')||path.isAbsolute(match[2])||seen.has(match[2].toLowerCase()))throw Error('无效或重复的发行资产。');
  seen.add(match[2].toLowerCase());if(digest(fs.readFileSync(path.join(dist,match[2])))!==match[1])throw Error('发行资产摘要不匹配：'+match[2]);
 }
 for(const item of ['workbench.js','workspace_core.js','workspace.css','workspace_core.css','assets/update/release.json'])if(!seen.has(item))throw Error('发行包缺少必要资产。');
 return info;
}
async function acquire_update_lock(state_root){
 const name=process.platform==='win32'?'\\\\.\\pipe\\typora-code-update-'+digest(Buffer.from(path.resolve(state_root).toLowerCase())):path.join(state_root,'update.sock');
 const server=net.createServer(socket=>socket.end());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(name,resolve);});return ()=>new Promise(resolve=>server.close(resolve));
}
async function run_worker(request_file,{request=download,unpack,install}={}){
 const root=path.dirname(request_file),configuration=read_json(request_file),{state_root,user_data,host_root,plan}=configuration;
 let unlock,timer,installing=false;const abort=new AbortController();
 const status=(phase,message,extra={})=>write_json(path.join(root,'status.json'),{phase,message,pid:process.pid,updated_at:new Date().toISOString(),...extra});
 try{
  unlock=await acquire_update_lock(state_root);
  write_json(path.join(state_root,'active_job.json'),{job:path.basename(root)});
  release_info(plan.release);
  if(!/^[a-f0-9]{40}$/.test(plan.commit)||plan.archive_url!==`https://codeload.github.com/${repository}/zip/${plan.commit}`)throw Error('下载地址与固定提交不匹配。');
  const current=release_info(read_json(path.join(user_data,'typora_code/assets/update/release.json')));
  if(plan.release.releases[0].sequence<=current.releases[0].sequence)throw Error('本地已经是相同或更新版本，无需覆盖。');
  status('downloading','正在下载 '+plan.release.releases[0].version+'…');
  timer=setInterval(()=>{if(fs.existsSync(path.join(root,'cancel')))abort.abort();},100);
  const archive=path.join(root,'repository.zip');let last_progress=0;
  await request(plan.archive_url,{file:archive,limit:128*1024*1024,timeout_ms:180000,signal:abort.signal,on_progress:bytes=>{if(Date.now()-last_progress>500){last_progress=Date.now();status('downloading','正在下载…',{bytes});}}});
  if(fs.existsSync(path.join(root,'cancel')))throw Error('已取消更新。');
  status('verifying','正在校验并解压更新包…');
  const payload=unpack?await unpack(archive,root):await execute(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'workspace_update_archive.ps1'),'-archive',archive,'-destination',path.join(root,'payload')],{timeout:120000});
  validate_payload(payload,plan);
  if(fs.existsSync(path.join(root,'cancel')))throw Error('已取消更新。');
  clearInterval(timer);timer=undefined;
  installing=true;
  status('installing','正在备份并安装；请勿关闭更新进程。文档窗口可以继续使用。',{archive_sha256:digest(fs.readFileSync(archive))});
  if(install)await install(payload,configuration);else{
   const env=child_environment();env.APPDATA=path.dirname(user_data);
   // 写入事务没有强杀超时；备份／回滚必须允许安装器完整结束。
   const output=await execute(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(payload,'install_windows.ps1'),'-typora_root',host_root,'-user_data',user_data,'-non_interactive'],{env,timeout:0,maxBuffer:4*1024*1024});
   fs.writeFileSync(path.join(root,'install.log'),output,'utf8');
  }
  const installed=release_info(read_json(path.join(user_data,'typora_code/assets/update/release.json')));
  if(installed.releases[0].sequence!==plan.release.releases[0].sequence)throw Error('安装器返回后版本校验未通过，请查看安装备份。');
  status('succeeded','更新已安装。请保存文档后手动重启所有 Typora 窗口以加载新版。',{version:installed.releases[0].version});
 }catch(error){status(!installing&&(abort.signal.aborted||fs.existsSync(path.join(root,'cancel')))?'cancelled':'failed',String(error.message||error));}
 finally{clearInterval(timer);if(unlock)await unlock();}
}
module.exports={execute,powershell,release_info,allowed_url,download,check_update,session_identity,claim_startup,start_update,status_of,cancel_update,validate_payload,acquire_update_lock,run_worker,digest};
if(require.main===module&&process.argv[2]==='--worker')run_worker(process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});
