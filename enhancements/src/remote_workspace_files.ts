import {workspace_text} from "./workspace_i18n";
import {notify_workspace_resource_change} from './workspace_resource_events';
/** Remote file identity and host materialization adapter. The cache must never serve as a fallback business filesystem. */
export type remote_file_connection={target:string;port?:number;username?:string;name?:string;request(operation:string,values?:Record<string,unknown>):Promise<any>;connected():boolean;poll_interval?():number};
const providers=new Set<remote_file_provider>();
let active_provider:remote_file_provider|undefined;
let protected_cache:{root:string;path_api:any}|undefined;
export function protect_remote_cache(root:string,path_api:any){protected_cache={root,path_api};}
export function is_remote_cache_path(path:string){
  if(remote_files_for(path))return true;
  if(!protected_cache)return false;
  const relative=protected_cache.path_api.relative(protected_cache.root,path);
  return relative!=='..'&&!relative.startsWith('..'+protected_cache.path_api.sep)&&!protected_cache.path_api.isAbsolute(relative);
}
export function assert_remote_owner(path:string){
  if(!protected_cache||typeof path!=='string')return;
  const relative=protected_cache.path_api.relative(protected_cache.root,path);
  if(relative!=='..'&&!relative.startsWith('..'+protected_cache.path_api.sep)&&!protected_cache.path_api.isAbsolute(relative)&&!remote_files_for(path))throw Error(workspace_text("remote_workspace_files_this_file_belongs_to_a_ssh_workspace_that_has_not_reconnecte"));
}
export const active_remote_files=()=>active_provider;
export const remote_files_for=(path:string)=>[...providers].find(provider=>provider.owns(path));
export function register_remote_files(provider:remote_file_provider){providers.add(provider);return()=>{provider.dispose();providers.delete(provider);if(active_provider===provider)active_provider=undefined;};}
export function select_remote_files(provider:remote_file_provider|undefined){active_provider=provider;}
const missing=()=>Object.assign(Error(workspace_text("remote_workspace_files_the_remote_path_has_not_been_read_please_open_it_through_the")),{code:'EREMOTE'});
const stat_value=(value:any)=>({...value,isDirectory:()=>value.directory,isFile:()=>value.file,isSymbolicLink:()=>value.link});

