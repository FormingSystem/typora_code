'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),child_process=require('node:child_process');

/** Windows 当前用户DPAPI；磁盘只保存密文，明文不进入参数、日志或工作台配置。 */
function create_legacy_store(root){
  const supported=process.platform==='win32';
  const location=target=>path.join(root,crypto.createHash('sha256').update(target).digest('hex')+'.bin');
  const transform=(data,protect)=>new Promise((resolve,reject)=>{
    if(!supported){reject(Error('当前平台未接入系统凭据加密，请使用OpenSSH密钥认证。'));return;}
    const script="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::"+(protect?'Protect':'Unprotect')+"($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))";
    const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const child=child_process.execFile(executable,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:65536},(error,stdout)=>{
      if(error){reject(Error('系统凭据加密不可用，未保存密码。'));return;}
      try{resolve(Buffer.from(stdout.trim(),'base64'));}catch{reject(Error('系统凭据响应无效。'));}
    });child.stdin.on('error',()=>{});child.stdin.end(Buffer.from(data).toString('base64'));
  });
  return {supported,
    async read(target){let encrypted;try{encrypted=await fs.promises.readFile(location(target));}catch(error){if(error.code==='ENOENT')return;throw error;}if(encrypted.length>65536)throw Error('SSH凭据记录无效');return (await transform(encrypted,false)).toString('utf8');},
    async remove(target){await fs.promises.unlink(location(target)).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  };
}

