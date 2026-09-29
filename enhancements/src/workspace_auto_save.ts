import {workspace_text} from "./workspace_i18n";
export type auto_save_policy={mode:string;delay:number};
/** Each document has one timer and write task; failure does not loop retry, and new edits during saving are preserved for the next round. */
export function create_auto_save<T extends object>(options:{policy():auto_save_policy;state(target:T):{dirty:boolean;busy:boolean;eligible:boolean};save(target:T):Promise<boolean>;report(target:T,error:unknown):void}){
  const revisions=new Map<T,number>(),timers=new Map<T,ReturnType<typeof setTimeout>>(),pending=new Set<T>(),failed=new Map<T,number>(),forgotten=new WeakSet<T>();let disposed=false;
  function clear(target:T){const timer=timers.get(target);if(timer!==undefined)clearTimeout(timer);timers.delete(target);}
  function schedule(target:T,delay=options.policy().delay){clear(target);if(!disposed)timers.set(target,setTimeout(()=>{timers.delete(target);void execute(target);},Math.min(2147483647,Math.max(0,delay))));}
  async function execute(target:T){
    if(disposed||options.policy().mode==="off"||pending.has(target)||forgotten.has(target))return;
    const state=options.state(target);if(!state.eligible||!state.dirty)return;
    if(state.busy){schedule(target,100);return;}
    const revision=revisions.get(target)||0;if(failed.get(target)===revision)return;pending.add(target);
    try{const saved=await options.save(target);if(!saved&&!disposed&&!forgotten.has(target)&&options.state(target).dirty){failed.set(target,revision);options.report(target,new Error(workspace_text("auto_save_automatic_saving_is_not_complete_edited_content_is_retained")));}else if(saved)failed.delete(target);}
    catch(error){if(!disposed&&!forgotten.has(target)){failed.set(target,revision);options.report(target,error);}}
    finally{pending.delete(target);if(!disposed&&!forgotten.has(target)&&(revisions.get(target)||0)!==revision&&options.policy().mode==="afterDelay"&&options.state(target).dirty)schedule(target);}
  }
  return {
    changed(target:T){if(disposed)return;forgotten.delete(target);failed.delete(target);revisions.set(target,(revisions.get(target)||0)+1);if(options.policy().mode==="afterDelay")schedule(target);else clear(target);},
    focus_lost(target:T){if(options.policy().mode==="onFocusChange")void execute(target);},
    window_lost(targets:Iterable<T>){if(["onWindowChange","onFocusChange"].includes(options.policy().mode))for(const target of targets)void execute(target);},
    configure(targets:Iterable<T>){for(const target of timers.keys())clear(target);if(options.policy().mode==="afterDelay")for(const target of targets)if(options.state(target).dirty)schedule(target);},
    forget(target:T){clear(target);revisions.delete(target);failed.delete(target);forgotten.add(target);},
    dispose(){disposed=true;for(const target of timers.keys())clear(target);revisions.clear();failed.clear();},
  };
}
