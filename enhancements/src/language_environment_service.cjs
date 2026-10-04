'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),child_process=require('node:child_process');
const tar=require('tar');
const {set_workspace_service_locale,workspace_service_text}=require('./workspace_service_i18n.cjs');
const catalog=require('./language_environment_catalog.json');
const {normalize}=require('./workspace_network_configuration.cjs');
function package_environment(configuration){
 const network=normalize(configuration),environment={};
 if(network.proxy_mode!=='environment'){
  for(const name of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','npm_config_proxy','npm_config_https_proxy'])environment[name]='';
  if(network.proxy_mode==='manual'){
   environment.HTTP_PROXY=environment.http_proxy=environment.npm_config_proxy=network.http_proxy_url;
   environment.HTTPS_PROXY=environment.https_proxy=environment.npm_config_https_proxy=network.https_proxy_url;
   environment.NO_PROXY=environment.no_proxy='';
  }
 }
 if(network.ca_file){environment.NODE_EXTRA_CA_CERTS=network.ca_file;environment.npm_config_cafile=network.ca_file;environment.PIP_CERT=network.ca_file;}
 return environment;
}
const read_json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const aborted=()=>Object.assign(Error(workspace_service_text('language_environment_cancelled')),{name:'AbortError'});
const check=signal=>{if(signal?.aborted)throw aborted();};
function entry_for(id){const entry=catalog.plugins.find(item=>item.id===id);if(!entry)throw Error(workspace_service_text('language_environment_unknown'));return entry;}
function allowed_url(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!['github.com','api.github.com','release-assets.githubusercontent.com','nodejs.org','www.python.org','files.pythonhosted.org','pypi.org','download.eclipse.org','builds.dotnet.microsoft.com','api.nuget.org','globalcdn.nuget.org','registry.npmjs.org'].includes(url.hostname))throw Error(workspace_service_text('language_environment_source'));return url;}
async function write_json(file,value){const temporary=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.promises.writeFile(temporary,JSON.stringify(value,null,2),'utf8');await fs.promises.rename(temporary,file);}finally{await fs.promises.rm(temporary,{force:true});}}
async function no_links(target){let current=path.resolve(target);for(;;){try{if((await fs.promises.lstat(current)).isSymbolicLink())throw Error(workspace_service_text('language_environment_links'));}catch(error){if(error.code!=='ENOENT')throw error;}const parent=path.dirname(current);if(parent===current)break;current=parent;}}
async function verify_tree(target,first=true){if(first)await no_links(target);for(const item of await fs.promises.readdir(target,{withFileTypes:true})){if(item.isSymbolicLink())throw Error(workspace_service_text('language_environment_linked'));if(item.isDirectory())await verify_tree(path.join(target,item.name),false);}}
async function remove_owned(directory,id){
 await no_links(directory);const marker=read_json(path.join(directory,'.typora_code_environment.json'));
 if(marker.schema!==1||marker.id!==id||marker.directory!==path.resolve(directory)||!/^env-[a-f0-9]{16}$/.test(path.basename(directory)))throw Error(workspace_service_text('language_environment_ownership'));
 await verify_tree(directory);await fs.promises.rm(directory,{recursive:true,force:false,maxRetries:8,retryDelay:250});
}
function execute(executable,args,{cwd,env,signal,on_output=()=>{},timeout_ms=600000}={}){
 check(signal);
 return new Promise((resolve,reject)=>{
  let output='',failure;const child=child_process.spawn(executable,args,{cwd,env:{...process.env,...env},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const stop=()=>{failure=aborted();if(child.pid&&process.platform==='win32')child_process.execFile(path.join(process.env.SystemRoot,'System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill();};
  const timer=setTimeout(()=>{stop();failure=Error(workspace_service_text('language_environment_timeout'));},timeout_ms);
  const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
  signal?.addEventListener('abort',stop,{once:true});
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{const text=bytes.toString('utf8');output=(output+text).slice(-65536);on_output(text);});
  child.once('error',error=>{finish();reject(error);});
  child.once('close',code=>{finish();failure?reject(failure):code!==0?reject(Error(output||'Language tool command failed: '+code)):resolve(output);});
  if(signal?.aborted)stop();
 });
}
async function extract_tar(archive,destination){
 const names=new Set();
 const safe=entry=>{
  const name=entry.path.replace(/\/$/,'');
  if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..'||/[<>:"|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))||!['File','Directory'].includes(entry.type))throw Error(workspace_service_text('language_environment_archive',{name:name}));
  const identity=name.toLowerCase();if(names.has(identity))throw Error(workspace_service_text('language_environment_duplicate'));names.add(identity);
 };
 await tar.t({file:archive,onReadEntry:safe,strict:true});
 await fs.promises.mkdir(destination);await tar.x({file:archive,cwd:destination,strict:true,preservePaths:false});
 await verify_tree(destination);
}
function create_language_environment_service({root,request,extract_zip,acquire_lock,package_environment=()=>({}),run=execute,platform=process.platform,arch=process.arch}){
 fs.mkdirSync(root,{recursive:true});const state_file=path.join(root,'installed.json');
 const state=()=>{try{const value=read_json(state_file);if(value.schema!==1||!value.environments||Array.isArray(value.environments))throw Error(workspace_service_text('language_environment_state'));return value;}catch(error){if(error.code==='ENOENT')return {schema:1,environments:{}};throw error;}};
 const current=id=>{entry_for(id);return state().environments[id];};
 const with_lock=async action=>{const unlock=await acquire_lock();try{return await action();}finally{await unlock();}};
 const digest_file=async(file,algorithm)=>{const hash=crypto.createHash(algorithm);for await(const bytes of fs.createReadStream(file))hash.update(bytes);return hash.digest('hex');};
 const install=(id,{directory='',signal,on_progress=()=>{}}={})=>with_lock(async()=>{
  const entry=entry_for(id);if(platform!=='win32'||arch!=='x64')throw Error(workspace_service_text('language_environment_platform'));
  check(signal);const value=state();if(value.environments[id])throw Error(workspace_service_text('language_environment_exists'));
  const base=directory||path.join(root,'tools');if(!path.isAbsolute(base)||/[\r\n\0]/.test(base))throw Error(workspace_service_text('language_environment_absolute'));
  await no_links(base);await fs.promises.mkdir(base,{recursive:true});
  const destination=path.join(base,'typora_code_tools',id.replace('typora_code.language_',''),'env-'+crypto.randomBytes(8).toString('hex'));await no_links(destination);await fs.promises.mkdir(destination,{recursive:true});
  await write_json(path.join(destination,'.typora_code_environment.json'),{schema:1,id,directory:destination});
  const downloads=path.join(destination,'downloads');await fs.promises.mkdir(downloads);
  try{
   const unpack=async(asset,name)=>{
    check(signal);on_progress(workspace_service_text('language_environment_download',{name:name}));const file=path.join(downloads,name+(asset.kind==='tar'?'.tar.gz':'.zip'));
    await request(asset.url,{file,signal,timeout_ms:600000,validate_url:allowed_url,on_progress:(received,total)=>on_progress(workspace_service_text('language_environment_download',{name:name})+': '+Math.round(received/1048576)+' MB'+(total?' / '+Math.round(total/1048576)+' MB':''))});
    const algorithm=asset.sha512?'sha512':'sha256',expected=asset[algorithm];if(!expected||await digest_file(file,algorithm)!==expected)throw Error(workspace_service_text('language_environment_checksum',{name:name}));
    check(signal);on_progress(workspace_service_text('language_environment_extract',{name:name}));const out=path.join(destination,name);if(asset.kind==='tar')await extract_tar(file,out);else await extract_zip(file,out,signal);check(signal);return asset.prefix?path.join(out,asset.prefix):out;
   };
   const command_env={...package_environment(),ELECTRON_RUN_AS_NODE:'',NPM_CONFIG_USERCONFIG:path.join(destination,'npmrc'),NPM_CONFIG_CACHE:path.join(destination,'cache/npm'),PIP_CONFIG_FILE:'NUL',PIP_DISABLE_PIP_VERSION_CHECK:'1',PIP_CACHE_DIR:path.join(destination,'cache/pip'),PYTHONNOUSERSITE:'1',DOTNET_CLI_HOME:path.join(destination,'cache/dotnet'),NUGET_PACKAGES:path.join(destination,'cache/nuget'),DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_ADD_GLOBAL_TOOLS_TO_PATH:'false',DOTNET_NOLOGO:'1'};
   const exec=(executable,args)=>{check(signal);on_progress(workspace_service_text('language_environment_prepare',{name:entry.name}));return run(executable,args,{cwd:destination,env:command_env,signal,on_output:text=>on_progress(text.slice(-2000))});};
   let command,args=[],environment={},tools={};
   if(entry.recipe==='npm'){
    const runtime=await unpack(catalog.runtimes.node,'node'),node=path.join(runtime,'node.exe');command_env.PATH=runtime+path.delimiter+process.env.PATH;
    await fs.promises.writeFile(path.join(destination,'npmrc'),'registry=https://registry.npmjs.org/\nignore-scripts=true\n','utf8');
    await exec(node,[path.join(runtime,'node_modules/npm/bin/npm-cli.js'),'install','--prefix',path.join(destination,'server'),'--ignore-scripts','--no-audit','--no-fund','--save-exact',...entry.packages]);
    command=node;args=[path.join(destination,'server/node_modules',entry.entry),...entry.args];tools.node=node;
   }else if(entry.recipe==='archive'){
    const server=await unpack(entry.asset,'server');command=path.join(server,entry.entry);args=entry.args;tools.server=command;
   }else if(entry.recipe==='python'){
    const runtime=await unpack(catalog.runtimes.python,'python'),python=path.join(runtime,'python.exe'),pip=await unpack(catalog.runtimes.pip,'pip');
    const pth=(await fs.promises.readdir(runtime)).find(name=>/^python\d+\._pth$/.test(name));if(!pth)throw Error(workspace_service_text('language_environment_python'));
    await fs.promises.appendFile(path.join(runtime,pth),'\n../server\nimport site\n','utf8');
    await exec(python,[path.join(pip,'pip'),'install','--only-binary=:all:','--no-warn-script-location','--target',path.join(destination,'server'),'--index-url','https://pypi.org/simple',...entry.packages]);
    command=python;args=['-m',entry.entry];tools.python=python;
   }else if(entry.recipe==='dotnet'){
    const runtime=await unpack(catalog.runtimes.dotnet,'dotnet'),dotnet=path.join(runtime,'dotnet.exe');command_env.DOTNET_ROOT=runtime;command_env.PATH=runtime+path.delimiter+process.env.PATH;
    const config=path.join(destination,'nuget.config');await fs.promises.writeFile(config,'<configuration><packageSources><clear/><add key="nuget" value="https://api.nuget.org/v3/index.json"/></packageSources></configuration>','utf8');
    await exec(dotnet,['tool','install','csharp-ls','--version',entry.server_version,'--tool-path',path.join(destination,'server'),'--configfile',config]);
    command=dotnet;args=[path.join(destination,'server/.store/csharp-ls',entry.server_version,'csharp-ls',entry.server_version,'tools/net10.0/any/CSharpLanguageServer.dll')];environment={DOTNET_ROOT:runtime,PATH:runtime+path.delimiter+process.env.PATH,DOTNET_CLI_HOME:command_env.DOTNET_CLI_HOME,NUGET_PACKAGES:command_env.NUGET_PACKAGES,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_ADD_GLOBAL_TOOLS_TO_PATH:'false'};tools.dotnet=dotnet;
   }else if(entry.recipe==='java'){
    const runtime=await unpack(catalog.runtimes.jdk,'jdk'),server=await unpack(entry.asset,'server');command=path.join(runtime,'bin/java.exe');
    const launchers=(await fs.promises.readdir(path.join(server,'plugins'))).filter(name=>/^org\.eclipse\.equinox\.launcher_[\w.-]+\.jar$/.test(name));if(launchers.length!==1)throw Error(workspace_service_text('language_environment_java'));
    args=['-Declipse.application=org.eclipse.jdt.ls.core.id1','-Dosgi.bundles.defaultStartLevel=4','-Declipse.product=org.eclipse.jdt.ls.core.product','-Xmx1G','--add-modules=ALL-SYSTEM','--add-opens','java.base/java.util=ALL-UNNAMED','--add-opens','java.base/java.lang=ALL-UNNAMED','-jar',path.join(server,'plugins',launchers[0]),'-configuration',path.join(server,'config_win'),'-data',path.join(destination,'workspace','${workspace_hash}','${session_id}')];environment={JAVA_HOME:runtime};tools.java=command;tools.javac=path.join(runtime,'bin/javac.exe');
   }else throw Error(workspace_service_text('language_environment_recipe'));
   check(signal);for(const file of [command,...args.filter(arg=>path.isAbsolute(arg)&&!/\$\{/.test(arg))]){if(!fs.existsSync(file))throw Error(workspace_service_text('language_environment_entry',{name:file}));}
   await verify_tree(destination);const record={id,version:entry.version,directory:destination,command,args,environment,tools,installed_at:new Date().toISOString()};
   await fs.promises.rm(downloads,{recursive:true});check(signal);value.environments[id]=record;await write_json(state_file,value);on_progress(workspace_service_text('language_environment_installed'));return record;
  }catch(error){try{await remove_owned(destination,id);}catch(cleanup_error){error.message+='\nCleanup required: '+destination+'\n'+cleanup_error.message;}throw error;}
 });
 const uninstall=id=>with_lock(async()=>{entry_for(id);const value=state(),record=value.environments[id];if(!record)return;try{await remove_owned(record.directory,id);}catch(error){if(error.code!=='ENOENT'||fs.existsSync(record.directory))throw error;}delete value.environments[id];await write_json(state_file,value);});
 return {catalog:()=>catalog.plugins,current,install,uninstall};
}
module.exports={set_workspace_service_locale,catalog,entry_for,allowed_url,execute,extract_tar,no_links,remove_owned,package_environment,create_language_environment_service};