export class remote_file_provider {
  root='';readonly cache_root:string;readonly fs:any;
  private metadata=new Map<string,any>();
  private names=new Map<string,string>();
  private snapshots=new Map<string,{data:string;version:unknown}>();
  private preparing=new Map<string,Promise<void>>();
  private git_tail:Promise<unknown>=Promise.resolve();
  private watchers=new Set<()=>void>();
  private disposed=false;
  constructor(readonly connection:remote_file_connection,private native_fs:any,readonly path_api:any,cache_root:string,private buffer_api:any){
    this.cache_root=path_api.resolve(cache_root);
    const rpc=(action:string,path:string,values:Record<string,unknown>={})=>this.call('filesystem',{action,path:this.remote_path(path),...values});
    const stat=async(path:string,action='stat')=>{const value=stat_value(await rpc(action,path));this.metadata.set(path,value);return value;};
    const handle=async(path:string,flags:string,mode?:number)=>{
      const id=await rpc('open',path,{flags,...(mode===undefined?{}:{mode})});let closed=false;
      const invoke=(action:string,values:Record<string,unknown>={})=>{if(closed)throw Error(workspace_text("remote_workspace_files_file_handle_has_been_closed"));return this.call('filesystem',{action,handle:id,...values});};
      return {
        stat:async()=>stat_value(await invoke('fstat')),
        read:async(buffer:Uint8Array,offset:number,length:number,position:number|null)=>{const data=this.buffer_api.from(await invoke('read',{length,position}),'base64');buffer.set(data,offset);return{bytesRead:data.length,buffer};},
        write:async(buffer:Uint8Array,offset:number,length:number,position:number|null)=>({bytesWritten:await invoke('write',{data:this.buffer_api.from(buffer.subarray(offset,offset+length)).toString('base64'),position}),buffer}),
        writeFile:async(bytes:Uint8Array|string)=>{const data=this.buffer_api.from(bytes);let offset=0;while(offset<data.length){const written=await invoke('write',{data:data.subarray(offset,offset+1048576).toString('base64'),position:offset});if(!written)throw Error(workspace_text("remote_workspace_files_remote_write_has_not_made_progress"));offset+=written;}},
        chmod:(mode:number)=>invoke('chmod',{mode}),sync:()=>invoke('sync'),
        close:async()=>{if(closed)return;try{await invoke('close');}finally{closed=true;}},
      };
    };
    const promises={
      stat:(path:string)=>stat(path),lstat:(path:string)=>stat(path,'lstat'),
      realpath:async(path:string)=>this.local_path(await rpc('realpath',path)),
      readlink:(path:string)=>rpc('readlink',path),
      readdir:async(path:string,options?:{withFileTypes?:boolean})=>{const result=await this.call('list',{path:this.remote_path(path)});return result.entries.map((entry:any)=>{this.local_path(this.path_api.posix.join(this.remote_path(path),entry.name));return options?.withFileTypes?{name:entry.name,isDirectory:()=>entry.directory,isFile:()=>!entry.directory&&!entry.link,isSymbolicLink:()=>entry.link}:entry.name;});},
      readFile:async(path:string,options?:any)=>{if(options?.signal?.aborted)throw Error(workspace_text("remote_workspace_files_read_has_been_canceled"));const result=await this.call('read',{path:this.remote_path(path)});if(options?.signal?.aborted)throw Error(workspace_text("remote_workspace_files_read_has_been_canceled"));const data=this.buffer_api.from(result.data,'base64');const encoding=typeof options==='string'?options:options?.encoding;return encoding?data.toString(encoding):data;},
      open:handle,
      rename:async(path:string,target:string)=>{
        const result=await rpc('rename',path,{target:this.remote_path(target)});this.metadata.clear();
        // After an atomic-save temporary file replaces the target, fetch the remote version again on the next native open.
        this.snapshots.delete(target);
        for(const [old,snapshot] of [...this.snapshots]){
          const relative=this.path_api.relative(path,old);if(relative==='..'||relative.startsWith('..'+this.path_api.sep)||this.path_api.isAbsolute(relative))continue;
          const next=this.path_api.join(target,relative),version:any=snapshot.version;
          this.snapshots.delete(old);this.snapshots.set(next,{...snapshot,version:{...version,real_path:this.remote_path(next)}});
        }
        if(this.native_fs.existsSync(path)){await this.native_fs.promises.mkdir(this.path_api.dirname(target),{recursive:true});await this.native_fs.promises.rename(path,target);}
        return result;
      },
      link:(path:string,target:string)=>rpc('link',path,{target:this.remote_path(target)}),
      unlink:(path:string)=>rpc('unlink',path),rmdir:(path:string)=>rpc('rmdir',path),mkdir:(path:string)=>rpc('mkdir',path),
    };
    this.fs={promises,
      statSync:(path:string)=>{const value=this.metadata.get(path);if(!value)throw missing();return value;},
      lstatSync:(path:string)=>{const value=this.metadata.get(path);if(!value)throw missing();return value;},
      existsSync:(path:string)=>this.metadata.has(path),
      watch:(path:string,options:any,callback?:()=>void)=>{
        const changed=typeof options==='function'?options:callback;let stopped=false,timer:ReturnType<typeof setTimeout>,signature='';
        const close=()=>{stopped=true;clearTimeout(timer);this.watchers.delete(close);};this.watchers.add(close);
        const poll=async()=>{try{if(this.connection.connected()&&(this.connection.poll_interval?.()??5000)>0){const next=await rpc('watch_signature',path);if(!stopped&&signature&&next!==signature)changed?.();signature=next;}}catch{/* Disconnection maintains identity, and the next round can be restored after reconnection. */}finally{if(!stopped)timer=setTimeout(poll,this.connection.poll_interval?.()||5000);}};
        void poll();return{close,on(){return this;}};
      },
    };
  }
  owns(path:string){if(typeof path!=='string')return false;const relative=this.path_api.relative(this.cache_root,path);return relative!== '..'&&!relative.startsWith('..'+this.path_api.sep)&&!this.path_api.isAbsolute(relative);}
  remote_path(path:string){if(!this.owns(path))throw Error(workspace_text("remote_workspace_files_the_path_does_not_belong_to_this_ssh_host"));return '/'+this.path_api.relative(this.cache_root,path).split(this.path_api.sep).join('/');}
  local_path(path:string){
    if(typeof path!=='string'||!path.startsWith('/')||path.includes('\0'))throw Error(workspace_text("remote_workspace_files_invalid_remote_path"));
    const normalized=this.path_api.posix.normalize(path),parts=normalized.split('/').filter(Boolean);
    if(this.path_api.sep==='\\'&&parts.some((part:string)=>/[<>:"\\|?*\x00-\x1f]/u.test(part)||/[ .]$/u.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)))throw Error(workspace_text("remote_workspace_files_this_remote_name_cannot_be_passed_to_the_windows_native_edit"));
    const local=this.path_api.join(this.cache_root,...parts),key=this.path_api.sep==='\\'?local.toLowerCase():local;
    const prior=this.names.get(key);if(prior&&prior!==normalized)throw Error(workspace_text("remote_workspace_files_the_remote_file_exists_with_a_name_that_differs_only_in_case"));this.names.set(key,normalized);return local;
  }
  private call(operation:string,values:Record<string,unknown>){if(this.disposed||!this.connection.connected())throw Error(workspace_text("remote_workspace_files_ssh_has_been_disconnected_the_draft_is_retained_please_recon"));return this.connection.request(operation,values);}
  /** An address draft may contain regex characters; verify the remote object first and map only real paths into the host cache. */
  async stat_remote(path:string){
    if(typeof path!=='string'||!path.startsWith('/')||path.includes('\0'))throw Error(workspace_text("remote_workspace_files_invalid_remote_path"));
    return stat_value(await this.call('filesystem',{action:'stat',path:this.path_api.posix.normalize(path)}));
  }
  async mount(path:string){const local=this.local_path(path);if(!(await this.fs.promises.stat(local)).isDirectory())throw Error(workspace_text("remote_workspace_files_the_selected_item_is_not_a_remote_folder"));await this.native_fs.promises.mkdir(local,{recursive:true});return local;}
  prepare(path:string,force=false,valid:()=>boolean=()=>true){
    let pending=this.preparing.get(path);if(pending)return pending.then(()=>{if(this.disposed||!valid())throw Error(workspace_text("remote_workspace_files_remote_file_reading_has_been_canceled"));if(force)return this.prepare(path,true,valid);});
    pending=(async()=>{
      if(this.snapshots.has(path)&&!force){if(!this.metadata.has(path))await this.fs.promises.stat(path);return;} // The opened document must not be overridden by navigation for native drafts or version baseline.
      const snapshot=await this.call('read',{path:this.remote_path(path)});
      await this.fs.promises.stat(path);
      await this.native_fs.promises.mkdir(this.path_api.dirname(path),{recursive:true});
      if(this.disposed||!valid())throw Error(workspace_text("remote_workspace_files_remote_file_reading_has_been_canceled"));
      await this.native_fs.promises.writeFile(path,this.buffer_api.from(snapshot.data,'base64'));
      this.snapshots.set(path,snapshot);
    })().finally(()=>this.preparing.delete(path));this.preparing.set(path,pending);return pending;
  }
  prepared(path:string){return this.snapshots.has(path);}
  dispose(){this.disposed=true;for(const close of [...this.watchers])close();}
  trash(path:string){return this.call('filesystem',{action:'trash',path:this.remote_path(path)});}
  async save_native(path:string,text:string,bytes?:Uint8Array){
    const snapshot=this.snapshots.get(path);if(!snapshot)throw Error(workspace_text("remote_workspace_files_remote_baseline_save_does_not_exist_no_cache_writing"));
    const original=this.buffer_api.from(snapshot.data,'base64');const bom=original[0]===239&&original[1]===187&&original[2]===191;
    const data=(bytes?this.buffer_api.from(bytes):this.buffer_api.from((bom?'\ufeff':'')+text,'utf8')).toString('base64');
    const saved=await this.call('write',{path:this.remote_path(path),version:snapshot.version,data});
    this.snapshots.set(path,{data,version:saved.version});
  }
  git(cwd:string,args:string[],env:Record<string,unknown>,writable:boolean,input?:string,signal?:AbortSignal){
    const mapped=args.map(arg=>{
      const prefix=arg.startsWith('--output=')?'--output=':'',value=prefix?arg.slice(prefix.length):arg;
      if(this.path_api.isAbsolute(value)&&this.owns(value))return prefix+this.remote_path(value);
      if(/^[a-z]:[\\/]/iu.test(value))throw Error(workspace_text("remote_workspace_files_remote_git_cannot_use_local_disk_path_please_select_remote_w"));
      return arg;
    });
    const token=globalThis.crypto.randomUUID();
    const cancel=()=>{void Promise.resolve().then(()=>this.call('cancel_git',{token})).catch(()=>{});};
    const pending=this.git_tail.catch(()=>{}).then(async()=>{
      if(signal?.aborted)throw Error(workspace_text("remote_workspace_files_remote_git_has_been_canceled"));signal?.addEventListener('abort',cancel,{once:true});
      try{return await this.call('git',{path:this.remote_path(cwd),args:mapped,env,writable,input,token});}finally{signal?.removeEventListener('abort',cancel);}
    });this.git_tail=pending;
    return pending.then(result=>this.buffer_api.from(result.data,'base64'));
  }
}

const resource_file_systems=new WeakMap<object,any>();
/** Only for use with own files, never modify Node global fs or third-party host's IO. */
export function workspace_resource_fs(native_fs:any){
  const existing=resource_file_systems.get(native_fs);if(existing)return existing;
  const route=(owner:any,key:string,promise:boolean)=>{const original=owner[key];return(...args:any[])=>{
    const provider=typeof args[0]==='string'?remote_files_for(args[0]):undefined;
    if(!provider)assert_remote_owner(args[0]);
    const method=provider?(promise?provider.fs.promises:provider.fs)[key]:original;
    if(!method)throw Error(workspace_text("remote_workspace_files_remote_file_service_does_not_support_this_operation")+key);
    const result=method.apply(provider?undefined:owner,args);
    if(promise&&['writeFile','appendFile','truncate','mkdir','rm','rmdir','unlink','rename','copyFile','link','symlink'].includes(key))return Promise.resolve(result).then(value=>{const paths=(['rename','copyFile','link','symlink'].includes(key)?args.slice(0,2):args.slice(0,1)).filter(path=>typeof path==='string');notify_workspace_resource_change({fs:proxy,paths});return value;});
    return result;
  };};
  const promises=new Proxy(native_fs.promises,{get:(owner,key:string)=>typeof owner[key]==='function'?route(owner,key,true):owner[key]});
  const proxy=new Proxy(native_fs,{get:(owner,key:string)=>key==='promises'?promises:typeof owner[key]==='function'?route(owner,key,false):owner[key]});
  resource_file_systems.set(native_fs,proxy);return proxy;
}
