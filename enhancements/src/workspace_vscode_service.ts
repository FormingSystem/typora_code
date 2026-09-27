/** 系统环境拥有安装位置；不缓存路径，不执行拼接后的 shell 命令。 */
export type vscode_environment = {
  platform:string; env:Record<string,string|undefined>; fs:any; path_api:any;
  execute(file:string,args:string[]):Promise<string>;
  launch(file:string,args:string[],env:Record<string,string|undefined>):Promise<void>;
};

export function create_vscode_environment(reqnode:(name:string)=>any):vscode_environment {
  const process=reqnode("process"),child_process=reqnode("child_process");
  const lookup_env={...process.env};for(const key of Object.keys(lookup_env))if(key.toLowerCase()==="psmodulepath")delete lookup_env[key];
  return {platform:process.platform,env:process.env,fs:reqnode("fs"),path_api:reqnode("path"),
    execute:(file,args)=>new Promise((resolve,reject)=>child_process.execFile(file,args,{windowsHide:true,timeout:5000,encoding:"utf8",env:lookup_env},(error:unknown,stdout:string)=>error?reject(error):resolve(stdout))),
    launch:(file,args,env)=>new Promise((resolve,reject)=>{
      const child=child_process.spawn(file,args,{shell:false,detached:true,stdio:"ignore",windowsHide:true,env});
      child.once("error",reject);child.once("spawn",()=>{child.unref();resolve();});
    })};
}

export async function discover_vscode(runtime:vscode_environment):Promise<{file:string;args:string[]}> {
  const {fs,path_api,platform,env}=runtime;
  const variable=(name:string)=>Object.entries(env).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||"";
  const expand=(value:string)=>value.replace(/%([^%]+)%/gu,(_,key)=>variable(key));
  const valid=async(file:string)=>{try{if(!path_api.isAbsolute(file))return false;const stat=await fs.promises.stat(file);if(!stat.isFile())return false;if(platform!=="win32")await fs.promises.access(file,fs.constants.X_OK);return true;}catch{return false;}};
  const checked=new Set<string>();
  const candidate=async(file:string)=>{const key=platform==="win32"?file.toLowerCase():file;if(checked.has(key))return;checked.add(key);return await valid(file)?{file,args:[]}:undefined;};
  const from_path=async(value:string)=>{
    for(const part of value.split(platform==="win32"?";":":")){
      const directory=expand(part.trim().replace(/^"|"$/gu,""));
      // 相对/空 PATH 段不能让文档目录中的程序冒充已安装应用。
      if(!directory||!path_api.isAbsolute(directory))continue;
      if(platform==="win32"){
        const executable=await candidate(path_api.join(directory,"Code.exe"));if(executable)return executable;
        if(await valid(path_api.join(directory,"code.cmd"))){const installed=await candidate(path_api.resolve(directory,"..","Code.exe"));if(installed)return installed;}
      }else {const executable=await candidate(path_api.join(directory,"code"));if(executable)return executable;}
    }
  };
  const path_result=await from_path(variable("PATH"));if(path_result)return path_result;
  if(platform==="win32"){
    const system_root=variable("SystemRoot")||variable("windir");
    if(system_root){
      const powershell=path_api.join(system_root,"System32","WindowsPowerShell","v1.0","powershell.exe");
      const query=async(key:string,value?:string)=>{
        // reg.exe 输出使用系统代码页；固定 PowerShell UTF-8，中文安装目录不乱码。
        const registry_key=key.replace(/^HKCU/u,"HKEY_CURRENT_USER").replace(/^HKLM/u,"HKEY_LOCAL_MACHINE");
        try{return (await runtime.execute(powershell,["-NoProfile","-NonInteractive","-Command",`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$key=Get-Item -LiteralPath 'Registry::${registry_key}' -ErrorAction Stop;try{$key.GetValue('${value||""}','','DoNotExpandEnvironmentNames')}finally{$key.Close()}`])).trim();}catch{return "";}
      };
      for(const key of ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe","HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe","HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe"]){
        const registered=expand(await query(key)).replace(/^"|"$/gu,"");const result=await candidate(registered);if(result)return result;
      }
      // Typora 启动后才安装 VS Code 时，进程继承的 PATH 可能尚未更新。
      for(const key of ["HKCU\\Environment","HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"]){const result=await from_path(await query(key,"Path"));if(result)return result;}
    }
    for(const [base,parts] of [[variable("LOCALAPPDATA"),["Programs","Microsoft VS Code","Code.exe"]],[variable("ProgramW6432"),["Microsoft VS Code","Code.exe"]],[variable("ProgramFiles"),["Microsoft VS Code","Code.exe"]],[variable("ProgramFiles(x86)"),["Microsoft VS Code","Code.exe"]]] as [string,string[]][]){
      if(base){const result=await candidate(path_api.join(base,...parts));if(result)return result;}
    }
  }
  if(platform==="darwin"){
    try{
      const apps=await runtime.execute("/usr/bin/mdfind",["kMDItemCFBundleIdentifier == 'com.microsoft.VSCode'"]);
      for(const app of apps.split(/\r?\n/u).filter(Boolean))if(await valid(path_api.join(app,"Contents","MacOS","Electron")))return {file:"/usr/bin/open",args:["-a",app,"--args"]};
    }catch{/* 未安装或未被系统索引时，由下方统一提示。 */}
  }
  throw new Error("未找到 VS Code。请安装 Visual Studio Code，并启用“添加到 PATH”；安装后可直接重试。");
}

export async function open_resource_in_vscode(runtime:vscode_environment,target:string,workspace_root?:string):Promise<void> {
  if(!target||!runtime.path_api.isAbsolute(target))throw new Error("请先将文档保存为本地文件，再在 VS Code 中打开。");
  const stat=await runtime.fs.promises.stat(target).catch(()=>{throw new Error("文件或文件夹不存在，或当前无权访问："+target);});
  if(!stat.isFile()&&!stat.isDirectory())throw new Error("只能在 VS Code 中打开普通文件或文件夹。");
  const root=workspace_root||(stat.isDirectory()?target:runtime.path_api.dirname(target));
  if(!runtime.path_api.isAbsolute(root)||!(await runtime.fs.promises.stat(root).catch(()=>null))?.isDirectory())throw new Error("工程根目录不存在或无法访问："+root);
  let file=stat.isFile()?target:undefined;
  if(stat.isDirectory()){
    // 保留工程根。目录以直属文件定位，不递归扫描、不创建占位文件。
    const entries=await runtime.fs.promises.readdir(target,{withFileTypes:true});
    const names=entries.filter((entry:any)=>entry.isFile()).map((entry:any)=>entry.name) as string[];
    names.sort((a,b)=>Number(/^readme(?:\.|$)/iu.test(b))-Number(/^readme(?:\.|$)/iu.test(a))||a.localeCompare(b));
    if(names.length)file=runtime.path_api.join(target,names[0]);
  }
  const application=await discover_vscode(runtime),env={...runtime.env};
  for(const key of Object.keys(env))if(["ELECTRON_RUN_AS_NODE","VSCODE_IPC_HOOK_CLI"].includes(key.toUpperCase()))delete env[key];
  try{await runtime.launch(application.file,[...application.args,"--",root,...(file?[file]:[])],env);}
  catch(error){throw new Error("无法启动 VS Code："+(error instanceof Error?error.message:String(error)));}
}
