import {globalConfigDir} from 'src/common/constants';
/** 产品配置只写用户数据目录；切换普通文件夹不会重启工作台。 */
export class ConfigRepository {
 readonly configDir=globalConfigDir();readonly dataDir=this.configDir+'/data';readonly isUsingGlobalConfig=true;
 readConfigJson(filename:string,fallback:any={}) {try{return JSON.parse(reqnode('fs').readFileSync(reqnode('path').join(this.configDir,filename+'.json'),'utf8'))}catch{return fallback}}
 writeConfigJson(filename:string,value:any) {const fs=reqnode('fs'),path=reqnode('path');fs.mkdirSync(this.configDir,{recursive:true});fs.writeFileSync(path.join(this.configDir,filename+'.json'),JSON.stringify(value,null,2),'utf8');}
}
