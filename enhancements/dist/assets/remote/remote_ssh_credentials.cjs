'use strict';
const {workspace_service_text,set_workspace_service_locale}=require("./workspace_service_i18n.cjs");
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),child_process=require('node:child_process');

/** Use Windows DPAPI for the current user; store only ciphertext on disk and never put plaintext in arguments, logs, or workbench settings. */
function create_legacy_store(root){
  const supported=process.platform==='win32';
  const location=target=>path.join(root,crypto.createHash('sha256').update(target).digest('hex')+'.bin');
  const transform=(data,protect)=>new Promise((resolve,reject)=>{
    if(!supported){reject(Error(workspace_service_text("service_537f77c9981a")));return;}
    const script="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::"+(protect?'Protect':'Unprotect')+"($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))";
    const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const child=child_process.execFile(executable,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:Infinity},(error,stdout)=>{
      if(error){reject(Error(workspace_service_text("service_d445a19b5f6d")));return;}
      try{resolve(Buffer.from(stdout.trim(),'base64'));}catch{reject(Error(workspace_service_text("service_0dd7bfe2bc1d")));}
    });child.stdin.on('error',()=>{});child.stdin.end(Buffer.from(data).toString('base64'));
  });
  return {supported,
    async read(target){let encrypted;try{encrypted=await fs.promises.readFile(location(target));}catch(error){if(error.code==='ENOENT')return;throw error;}if(encrypted.length>65536)throw Error(workspace_service_text("service_7b2c448d36f1"));return (await transform(encrypted,false)).toString('utf8');},
    async remove(target){await fs.promises.unlink(location(target)).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  };
}

