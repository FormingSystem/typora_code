// The renderer and Node share the same configuration contract; old keys are read-only migration, and successful saving only writes new fields.
'use strict';
const {workspace_service_text,set_workspace_service_locale}=require("./workspace_service_i18n.cjs");
const defaults=Object.freeze({proxy_mode:'environment',http_proxy_url:'',https_proxy_url:'',ca_file:''});
function normalize(value={}){
 const legacy=value.proxy_url??'';
 const result={...defaults,...value,http_proxy_url:Object.hasOwn(value,'http_proxy_url')?value.http_proxy_url:legacy,https_proxy_url:Object.hasOwn(value,'https_proxy_url')?value.https_proxy_url:legacy};
 if(!['environment','direct','manual'].includes(result.proxy_mode))throw Error(workspace_service_text("service_d0b51287ac28"));
 for(const key of ['http_proxy_url','https_proxy_url','ca_file']){
  if(typeof result[key]!=='string'||/[\r\n\0]/.test(result[key]))throw Error(workspace_service_text("service_447286ee03c3"));
  result[key]=result[key].trim();
 }
 for(const key of ['http_proxy_url','https_proxy_url'])if(result[key])parse_proxy(result[key],false);
 return {proxy_mode:result.proxy_mode,http_proxy_url:result.http_proxy_url,https_proxy_url:result.https_proxy_url,ca_file:result.ca_file};
}
function parse_proxy(value,allow_auth){
 let url;try{url=new URL(value);}catch{throw Error(workspace_service_text("service_c2dc4167ea3f"));}
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.pathname!=='/'||url.search||url.hash)throw Error(workspace_service_text("service_6a929c77fe98"));
 if(!allow_auth&&(url.username||url.password))throw Error(workspace_service_text("service_dace023253b3"));
 return url;
}
module.exports={set_workspace_service_locale,defaults,normalize,parse_proxy};
