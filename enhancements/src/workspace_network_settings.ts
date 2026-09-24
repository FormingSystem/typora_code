import {get_workspace_app} from './workspace_bootstrap';
export const NETWORK_DEFAULTS={proxy_mode:'environment',proxy_url:'',ca_file:''};
export function read_network_settings(){return {...NETWORK_DEFAULTS,...get_workspace_app()?.settings.get('workspace_network')};}
export function write_network_setting(key:string,value:unknown){
 if(!(key in NETWORK_DEFAULTS))throw Error('未知网络设置。');
 const runtime=window as any,settings=get_workspace_app()?.settings;
 if(!settings||!runtime._options?.userDataPath)throw Error('网络设置服务尚未就绪。');
 const path=runtime.reqnode('path'),service=runtime.reqnode(path.join(runtime._options.userDataPath,'typora_code/assets/update/workspace_network.cjs'));
 const next=service.validate({...read_network_settings(),[key]:value});
 settings.set_and_save('workspace_network',next);
}
