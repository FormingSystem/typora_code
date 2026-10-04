'use strict';
const {set_workspace_service_locale,workspace_service_text}=require('./workspace_service_i18n.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function create_language_support_registry({root,community_root,settings_root,catalog,acquire_lock}){
 fs.mkdirSync(root,{recursive:true});const registry_lock=path.join(root,'registration_lock');fs.mkdirSync(registry_lock,{recursive:true});const file=path.join(root,'supports.json'),ids=new Set(catalog.map(item=>item.id));
 const read=(target,fallback)=>{try{return JSON.parse(fs.readFileSync(target,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
 const state=()=>{const value=read(file,{schema:1,supports:{}});if(value.schema!==1||!value.supports||Array.isArray(value.supports))throw Error(workspace_service_text('language_environment_state'));return value;};
 const write=async(target,value)=>{const temporary=target+'.'+crypto.randomUUID()+'.tmp';try{await fs.promises.writeFile(temporary,JSON.stringify(value,null,2),'utf8');await fs.promises.rename(temporary,target);}finally{await fs.promises.rm(temporary,{force:true});}};
 let queue=Promise.resolve();
 const transaction=action=>{const task=queue.then(async()=>{let unlock;for(let i=0;i<100&&!unlock;i++){try{unlock=await acquire_lock(registry_lock);}catch(error){if(error.code!=='EADDRINUSE')throw error;await new Promise(resolve=>setTimeout(resolve,50));}}if(!unlock)throw Error(workspace_service_text('language_support_registry_busy'));try{return await action();}finally{await unlock();}});queue=task.catch(()=>{});return task;};
 const update=(id,changes)=>transaction(async()=>{if(!ids.has(id))throw Error(workspace_service_text('language_environment_unknown'));const value=state();if(changes===null)delete value.supports[id];else value.supports[id]={...value.supports[id],...changes};await write(file,value);return value.supports[id];});
 const migrate=()=>transaction(async()=>{
  const legacy_file=path.join(community_root,'plugins.json');const legacy=read(legacy_file,{schema:1,plugins:{}});
  const matching=Object.keys(legacy.plugins||{}).filter(id=>ids.has(id));if(!matching.length)return;
  const unlock=await acquire_lock(community_root);
  try{
   const current=read(legacy_file,{schema:1,plugins:{}}),value=state();
   for(const id of matching){if(!current.plugins[id])continue;if(!value.supports[id]){const settings=read(path.join(settings_root,'data',id+'.json'),{}).settings||{};value.supports[id]={installed:true,enabled:current.plugins[id].enabled===true,use_environment:settings.use_environment!==false,installation_directory:settings.installation_directory||''};}}
   await write(file,value);
   for(const id of matching)delete current.plugins[id];
   await write(legacy_file,current);
  }finally{await unlock();}
 });
 return {list:()=>state().supports,update,migrate};
}
module.exports={set_workspace_service_locale,create_language_support_registry};