/** System credentials are the sole persistent secret store; root is used only for the application namespace and migration of old records. */
function create_system_credentials(root){
  const prefix='TyporaCode/SSH/'+crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,32)+'/';
  const supported=process.platform==='win32';
  const invoke=(operation,key,value)=>new Promise((resolve,reject)=>{
    if(!supported)return reject(Error(workspace_service_text("service_759c3cf57f8f")));
    const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const child=child_process.execFile(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'remote_ssh_wincred.ps1')],{windowsHide:true,timeout:20000,maxBuffer:Infinity},(error,stdout)=>{
      try{const result=JSON.parse(stdout);if(error||!result.ok)throw Error();resolve(result.value);}catch{reject(Error(workspace_service_text("service_b0ec1874a150")));}
    });child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({operation,target:prefix+key,value}));
  });
  return{supported,prefix,async read(key){const value=await invoke('read',key);return value===null?undefined:Buffer.from(value,'base64').toString('utf8');},async write(key,value){const bytes=Buffer.from(value,'utf8');if(bytes.length>2560)throw Error(workspace_service_text("service_b46b3035ab61"));await invoke('write',key,bytes.toString('base64'));},remove:key=>invoke('delete',key),async list(key){const names=await invoke('list',key);return names.map(name=>name.slice(prefix.length));}};
}
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function create_credential_store(root,storage=create_system_credentials(root)){
 const legacy=create_legacy_store(root);
 const login_key=target=>'login/'+digest(target);
 return {supported:storage.supported,storage,
  async read(target){let value=await storage.read(login_key(target));if(value!==undefined)return value;value=await legacy.read(target);if(value!==undefined){await storage.write(login_key(target),value);if(await storage.read(login_key(target))!==value)throw Error(workspace_service_text("service_5a5fed67c591"));await legacy.remove(target);}return value;},
  async save(target,password){if(typeof password!=='string'||!password||Buffer.byteLength(password)>1600)throw Error(workspace_service_text("service_668fafe3bdb6"));await storage.write(login_key(target),password);},
  async remove(target){await storage.remove(login_key(target));await legacy.remove(target);}
 };
}
const derive=(password,salt)=>new Promise((resolve,reject)=>crypto.scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
function seal(key,value,aad){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));return{iv:iv.toString('base64'),data:Buffer.concat([cipher.update(value),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};}
function unseal(key,value,aad){const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]);}
/** Automatic login and password viewing have separate domains; resetting the viewing domain neither reads nor deletes automatic-login passwords. */
function create_password_vault(credentials,lock=operation=>operation()){
 const store=credentials.storage;
 const metadata=async()=>{const raw=await store.read('vault');return raw?JSON.parse(raw):undefined;};
 const validate=password=>{if(typeof password!=='string'||password.length<12||password.length>1024)throw Error(workspace_service_text("service_d07ffdf4bb10"));};
 const keys=()=>new Promise((resolve,reject)=>crypto.generateKeyPair('x25519',{},(error,public_key,private_key)=>error?reject(error):resolve({public_key,private_key})));
 const check=async(password,record)=>{let key;try{key=await derive(password,Buffer.from(record.salt,'base64'));return unseal(key,record.private_key,record.id);}catch{throw Error(workspace_service_text("service_0928abb83c4c"));}finally{key?.fill(0);}};
 const box_key=(record,target)=>'view/'+record.id+'/'+digest(target);
 const record_password=async(record,target,password)=>{
  const pair=await keys(),public_key=crypto.createPublicKey({key:Buffer.from(record.public_key,'base64'),format:'der',type:'spki'}),secret=crypto.diffieHellman({privateKey:pair.private_key,publicKey:public_key});
  const key=Buffer.from(crypto.hkdfSync('sha256',secret,Buffer.from(record.id),Buffer.from(target),32));secret.fill(0);
  try{const encrypted={public_key:pair.public_key.export({format:'der',type:'spki'}).toString('base64'),...seal(key,Buffer.from(password,'utf8'),record.id+target)};await store.write(box_key(record,target),JSON.stringify(encrypted));}finally{key.fill(0);}
 };
 const vault={
  async state(){const record=await metadata();return{configured:Boolean(record?.private_key),reset:Boolean(record?.reset)};},
  async setup(password,targets=[]){validate(password);const previous=await metadata();if(previous?.private_key)throw Error(workspace_service_text("service_5ef47b55bbeb"));const pair=await keys(),salt=crypto.randomBytes(16),id=crypto.randomUUID().replaceAll('-',''),key=await derive(password,salt),private_bytes=pair.private_key.export({format:'der',type:'pkcs8'});
   let record;try{record={id,salt:salt.toString('base64'),public_key:pair.public_key.export({format:'der',type:'spki'}).toString('base64'),private_key:seal(key,private_bytes,id)};}finally{key.fill(0);private_bytes.fill(0);}
   await store.write('vault',JSON.stringify(record));
   // Import existing passwords only on first activation; reconfiguration after clearing must not restore deleted viewing records automatically.
   if(!previous?.reset)for(const target of targets){const value=await credentials.read(target);if(value)await record_password(record,target,value);}
  },
  async remember(target,password){const record=await metadata();if(record?.private_key)await record_password(record,target,password);},
  async reveal(target,password){const record=await metadata();if(!record?.private_key)throw Error(workspace_service_text("service_b152dadedc15"));const private_bytes=await check(password,record);let key;
   try{const raw=await store.read(box_key(record,target));if(!raw)throw Error(workspace_service_text("service_174ff4a07720"));const value=JSON.parse(raw),private_key=crypto.createPrivateKey({key:private_bytes,format:'der',type:'pkcs8'}),public_key=crypto.createPublicKey({key:Buffer.from(value.public_key,'base64'),format:'der',type:'spki'}),secret=crypto.diffieHellman({privateKey:private_key,publicKey:public_key});key=Buffer.from(crypto.hkdfSync('sha256',secret,Buffer.from(record.id),Buffer.from(target),32));secret.fill(0);const latest=await metadata();if(latest?.id!==record.id)throw Error(workspace_service_text("service_be39ae514bf9"));const clear=unseal(key,value,record.id+target);try{return clear.toString('utf8');}finally{clear.fill(0);}}
   finally{private_bytes.fill(0);key?.fill(0);}
  },
  async change(previous,password){validate(password);const record=await metadata();if(!record?.private_key)throw Error(workspace_service_text("service_76cfddf52a39"));const clear=await check(previous,record),salt=crypto.randomBytes(16),key=await derive(password,salt);try{await store.write('vault',JSON.stringify({...record,salt:salt.toString('base64'),private_key:seal(key,clear,record.id)}));}finally{clear.fill(0);key.fill(0);}},
  async reset(){const record=await metadata();await store.write('vault',JSON.stringify({reset:true,id:crypto.randomUUID().replaceAll('-','')}));if(record?.id)for(const key of await store.list('view/'+record.id+'/'))await store.remove(key);},
  async remove(target){const record=await metadata();if(record?.id)await store.remove(box_key(record,target));}
 };
 for(const name of ['setup','remember','change','reset','remove']){const operation=vault[name];vault[name]=(...args)=>lock(()=>operation(...args));}
 return vault;
}
module.exports={set_workspace_service_locale,create_credential_store,create_system_credentials,create_password_vault};
