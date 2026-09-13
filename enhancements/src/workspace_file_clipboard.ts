export type file_clipboard_snapshot={paths:string[];version:string;move_requested:boolean};
export type file_clipboard_adapter={read():Promise<file_clipboard_snapshot>;write(paths:string[]):Promise<file_clipboard_snapshot>;clear(version:string):Promise<boolean>;dispose():void};
type clipboard_actions={validate(root:string,paths:string[]):Promise<void>;transfer(root:string,paths:string[],target:string,move:boolean,external:boolean):Promise<string[]>};

/** 系统文件列表是唯一内容源；只有本窗口的版本匹配剪切可执行受保护移动。 */
export function create_workspace_file_clipboard(adapter:file_clipboard_adapter,actions:clipboard_actions){
  let cut:{root:string;snapshot:file_clipboard_snapshot}|undefined,disposed=false,busy=false;
  const listeners=new Set<()=>void>(),notify=()=>{if(!disposed)for(const listener of listeners)listener();};
  const validate=(snapshot:file_clipboard_snapshot)=>{if(!snapshot||!Array.isArray(snapshot.paths)||snapshot.paths.length>512||typeof snapshot.version!=="string"||typeof snapshot.move_requested!=="boolean"||snapshot.paths.some(path=>typeof path!=="string"||!path||path.length>32767||/[\x00-\x1f]/u.test(path)))throw new Error("系统剪贴板中的文件列表不合法。");return snapshot;};
  const invalidate=()=>{cut=undefined;notify();};
  const read=async()=>{const expected_cut=cut,snapshot=validate(await adapter.read());if(cut===expected_cut&&cut&&(cut.snapshot.version!==snapshot.version||JSON.stringify(cut.snapshot.paths)!==JSON.stringify(snapshot.paths)))invalidate();return snapshot;};
  const perform=async<T>(action:()=>Promise<T>)=>{if(disposed)throw new Error("文件剪贴板已关闭。");if(busy)throw new Error("正在处理文件剪贴板，请稍后重试。");busy=true;try{return await action();}finally{busy=false;}};
  return {
    is_busy:()=>busy,
    is_cut:(path:string)=>!disposed&&Boolean(cut?.snapshot.paths.includes(path)),
    invalidate,
    subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);},
    async refresh(){if(disposed||busy||!cut)return;const expected_cut=cut;try{await read();}catch{if(cut===expected_cut)invalidate();}},
    copy:(root:string,paths:string[],move:boolean,valid=()=>true)=>perform(async()=>{
      const selected=[...new Set(paths)];validate({paths:selected,version:"",move_requested:false});if(!selected.length)return;
      await actions.validate(root,selected);if(disposed||!valid())throw new Error("操作上下文已改变，未复制文件。");
      invalidate();const snapshot=validate(await adapter.write(selected));if(JSON.stringify(snapshot.paths)!==JSON.stringify(selected))throw new Error("系统剪贴板已变化，请重新复制文件。");if(!disposed&&move&&valid()){cut={root,snapshot};notify();}
    }),
    paste:(root:string,target:string,valid=()=>true)=>perform(async()=>{
      const snapshot=await read();if(disposed||!valid())throw new Error("目标已改变，未粘贴文件。");if(!snapshot.paths.length)throw new Error("系统剪贴板中没有文件或文件夹。");
      const move=Boolean(cut&&cut.root===root&&cut.snapshot.version===snapshot.version),paths=await actions.transfer(root,snapshot.paths,target,move,!move);
      let warning="";if(move){invalidate();try{await adapter.clear(snapshot.version);}catch{warning="文件已移动，但剪贴板清理失败。";}}
      return {paths,message:warning||(move?"移动完成。":snapshot.move_requested?"复制完成，源文件保留。":"复制完成。")};
    }),
    dispose(){disposed=true;cut=undefined;listeners.clear();adapter.dispose();}
  };
}
export type workspace_file_clipboard=ReturnType<typeof create_workspace_file_clipboard>;
