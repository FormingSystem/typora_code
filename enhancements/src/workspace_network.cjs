// 更新与社区下载共用的请求级网络适配；不修改全局Agent、系统信任库或进程环境。
'use strict';
const fs=require('node:fs'),tls=require('node:tls'),https=require('node:https'),crypto=require('node:crypto');
const {HttpsProxyAgent}=require('https-proxy-agent');
const {getProxyForUrl}=require('proxy-from-env');
const defaults=Object.freeze({proxy_mode:'environment',proxy_url:'',ca_file:''});
function normalize(value={}){
 const result={...defaults,...value};
 if(!['environment','direct','manual'].includes(result.proxy_mode))throw Error('请选择有效的代理模式。');
 for(const key of ['proxy_url','ca_file']){
  if(typeof result[key]!=='string'||result[key].length>4096||/[\r\n\0]/.test(result[key]))throw Error('网络配置内容无效。');
  result[key]=result[key].trim();
 }
 if(result.proxy_url)parse_proxy(result.proxy_url,false);
 return {proxy_mode:result.proxy_mode,proxy_url:result.proxy_url,ca_file:result.ca_file};
}
function parse_proxy(value,allow_auth){
 let url;try{url=new URL(value);}catch{throw Error('代理地址格式无效，请使用 http://主机:端口 或 https://主机:端口。');}
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.pathname!=='/'||url.search||url.hash)throw Error('仅支持HTTP/HTTPS代理地址，不接受路径、查询或片段。');
 if(!allow_auth&&(url.username||url.password))throw Error('代理地址不能包含账户密码；当前设置支持无需独立身份认证的HTTP/HTTPS代理。');
 return url;
}
function certificates(file){
 if(!file)return [];
 let bytes;try{const stat=fs.statSync(file);if(!stat.isFile()||stat.size>2*1024*1024)throw Error();bytes=fs.readFileSync(file);}catch{throw Error('无法读取CA证书，请选择不超过2MB的证书文件。');}
 try{
  const text=bytes.toString('utf8');if(/PRIVATE KEY/.test(text))throw Error();
  if(text.includes('-----BEGIN')){
   const blocks=text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
   if(!blocks?.length||blocks.length>100||text.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,'').trim())throw Error();
   return blocks.map(block=>new crypto.X509Certificate(block).toString());
  }
  return [new crypto.X509Certificate(bytes).toString()];
 }catch{throw Error('CA证书格式无效，请使用PEM证书包或DER证书（不含私钥）。');}
}
function validate(value){const configuration=normalize(value);if(configuration.proxy_mode==='manual'&&!configuration.proxy_url)throw Error('请先填写代理地址，再选择指定代理模式。');certificates(configuration.ca_file);return configuration;}
function create_agent(address,value,signal){
 const configuration=normalize(value),extra=certificates(configuration.ca_file);
 const roots=typeof tls.getCACertificates==='function'?tls.getCACertificates('default'):tls.rootCertificates;
 const ca=extra.length?[...roots,...extra]:undefined;
 const proxy=configuration.proxy_mode==='manual'?configuration.proxy_url:configuration.proxy_mode==='environment'?getProxyForUrl(address):'';
 if(configuration.proxy_mode==='manual'&&!proxy)throw Error('指定代理模式需要填写代理地址。');
 const agent=proxy?new HttpsProxyAgent(parse_proxy(proxy,true),{ca,rejectUnauthorized:true,signal}):new https.Agent({ca,rejectUnauthorized:true});
 return {agent,ca,rejectUnauthorized:true};
}
module.exports={defaults,normalize,validate,create_agent};
