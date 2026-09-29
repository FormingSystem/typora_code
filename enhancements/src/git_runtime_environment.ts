import {workspace_text} from "./workspace_i18n";
/** .Git discovery only verifies executable programs, does not touch the repository; successful results are shared by the runtime environment. */
const discoveries = new WeakMap<object, Map<string, Promise<string>>>();
export function clear_git_discovery(child_process: object): void { discoveries.delete(child_process); }
export function discover_git(modules: {child_process: any; process: {env: Record<string,string|undefined>; platform?: string}}, configured = "git"): Promise<string> {
  let cache=discoveries.get(modules.child_process);if(!cache){cache=new Map();discoveries.set(modules.child_process,cache);}
  if(cache.has(configured))return cache.get(configured)!;
  let unavailable:Error|undefined;
  const probe=(file:string)=>new Promise<string>((resolve,reject)=>modules.child_process.execFile(file,['--version'],{windowsHide:true,shell:false,timeout:10000,maxBuffer:Infinity},(error:any,output:string)=>{
    if(error){if(!['ENOENT','ENOTDIR'].includes(error.code))unavailable=error;reject(error);}else if(/^git version /u.test(String(output)))resolve(file);else{unavailable=Error(workspace_text("git_runtime_environment_the_program_did_not_return_git_version"));reject(unavailable);}
  }));
  const task=(async()=>{
    const candidates:string[]=[], env=modules.process.env;
    // .Windows uses absolute PATH candidates, preventing commands from picking up same-named git.exe from the workspace during execution.
    if(configured==='git'&&modules.process.platform==='win32'){
      const path_value=Object.entries(env).find(([key])=>key.toLowerCase()==='path')?.[1]||'';
      for(const directory of path_value.split(';')){const base=directory.replace(/^"|"$/gu,'');if(/^(?:[a-z]:[\\/]|\\\\)/iu.test(base))candidates.push(base+'\\git.exe');}
      for(const candidate of candidates){try{return await probe(candidate);}catch{/* Proceed to the next absolute directory. */}}
    }else{try{return await probe(configured);}catch{/* When the configuration path is missing, report it below. */}}

    if(configured==='git'&&modules.process.platform==='win32'){
      for(const base of [env.ProgramW6432,env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA&&env.LOCALAPPDATA+'\\Programs'])if(base)candidates.push(base+'\\Git\\cmd\\git.exe');
      const registry=await new Promise<string>(resolve=>modules.child_process.execFile('reg.exe',['query','HKLM\\SOFTWARE\\GitForWindows','/v','InstallPath'],{windowsHide:true,timeout:5000,maxBuffer:Infinity},(_error:any,out:string)=>resolve(String(out||'').match(/InstallPath\s+REG_SZ\s+(.+)/u)?.[1]?.trim()||'')));
      if(registry)candidates.push(registry+'\\cmd\\git.exe');
    }
    let last:unknown;
    for(const candidate of new Set(candidates)){try{return await probe(candidate);}catch(error){last=error;}}
    if(unavailable)throw Object.assign(Error(workspace_text("git_runtime_environment_there_is_already_git_that_cannot_run_please_check_the_permis")+unavailable.message),{code:'GIT_UNAVAILABLE'});
    throw Object.assign(Error(workspace_text("git_runtime_environment_no_available_git_found_please_install_git_or_correct_the_git")+(configured!=='git'?workspace_text("git_runtime_environment_configuration")+configured:'')),{code:'GIT_NOT_FOUND',cause:last});
  })();cache.set(configured,task);void task.catch(()=>{if(cache!.get(configured)===task)cache!.delete(configured);});return task;
}
/** Installation is only done when secondary discovery is still missing; winget has download, signature verification, and system authorization. */
export async function install_missing_git(modules: {child_process:any;process:{env:Record<string,string|undefined>;platform?:string}}, report:(message:string)=>void):Promise<string>{
  clear_git_discovery(modules.child_process);
  try{return await discover_git(modules);}catch(error){if((error as any).code!=='GIT_NOT_FOUND')throw error;}
  if(modules.process.platform!=='win32')throw Error(workspace_text("git_runtime_environment_please_use_the_system_software_manager_to_install_git_then_c"));
  report(workspace_text("git_runtime_environment_installing_git_via_windows_software_manager_if_system_author"));
  await new Promise<void>((resolve,reject)=>{
    const child=modules.child_process.spawn('winget',['install','--id','Git.Git','--exact','--source','winget','--interactive','--disable-interactivity'],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    let tail='';const collect=(data:any)=>{tail=(tail+String(data)).slice(-4096);};child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.once('error',(error:Error)=>reject(Error(workspace_text("git_runtime_environment_cannot_start_winget_please_install_it_via_git_official_websi")+error.message)));
    child.once('close',(code:number)=>code===0?resolve():reject(Error(workspace_text("git_runtime_environment_git_installation_not_completed_exit_code")+code+'). '+tail)));
  });clear_git_discovery(modules.child_process);return discover_git(modules);
}
