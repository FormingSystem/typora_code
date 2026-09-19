import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {read_test_catalog,package_root,repository_root} from './check_test_catalog.mjs';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++) {
  const key=args[i];if(key==='--list'){options.list=true;continue;}
  if(!['--domain','--level','--purpose','--tier','--id'].includes(key)||!args[i+1])throw Error('未知参数：'+key);
  options[key.slice(2)]=args[++i];
}
const tier=Number(options.tier||20);if(![20,100,1000].includes(tier))throw Error('tier必须是20/100/1000');
const catalog=read_test_catalog();
const selected=catalog.suites.filter(entry=>['domain','level','purpose','id'].every(key=>!options[key]||entry[key]===options[key]));
if(!selected.length)throw Error('没有匹配用例');
if(options.list){console.log(selected.map(entry=>`${entry.id}\t${entry.level}/${entry.purpose}\t${entry.domain}\t${entry.script}`).join('\n'));process.exit(0);}
const run_id=new Date().toISOString().replace(/[:.]/g,'-')+'_'+crypto.randomBytes(3).toString('hex');
const output=path.join(repository_root,'.cache/issue_tracking/runs',run_id);fs.mkdirSync(output,{recursive:true});
const git=(...arguments_)=>execFileSync('git',['-c','core.safecrlf=false','-C',repository_root,...arguments_],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const tracked=git('ls-files','--cached','--others','--exclude-standard','enhancements/src','enhancements/vendor/workspace_core','enhancements/scripts','enhancements/fixtures','enhancements/tests','enhancements/package.json','docs','AGENTS.md').split('\n');
const source_hashes=Object.fromEntries(tracked.filter(Boolean).filter(file=>fs.existsSync(path.join(repository_root,file))).map(file=>[file,hash(fs.readFileSync(path.join(repository_root,file)))]));
// 新增用例/实现也必须进入身份记录，不能只依赖git已跟踪文件。
for(const entry of selected)for(const file of [entry.script,...entry.implementation])source_hashes[file]=hash(fs.readFileSync(path.join(repository_root,file)));
const report={schema:1,run_id,started_at:new Date().toISOString(),status:'running',revision:git('rev-parse','HEAD'),diff_sha256:hash(git('diff','HEAD','--')),source_hashes,
  catalog_sha256:hash(fs.readFileSync(path.join(package_root,'tests/test_catalog.json'))),asset_manifest_sha256:hash(fs.readFileSync(path.join(package_root,'dist/SHA256SUMS'))),
  environment:{platform:process.platform,arch:process.arch,os_release:os.release(),node:process.version,electron:JSON.parse(fs.readFileSync(path.join(package_root,'node_modules/electron/package.json'),'utf8')).version},tier,results:[]};
const persist=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),'utf8');persist();
const execute=entry=>new Promise(resolve=>{
  const log_path=path.join(output,entry.id+'.log');const log=fs.openSync(log_path,'w');const start=Date.now();
  const suite_files=[entry.script,...entry.implementation,...(entry.runner?[entry.runner]:[])];
  const suite_hashes=Object.fromEntries(suite_files.map(file=>[file,hash(fs.readFileSync(path.join(repository_root,file)))]));
  const file=path.join(repository_root,entry.script),extension=path.extname(file);
  let executable=process.execPath,command_args=[file];
  if(extension==='.cjs')command_args=[path.join(package_root,'scripts/test_ui.mjs'),path.basename(file)];
  if(extension==='.ps1'){executable='powershell';command_args=['-NoProfile','-ExecutionPolicy','Bypass','-File',file];}
  if(extension==='.py'){executable='python';command_args=['-X','utf8',file];}
  if(extension==='.sh'){executable='bash';command_args=[file];}
  if(entry.runner){executable=process.execPath;command_args=[path.join(repository_root,entry.runner)];}
  const environment={...process.env,TYPORA_STRESS_ITERATIONS:String(tier),TYPORA_TEST_PURPOSE:entry.purpose};delete environment.ELECTRON_RUN_AS_NODE;
  // 从PowerShell 7经Node启动5.1时，继承的模块路径会优先加载不兼容的Utility模块。
  // 仅清理子进程环境，让目标引擎建立自己的标准模块路径。
  if(extension==='.ps1')for(const key of Object.keys(environment))if(key.toLowerCase()==='psmodulepath')delete environment[key];
  const child=spawn(executable,command_args,{cwd:package_root,env:environment,windowsHide:true,stdio:['ignore',log,log]});
  let timed_out=false,done=false;
  const timer=setTimeout(()=>{timed_out=true;if(process.platform==='win32'&&child.pid){spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}else child.kill();},entry.timeout_ms);
  const finish=(code,error)=>{if(done)return;done=true;clearTimeout(timer);fs.closeSync(log);
    const sources_unchanged=suite_files.every(file=>fs.existsSync(path.join(repository_root,file))&&suite_hashes[file]===hash(fs.readFileSync(path.join(repository_root,file))));
    resolve({id:entry.id,requirements:entry.requirements,design:entry.design,implementation:entry.implementation,source_hashes:suite_hashes,sources_unchanged,level:entry.level,purpose:entry.purpose,iterations:entry.workload_mode==='tiered'?tier:null,status:timed_out?'timeout':error?'blocked':!sources_unchanged?'invalidated':code===0?'passed':'failed',exit_code:code,error:error?String(error):undefined,elapsed_ms:Date.now()-start,log:path.basename(log_path),log_sha256:hash(fs.readFileSync(log_path))});};
  child.on('error',error=>finish(null,error));child.on('close',code=>finish(code));
});
for(const entry of selected) {
  console.log(`[quality] ${entry.id} ${entry.script}`);
  const missing_environment=entry.requires_environment?.filter(name=>!process.env[name]);
  const missing_executables=entry.required_executables?.filter(name=>{try{execFileSync(name,['--version'],{stdio:'ignore',windowsHide:true,timeout:5000});return false;}catch{return true;}});
  if(entry.manual_reason||entry.platform&&entry.platform!==process.platform||missing_environment?.length||missing_executables?.length)report.results.push({id:entry.id,requirements:entry.requirements,status:'not_run',reason:entry.manual_reason||(missing_environment?.length?'缺少环境变量：'+missing_environment.join(','):missing_executables?.length?'缺少程序：'+missing_executables.join(','):'平台不匹配')});
  else report.results.push(await execute(entry));
  persist();console.log(`[quality] ${report.results.at(-1).status}`);
}
report.finished_at=new Date().toISOString();report.asset_manifest_unchanged=report.asset_manifest_sha256===hash(fs.readFileSync(path.join(package_root,'dist/SHA256SUMS')));report.status=report.asset_manifest_unchanged&&report.results.every(result=>result.status==='passed')?'passed':'incomplete';persist();
console.log(JSON.stringify({status:report.status,report:path.join(output,'report.json'),counts:report.results.reduce((counts,result)=>(counts[result.status]=(counts[result.status]||0)+1,counts),{})}));
process.exitCode=report.status==='passed'?0:1;
