import {globalConfigDir} from 'src/common/constants';
/** 产品配置只写用户数据目录；切换普通文件夹不会重启工作台。 */
export class ConfigRepository {
 readonly configDir=globalConfigDir();readonly dataDir=this.configDir+'/data';readonly isUsingGlobalConfig=true;
 readConfigJson(filename:string,fallback:any={}) {try{return JSON.parse(reqnode('fs').readFileSync(reqnode('path').join(this.configDir,filename+'.json'),'utf8'))}catch{return fallback}}
 writeConfigJson(filename:string,value:any) {
  const fs=reqnode('fs'),path=reqnode('path');
  const target=path.join(this.configDir,filename+'.json');
  const contents=JSON.stringify(value,null,2);
  fs.mkdirSync(this.configDir,{recursive:true});
  const temporary=target+'.'+reqnode('crypto').randomBytes(12).toString('hex')+'.tmp';
  let descriptor:number|undefined,created=false;
  try {
   descriptor=fs.openSync(temporary,'wx');created=true;
   fs.writeFileSync(descriptor,contents,'utf8');fs.fsyncSync(descriptor);
   fs.closeSync(descriptor);descriptor=undefined;
   fs.renameSync(temporary,target);created=false;
  } finally {
   if(descriptor!==undefined)try{fs.closeSync(descriptor)}catch{}
   if(created)try{fs.unlinkSync(temporary)}catch{}
  }
 }
}
