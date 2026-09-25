// 更新与社区下载共用的请求级网络适配；不修改全局Agent、系统信任库或进程环境。
'use strict';
const fs=require('node:fs'),tls=require('node:tls'),http=require('node:http'),https=require('node:https'),crypto=require('node:crypto');
const {HttpProxyAgent}=require('http-proxy-agent');
const {HttpsProxyAgent}=require('https-proxy-agent');
const {getProxyForUrl}=require('proxy-from-env');
const {defaults,normalize,parse_proxy}=require('./workspace_network_configuration.cjs');
function certificates(file){
 if(!file)return [];
 let bytes;try{const stat=fs.statSync(file);if(!stat.isFile())throw Error();bytes=fs.readFileSync(file);}catch{throw Error('无法读取CA证书，请选择可读的证书文件。');}
 try{
  const text=bytes.toString('utf8');if(/PRIVATE KEY/.test(text))throw Error();
  if(text.includes('-----BEGIN')){
   const blocks=text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
   if(!blocks?.length||text.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,'').trim())throw Error();
   return blocks.map(block=>new crypto.X509Certificate(block).toString());
  }
  return [new crypto.X509Certificate(bytes).toString()];
 }catch{throw Error('CA证书格式无效，请使用PEM证书包或DER证书（不含私钥）。');}
}
function validate_selection(value){const configuration=normalize(value);if(configuration.proxy_mode==='manual'&&!configuration.http_proxy_url&&!configuration.https_proxy_url)throw Error('请先填写HTTP或HTTPS请求代理地址，再选择指定代理模式。');return configuration;}
function validate(value){const configuration=validate_selection(value);certificates(configuration.ca_file);return configuration;}
function create_agent(address,value,signal){
 const configuration=validate_selection(value),extra=certificates(configuration.ca_file);
 const roots=typeof tls.getCACertificates==='function'?tls.getCACertificates('default'):tls.rootCertificates;
 const ca=extra.length?[...roots,...extra]:undefined;
 const protocol=new URL(address).protocol;
 if(!['http:','https:'].includes(protocol))throw Error('网络请求只支持HTTP或HTTPS目标。');
 const is_https=protocol==='https:';
 const proxy=configuration.proxy_mode==='manual'?configuration[is_https?'https_proxy_url':'http_proxy_url']:configuration.proxy_mode==='environment'?getProxyForUrl(address):'';
 const proxy_agent=is_https?HttpsProxyAgent:HttpProxyAgent;
 const direct_agent=is_https?https.Agent:http.Agent;
 const agent=proxy?new proxy_agent(parse_proxy(proxy,true),{ca,rejectUnauthorized:true,signal}):new direct_agent({ca,rejectUnauthorized:true});
 return {agent,ca,rejectUnauthorized:true};
}
module.exports={defaults,normalize,validate,create_agent};
