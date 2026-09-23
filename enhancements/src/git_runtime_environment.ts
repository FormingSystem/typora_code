/** Git发现只验证可执行程序，不触碰仓库；成功结果由运行环境共享。 */
const discoveries = new WeakMap<object, Map<string, Promise<string>>>();
export function clear_git_discovery(child_process: object): void { discoveries.delete(child_process); }
export function discover_git(modules: {child_process: any; process: {env: Record<string,string|undefined>; platform?: string}}, configured = "git"): Promise<string> {
  let cache=discoveries.get(modules.child_process);if(!cache){cache=new Map();discoveries.set(modules.child_process,cache);}
  if(cache.has(configured))return cache.get(configured)!;
  let unavailable:Error|undefined;
  const probe=(file:string)=>new Promise<string>((resolve,reject)=>modules.child_process.execFile(file,['--version'],{windowsHide:true,shell:false,timeout:10000,maxBuffer:65536},(error:any,output:string)=>{
    if(error){if(!['ENOENT','ENOTDIR'].includes(error.code))unavailable=error;reject(error);}else if(/^git version /u.test(String(output)))resolve(file);else{unavailable=Error('程序未返回Git版本。');reject(unavailable);}
  }));
  const task=(async()=>{
    const candidates:string[]=[], env=modules.process.env;
    // Windows使用绝对PATH候选，防止命令运行时从工作区拾取同名git.exe。
    if(configured==='git'&&modules.process.platform==='win32'){
      const path_value=Object.entries(env).find(([key])=>key.toLowerCase()==='path')?.[1]||'';
      for(const directory of path_value.split(';')){const base=directory.replace(/^"|"$/gu,'');if(/^(?:[a-z]:[\\/]|\\\\)/iu.test(base))candidates.push(base+'\\git.exe');}
      for(const candidate of candidates){try{return await probe(candidate);}catch{/* 继续下一个绝对目录。 */}}
    }else{try{return await probe(configured);}catch{/* 配置路径缺失时由下方报告。 */}}

    if(configured==='git'&&modules.process.platform==='win32'){
      for(const base of [env.ProgramW6432,env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA&&env.LOCALAPPDATA+'\\Programs'])if(base)candidates.push(base+'\\Git\\cmd\\git.exe');
      const registry=await new Promise<string>(resolve=>modules.child_process.execFile('reg.exe',['query','HKLM\\SOFTWARE\\GitForWindows','/v','InstallPath'],{windowsHide:true,timeout:5000,maxBuffer:65536},(_error:any,out:string)=>resolve(String(out||'').match(/InstallPath\s+REG_SZ\s+(.+)/u)?.[1]?.trim()||'')));
      if(registry)candidates.push(registry+'\\cmd\\git.exe');
    }
    let last:unknown;
    for(const candidate of new Set(candidates)){try{return await probe(candidate);}catch(error){last=error;}}
    if(unavailable)throw Object.assign(Error('已有Git无法运行，请检查权限或程序路径：'+unavailable.message),{code:'GIT_UNAVAILABLE'});
    throw Object.assign(Error('未找到可用Git。请安装Git，或在设置中修正Git程序路径。'+(configured!=='git'?' 配置：'+configured:'')),{code:'GIT_NOT_FOUND',cause:last});
  })();cache.set(configured,task);void task.catch(()=>{if(cache!.get(configured)===task)cache!.delete(configured);});return task;
}
/** 只在二次发现仍缺失时安装；winget拥有下载、签名验证和系统授权。 */
export async function install_missing_git(modules: {child_process:any;process:{env:Record<string,string|undefined>;platform?:string}}, report:(message:string)=>void):Promise<string>{
  clear_git_discovery(modules.child_process);
  try{return await discover_git(modules);}catch(error){if((error as any).code!=='GIT_NOT_FOUND')throw error;}
  if(modules.process.platform!=='win32')throw Error('请使用系统软件管理器安装Git，然后点击重试。官方安装说明：https://git-scm.com/install/');
  report('正在通过Windows软件管理器安装Git；如出现系统授权或安装窗口，请完成操作…');
  await new Promise<void>((resolve,reject)=>{
    const child=modules.child_process.spawn('winget',['install','--id','Git.Git','--exact','--source','winget','--interactive','--disable-interactivity'],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    let tail='';const collect=(data:any)=>{tail=(tail+String(data)).slice(-4096);};child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.once('error',(error:Error)=>reject(Error('无法启动winget，请通过Git官网安装后重试。'+error.message)));
    child.once('close',(code:number)=>code===0?resolve():reject(Error('Git安装未完成（退出码'+code+'）。'+tail)));
  });clear_git_discovery(modules.child_process);return discover_git(modules);
}
