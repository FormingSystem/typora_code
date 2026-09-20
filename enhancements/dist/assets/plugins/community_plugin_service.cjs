// 社区包只从用户数据目录加载；程序版本不可变，更新不会删除其他窗口正在使用的文件。
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const id_pattern=/^[a-z0-9][a-z0-9._-]{0,127}$/;
function plugin_id(value){if(typeof value!=='string'||!id_pattern.test(value)||value.includes('..')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))throw Error('插件标识无效。');return value;}
function version_parts(value){const match=/^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/.exec(value||'');if(!match)throw Error('插件版本无效。');return match.slice(1);}
function compare_version(left,right){const a=version_parts(left),b=version_parts(right);for(let i=0;i<3;i++){const difference=Number(a[i])-Number(b[i]);if(difference)return Math.sign(difference);}if(a[3]===b[3])return 0;if(!a[3])return 1;if(!b[3])return -1;const x=a[3].split('.'),y=b[3].split('.');for(let i=0;i<Math.max(x.length,y.length);i++){if(x[i]===y[i])continue;if(x[i]===undefined)return -1;if(y[i]===undefined)return 1;const xn=/^\d+$/.test(x[i]),yn=/^\d+$/.test(y[i]);return xn&&yn?Math.sign(Number(x[i])-Number(y[i])):xn?-1:yn?1:x[i]<y[i]?-1:1;}return 0;}
function validate_manifest(value,{host_version,platform=process.platform,core_version='2.10.15'}={}){
 plugin_id(value?.id);version_parts(value.version);
 for(const key of ['name','description','author'])if(typeof value[key]!=='string'||value[key].length>4000||key==='name'&&!value[key].trim())throw Error('插件清单缺少有效的'+key+'。');
 if(!/^[\w.-]+\/[\w.-]+$/.test(value.repo||''))throw Error('插件仓库标识无效。');
 if(!Array.isArray(value.platforms)||!value.platforms.includes(platform))throw Error('插件不支持当前系统。');
 if(compare_version(core_version,value.minCoreVersion)<0)throw Error('插件需要更高版本的社区核心API。');
 if(!host_version||compare_version(host_version,value.minAppVersion)<0)throw Error('插件需要更高版本的Typora。');
 return {id:value.id,name:value.name,description:value.description,author:value.author,repo:value.repo,version:value.version,minCoreVersion:value.minCoreVersion,minAppVersion:value.minAppVersion,platforms:value.platforms};
}
function read_json(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
async function write_json(file,value){
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';
 try{
  await fs.promises.writeFile(temporary,JSON.stringify(value,null,2),'utf8');
  // Windows 索引器和杀毒扫描可能短暂占用目标；保留旧配置，不能先删除再重命名。
  for(let attempt=0;;attempt++){
   try{await fs.promises.rename(temporary,file);break;}
   catch(error){if(attempt>=20||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,25));}
  }
 }finally{await fs.promises.rm(temporary,{force:true});}
}
async function verify_directory(directory){
 if((await fs.promises.lstat(directory)).isSymbolicLink())throw Error("插件根目录不能是链接。");
 const hash=crypto.createHash('sha256');let total=0,count=0;
 const walk=async dir=>{for(const name of (await fs.promises.readdir(dir)).sort()){
  const file=path.join(dir,name),stat=await fs.promises.lstat(file);
  if(stat.isSymbolicLink()||!stat.isFile()&&!stat.isDirectory())throw Error('插件目录包含链接或特殊文件。');
  if(stat.isDirectory())await walk(file);else {if(++count>5000||(total+=stat.size)>128*1024*1024)throw Error('插件体积超过上限。');hash.update(path.relative(directory,file).split(path.sep).join('/'));hash.update('\0');for await(const chunk of fs.createReadStream(file)){hash.update(chunk);}}
 }};
 await walk(directory);if(!(await fs.promises.stat(path.join(directory,'main.js'))).isFile())throw Error('插件缺少main.js。');return hash.digest('hex');
}
function create_community_service({root,host_version,load_plugin,unload_plugin,request,extract,acquire_lock,platform=process.platform}){
 fs.mkdirSync(root,{recursive:true});root=fs.realpathSync(root);
 const state_file=path.join(root,'plugins.json'),package_root=path.join(root,'packages');fs.mkdirSync(package_root,{recursive:true});if(fs.lstatSync(package_root).isSymbolicLink())throw Error('插件包目录不能是链接。');
 const instances=new Map(),errors=new Map(),listeners=new Set();let disposed=false,queue=Promise.resolve(),watcher;
 const notify=()=>{for(const listener of listeners)try{listener();}catch(error){console.error('社区插件视图更新失败',error);}};
 const state=()=>{try{const value=read_json(state_file);if(value.schema!==1||!value.plugins||Array.isArray(value.plugins))throw Error('插件配置格式无效。');return value;}catch(error){if(error.code==='ENOENT')return {schema:1,plugins:{}};throw error;}};
 const enqueue=action=>{const task=queue.then(()=>{if(disposed)throw Error('插件服务已经关闭。');return action();});queue=task.catch(()=>{});return task;};
 const lock=async action=>{let unlock;for(let i=0;i<100;i++){try{unlock=await acquire_lock();break;}catch(error){if(error.code!=='EADDRINUSE')throw error;await new Promise(resolve=>setTimeout(resolve,50));}}if(!unlock)throw Error('另一个窗口正在修改插件，请稍后重试。');try{return await action();}finally{await unlock();}};
 const resolve_entry=(id,entry)=>{
  plugin_id(id);if(!/^[a-f0-9]{64}$/.test(entry?.revision))throw Error('插件版本路径无效。');
  const dir=path.join(package_root,id,entry.revision);if(!fs.realpathSync(dir).startsWith(package_root+path.sep))throw Error('插件路径越界。');
  const manifest=validate_manifest(read_json(path.join(dir,'manifest.json')),{host_version,platform});if(manifest.id!==id)throw Error('插件身份不匹配。');
  return {...manifest,dir,position:'global',revision:entry.revision,enabled:entry.enabled===true};
 };
 const list=()=>{const rows=[];for(const [id,entry]of Object.entries(state().plugins)){try{const value=resolve_entry(id,entry),running=instances.get(id);rows.push({...value,running:!!running,restart_required:!!running&&running.revision!==entry.revision,error:errors.get(id)||''});}catch(error){rows.push({id,name:id,enabled:false,error:String(error.message||error)});}}return rows;};
 const reconcile=async()=>{
  const desired=state().plugins;
  for(const [id,running]of instances)if(!desired[id]||desired[id].enabled!==true){await unload_plugin(running.instance);instances.delete(id);}
  for(const [id,entry]of Object.entries(desired)){
   if(entry.enabled!==true||instances.has(id))continue;
   try{const manifest=resolve_entry(id,entry);if(await verify_directory(manifest.dir)!==entry.revision)throw Error('插件文件校验失败，请重新安装。');const instance=await load_plugin(manifest);if(disposed){await unload_plugin(instance);return;}instances.set(id,{instance,revision:entry.revision});errors.delete(id);}catch(error){errors.set(id,String(error.message||error));}
  }notify();
 };
 async function set_enabled(id,enabled){plugin_id(id);return enqueue(async()=>{await lock(async()=>{const value=state();if(!value.plugins[id])throw Error('插件尚未安装。');resolve_entry(id,value.plugins[id]);value.plugins[id].enabled=!!enabled;await write_json(state_file,value);});await reconcile();if(enabled&&errors.has(id))throw Error(errors.get(id));});}
 async function install_archive(archive,expected){return enqueue(()=>lock(async()=>{
  const temporary=path.join(root,'staging-'+crypto.randomUUID());
  try{
   await extract(archive,temporary);const manifest=validate_manifest(read_json(path.join(temporary,'manifest.json')),{host_version,platform});
   if(expected&&(manifest.id!==expected.id||manifest.repo!==expected.repo||compare_version(manifest.version,expected.version)!==0))throw Error('下载包与所选插件或发行版本不一致。');
   const revision=await verify_directory(temporary),destination=path.join(package_root,manifest.id,revision);fs.mkdirSync(path.dirname(destination),{recursive:true});if(fs.lstatSync(path.dirname(destination)).isSymbolicLink())throw Error("插件目录不能是链接。");
   if(!fs.existsSync(destination))fs.renameSync(temporary,destination);else if(await verify_directory(destination)!==revision)throw Error('现有插件包校验失败。');
   const value=state(),previous=value.plugins[manifest.id];value.plugins[manifest.id]={revision,enabled:previous?.enabled===true};await write_json(state_file,value);notify();return {...manifest,enabled:previous?.enabled===true};
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
 }));}
 async function uninstall(id){plugin_id(id);return enqueue(async()=>{await lock(async()=>{const value=state();delete value.plugins[id];await write_json(state_file,value);});await reconcile();errors.delete(id);notify();});}
 const json_request=async url=>JSON.parse((await request(url,{limit:2*1024*1024})).toString('utf8'));
 async function catalog(){const head=await json_request('https://api.github.com/repos/typora-community-plugin/typora-plugin-releases/commits/main');if(!/^[a-f0-9]{40}$/.test(head.sha))throw Error('社区目录版本身份无效。');const url='https://raw.githubusercontent.com/typora-community-plugin/typora-plugin-releases/'+head.sha+'/';let rows;try{rows=await json_request(url+'community-plugins.zh-cn.json');}catch{rows=await json_request(url+'community-plugins.json');}if(!Array.isArray(rows)||rows.length>2000)throw Error('社区目录格式无效。');return rows.filter(row=>{try{plugin_id(row.id);return /^[\w.-]+\/[\w.-]+$/.test(row.repo)&&typeof row.name==='string'&&typeof row.description==='string';}catch{return false;}});}
 async function latest(info){plugin_id(info.id);if(!/^[\w.-]+\/[\w.-]+$/.test(info.repo))throw Error('插件仓库无效。');const release=await json_request('https://api.github.com/repos/'+info.repo+'/releases/latest');version_parts(release.tag_name);const asset=release.assets?.find(item=>item.name==='plugin.zip');const expected_prefix='https://github.com/'+info.repo+'/releases/download/';if(!asset?.browser_download_url?.startsWith(expected_prefix)||asset.size>32*1024*1024)throw Error('插件发行包无效。');return {id:info.id,repo:info.repo,version:release.tag_name,url:asset.browser_download_url};}
 async function install_online(info){const release=await latest(info),archive=path.join(root,'download-'+crypto.randomUUID()+'.zip');try{await request(release.url,{file:archive,limit:32*1024*1024,timeout_ms:60000});return await install_archive(archive,release);}finally{fs.rmSync(archive,{force:true});}}
 async function start(){if(watcher||disposed)return;watcher=fs.watch(root,(_event,file)=>{if(file==='plugins.json')enqueue(reconcile).catch(error=>{errors.set('service',String(error));notify();});});await enqueue(reconcile);}
 async function dispose(){if(disposed)return;disposed=true;watcher?.close();await queue;for(const {instance}of instances.values())await unload_plugin(instance);instances.clear();listeners.clear();}
 return {list,set_enabled,install_archive,install_online,uninstall,catalog,latest,start,dispose,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
}
module.exports={plugin_id,compare_version,validate_manifest,verify_directory,create_community_service};
