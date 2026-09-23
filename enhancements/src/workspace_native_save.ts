import {remote_files_for,active_remote_files,assert_remote_owner} from './remote_workspace_files';
type native_save_hooks={changed(file_path:string):void;saved(file_path:string):void;auto_save_changed(enabled:boolean):void;save_as?():Promise<boolean>};

/** 已核对的宿主边界：成功写盘后发didSave；备份服务读取enableAutoSave决定是否顺带写盘。 */
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
    if(descriptor&&(descriptor.configurable===false||descriptor.get||descriptor.set))throw new Error("宿主自动保存设置不可接管，未启用另一套自动保存。");
    let native_value=owner.enableAutoSave;
    const read=()=>false,write=(value:unknown)=>{native_value=value;if(!disposed)hooks.auto_save_changed(value===true);};
    // 只接管本窗口的运行时开关，不写宿主偏好文件；草稿备份服务继续工作。
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
      // 仅在远端确认之后提交宿主状态；等待期间的新输入或切换不能被标为已保存。
      const text=typeof this.sync==='function'?this.sync():this.editor?.getMarkdown?.();if(typeof text!=='string')return Promise.reject(Error('远程Markdown正文尚未就绪。'));
      if(this.validateContentForSave?.()===false)return Promise.reject(Error('原生编辑器拒绝保存当前正文，草稿已保留。'));
      const current=this.editor.getMarkdown(),format=this.bundle.fileEncode||'utf8';
      const codec=runtime.reqnode('iconv-lite'),encoding=format.replace(/-bom$/u,'');
      let bytes=codec.encode(text,encoding,{addBOM:format.endsWith('-bom')});
      // 与原生保存保持一致：旧编码不能无损表示正文时使用UTF-8，不能把问号写入远端。
      if(!encoding.toLowerCase().includes('utf')&&codec.decode(bytes,encoding)!==text)bytes=codec.encode(text,'utf8');
      remote_saving=true;
      return remote.save_native(path,text,bytes).then(()=>{
        if(disposed||this.bundle?.filePath!==path||this.editor.getMarkdown()!==current)return false;
        save_depth++;try{return original.apply(this,args);}finally{save_depth--;}
      }).finally(()=>{remote_saving=false;});
    });
    replace(file,"updateChangeCount",original=>function(this:any,...args:any[]){const result=original.apply(this,args);if(!disposed&&this.changeCounter?.isDocumentEdited()&&typeof this.bundle?.filePath==="string")hooks.changed(this.bundle.filePath);return result;});
    replace(bridge,"invoke",original=>function(this:any,...args:any[]){const result=original.apply(this,args);if(!disposed&&args[0]==="app.sendEvent"&&args[1]==="didSave"&&typeof args[2]?.path==="string")hooks.saved(args[2].path);return result;});
    // saveUseNode在同步入口拒绝非前台窗口。仅显式自动保存这一轮允许跨过前台检查，
    // 同步调用返回即退出，其他宿主任务与随后异步阶段仍看到真实窗口状态。
    replace(file,"isActiveWindow",original=>function(this:any,...args:any[]){return save_depth>0||original.apply(this,args);});
  }
  return{sync_options,save<T>(operation:()=>T):T{save_depth++;try{return operation();}finally{save_depth--;}},dispose(){disposed=true;for(const release of releases.reverse())release();}};
}
