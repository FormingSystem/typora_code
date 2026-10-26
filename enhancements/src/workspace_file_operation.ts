import {workspace_text} from './workspace_i18n';

export type workspace_file_operation_state = Readonly<{
  id:number; root:string; paths:readonly string[]; busy:boolean; label:string;
  phase:'idle'|'preparing'|'executing'|'waiting'|'verifying'|'cleanup'|'refreshing'|'succeeded'|'failed'|'cancelled';
  error:string; completed_paths:readonly string[]; cancelable:boolean; cancel_requested:boolean;
}>;
export type workspace_file_operation_context = {
  checkpoint():void;
  phase(phase:workspace_file_operation_state['phase'],label:string):void;
  completed(path:string):void;
};

/** File-domain execution owns exclusion, outcomes and reconciliation independently of views. */
export function create_workspace_file_operation(assert_current:(root:string,epoch:number)=>void,epoch:()=>number){
  let serial=0,disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
  let state:workspace_file_operation_state={id:0,root:'',paths:[],busy:false,label:'',phase:'idle',error:'',completed_paths:[],cancelable:false,cancel_requested:false};
  const listeners=new Set<(state:workspace_file_operation_state)=>void>();
  const refreshers=new Set<(root:string)=>Promise<void>>();
  const publish=(change:Partial<workspace_file_operation_state>)=>{
    state=Object.freeze({...state,...change});
    for(const listener of listeners)try{listener(state);}catch(error){console.error('File operation observer:',error);}
  };
  const clear_timer=()=>{clearTimeout(timer);timer=undefined;};
  const message=(error:unknown)=>error instanceof Error?error.message:String(error);
  return {
    get state(){return state;},
    subscribe(listener:(state:workspace_file_operation_state)=>void){listeners.add(listener);listener(state);return()=>{listeners.delete(listener);};},
    on_refresh(refresh:(root:string)=>Promise<void>){refreshers.add(refresh);return()=>{refreshers.delete(refresh);};},
    cancel(){if(state.busy&&state.cancelable&&!state.cancel_requested)publish({cancel_requested:true,label:workspace_text('file_task_stopping')});},
    async run<T>(root:string,paths:readonly string[],label:string,action:(context:workspace_file_operation_context)=>Promise<T>,options:{refresh?:boolean;cancelable?:boolean}={}):Promise<T>{
      if(disposed)throw new Error(workspace_text('git_graph_host_typora_code_is_disabled'));
      if(state.busy)throw new Error(workspace_text('file_task_busy',{value_0:state.label}));
      const captured_epoch=epoch(),id=++serial;
      publish({id,root,paths:Object.freeze([...paths]),busy:true,label,phase:'preparing',error:'',completed_paths:[],cancelable:!!options.cancelable,cancel_requested:false});
      const context:workspace_file_operation_context={
        checkpoint(){
          if(state.id!==id||!state.busy||disposed)throw Object.assign(new Error(workspace_text('file_task_cancelled')),{name:'AbortError'});
          assert_current(root,captured_epoch);
          if(state.cancel_requested)throw Object.assign(new Error(workspace_text('file_task_cancelled')),{name:'AbortError'});
        },
        phase(phase,label){
          if(state.id!==id||!state.busy||disposed)return;
          clear_timer();publish({phase,label:state.cancel_requested?workspace_text('file_task_stopping'):label});
          if(phase==='executing')timer=setTimeout(()=>{
            if(state.id===id&&state.busy)publish({phase:'waiting',label:state.cancel_requested?workspace_text('file_task_stopping'):workspace_text('file_task_waiting',{value_0:label})});
          },5000);
        },
        completed(path){if(state.id===id&&state.busy&&!disposed)publish({completed_paths:Object.freeze([...new Set([...state.completed_paths,path])])});}
      };
      let result:T|undefined,failure:unknown,failed=false;
      try{context.checkpoint();result=await action(context);}
      catch(error){failed=true;failure=error;publish({error:message(error)});}
      finally{clear_timer();}
      if(failed&&state.completed_paths.length){
        const detail=workspace_text('file_task_completed_paths',{value_0:state.completed_paths.join('\n')});
        failure=Object.assign(new Error(message(failure)+'\n'+detail),{name:(failure as {name?:string})?.name||'Error',cause:failure,removed_paths:[...state.completed_paths]});
        publish({error:message(failure)});
      }
      if(options.refresh){
        publish({cancelable:false});
        context.phase('refreshing',workspace_text('file_task_refreshing'));
        for(const refresh of [...refreshers]){
          try{await refresh(root);}catch(error){
            const detail=workspace_text('file_task_refresh_failed',{value_0:message(error)});
            failure=new Error((failed?message(failure)+'\n':'')+detail);failed=true;publish({error:message(failure)});
          }
        }
      }
      const cancelled=failed&&(failure as {name?:string})?.name==='AbortError';
      publish({busy:false,cancelable:false,phase:failed?(cancelled?'cancelled':'failed'):'succeeded',
        label:failed?(cancelled?workspace_text('file_task_cancelled'):workspace_text('file_task_failed')):workspace_text('file_task_finished'),
        error:failed?message(failure):''});
      if(failed)throw failure;
      return result as T;
    },
    dispose(){if(state.busy)throw new Error(workspace_text('file_history_busy'));disposed=true;clear_timer();listeners.clear();refreshers.clear();}
  };
}
export type workspace_file_operation = ReturnType<typeof create_workspace_file_operation>;
