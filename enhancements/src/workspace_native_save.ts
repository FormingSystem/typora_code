import {workspace_text} from "./workspace_i18n";
import {remote_files_for,active_remote_files,assert_remote_owner} from './remote_workspace_files';
type native_save_hooks={changed(file_path:string):void;saved(file_path:string):void;auto_save_changed(enabled:boolean):void;save_as?():Promise<boolean>};

/** Verified host boundaries: after successful disk writing, emit didSave; the backup service reads enableAutoSave to decide whether to also write to disk. */
export function bind_native_save(runtime:any,hooks:native_save_hooks){
  const file=runtime.File,bridge=runtime.JSBridge,releases:Array<()=>void>=[];
  let disposed=false,save_depth=0,option:any;
  function replace(owner:any,key:string,wrap:(original:Function)=>Function){
    const original=owner?.[key];if(typeof original!=="function")return;
    const wrapped=wrap(original);owner[key]=wrapped;releases.push(()=>{if(owner[key]===wrapped)owner[key]=original;});
  }
  function sync_options(){
    if(disposed||!file?.isNode||!file.option||option===file.option)return;
    option=file.option;const owner=option,descriptor=Object.getOwnPropertyDescriptor(owner,"enableAutoSave");
    if(descriptor&&(descriptor.configurable===false||descriptor.get||descriptor.set))throw new Error(workspace_text("native_save_the_host_s_automatic_save_settings_cannot_be_taken_over_anot"));
    let native_value=owner.enableAutoSave;
    const read=()=>false,write=(value:unknown)=>{native_value=value;if(!disposed)hooks.auto_save_changed(value===true);};
    // Only take over the runtime switch of this window, and do not write to the host preference files; the draft backup service continues to work.
    Object.defineProperty(owner,"enableAutoSave",{configurable:true,enumerable:descriptor?.enumerable??true,get:read,set:write});
    releases.push(()=>{if(Object.getOwnPropertyDescriptor(owner,"enableAutoSave")?.get!==read)return;if(descriptor)Object.defineProperty(owner,"enableAutoSave",{...descriptor,value:native_value});else{delete owner.enableAutoSave;if(native_value!==undefined)owner.enableAutoSave=native_value;}});
  }
  if(file?.isNode){
    sync_options();
    let remote_saving=false;
    replace(file,'saveUseNode',original=>function(this:any,...args:any[]){
      const path=this.bundle?.filePath,remote=typeof path==='string'?remote_files_for(path):undefined;
      assert_remote_owner(path);
      if((remote&&args[0]||!path&&active_remote_files())&&hooks.save_as)return args[1]?Promise.resolve(false):hooks.save_as();
      if(!remote)return original.apply(this,args);
      if(remote_saving)return Promise.resolve(false);
      // Only submit the host status after confirmation from the remote side; during the waiting period, new inputs or switches cannot be marked as saved.
      const text=typeof this.sync==='function'?this.sync():this.editor?.getMarkdown?.();if(typeof text!=='string')return Promise.reject(Error(workspace_text("native_save_the_markdown_document_content_is_not_yet_ready")));
      if(this.validateContentForSave?.()===false)return Promise.reject(Error(workspace_text("native_save_the_native_editor_refuses_to_save_the_current_document_conte")));
      const current=this.editor.getMarkdown(),format=this.bundle.fileEncode||'utf8';
      const codec=runtime.reqnode('iconv-lite'),encoding=format.replace(/-bom$/u,'');
      let bytes=codec.encode(text,encoding,{addBOM:format.endsWith('-bom')});
      // Keep consistent with native saving: old encoding cannot use UTF-8 when it is impossible to losslessly represent the main content; it is not allowed to write a question mark to the remote end.
      if(!encoding.toLowerCase().includes('utf')&&codec.decode(bytes,encoding)!==text)bytes=codec.encode(text,'utf8');
      remote_saving=true;
      return remote.save_native(path,text,bytes).then(()=>{
        if(disposed||this.bundle?.filePath!==path||this.editor.getMarkdown()!==current)return false;
        save_depth++;try{return original.apply(this,args);}finally{save_depth--;}
      }).finally(()=>{remote_saving=false;});
    });
    replace(file,"updateChangeCount",original=>function(this:any,...args:any[]){const result=original.apply(this,args);if(!disposed&&this.changeCounter?.isDocumentEdited()&&typeof this.bundle?.filePath==="string")hooks.changed(this.bundle.filePath);return result;});
    replace(bridge,"invoke",original=>function(this:any,...args:any[]){const result=original.apply(this,args);if(!disposed&&args[0]==="app.sendEvent"&&args[1]==="didSave"&&typeof args[2]?.path==="string")hooks.saved(args[2].path);return result;});
    // The saveUseNode at the synchronization entrance rejects non-foreground windows. Only the explicit automatic saving in this round allows crossing the foreground check.
    // The synchronization call exits immediately; other host tasks and subsequent asynchronous stages still see the real window state.
    replace(file,"isActiveWindow",original=>function(this:any,...args:any[]){return save_depth>0||original.apply(this,args);});
  }
  return{sync_options,save<T>(operation:()=>T):T{save_depth++;try{return operation();}finally{save_depth--;}},dispose(){disposed=true;for(const release of releases.reverse())release();}};
}
