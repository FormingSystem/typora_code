// Update and community download share the same network adapter at the request level; do not modify the global Agent, system trust library, or process environment.
'use strict';
const {workspace_service_text,set_workspace_service_locale}=require("./workspace_service_i18n.cjs");
const fs=require('node:fs'),tls=require('node:tls'),http=require('node:http'),https=require('node:https'),crypto=require('node:crypto');
const {HttpProxyAgent}=require('http-proxy-agent');
const {HttpsProxyAgent}=require('https-proxy-agent');
const {getProxyForUrl}=require('proxy-from-env');
const {defaults,normalize,parse_proxy}=require('./workspace_network_configuration.cjs');
function certificates(file){
 if(!file)return [];
 let bytes;try{const stat=fs.statSync(file);if(!stat.isFile())throw Error();bytes=fs.readFileSync(file);}catch{throw Error(workspace_service_text("service_560f0ea999a2"));}
 try{
  const text=bytes.toString('utf8');if(/PRIVATE KEY/.test(text))throw Error();
  if(text.includes('-----BEGIN')){
   const blocks=text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
   if(!blocks?.length||text.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,'').trim())throw Error();
   return blocks.map(block=>new crypto.X509Certificate(block).toString());
  }
  return [new crypto.X509Certificate(bytes).toString()];
 }catch{throw Error(workspace_service_text("service_574086c2ed1d"));}
}
function validate_selection(value){const configuration=normalize(value);if(configuration.proxy_mode==='manual'&&!configuration.http_proxy_url&&!configuration.https_proxy_url)throw Error(workspace_service_text("service_e2087b5b24ff"));return configuration;}
function validate(value){const configuration=validate_selection(value);certificates(configuration.ca_file);return configuration;}
function create_agent(address,value,signal){
 const configuration=validate_selection(value),extra=certificates(configuration.ca_file);
 const roots=typeof tls.getCACertificates==='function'?tls.getCACertificates('default'):tls.rootCertificates;
 const ca=extra.length?[...roots,...extra]:undefined;
 const protocol=new URL(address).protocol;
 if(!['http:','https:'].includes(protocol))throw Error(workspace_service_text("service_bd37acc0e16d"));
 const is_https=protocol==='https:';
 const proxy=configuration.proxy_mode==='manual'?configuration[is_https?'https_proxy_url':'http_proxy_url']:configuration.proxy_mode==='environment'?getProxyForUrl(address):'';
 const proxy_agent=is_https?HttpsProxyAgent:HttpProxyAgent;
 const direct_agent=is_https?https.Agent:http.Agent;
 const agent=proxy?new proxy_agent(parse_proxy(proxy,true),{ca,rejectUnauthorized:true,signal}):new direct_agent({ca,rejectUnauthorized:true});
 return {agent,ca,rejectUnauthorized:true};
}
module.exports={set_workspace_service_locale,defaults,normalize,validate,create_agent};
