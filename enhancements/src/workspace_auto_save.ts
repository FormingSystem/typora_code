export type auto_save_policy={mode:string;delay:number};
/** 每份文档一个定时器和写入任务；失败不循环重试，保存期间的新编辑保留下一轮。 */
export function create_auto_save<T extends object>(options:{policy():auto_save_policy;state(target:T):{dirty:boolean;busy:boolean;eligible:boolean};save(target:T):Promise<boolean>;report(target:T,error:unknown):void}){
  const revisions=new Map<T,number>(),timers=new Map<T,ReturnType<typeof setTimeout>>(),pending=new Set<T>(),failed=new Map<T,number>(),forgotten=new WeakSet<T>();let disposed=false;
  function clear(target:T){const timer=timers.get(target);if(timer!==undefined)clearTimeout(timer);timers.delete(target);}
  function schedule(target:T,delay=options.policy().delay){clear(target);if(!disposed)timers.set(target,setTimeout(()=>{timers.delete(target);void execute(target);},Math.min(2147483647,Math.max(0,delay))));}
  async function execute(target:T){
    if(disposed||options.policy().mode==="off"||pending.has(target)||forgotten.has(target))return;
    const state=options.state(target);if(!state.eligible||!state.dirty)return;
    if(state.busy){schedule(target,100);return;}
    const revision=revisions.get(target)||0;if(failed.get(target)===revision)return;pending.add(target);
    try{const saved=await options.save(target);if(!saved&&!disposed&&!forgotten.has(target)&&options.state(target).dirty){failed.set(target,revision);options.report(target,new Error("自动保存未完成，编辑内容已保留。"));}else if(saved)failed.delete(target);}
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
