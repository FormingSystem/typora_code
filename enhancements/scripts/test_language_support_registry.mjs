import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{create_language_support_registry}=require('../src/language_support_registry.cjs'),{acquire_update_lock}=require('../src/workspace_update_service.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'language_registry_')),community=path.join(root,'community'),settings=path.join(root,'settings'),owned=path.join(root,'languages');
await fs.mkdir(community);await fs.mkdir(path.join(settings,'data'),{recursive:true});
const id='typora_code.language_cmake',file=path.join(community,'plugins.json'),preference=path.join(settings,'data',id+'.json');
await fs.writeFile(file,JSON.stringify({schema:1,plugins:{[id]:{enabled:true,revision:'legacy'},'third.party':{enabled:true,revision:'untouched'}}}));
await fs.writeFile(preference,JSON.stringify({version:1,settings:{installation_directory:path.join(root,'custom'),use_environment:false}}));
const registry=create_language_support_registry({root:owned,community_root:community,settings_root:settings,catalog:[{id}],acquire_lock:acquire_update_lock});
try{
 await registry.migrate();assert.deepEqual(registry.list()[id],{installed:true,enabled:true,use_environment:false,installation_directory:path.join(root,'custom')});
 assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).plugins,{'third.party':{enabled:true,revision:'untouched'}});assert.equal(JSON.parse(await fs.readFile(preference)).settings.use_environment,false);
 for(let i=0;i<20;i++){await registry.migrate();await registry.update(id,{enabled:i%2===0});}
 assert.equal(registry.list()[id].enabled,false);assert.equal(registry.list()[id].use_environment,false);
 const updates=Array.from({length:100},(_,index)=>registry.update(id,{iteration:index}));await Promise.all(updates);assert.equal(registry.list()[id].iteration,99);
 const release_download=await acquire_update_lock(owned);try{await registry.update(id,{use_environment:false});assert.equal(registry.list()[id].use_environment,false);}finally{await release_download();}
 await registry.update(id,null);assert.deepEqual(registry.list(),{});await registry.migrate();assert.deepEqual(registry.list(),{});
 await assert.rejects(registry.update('third.party',{enabled:true}));
 console.log('PASS independent language registry: precise legacy migration, retained preferences/third-party state, 20 retries, 100 serialized updates and uninstall.');
}finally{await fs.rm(root,{recursive:true,force:true});}
