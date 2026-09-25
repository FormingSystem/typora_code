// renderer和Node共用配置契约；旧键只读迁移，成功保存仅写新字段。
'use strict';
const defaults=Object.freeze({proxy_mode:'environment',http_proxy_url:'',https_proxy_url:'',ca_file:''});
function normalize(value={}){
 const legacy=value.proxy_url??'';
 const result={...defaults,...value,http_proxy_url:Object.hasOwn(value,'http_proxy_url')?value.http_proxy_url:legacy,https_proxy_url:Object.hasOwn(value,'https_proxy_url')?value.https_proxy_url:legacy};
 if(!['environment','direct','manual'].includes(result.proxy_mode))throw Error('请选择有效的代理模式。');
 for(const key of ['http_proxy_url','https_proxy_url','ca_file']){
  if(typeof result[key]!=='string'||/[\r\n\0]/.test(result[key]))throw Error('网络配置内容无效。');
  result[key]=result[key].trim();
 }
 for(const key of ['http_proxy_url','https_proxy_url'])if(result[key])parse_proxy(result[key],false);
 return {proxy_mode:result.proxy_mode,http_proxy_url:result.http_proxy_url,https_proxy_url:result.https_proxy_url,ca_file:result.ca_file};
}
function parse_proxy(value,allow_auth){
 let url;try{url=new URL(value);}catch{throw Error('代理地址格式无效，请使用 http://主机:端口 或 https://主机:端口。');}
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.pathname!=='/'||url.search||url.hash)throw Error('仅支持HTTP/HTTPS代理地址，不接受路径、查询或片段。');
 if(!allow_auth&&(url.username||url.password))throw Error('代理地址不能包含账户密码；当前设置支持无需独立身份认证的HTTP/HTTPS代理。');
 return url;
}
module.exports={defaults,normalize,parse_proxy};
