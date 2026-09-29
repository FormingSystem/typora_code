import {workspace_text} from "./workspace_i18n";
export type file_clipboard_snapshot={paths:string[];version:string;move_requested:boolean};
export type file_clipboard_adapter={read():Promise<file_clipboard_snapshot>;write(paths:string[]):Promise<file_clipboard_snapshot>;clear(version:string):Promise<boolean>;dispose():void};
type clipboard_actions={validate(root:string,paths:string[]):Promise<void>;transfer(root:string,paths:string[],target:string,move:boolean,external:boolean):Promise<string[]>};

/** The system file list is the only source of content; only the version in this window matches the cut executable for protected movement. */
export function create_workspace_file_clipboard(adapter:file_clipboard_adapter,actions:clipboard_actions){
  let cut:{root:string;snapshot:file_clipboard_snapshot}|undefined,disposed=false,busy=false;
  const listeners=new Set<()=>void>(),notify=()=>{if(!disposed)for(const listener of listeners)listener();};
  const validate=(snapshot:file_clipboard_snapshot)=>{if(!snapshot||!Array.isArray(snapshot.paths)||typeof snapshot.version!=="string"||typeof snapshot.move_requested!=="boolean"||snapshot.paths.some(path=>typeof path!=="string"||!path||/[\x00-\x1f]/u.test(path)))throw new Error(workspace_text("file_clipboard_the_file_list_in_the_system_clipboard_is_invalid"));return snapshot;};
  const invalidate=()=>{cut=undefined;notify();};
  const read=async()=>{const expected_cut=cut,snapshot=validate(await adapter.read());if(cut===expected_cut&&cut&&(cut.snapshot.version!==snapshot.version||JSON.stringify(cut.snapshot.paths)!==JSON.stringify(snapshot.paths)))invalidate();return snapshot;};
  const perform=async<T>(action:()=>Promise<T>)=>{if(disposed)throw new Error(workspace_text("file_clipboard_file_clipboard_is_closed"));if(busy)throw new Error(workspace_text("file_clipboard_processing_the_file_clipboard_please_try_again_later"));busy=true;try{return await action();}finally{busy=false;}};
  return {
    is_busy:()=>busy,
    is_cut:(path:string)=>!disposed&&Boolean(cut?.snapshot.paths.includes(path)),
    invalidate,
    subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);},
    async refresh(){if(disposed||busy||!cut)return;const expected_cut=cut;try{await read();}catch{if(cut===expected_cut)invalidate();}},
    copy:(root:string,paths:string[],move:boolean,valid=()=>true)=>perform(async()=>{
      const selected=[...new Set(paths)];validate({paths:selected,version:"",move_requested:false});if(!selected.length)return;
      await actions.validate(root,selected);if(disposed||!valid())throw new Error(workspace_text("file_clipboard_the_operation_context_has_changed_the_file_was_not_copied"));
      invalidate();const snapshot=validate(await adapter.write(selected));if(JSON.stringify(snapshot.paths)!==JSON.stringify(selected))throw new Error(workspace_text("file_clipboard_the_system_clipboard_has_changed_please_re_copy_the_file"));if(!disposed&&move&&valid()){cut={root,snapshot};notify();}
    }),
    paste:(root:string,target:string,valid=()=>true)=>perform(async()=>{
      const snapshot=await read();if(disposed||!valid())throw new Error(workspace_text("file_clipboard_the_target_has_changed_the_file_was_not_pasted"));if(!snapshot.paths.length)throw new Error(workspace_text("file_clipboard_the_system_clipboard_contains_no_files_or_folders"));
      const move=Boolean(cut&&cut.root===root&&cut.snapshot.version===snapshot.version),paths=await actions.transfer(root,snapshot.paths,target,move,!move);
      let warning="";if(move){invalidate();try{await adapter.clear(snapshot.version);}catch{warning=workspace_text("file_clipboard_the_file_has_been_moved_but_the_clipboard_cleanup_failed");}}
      return {paths,message:warning||(move?workspace_text("file_clipboard_move_completed"):snapshot.move_requested?workspace_text("file_clipboard_copy_completed_the_source_file_is_retained"):workspace_text("file_clipboard_copy_completed"))};
    }),
    dispose(){disposed=true;cut=undefined;listeners.clear();adapter.dispose();}
  };
}
export type workspace_file_clipboard=ReturnType<typeof create_workspace_file_clipboard>;
