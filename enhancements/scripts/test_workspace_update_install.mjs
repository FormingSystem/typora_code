// 真ZIP + 真PowerShell事务安装器，目标全部位于新临时目录；网络下载用本地ZIP字节替身。
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync,spawnSync,spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),service=require('../src/workspace_update_service.cjs'),repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.platform!=='win32')throw Error('Windows integration fixture required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora-update-install-')),checkout=path.join(root,'package','repository'),host=path.join(root,'host'),user_data=path.join(root,'custom profile 中文'),state_root=service.update_paths(user_data).state_root,checks=[];
fs.mkdirSync(checkout,{recursive:true});fs.mkdirSync(path.join(host,'resources'),{recursive:true});fs.mkdirSync(user_data,{recursive:true});fs.mkdirSync(state_root,{recursive:true});
fs.writeFileSync(path.join(host,'Typora.exe'),'fixture');fs.writeFileSync(path.join(host,'resources/window.html'),'<html><head><title>fixture</title></head><body></body></html>');
for(const relative of ['install_windows.ps1','check_windows.ps1','cpp_github-consolas.css','scripts','enhancements/dist','enhancements/runtime_head.html','enhancements/bundle_markers.txt','enhancements/node_runtime.json','enhancements/release.json'])fs.cpSync(path.join(repository,relative),path.join(checkout,relative),{recursive:true});
// GitHub archive uses the repository LF form of release metadata.
const notes_file=path.join(checkout,'enhancements/release.json');fs.writeFileSync(notes_file,fs.readFileSync(notes_file,'utf8').replace(/\r\n/g,'\n'));
const env={...process.env,APPDATA:path.join(root,'appdata')};for(const key of Object.keys(env))if(key.toLowerCase()==='path')env[key]=path.join(process.env.SystemRoot,'System32');
assert(!fs.existsSync(path.join(checkout,'.git')));assert.equal(spawnSync('git',['--version'],{env,windowsHide:true}).error?.code,'ENOENT');for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];
const shell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const ps=(...args)=>execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',...args],{env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(root,'baseline.log'),ps('-File',path.join(checkout,'install_windows.ps1'),'-typora_root',host,'-user_data',user_data,'-non_interactive'));
const settings=path.join(user_data,'typora_code/settings/workspace.json');fs.mkdirSync(path.dirname(settings),{recursive:true});fs.writeFileSync(settings,'{"fixture":"keep 设置"}');
const protected_file=path.join(root,'note.md');fs.writeFileSync(protected_file,'# 用户草稿不属于安装目标\n');
const installed_release=path.join(user_data,'typora_code/assets/update/release.json'),release=JSON.parse(fs.readFileSync(installed_release,'utf8'));
const older=structuredClone(release);older.releases=older.releases.slice(1);assert(older.releases.length,'fixture requires a prior release');fs.writeFileSync(installed_release,JSON.stringify(older));
const archive=path.join(root,'candidate.zip');
const create_zip=String.raw`import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 for p in root.rglob('*'):
  if p.is_file(): z.write(p,p.relative_to(root.parent).as_posix())
`;
const zipped=spawnSync('python',['-X','utf8','-',checkout,archive],{input:create_zip,encoding:'utf8',windowsHide:true});assert.equal(zipped.status,0,zipped.stderr);
const commit='a'.repeat(40),plan={commit,release,notes_sha256:service.digest(fs.readFileSync(path.join(checkout,'enhancements/release.json'))),manifest_sha256:service.digest(fs.readFileSync(path.join(checkout,'enhancements/dist/SHA256SUMS'))),archive_url:'https://codeload.github.com/FormingSystem/typora_code/zip/'+commit};
const job=path.join(state_root,'case');fs.mkdirSync(job);fs.copyFileSync(path.join(repository,'enhancements/src/workspace_update_archive.ps1'),path.join(job,'workspace_update_archive.ps1'));fs.writeFileSync(path.join(job,'request.json'),JSON.stringify({state_root,user_data,host_root:host,plan}));
const node_version=JSON.parse(fs.readFileSync(path.join(checkout,'enhancements/node_runtime.json'),'utf8')).version;
const private_node=path.join(user_data,'linux_note_enhancements/terminal_runtime/node',node_version,'node.exe');
const cached_node=path.join(process.env.TYPORA_TERMINAL_CACHE||path.join(process.env.LOCALAPPDATA,'Typora/terminal_downloads'),'node-v'+node_version+'-win-'+process.arch+'-verified/node',node_version,'node.exe');
const cache_process=spawn(cached_node,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
const cache_done=new Promise((resolve,reject)=>{cache_process.on('error',reject);cache_process.on('close',resolve);});
const running=spawn(private_node,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
const running_done=new Promise((resolve,reject)=>{running.on('error',reject);running.on('close',resolve);});
try{
 const identity=await service.session_identity(running.pid,private_node);assert(identity.startsWith(running.pid+'-'));
 const previous_path=process.env.PATH;process.env.PATH=env.Path||env.PATH;
 try{await service.run_worker(path.join(job,'request.json'),{request:async(_url,{file})=>fs.copyFileSync(archive,file)});}finally{process.env.PATH=previous_path;}
}finally{running.kill();cache_process.kill();await Promise.all([running_done,cache_done]);}
checks.push('中文可执行路径的真实进程身份读取正确，私有Node与共享缓存Node正在运行时仍可原地安装');
const status=JSON.parse(fs.readFileSync(path.join(job,'status.json'),'utf8'));assert.equal(status.phase,'succeeded',status.message);
assert.equal(fs.readFileSync(settings,'utf8'),'{"fixture":"keep 设置"}');assert.equal(fs.readFileSync(protected_file,'utf8'),'# 用户草稿不属于安装目标\n');assert.equal(JSON.parse(fs.readFileSync(installed_release,'utf8')).releases[0].sequence,release.releases[0].sequence);
for(const line of fs.readFileSync(path.join(checkout,'enhancements/dist/SHA256SUMS'),'utf8').trim().split(/\r?\n/)){const [digest,file]=line.split('  ');assert.equal(service.digest(fs.readFileSync(path.join(user_data,'typora_code',file))),digest,file);}
assert.equal(service.installed_identity(user_data).commit,commit);
checks.push('PATH无Git、安装包无.git，用户temp中的真实ZIP解压、固定公告／资产校验、真实安装事务成功；非默认中文用户目录正确，设置和文档字节保留');
// 另一进程持有同一安装互斥时，真实入口应在任何安装写入前失败。
const holder_script=path.join(root,'hold.ps1'),ready=path.join(root,'mutex-ready');
fs.writeFileSync(holder_script,'\uFEFF'+String.raw`param([string]$user_data,[string]$ready)
$provider=[Security.Cryptography.SHA256]::Create()
$key=[BitConverter]::ToString($provider.ComputeHash([Text.Encoding]::UTF8.GetBytes($user_data.ToLowerInvariant()))).Replace('-','')
$mutex=[Threading.Mutex]::new($false,('Local\TyporaCodeInstall_'+$key))
[void]$mutex.WaitOne()
try{[IO.File]::WriteAllText($ready,'ready');[void][Console]::ReadLine()}finally{$mutex.ReleaseMutex();$mutex.Dispose();$provider.Dispose()}
`);
const holder=spawn(shell,['-NoProfile','-ExecutionPolicy','Bypass','-File',holder_script,'-user_data',user_data,'-ready',ready],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
const holder_done=new Promise((resolve,reject)=>{holder.on('error',reject);holder.on('close',resolve);});
try{
 for(let index=0;index<100&&!fs.existsSync(ready);index++)await new Promise(resolve=>setTimeout(resolve,30));
 assert(fs.existsSync(ready),'mutex holder ready');
 const locked=spawnSync(shell,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(checkout,'install_windows.ps1'),'-typora_root',host,'-user_data',user_data,'-non_interactive'],{env,encoding:'utf8',windowsHide:true,timeout:20000});
 fs.writeFileSync(path.join(root,'mutex.log'),locked.stdout+locked.stderr);
 assert.notEqual(locked.status,0);assert.match(locked.stdout+locked.stderr,/Another Typora Code installation/);
 assert.equal(fs.readFileSync(settings,'utf8'),'{"fixture":"keep 设置"}');
}finally{holder.stdin.end('\n');await holder_done;}
checks.push('真实跨进程安装互斥拒绝并发入口，旧资产和设置保持');
// 使用随安装交付的私有Node真正启动独立worker；相同提交在联网之前拒绝。
const network_configuration={proxy_mode:'direct',proxy_url:'',ca_file:path.join(repository,'enhancements/fixtures/network_tls/test_ca.pem')};
const actual_job=service.start_update({state_root,installed_root:path.join(user_data,'typora_code'),user_data,host_root:host,node_path:private_node,plan,network:network_configuration});
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(state_root,actual_job,'request.json'),'utf8')).network,network_configuration);
assert(fs.existsSync(path.join(state_root,actual_job,'workspace_network.cjs')),'worker carries bundled transport');
let actual_status;
for(let index=0;index<150;index++){actual_status=service.status_of(state_root,actual_job);if(['failed','succeeded','cancelled'].includes(actual_status.phase))break;await new Promise(resolve=>setTimeout(resolve,50));}
assert.equal(actual_status.phase,'failed');assert.match(actual_status.message,/本地已经/);assert(!fs.existsSync(path.join(state_root,actual_job,'repository.zip')));
checks.push('安装内私有Node可启动真实独立worker，相同提交在下载前拒绝，进度文件可读取');
const archives=[['../escape.txt','x',0],['repo/../../escape.txt','x',0],['repo/C:evil','x',0],['repo/link','target',0o120777*65536],['repo/A.txt','a',0],['repo/a.txt','b',0]];
for(let index=0;index<5;index++){
 const entries=index===4?archives.slice(4):[archives[index]],zip=path.join(root,'bad-'+index+'.zip');
 const code='import zipfile,sys,json\nwith zipfile.ZipFile(sys.argv[1],"w") as z:\n for name,text,mode in json.loads(sys.argv[2]):\n  info=zipfile.ZipInfo(name);info.external_attr=mode;z.writestr(info,text)';
 execFileSync('python',['-c',code,zip,JSON.stringify(entries)],{windowsHide:true});
 assert.throws(()=>ps('-File',path.join(repository,'enhancements/src/workspace_update_archive.ps1'),'-archive',zip,'-destination',path.join(root,'bad-'+index)));
 assert(!fs.existsSync(path.join(root,'bad-'+index)));
}
checks.push('遍历路径、Windows路径别名、符号链接、大小写冲突在写盘前拒绝');
assert(!fs.existsSync(path.join(root,'escape.txt')));
console.log(JSON.stringify({status:'PASS',checks,evidence:root},null,2));
