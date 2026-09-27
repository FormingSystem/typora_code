import {remote_files_for} from './remote_workspace_files';
import {subscribe_workspace_resource_change} from './workspace_resource_events';

export type directory_change={root:string;directory?:string;path?:string;source?:unknown;names?:boolean};
export type directory_file={file_path:string;relative_path:string;name:string;directory:string};
type directory_scope={root:string;provider:unknown;revision:number;disposed:boolean;recursive:boolean;unwatched:boolean;watchers:Map<string,any>;entries:Map<string,Promise<any[]>>;catalogue?:Promise<{files:directory_file[];unreadable:number}>;snapshot?:{files:directory_file[];unreadable:number}};
const services=new WeakMap<object,workspace_directory_service>();
const change_listeners=new Set<(change:directory_change)=>void>();
export function subscribe_workspace_directory_changes(listener:(change:directory_change)=>void){change_listeners.add(listener);return()=>{change_listeners.delete(listener);};}

/** 名称元数据的唯一所有者；正文、Git状态与视图选择不进入此缓存。 */
export class workspace_directory_service {
  private scopes=new Map<string,directory_scope>();
  private references=0;
  private progress=new Set<(root:string,files:directory_file[])=>void>();
  private listeners=new Set<{root:string;directory?:string;callback:(change:directory_change)=>void}>();
  private disposed=false;
  private release_changes:()=>void;
  private context_changed=()=>this.clear();
  constructor(private fs:any,private path_api:any){
    globalThis.addEventListener?.('linux-note-workspace-context-changed',this.context_changed);
    this.release_changes=subscribe_workspace_resource_change(change=>{if(change.fs!==this.fs)return;for(const scope of this.scopes.values())for(const path of change.paths){const relative=this.path_api.relative(scope.root,path);if(relative!=='..'&&!relative.startsWith('..'+this.path_api.sep)&&!this.path_api.isAbsolute(relative))this.changed(scope,{root:scope.root,directory:this.path_api.dirname(path),path},true);}});
  }
  retain(){this.references++;let released=false;return()=>{if(released)return;released=true;if(--this.references===0){this.disposed=true;this.clear();this.release_changes();this.listeners.clear();this.progress.clear();globalThis.removeEventListener?.('linux-note-workspace-context-changed',this.context_changed);services.delete(this.fs);}};}
  private clear(){for(const scope of this.scopes.values()){scope.disposed=true;for(const watcher of scope.watchers.values())watcher.close();scope.watchers.clear();scope.entries.clear();scope.catalogue=undefined;scope.snapshot=undefined;}this.scopes.clear();}
  private scope(root:string){
    if(this.disposed)throw new Error('目录服务已关闭');
    const key=this.path_api.normalize(root),provider=remote_files_for(root);let scope=this.scopes.get(key);
    if(scope&&scope.provider!==provider){scope.disposed=true;for(const watcher of scope.watchers.values())watcher.close();this.scopes.delete(key);scope=undefined;}
    if(!scope){scope={root:key,provider,revision:0,disposed:false,recursive:false,unwatched:false,watchers:new Map(),entries:new Map()};this.scopes.set(key,scope);if(!provider)scope.recursive=this.watch(scope,key,true);else scope.unwatched=true;}
    return scope;
  }
  private watch(scope:directory_scope,directory:string,recursive=false){
    if(scope.watchers.has(directory))return true;
    try{
      const watcher=this.fs.watch(directory,{persistent:false,recursive},(kind?:string,name?:string)=>{
        if(scope.disposed)return;
        const target=name?this.path_api.join(directory,String(name)):undefined;
        // change只影响内容消费者；rename或无明细通知使名称快照失效。
        this.changed(scope,{root:scope.root,directory:recursive?(target?this.path_api.dirname(target):undefined):directory,path:target},kind!=='change');
      });scope.watchers.set(directory,watcher);
      watcher.on?.('error',()=>{watcher.close();scope.watchers.delete(directory);scope.unwatched=true;scope.recursive=false;this.changed(scope,{root:scope.root},true);});return true;
    }catch{if(!recursive)scope.unwatched=true;return false;}
  }
  private changed(scope:directory_scope,change:directory_change,names:boolean){
    if(scope.disposed)return;
    change.names=names;
    if(names){
      const relative=change.path?this.path_api.relative(scope.root,change.path).split(this.path_api.sep).join('/'):'';
      if(!relative.startsWith('.git/')&&!relative.startsWith('node_modules/')){scope.revision++;scope.catalogue=undefined;scope.snapshot=undefined;}
      if(!change.directory)scope.entries.clear();else{
        scope.entries.delete(change.directory);
        const branch=change.path||change.directory;
        for(const key of scope.entries.keys())if(key===branch||key.startsWith(branch+this.path_api.sep))scope.entries.delete(key);
        if(!scope.recursive)for(const [key,watcher] of scope.watchers)if(key!==scope.root&&(key===change.path||key.startsWith(branch+this.path_api.sep))){watcher.close();scope.watchers.delete(key);}
      }
    }
    for(const listener of [...this.listeners])if(listener.root===scope.root)listener.callback(change);
    for(const listener of [...change_listeners])listener(change);
  }
  invalidate(root:string,directory?:string,source?:unknown){const scope=this.scope(root);this.changed(scope,{root:scope.root,directory,source},true);}
  observe(root:string){if(root){const scope=this.scope(root);if(!scope.recursive)this.watch(scope,scope.root);}}
  subscribe(root:string,callback:(change:directory_change)=>void,directory?:string){
    const listener={root:this.path_api.normalize(root),directory,callback};this.listeners.add(listener);
    const scope=directory?this.scope(root):undefined;
    if(scope?.provider&&directory)this.watch(scope,directory);
    return()=>{this.listeners.delete(listener);if(scope?.provider&&directory&&directory!==scope.root&&![...this.listeners].some(other=>other.root===scope.root&&other.directory===directory)){scope.watchers.get(directory)?.close();scope.watchers.delete(directory);}};
  }
  async read(root:string,directory:string):Promise<any[]>{
    const scope=this.scope(root);directory=this.path_api.normalize(directory);
    // SSH没有递归事件能力；未展示目录不创建长期轮询，按需读取以保证新鲜度。
    if(scope.provider){
      if([...this.listeners].some(listener=>listener.root===scope.root&&listener.directory===directory))this.watch(scope,directory);
      let pending=scope.entries.get(directory);if(!pending){pending=Promise.resolve().then(()=>this.fs.promises.readdir(directory,{withFileTypes:true}));scope.entries.set(directory,pending);}
      try{const entries=await pending;if(scope.disposed)throw new DOMException('工作区目录已切换','AbortError');return entries.slice();}
      finally{if(scope.entries.get(directory)===pending)scope.entries.delete(directory);}
    }
    if(!scope.recursive)this.watch(scope,directory);
    let pending=scope.entries.get(directory);
    if(!pending){
      pending=Promise.resolve().then(()=>this.fs.promises.readdir(directory,{withFileTypes:true}));scope.entries.set(directory,pending);
      pending.catch(()=>{if(scope.entries.get(directory)===pending)scope.entries.delete(directory);});
    }
    const entries=await pending;
    if(scope.disposed)throw new DOMException('工作区目录已切换','AbortError');
    // 读取中发生变更时不发布过期快照；同目录等待者共享下一次读取。
    if(scope.entries.get(directory)!==pending)return this.read(root,directory);
    if(scope.unwatched)scope.entries.delete(directory);
    return entries.slice();
  }
  cached_catalogue(root:string){const scope=this.scope(root);return scope.unwatched?undefined:scope.snapshot;}
  subscribe_progress(listener:(root:string,files:directory_file[])=>void){this.progress.add(listener);return()=>this.progress.delete(listener);}
  catalogue(root:string):Promise<{files:directory_file[];unreadable:number}>{
    const scope=this.scope(root);if(scope.catalogue)return scope.catalogue;
    const revision=scope.revision;
    const pending=(async()=>{
      const files:directory_file[]=[],stack=[root];let unreadable=0;
      const current=()=>{if(scope.disposed)throw new DOMException('工作区目录已切换','AbortError');};
      const read_directory=async(directory:string)=>{
          current();let entries:any[];
          try{entries=await this.read(root,directory);}catch(error){current();unreadable++;return;}
          let started=performance.now();
          for(const entry of entries){
            if(performance.now()-started>8){await new Promise(resolve=>setTimeout(resolve,0));current();started=performance.now();}
            const file_path=this.path_api.join(directory,entry.name);
            if(entry.isDirectory()&&!entry.isSymbolicLink?.()){if(!['.git','node_modules'].includes(entry.name))stack.push(file_path);}
            else if(entry.isFile()){const relative_path=this.path_api.relative(root,file_path).replaceAll('\\','/');files.push({file_path,relative_path,name:entry.name,directory:this.path_api.dirname(relative_path).replace(/^\.$/u,'')});}
          }
          current();if(scope.revision===revision)for(const listener of [...this.progress])listener(root,files);
      };
      const running=new Set<Promise<void>>();
      try{while(stack.length||running.size){current();while(stack.length&&running.size<4){const task=read_directory(stack.pop()!).finally(()=>running.delete(task));running.add(task);}if(running.size)await Promise.race(running);}}
      finally{await Promise.allSettled(running);}
      current();
      if(scope.revision!==revision)return this.catalogue(root);
      const snapshot={files,unreadable};
      if(unreadable||scope.unwatched){scope.catalogue=undefined;scope.snapshot=undefined;}else scope.snapshot=snapshot;
      return snapshot;
    })();scope.catalogue=pending;pending.catch(()=>{if(scope.catalogue===pending){scope.catalogue=undefined;scope.snapshot=undefined;}});return pending;
  }
}

export function acquire_workspace_directories(fs:any,path_api:any){let service=services.get(fs);if(!service){service=new workspace_directory_service(fs,path_api);services.set(fs,service);}return{service,dispose:service.retain()};}
export function read_workspace_directory(fs:any,path_api:any,root:string,directory:string):Promise<any[]>{const service=services.get(fs);return service?service.read(root,directory):fs.promises.readdir(directory,{withFileTypes:true});}
