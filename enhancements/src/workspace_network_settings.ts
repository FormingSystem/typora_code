import {load_workspace_service} from "./workspace_service_loader";
import {workspace_text} from "./workspace_i18n";
import {get_workspace_app} from './workspace_bootstrap';
import {defaults,normalize} from './workspace_network_configuration.cjs';
export const NETWORK_DEFAULTS=defaults;
export function read_network_settings(){return normalize(get_workspace_app()?.settings.get('workspace_network')??{});}
export function write_network_setting(key:string,value:unknown){
 if(!(key in NETWORK_DEFAULTS))throw Error(workspace_text("network_settings_unknown_network_settings"));
 const runtime=window as any,settings=get_workspace_app()?.settings;
 if(!settings||!runtime._options?.userDataPath)throw Error(workspace_text("network_settings_the_network_settings_service_is_not_yet_ready"));
 const path=runtime.reqnode('path'),service=load_workspace_service(runtime.reqnode, path.join(runtime._options.userDataPath,'typora_code/assets/update/workspace_network.cjs'));
 const next=service.validate({...read_network_settings(),[key]:value});
 settings.set_and_save('workspace_network',next);
}
