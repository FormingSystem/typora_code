import {workspace_text} from "./workspace_i18n";
import {resolve_workspace_locale} from "./workspace_locale";
import {workspace_context_switching} from './workspace_context';
import {create_workspace_lifetime} from './workspace_lifetime';
import {show_workspace_onboarding} from './workspace_onboarding_view';
import {create_onboarding_store} from './workspace_onboarding_state.cjs';
import bundled_release from '../release.json';
import type {workspace_file_host} from './workspace_files';

export function bind_workspace_onboarding(files:workspace_file_host) {
 const lifetime=create_workspace_lifetime(),runtime=window as any;
 const waiting=create_workspace_lifetime();lifetime.own(waiting);
 let store:ReturnType<typeof create_onboarding_store>|undefined;
 let tour:ReturnType<typeof show_workspace_onboarding>|undefined;
 const notice=(error:unknown)=>new files.core.Notice(workspace_text("onboarding_operation_instructions")+String(error instanceof Error?error.message:error),5000);
 const open_guide=()=>{void(async()=>{try{
  const path=files.path_api.join(runtime._options.userDataPath,'typora_code/assets/help/'+(resolve_workspace_locale()==='en'?'user_guide.en.md':'user_guide.md'));
  await files.fs.promises.access(path);if(lifetime.disposed)return;
  if(!runtime.JSBridge?.invoke)throw Error(workspace_text("onboarding_the_native_file_open_interface_is_unavailable"));
  await runtime.JSBridge.invoke('app.openFile',path,{forceCreateWindow:true});
 }catch(error){if(!lifetime.disposed)notice(error);}})();};
 const show=()=>{if(lifetime.disposed)return;tour?.close();tour=show_workspace_onboarding(open_guide,()=>{tour=undefined;});};
 lifetime.add(files.core.app.commands.register({id:'typora_code:operation_guide',title:workspace_text("onboarding_operation_instructions_b658709a"),scope:'global',callback:()=>{waiting.dispose();try{if(store?.claim(show))return;}catch(error){notice(error);}show();}}));
 lifetime.add(files.core.app.commands.register({id:'typora_code:operation_manual',title:workspace_text("onboarding_operation_instructions_and_keyboard_shortcuts"),scope:'global',callback:open_guide}));
 lifetime.add(()=>tour?.close());
 // Automatic guidance only reads the installation identifier at startup; existing old windows do not consume the new version installed later.
 if(!runtime.reqnode||!runtime._options?.userDataPath)return lifetime;
 let timer=0;
 try{
  store=create_onboarding_store({fs:files.fs,path:files.path_api,process:runtime.reqnode('process'),root:files.path_api.join(runtime._options.userDataPath,'typora_code'),sequence:bundled_release.releases[0].sequence});
  const attempt=()=>{
   timer=0;if(waiting.disposed)return;
   try{
    if(!store!.pending()){waiting.dispose();return;}
    if(document.documentElement.getAttribute('data-linux-note-typora-enhancements')!=='ready'||document.hidden||!document.hasFocus()||document.querySelector('[role="dialog"][aria-modal="true"], .modal.in'))return;
    if(runtime.File?.isFileLoading?.()||runtime.File?._onFileSwitching||workspace_context_switching()){schedule();return;}
    if(store!.claim(show))waiting.dispose();else schedule();
   }catch(error){waiting.dispose();notice(error);}
  };
  const schedule=()=>{if(!timer&&!waiting.disposed)timer=window.setTimeout(attempt,500);};
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-linux-note-typora-enhancements']});observer.observe(document.body,{childList:true});
  waiting.add(()=>{observer.disconnect();clearTimeout(timer);});
  waiting.listen(window,'focus',schedule);waiting.listen(document,'visibilitychange',schedule);schedule();
 }catch(error){waiting.dispose();notice(error);}
 return lifetime;
}
