'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),child_process=require('node:child_process');

/** Windows 当前用户DPAPI；磁盘只保存密文，明文不进入参数、日志或工作台配置。 */
function create_credential_store(root){
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
    async save(target,password){if(typeof password!=='string'||!password||password.length>8192)throw Error('SSH密码格式无效');const encrypted=await transform(Buffer.from(password,'utf8'),true);await fs.promises.mkdir(root,{recursive:true});const target_path=location(target),temporary=target_path+'.'+crypto.randomUUID()+'.tmp';try{await fs.promises.writeFile(temporary,encrypted,{flag:'wx',mode:0o600});await fs.promises.rename(temporary,target_path);}finally{await fs.promises.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}},
    async remove(target){await fs.promises.unlink(location(target)).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  };
}
module.exports={create_credential_store};