/** 系统凭据是唯一秘密持久化位置；root仅用于应用命名空间和旧记录迁移。 */
function create_system_credentials(root){
  const prefix='TyporaCode/SSH/'+crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,32)+'/';
  const supported=process.platform==='win32';
  const invoke=(operation,key,value)=>new Promise((resolve,reject)=>{
    if(!supported)return reject(Error('当前平台未接入系统凭据管理器，请使用密钥或当次密码认证。'));
    const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const child=child_process.execFile(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'remote_ssh_wincred.ps1')],{windowsHide:true,timeout:20000,maxBuffer:1048576},(error,stdout)=>{
      try{const result=JSON.parse(stdout);if(error||!result.ok)throw Error();resolve(result.value);}catch{reject(Error('Windows凭据管理器操作失败，未改用本地密码文件。'));}
    });child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({operation,target:prefix+key,value}));
  });
  return{supported,prefix,async read(key){const value=await invoke('read',key);return value===null?undefined:Buffer.from(value,'base64').toString('utf8');},async write(key,value){const bytes=Buffer.from(value,'utf8');if(bytes.length>2560)throw Error('密码记录超过系统凭据大小限制，未保存。');await invoke('write',key,bytes.toString('base64'));},remove:key=>invoke('delete',key),async list(key){const names=await invoke('list',key);return names.map(name=>name.slice(prefix.length));}};
}
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function create_credential_store(root,storage=create_system_credentials(root)){
 const legacy=create_legacy_store(root);
 const login_key=target=>'login/'+digest(target);
 return {supported:storage.supported,storage,
  async read(target){let value=await storage.read(login_key(target));if(value!==undefined)return value;value=await legacy.read(target);if(value!==undefined){await storage.write(login_key(target),value);if(await storage.read(login_key(target))!==value)throw Error('系统凭据迁移校验失败，已保留旧记录。');await legacy.remove(target);}return value;},
  async save(target,password){if(typeof password!=='string'||!password||Buffer.byteLength(password)>1600)throw Error('SSH密码为空或超过安全存储上限（1600字节）');await storage.write(login_key(target),password);},
  async remove(target){await storage.remove(login_key(target));await legacy.remove(target);}
 };
}
const derive=(password,salt)=>new Promise((resolve,reject)=>crypto.scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
function seal(key,value,aad){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));return{iv:iv.toString('base64'),data:Buffer.concat([cipher.update(value),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};}
function unseal(key,value,aad){const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]);}
/** 自动登录域与查看域独立，重置查看域不会读取或删除自动登录密码。 */
function create_password_vault(credentials,lock=operation=>operation()){
 const store=credentials.storage;
 const metadata=async()=>{const raw=await store.read('vault');return raw?JSON.parse(raw):undefined;};
 const validate=password=>{if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('保险密码须为12至1024个字符。');};
 const keys=()=>new Promise((resolve,reject)=>crypto.generateKeyPair('x25519',{},(error,public_key,private_key)=>error?reject(error):resolve({public_key,private_key})));
 const check=async(password,record)=>{let key;try{key=await derive(password,Buffer.from(record.salt,'base64'));return unseal(key,record.private_key,record.id);}catch{throw Error('保险密码不正确，未显示任何密码。');}finally{key?.fill(0);}};
 const box_key=(record,target)=>'view/'+record.id+'/'+digest(target);
 const record_password=async(record,target,password)=>{
  const pair=await keys(),public_key=crypto.createPublicKey({key:Buffer.from(record.public_key,'base64'),format:'der',type:'spki'}),secret=crypto.diffieHellman({privateKey:pair.private_key,publicKey:public_key});
  const key=Buffer.from(crypto.hkdfSync('sha256',secret,Buffer.from(record.id),Buffer.from(target),32));secret.fill(0);
  try{const encrypted={public_key:pair.public_key.export({format:'der',type:'spki'}).toString('base64'),...seal(key,Buffer.from(password,'utf8'),record.id+target)};await store.write(box_key(record,target),JSON.stringify(encrypted));}finally{key.fill(0);}
 };
 const vault={
  async state(){const record=await metadata();return{configured:Boolean(record?.private_key),reset:Boolean(record?.reset)};},
  async setup(password,targets=[]){validate(password);const previous=await metadata();if(previous?.private_key)throw Error('保险密码已设置，请先解锁或重置。');const pair=await keys(),salt=crypto.randomBytes(16),id=crypto.randomUUID().replaceAll('-',''),key=await derive(password,salt),private_bytes=pair.private_key.export({format:'der',type:'pkcs8'});
   let record;try{record={id,salt:salt.toString('base64'),public_key:pair.public_key.export({format:'der',type:'spki'}).toString('base64'),private_key:seal(key,private_bytes,id)};}finally{key.fill(0);private_bytes.fill(0);}
   await store.write('vault',JSON.stringify(record));
   // 仅首次启用导入现有密码；清除后的重新配置不能自动复活已删除的查看内容。
   if(!previous?.reset)for(const target of targets){const value=await credentials.read(target);if(value)await record_password(record,target,value);}
  },
  async remember(target,password){const record=await metadata();if(record?.private_key)await record_password(record,target,password);},
  async reveal(target,password){const record=await metadata();if(!record?.private_key)throw Error('请先设置查看保险密码。');const private_bytes=await check(password,record);let key;
   try{const raw=await store.read(box_key(record,target));if(!raw)throw Error('该账号没有可查看记录；自动登录仍可使用，重新输入并保存账号密码后可加入保险箱。');const value=JSON.parse(raw),private_key=crypto.createPrivateKey({key:private_bytes,format:'der',type:'pkcs8'}),public_key=crypto.createPublicKey({key:Buffer.from(value.public_key,'base64'),format:'der',type:'spki'}),secret=crypto.diffieHellman({privateKey:private_key,publicKey:public_key});key=Buffer.from(crypto.hkdfSync('sha256',secret,Buffer.from(record.id),Buffer.from(target),32));secret.fill(0);const latest=await metadata();if(latest?.id!==record.id)throw Error('保险箱已在其他窗口重置，请重试。');const clear=unseal(key,value,record.id+target);try{return clear.toString('utf8');}finally{clear.fill(0);}}
   finally{private_bytes.fill(0);key?.fill(0);}
  },
  async change(previous,password){validate(password);const record=await metadata();if(!record?.private_key)throw Error('尚未设置保险密码');const clear=await check(previous,record),salt=crypto.randomBytes(16),key=await derive(password,salt);try{await store.write('vault',JSON.stringify({...record,salt:salt.toString('base64'),private_key:seal(key,clear,record.id)}));}finally{clear.fill(0);key.fill(0);}},
  async reset(){const record=await metadata();await store.write('vault',JSON.stringify({reset:true,id:crypto.randomUUID().replaceAll('-','')}));if(record?.id)for(const key of await store.list('view/'+record.id+'/'))await store.remove(key);},
  async remove(target){const record=await metadata();if(record?.id)await store.remove(box_key(record,target));}
 };
 for(const name of ['setup','remember','change','reset','remove']){const operation=vault[name];vault[name]=(...args)=>lock(()=>operation(...args));}
 return vault;
}
module.exports={create_credential_store,create_system_credentials,create_password_vault};
