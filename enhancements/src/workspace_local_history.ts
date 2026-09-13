import {detect_binary_bytes} from "./file_language";

export type local_history_entry={id:string;timestamp:number;source:string;hash:string;size:number;file_path:string};
export type local_history_options={enabled:boolean;max_file_size:number;max_entries:number;merge_window:number;exclude:Record<string,boolean>;workspace_root?:string};
type history_modules={fs:any;path_api:any;crypto:any};
const identifier=/^[a-f0-9]{32}$/u;
/** 支持VS Code常用glob：*、**、?、字符组和花括号备选。路径始终使用斜杠。 */
export function history_glob_matches(pattern:string,path:string):boolean{
  if(pattern.length>1024)return false;
  let source="";
  for(let i=0;i<pattern.length;i++){
    const char=pattern[i];
    if(char==="*"){if(pattern[i+1]==="*"){i++;if(pattern[i+1]==="/"){i++;source+="(?:.*/)?";}else source+=".*";}else source+="[^/]*";}
    else if(char==="?")source+="[^/]";
    else if(char==="{"){const end=pattern.indexOf("}",i+1);if(end<0)source+="\\{";else{source+="(?:"+pattern.slice(i+1,end).split(",").map(part=>part.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")).join("|")+")";i=end;}}
    else if(char==="["){const end=pattern.indexOf("]",i+1);if(end<0)source+="\\[";else{source+="["+pattern.slice(i+1,end).replace(/^!/u,"^")+ "]";i=end;}}
    else source+=char.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&");
  }
  try{return new RegExp("^"+source+"$","u").test(path.replaceAll("\\","/"));}catch{return false;}
}
/** 每条记录独立原子发布；多窗口不共写全局索引或同一快照文件。 */
export function create_local_history_store(modules:history_modules,directory:string,read_options:()=>local_history_options){
  const {path_api,crypto}=modules,fs=modules.fs.promises;
  const queues=new Map<string,Promise<unknown>>();
  const hash=(bytes:Uint8Array|string)=>crypto.createHash("sha256").update(bytes).digest("hex");
  const key=(path:string)=>{const value=path_api.resolve(path);return path_api.sep==="\\"?value.toLowerCase():value;};
  const bucket=(path:string)=>path_api.join(directory,hash(key(path)));
  const id=()=>crypto.randomBytes(16).toString("hex");
  async function bounded_read(path:string,limit:number){
    const handle=await fs.open(path,"r");try{
      const before=await handle.stat();if(!before.isFile()||before.size>limit)throw new Error("历史文件大小超限。");
      const buffer=new Uint8Array(before.size+1);let length=0;
      while(length<buffer.length){const read=await handle.read(buffer,length,buffer.length-length,length);if(!read.bytesRead)break;length+=read.bytesRead;}
      const after=await handle.stat();if(length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new Error("读取时文件发生变化。");
      return buffer.slice(0,length);
    }finally{await handle.close();}
  }
  async function atomic_write(path:string,bytes:string|Uint8Array){
    const temporary=path+"."+id()+".tmp";let created=false;
    try{const handle=await fs.open(temporary,"wx",0o600);created=true;try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await fs.rename(temporary,path);created=false;}
    finally{if(created)await fs.unlink(temporary).catch(()=>{});}
  }
  const json=async(path:string)=>JSON.parse(new TextDecoder().decode(await bounded_read(path,65536)));
  async function list(file_path:string):Promise<local_history_entry[]>{
    const dir=bucket(file_path);let names:string[];
    try{names=await fs.readdir(dir);}catch(error){if((error as any).code==="ENOENT")return [];throw error;}
    const result:local_history_entry[]=[];
    for(const name of names){if(!/^[a-f0-9]{32}\.json$/u.test(name))continue;
      try{const item=await json(path_api.join(dir,name));if(item.id+".json"!==name||!Number.isFinite(item.timestamp)||typeof item.source!=="string"||!Number.isSafeInteger(item.size)||item.size<0||!/^[a-f0-9]{64}$/u.test(item.hash))throw new Error("本地历史索引无效。");result.push({...item,file_path});}
      catch(error){if((error as any).code!=="ENOENT")throw error;}
    }
    return result.sort((a,b)=>b.timestamp-a.timestamp||b.id.localeCompare(a.id));
  }
  const serialize=<T>(file_path:string,action:()=>Promise<T>):Promise<T>=>{
    const resource=key(file_path),previous=queues.get(resource)||Promise.resolve();
    const result=previous.catch(()=>{}).then(action);queues.set(resource,result);
    void result.finally(()=>{if(queues.get(resource)===result)queues.delete(resource);}).catch(()=>{});return result;
  };
  const excluded=(file_path:string,options:local_history_options)=>Object.entries(options.exclude).some(([pattern,enabled])=>enabled&&[
    file_path.replaceAll("\\","/"),options.workspace_root?path_api.relative(options.workspace_root,file_path).replaceAll("\\","/"):path_api.basename(file_path),
  ].some(path=>history_glob_matches(pattern,path)));
  async function remove(entry:local_history_entry){if(!identifier.test(entry.id))throw new Error("历史条目无效。");const dir=bucket(entry.file_path);await fs.unlink(path_api.join(dir,entry.id+".json")).catch((error:any)=>{if(error.code!=="ENOENT")throw error;});await fs.unlink(path_api.join(dir,entry.id+".data")).catch((error:any)=>{if(error.code!=="ENOENT")throw error;});}
  const record=(file_path:string,input:Uint8Array,source="File Saved",force=false)=>{
    if(!path_api.isAbsolute(file_path))return Promise.resolve(undefined);
    const options=read_options();if(!options.enabled||input.byteLength>options.max_file_size*1024||input.byteLength>16*1024*1024||excluded(file_path,options)||detect_binary_bytes(input))return Promise.resolve(undefined);
    const bytes=input.slice();
    return serialize(file_path,async()=>{
      const entries=await list(file_path),digest=hash(bytes),previous=entries[0];
      if(previous?.hash===digest)return previous;
      const dir=bucket(file_path);await fs.mkdir(dir,{recursive:true});
      const entry:local_history_entry={id:id(),timestamp:Math.max(Date.now(),(previous?.timestamp||0)+1),source,hash:digest,size:bytes.byteLength,file_path};
      await atomic_write(path_api.join(dir,"resource.json"),JSON.stringify({file_path:path_api.resolve(file_path)}));
      await atomic_write(path_api.join(dir,entry.id+".data"),bytes);
      try{await atomic_write(path_api.join(dir,entry.id+".json"),JSON.stringify(entry));}catch(error){await fs.unlink(path_api.join(dir,entry.id+".data")).catch(()=>{});throw error;}
      if(!force&&previous?.source===source&&entry.timestamp-previous.timestamp<options.merge_window*1000){await remove(previous);entries.shift();}
      for(const item of entries.slice(Math.max(0,options.max_entries-1)))await remove(item);
      return entry;
    });
  };
  async function read(entry:local_history_entry){
    if(!identifier.test(entry.id))throw new Error("历史条目无效。");
    const current=(await list(entry.file_path)).find(item=>item.id===entry.id);if(!current)throw new Error("历史条目已被删除或合并，请刷新后重试。");
    const bytes=await bounded_read(path_api.join(bucket(entry.file_path),entry.id+".data"),16*1024*1024);
    if(bytes.length!==current.size||hash(bytes)!==current.hash)throw new Error("历史内容校验失败。");return bytes;
  }
  async function resources(){
    let names:string[];try{names=await fs.readdir(directory);}catch(error){if((error as any).code==="ENOENT")return [];throw error;}
    const result:{file_path:string;timestamp:number}[]=[];
    for(const name of names){if(!/^[a-f0-9]{64}$/u.test(name))continue;try{
      const resource=await json(path_api.join(directory,name,"resource.json"));if(typeof resource.file_path!=="string"||!path_api.isAbsolute(resource.file_path)||hash(key(resource.file_path))!==name)throw new Error("本地历史文件身份无效。");
      const entries=await list(resource.file_path);if(entries.length)result.push({file_path:resource.file_path,timestamp:entries[0].timestamp});
    }catch(error){if((error as any).code!=="ENOENT")throw error;}}
    return result.sort((a,b)=>b.timestamp-a.timestamp);
  }
  async function capture(file_path:string,source="File Saved",force=false){
    const options=read_options();if(!options.enabled||excluded(file_path,options))return;
    const stat=await fs.stat(file_path);if(!stat.isFile()||stat.size>options.max_file_size*1024||stat.size>16*1024*1024)return;
    return record(file_path,await bounded_read(file_path,Math.min(16*1024*1024,options.max_file_size*1024)),source,force);
  }
  async function move(old_path:string,new_path:string,directory_move=false){
    if(!path_api.isAbsolute(old_path)||!path_api.isAbsolute(new_path))throw new Error("历史迁移路径无效。");
    await Promise.all([...queues.values()]);
    const candidates=directory_move?(await resources()).map(item=>item.file_path):[old_path];
    for(const source of candidates){
      const relative=path_api.relative(old_path,source);if(directory_move&&(path_api.isAbsolute(relative)||relative===".."||relative.startsWith(".."+path_api.sep)))continue;
      const target=directory_move?path_api.join(new_path,relative):new_path;
      if(key(source)===key(target)){if((await list(source)).length)await atomic_write(path_api.join(bucket(source),"resource.json"),JSON.stringify({file_path:target}));continue;}
      await serialize(source,()=>serialize(target,async()=>{
        const entries=await list(source);if(!entries.length)return;
        const dir=bucket(target);await fs.mkdir(dir,{recursive:true});
        await atomic_write(path_api.join(dir,"resource.json"),JSON.stringify({file_path:target}));
        for(const entry of entries){const bytes=await read(entry);await atomic_write(path_api.join(dir,entry.id+".data"),bytes);await atomic_write(path_api.join(dir,entry.id+".json"),JSON.stringify({...entry,file_path:target}));await remove(entry);}
      }));
    }
  }
  return {record,list,read,resources,capture,remove,move,hash,bounded_read,flush:()=>Promise.all([...queues.values()])};
}
export type local_history_store=ReturnType<typeof create_local_history_store>;
