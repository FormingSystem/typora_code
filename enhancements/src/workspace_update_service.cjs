// Independent Node service; renderer and background worker reuse the same release protocol, do not access the user workspace.
'use strict';
const {workspace_service_text,set_workspace_service_locale,workspace_service_locale}=require("./workspace_service_i18n.cjs");
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https'),net=require('node:net'),child_process=require('node:child_process');
const network_service=require('./workspace_network.cjs');
const repository='FormingSystem/typora_code',branch='main';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read_json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function write_json(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),'utf8');fs.renameSync(temp,file);}
function release_info(value){
 if(value?.schema!==1||!Array.isArray(value.releases)||!value.releases.length)throw Error(workspace_service_text("service_eb97d4d23031"));
 let previous=Number.MAX_SAFE_INTEGER;
 for(const item of value.releases){
  if(!Number.isSafeInteger(item.sequence)||item.sequence<=0||item.sequence>=previous||typeof item.version!=='string'||!/^\d[\w.-]{0,63}$/.test(item.version)||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!Array.isArray(item.notes)||!item.notes.length||item.notes.some(note=>typeof note!=='string'||!note.trim()))throw Error(workspace_service_text("service_bdd922eb0b41"));
  if(item.notes_en!==undefined&&(!Array.isArray(item.notes_en)||item.notes_en.length!==item.notes.length||item.notes_en.some(note=>typeof note!=='string'||!note.trim())))throw Error(workspace_service_text("service_bdd922eb0b41"));
  previous=item.sequence;
 }
 return value;
}
function allowed_url(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!['api.github.com','raw.githubusercontent.com','codeload.github.com','github.com','release-assets.githubusercontent.com'].includes(url.hostname))throw Error(workspace_service_text("service_86c7aea302ad"));return url;}
/** Connection cutoff time overrides redirection and slow response; download does not close TLS certificate verification. */
function download(url,{file,signal,timeout_ms=30000,redirects=0,deadline=Date.now()+timeout_ms,on_progress=()=>{},network}={}){
 return new Promise((resolve,reject)=>{
  let settled=false,request,response,output,agent,total=0;const chunks=[],transport_abort=new AbortController();
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);transport_abort.abort();agent?.destroy();};
  const fail=error=>{if(settled)return;settled=true;cleanup();request?.destroy();response?.destroy();output?.destroy();reject(error);};
  const abort=()=>fail(Error(workspace_service_text("service_34b458f0042c")));
  const timer=setTimeout(()=>fail(Error(workspace_service_text("service_f09e28003ff4"))),Math.max(1,deadline-Date.now()));
  try{
   if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});
   const target=allowed_url(url),transport=network_service.create_agent(target.href,network,transport_abort.signal);agent=transport.agent;
   request=https.get(target,{...transport,headers:{'User-Agent':'TyporaCode-Updater','Accept':'application/vnd.github+json'}},incoming=>{
    response=incoming;response.on('error',fail);
    if([301,302,303,307,308].includes(response.statusCode)){
     const location=response.headers.location;response.resume();
     if(!location||redirects>=4)return fail(Error(workspace_service_text("service_2b4755c89b5c")));
     settled=true;cleanup();download(new URL(location,url).href,{file,signal,deadline,redirects:redirects+1,on_progress,network}).then(resolve,reject);return;
    }
    if(response.statusCode!==200){response.resume();return fail(Error(workspace_service_text("service_5b9df0dd9a0a")+response.statusCode+workspace_service_text("service_3ae5530c0a8e")));}
    const length=Number(response.headers['content-length']);
    const total_bytes=Number.isSafeInteger(length)&&length>0?length:undefined;
    if(file){output=fs.createWriteStream(file,{flags:'wx'});output.on('error',fail);}
    response.on('data',chunk=>{
     if(settled)return;
     try{total+=chunk.length;
     if(output){if(!output.write(chunk)){response.pause();output.once('drain',()=>response.resume());}}else chunks.push(chunk);
     on_progress(total,total_bytes&&total<=total_bytes?total_bytes:undefined);
     }catch(error){fail(error);}
    });
    response.on('aborted',()=>fail(Error(workspace_service_text("service_ac460300cc6e"))));
    response.on('end',()=>{
     const complete=()=>{if(settled)return;try{const value=file||Buffer.concat(chunks);settled=true;cleanup();resolve(value);}catch(error){fail(error);}};
     if(output){output.once('finish',complete);output.end();}else complete();
    });
   });request.on('error',fail);
  }catch(error){fail(error);}
 });
}
function parse_json(bytes){return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}
function update_paths(user_data){return {state_root:path.join(user_data,'temp','typora_code_updates'),identity_file:path.join(user_data,'typora_code_update_identity.json'),manifest_file:path.join(user_data,'typora_code','SHA256SUMS')};}
function installed_identity(user_data){
 if(!user_data)return null;
 try{const paths=update_paths(user_data),value=read_json(paths.identity_file);
  return value?.schema===1&&value.repository===repository&&/^[a-f0-9]{40}$/.test(value.commit)&&Number.isSafeInteger(value.sequence)&&['equivalent-assets','installed-archive'].includes(value.basis)&&value.manifest_sha256===digest(fs.readFileSync(paths.manifest_file))?value:null;
 }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
}
function record_identity(user_data,plan,basis){
 const paths=update_paths(user_data);
 if(digest(fs.readFileSync(paths.manifest_file))!==plan.manifest_sha256)throw Error(workspace_service_text("service_a9b1838de1b9"));
 write_json(paths.identity_file,{schema:1,repository,commit:plan.commit,sequence:plan.release.releases[0].sequence,manifest_sha256:plan.manifest_sha256,basis,recorded_at:new Date().toISOString()});
}
async function check_update(current,{request=download,signal,user_data,network}={}){
 release_info(current);
 const head=parse_json(await request(`https://api.github.com/repos/${repository}/commits/${branch}`,{signal,network}));
 if(!/^[a-f0-9]{40}$/.test(head.sha))throw Error(workspace_service_text("service_e00eeacd56d7"));
 const prefix=`https://raw.githubusercontent.com/${repository}/${head.sha}/`;
 const notes_bytes=await request(prefix+'enhancements/release.json',{signal,network});
 const latest=release_info(parse_json(notes_bytes));
 if(latest.releases[0].sequence<current.releases[0].sequence)return null;
 const identity=installed_identity(user_data);
 if(identity?.commit===head.sha&&identity.sequence===current.releases[0].sequence)return null;
 const manifest=await request(prefix+'enhancements/dist/SHA256SUMS',{signal,network});
 const plan={commit:head.sha,base_commit:identity?.commit||null,commit_message:typeof head.commit?.message==='string'?head.commit.message.slice(0,8000):'',release:latest,notes_sha256:digest(notes_bytes),manifest_sha256:digest(manifest),current:current.releases[0],archive_url:`https://codeload.github.com/${repository}/zip/${head.sha}`};
 // First manual ZIP installation has no Git identity; only establish a receipt when disk assets are equivalent.
 if(user_data&&!identity&&latest.releases[0].sequence===current.releases[0].sequence){
  try{if(digest(fs.readFileSync(update_paths(user_data).manifest_file))===plan.manifest_sha256&&!installed_identity(user_data)){record_identity(user_data,plan,'equivalent-assets');return null;}}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return plan;
}
function powershell(){return path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');}
function child_environment(){const env={...process.env,TYPORA_CODE_LANGUAGE:workspace_service_locale()};delete env.ELECTRON_RUN_AS_NODE;for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];return env;}
function execute(executable,args,options={}){
 const {on_spawn,...settings}=options;
 return new Promise((resolve,reject)=>{const child=child_process.execFile(executable,args,{windowsHide:true,env:child_environment(),timeout:15000,maxBuffer:Infinity,...settings},(error,stdout,stderr)=>error?reject(Error((stderr||stdout||error.message).trim())):resolve(stdout.trim()));if(child.pid)on_spawn?.(child.pid);});
}
async function session_identity(parent_pid=process.ppid,executable=process.execPath){
 if(process.platform!=='win32')throw Error(workspace_service_text("service_82c62e026689"));
 if(!Number.isSafeInteger(parent_pid)||parent_pid<=0)throw Error(workspace_service_text("service_df8ab3baf56e"));
 const result=JSON.parse(await execute(powershell(),['-NoProfile','-NonInteractive','-Command',`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$p=Get-Process -Id ${parent_pid} -ErrorAction Stop; @{pid=$p.Id; started=$p.StartTime.ToUniversalTime().Ticks.ToString(); executable=$p.Path}|ConvertTo-Json -Compress`]));
 if(path.resolve(result.executable).toLowerCase()!==path.resolve(executable).toLowerCase()||!/^\d+$/.test(result.started))throw Error(workspace_service_text("service_16704ed6abd3"));
 return `${result.pid}-${result.started}`;
}
function claim_startup(state_root,session){
 if(!/^\d+-\d+$/.test(session))throw Error(workspace_service_text("service_1003f9c8f6db"));
 fs.mkdirSync(state_root,{recursive:true});
 try{fs.writeFileSync(path.join(state_root,'session-'+session+'.json'),JSON.stringify({started_at:new Date().toISOString()}),{encoding:'utf8',flag:'wx'});return true;}
 catch(error){if(error.code==='EEXIST')return false;throw error;}
}
function validate_job_root(state_root,job){
 if(!/^[a-f0-9-]{36}$/.test(job))throw Error(workspace_service_text("service_1cf36b676f33"));
 const root=path.join(state_root,job);if(fs.lstatSync(root).isSymbolicLink())throw Error(workspace_service_text("service_32deb78247fe"));return root;
}
// Only recover UUID tasks with ownership records of this version; user backups belong to standard installation transactions.
function no_links(target){
 if(!fs.existsSync(target))return;
 const stat=fs.lstatSync(target);if(stat.isSymbolicLink())throw Error(workspace_service_text("service_4dfc94e43937")+target);
 if(stat.isDirectory())for(const name of fs.readdirSync(target))no_links(path.join(target,name));
}
function live_process(pid){if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
function owned_job(state_root,job){
 const root=validate_job_root(state_root,job);
 for(let parent=path.resolve(root);;parent=path.dirname(parent)){if(fs.lstatSync(parent).isSymbolicLink())throw Error(workspace_service_text("service_4befbe0b4148"));if(path.dirname(parent)===parent)break;}
 const owner=read_json(path.join(root,'ownership.json'));
 if(owner.schema!==1||owner.job!==job||owner.kind!=='typora-code-update')throw Error(workspace_service_text("service_b4d1c35da1ba"));
 return {root,owner};
}
async function cleanup_update_payload(state_root,job,{current=false}={}){
 const {root,owner}=owned_job(state_root,job);
 if((!current&&live_process(owner.pid))||(owner.children||[]).some(live_process))return false;
 const targets=['repository.zip','payload'].map(name=>path.join(root,name));
 for(const target of targets)no_links(target);
 let reclaimed=0;const size=target=>{if(!fs.existsSync(target))return 0;const stat=fs.lstatSync(target);return stat.isDirectory()?fs.readdirSync(target).reduce((sum,name)=>sum+size(path.join(target,name)),0):stat.size;};
 for(const target of targets){reclaimed+=size(target);await fs.promises.rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:150});}
 write_json(path.join(root,'ownership.json'),{...owner,children:[],cleaned_at:new Date().toISOString(),reclaimed_bytes:(owner.reclaimed_bytes||0)+reclaimed});
 return true;
}
async function sweep_update_jobs(state_root,current_job){
 const completed=[];
 for(const job of fs.readdirSync(state_root)){
  if(job===current_job||!/^[a-f0-9-]{36}$/.test(job))continue;
  try{
   const {root,owner}=owned_job(state_root,job);
   if(live_process(owner.pid)||(owner.children||[]).some(live_process))continue;
   // When the process crashes, UAC installation subprocess may still be alive; check the task script path, not just worker PID.
   if(process.platform==='win32'){
    const encoded=Buffer.from(path.resolve(root),'utf8').toString('base64');
    const active=await execute(powershell(),['-NoProfile','-NonInteractive','-Command',`$root=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {$_.CommandLine -and $_.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count`]);
    if(active!=='0')continue;
   }
   if(!owner.cleaned_at&&Date.now()-Date.parse(owner.created_at)>86400000)await cleanup_update_payload(state_root,job);
   const updated=read_json(path.join(root,'ownership.json'));
   if(updated.cleaned_at){
    const known=new Set(['ownership.json','request.json','status.json','cancel','worker.log','install.log','workspace_update_service.cjs','workspace_update_archive.ps1','workspace_network.cjs','workspace_service_i18n.cjs','workspace_service_messages.json']);
    if(fs.readdirSync(root).every(name=>known.has(name))){no_links(root);completed.push({root,finished:Date.parse(updated.cleaned_at)});}
   }
  }catch(error){console.warn(workspace_service_text("service_02f71dd1c3e0"),job,error.message);}
 }
 for(const entry of completed.sort((a,b)=>b.finished-a.finished).slice(19))await fs.promises.rm(entry.root,{recursive:true,force:true,maxRetries:3,retryDelay:150});
}
function status_of(state_root,job){
 const root=validate_job_root(state_root,job);let status;
 try{status=read_json(path.join(root,'status.json'));}catch(error){if(error.code==='ENOENT')return Date.now()-fs.statSync(root).mtimeMs>30000?{phase:'failed',message:workspace_service_text("service_81d72aa52d69")}:{phase:'starting',message:workspace_service_text("service_a11e70d4335d")};throw error;}
 if(!['succeeded','failed','cancelled'].includes(status.phase)&&status.pid){try{process.kill(status.pid,0);}catch(error){if(error.code==='ESRCH')return {...status,phase:'failed',message:workspace_service_text("service_fb234b0b4876")};}}
 return status;
}
function start_update({state_root,installed_root,user_data,host_root,node_path,plan,network}){
 if(process.platform!=='win32')throw Error(workspace_service_text("service_82c62e026689"));
 release_info(plan.release);if(!/^[a-f0-9]{40}$/.test(plan.commit))throw Error(workspace_service_text("service_ed9ffc92285a"));
 const job=crypto.randomUUID(),root=path.join(state_root,job);fs.mkdirSync(root,{recursive:true});
 for(const name of ['workspace_update_service.cjs','workspace_update_archive.ps1','workspace_network.cjs','workspace_service_i18n.cjs','workspace_service_messages.json'])fs.copyFileSync(path.join(installed_root,'assets/update',name),path.join(root,name));
 write_json(path.join(root,'request.json'),{state_root,user_data,host_root,plan,locale:workspace_service_locale(),network:network_service.validate(network)});
 const log=fs.openSync(path.join(root,'worker.log'),'a');let child;
 try{child=child_process.spawn(node_path,[path.join(root,'workspace_update_service.cjs'),'--worker',path.join(root,'request.json')],{detached:true,windowsHide:true,env:child_environment(),stdio:['ignore',log,log]});}
 finally{fs.closeSync(log);}
 child.on('error',error=>write_json(path.join(root,'status.json'),{phase:'failed',message:String(error.message)}));child.unref();return job;
}
function cancel_update(state_root,job){const root=validate_job_root(state_root,job);if(['starting','downloading','verifying'].includes(status_of(state_root,job).phase))fs.writeFileSync(path.join(root,'cancel'),'cancel','utf8');}
function validate_payload(root,plan){
 const release_path=path.join(root,'enhancements/release.json'),dist=path.join(root,'enhancements/dist');
 if(digest(fs.readFileSync(release_path))!==plan.notes_sha256||digest(fs.readFileSync(path.join(dist,'SHA256SUMS')))!==plan.manifest_sha256)throw Error(workspace_service_text("service_2aacadb877b2"));
 const info=release_info(read_json(release_path));if(info.releases[0].sequence!==plan.release.releases[0].sequence)throw Error(workspace_service_text("service_ee2dd89de271"));
 if(digest(fs.readFileSync(path.join(dist,'assets/update/release.json')))!==plan.notes_sha256)throw Error(workspace_service_text("service_696463d78c16"));
 const seen=new Set();
 for(const line of fs.readFileSync(path.join(dist,'SHA256SUMS'),'utf8').trim().split(/\r?\n/)){
  const match=/^([a-f0-9]{64})  ([a-zA-Z0-9_./-]+)$/.exec(line);if(!match||match[2].split('/').some(part=>!part||part==='.'||part==='..')||path.isAbsolute(match[2])||seen.has(match[2].toLowerCase()))throw Error(workspace_service_text("service_e0189ce23045"));
  seen.add(match[2].toLowerCase());if(digest(fs.readFileSync(path.join(dist,match[2])))!==match[1])throw Error(workspace_service_text("service_08dad3d93807")+match[2]);
 }
 for(const item of ['workbench.js','workspace_core.js','workspace.css','workspace_core.css','assets/update/release.json'])if(!seen.has(item))throw Error(workspace_service_text("service_b674e4fc1dd8"));
 return info;
}
async function acquire_update_lock(state_root){
 const name=process.platform==='win32'?'\\\\.\\pipe\\typora-code-update-'+digest(Buffer.from(path.resolve(state_root).toLowerCase())):path.join(state_root,'update.sock');
 const server=net.createServer(socket=>socket.end());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(name,resolve);});return ()=>new Promise(resolve=>server.close(resolve));
}
async function run_worker(request_file,{request=download,unpack,install}={}){
 const request_locale=read_json(request_file).locale;
 if(request_locale!==undefined)set_workspace_service_locale(request_locale);
 const root=path.dirname(request_file),configuration=read_json(request_file),{state_root,user_data,host_root,plan}=configuration;
 let unlock,timer,installing=false,owner;const abort=new AbortController();
 const register_child=pid=>{owner.children.push(pid);write_json(path.join(root,'ownership.json'),owner);};
 const status=(phase,message,extra={})=>write_json(path.join(root,'status.json'),{phase,message,pid:process.pid,updated_at:new Date().toISOString(),...extra});
 try{
  unlock=await acquire_update_lock(state_root);
  if(path.resolve(validate_job_root(state_root,path.basename(root)))!==path.resolve(root))throw Error(workspace_service_text("service_fa417a9f3cb1"));
  no_links(root);
  owner={schema:1,kind:'typora-code-update',job:path.basename(root),pid:process.pid,children:[],created_at:new Date().toISOString()};
  write_json(path.join(root,'ownership.json'),owner);
  await sweep_update_jobs(state_root,owner.job);
  write_json(path.join(state_root,'active_job.json'),{job:path.basename(root)});
  release_info(plan.release);
  if(!/^[a-f0-9]{40}$/.test(plan.commit)||plan.archive_url!==`https://codeload.github.com/${repository}/zip/${plan.commit}`)throw Error(workspace_service_text("service_68f98b2ffeaf"));
  const current=release_info(read_json(path.join(user_data,'typora_code/assets/update/release.json')));
  if(plan.release.releases[0].sequence<current.releases[0].sequence||installed_identity(user_data)?.commit===plan.commit)throw Error(workspace_service_text("service_5806ac1cd3aa"));
  if(Object.hasOwn(plan,'base_commit')&&(installed_identity(user_data)?.commit||null)!==plan.base_commit)throw Error(workspace_service_text("service_91042c5a1d2b"));
  status('downloading',workspace_service_text("service_b1eb0911b036")+plan.release.releases[0].version+'…');
  timer=setInterval(()=>{if(fs.existsSync(path.join(root,'cancel')))abort.abort();},100);
  const archive=path.join(root,'repository.zip');let last_progress=0;
  await request(plan.archive_url,{network:configuration.network,file:archive,timeout_ms:180000,signal:abort.signal,on_progress:(bytes,total_bytes)=>{if(Date.now()-last_progress>500||bytes===total_bytes){last_progress=Date.now();status('downloading',workspace_service_text("service_369ca5e19c59"),{bytes,total_bytes});}}});
  if(fs.existsSync(path.join(root,'cancel')))throw Error(workspace_service_text("service_34b458f0042c"));
  status('verifying',workspace_service_text("service_8c473d1786da"));
  const payload=unpack?await unpack(archive,root):await execute(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'workspace_update_archive.ps1'),'-archive',archive,'-destination',path.join(root,'payload')],{timeout:120000,on_spawn:register_child});
  validate_payload(payload,plan);
  if(fs.existsSync(path.join(root,'cancel')))throw Error(workspace_service_text("service_34b458f0042c"));
  clearInterval(timer);timer=undefined;
  installing=true;
  status('installing',workspace_service_text("service_99f7d7f66527"),{archive_sha256:digest(fs.readFileSync(archive))});
  if(install)await install(payload,configuration);else{
   const env=child_environment();env.APPDATA=path.dirname(user_data);
   // Write transactions do not have strong kill timeout; backup/rollback must allow the installer to complete fully.
   const output=await execute(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(payload,'install_windows.ps1'),'-typora_root',host_root,'-user_data',user_data,'-non_interactive','-allow_elevation'],{env,timeout:0,maxBuffer:Infinity,on_spawn:register_child});
   fs.writeFileSync(path.join(root,'install.log'),output,'utf8');
  }
  const installed=release_info(read_json(path.join(user_data,'typora_code/assets/update/release.json')));
  if(installed.releases[0].sequence!==plan.release.releases[0].sequence)throw Error(workspace_service_text("service_1dfbb5eb0739"));
  record_identity(user_data,plan,'installed-archive');
  status('succeeded',workspace_service_text("service_cfb57a5f223f"),{version:installed.releases[0].version,commit:plan.commit});
 }catch(error){const message=String(error.message||error);status(message.includes('[TYPORA_INSTALL_CANCELLED]')||(!installing&&(abort.signal.aborted||fs.existsSync(path.join(root,'cancel'))))?'cancelled':'failed',message);}
 finally{
  clearInterval(timer);
  if(owner)try{if(!await cleanup_update_payload(state_root,owner.job,{current:true}))throw Error(workspace_service_text("service_1428b1501699"));}catch(error){const previous=read_json(path.join(root,'status.json'));write_json(path.join(root,'status.json'),{...previous,cleanup_error:String(error.message),message:previous.message+workspace_service_text("service_e734ff9096ca")});}
  if(unlock)await unlock();
 }
}
module.exports={set_workspace_service_locale,update_paths,installed_identity,execute,powershell,release_info,allowed_url,download,check_update,session_identity,claim_startup,start_update,status_of,cancel_update,validate_payload,acquire_update_lock,run_worker,digest,cleanup_update_payload,sweep_update_jobs};
if(require.main===module&&process.argv[2]==='--worker')run_worker(process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});
