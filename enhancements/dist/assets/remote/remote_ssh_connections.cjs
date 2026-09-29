'use strict';
const {workspace_service_text,set_workspace_service_locale}=require("./workspace_service_i18n.cjs");
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate_target}=require('./remote_ssh_service.cjs');
async function with_store_lock(root,operation){
 await fs.promises.mkdir(root,{recursive:true});const file=path.join(root,'mutation.lock');let handle;
 const end=Date.now()+20000;
 while(!handle){try{handle=await fs.promises.open(file,'wx',0o600);await handle.writeFile(String(process.pid));}catch(error){if(error.code!=='EEXIST')throw error;try{const pid=Number(await fs.promises.readFile(file,'utf8'));if(pid){try{process.kill(pid,0);}catch(check){if(check.code==='ESRCH')await fs.promises.unlink(file);}}}catch{}if(Date.now()>end)throw Error(workspace_service_text("service_13939e8c2d1c"));await new Promise(resolve=>setTimeout(resolve,40));}}
 try{return await operation();}finally{await handle.close();await fs.promises.unlink(file);}
}
function validate_connection(value){
 const target=validate_target(String(value.target||'').trim()),port=Number(value.port||0),folder=String(value.folder||'');
 if(!Number.isInteger(port)||port<0||port>65535)throw Error(workspace_service_text("service_15cbb1fe5a7d"));
 if(folder&&(!folder.startsWith('/')||/[\0\r\n]/u.test(folder)))throw Error(workspace_service_text("service_550602aa589f"));
 const name=String(value.name||target).trim();if(!name||name.length>120||/[\0\r\n]/u.test(name))throw Error(workspace_service_text("service_9e17d09b4712"));
 const host_name=String(value.host_name||target.split('@').at(-1)).trim();if(!host_name||host_name.length>120||/[\0\r\n]/u.test(host_name))throw Error(workspace_service_text("service_7681e444b94e"));
 return{id:/^[a-f0-9-]{36}$/.test(value.id)?value.id:crypto.randomUUID(),name,host_name,target,port,folder};
}
function create_connection_store(root){
 const file=path.join(root,'connections.json');
 const list=async()=>{try{const data=JSON.parse(await fs.promises.readFile(file,'utf8'));if(!Array.isArray(data))throw Error(workspace_service_text("service_9503347061f5"));return data.map(validate_connection);}catch(error){if(error.code==='ENOENT')return[];throw error;}};
 const update=operation=>with_store_lock(root,async()=>{const records=await list(),result=operation(records),temporary=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.promises.writeFile(temporary,JSON.stringify(records,null,2),{flag:'wx',mode:0o600});await fs.promises.rename(temporary,file);}finally{await fs.promises.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}return result;});
 return{list,save:value=>update(records=>{const item=validate_connection(value),index=records.findIndex(record=>record.id===item.id);if(index<0){records.push(item);}else records[index]=item;for(const peer of records)if(peer.target.split('@').at(-1)===item.target.split('@').at(-1)&&peer.port===item.port)peer.host_name=item.host_name;return item;}),remove:id=>update(records=>{const index=records.findIndex(record=>record.id===id);if(index>=0)records.splice(index,1);})};
}
module.exports={set_workspace_service_locale,create_connection_store,validate_connection,with_store_lock};
