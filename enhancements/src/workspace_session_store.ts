export type workspace_session_file = {path:string;source:boolean;pinned:boolean};
export type workspace_session = {schema:1;root:string;files:workspace_session_file[];active:number};

/** 每个目录独立原子记录，只保存身份，不存储正文或与其他配置竞争写入。 */
export function create_workspace_session_store(fs:any,path_api:any,crypto:any,directory:string){
  const root_key=(root:string)=>{const resolved=path_api.resolve(root);return path_api.sep==="\\"?resolved.toLowerCase():resolved;};
  const location=(root:string)=>path_api.join(directory,crypto.createHash("sha256").update(root_key(root)).digest("hex")+".json");
  const validate=(value:any,root:string):workspace_session=>{
    if(value?.schema!==1||value.root!==root_key(root)||!Array.isArray(value.files)||value.files.length>1000||!Number.isInteger(value.active)||value.active< -1||value.active>=value.files.length)throw new Error("工作区会话记录无效。");
    if(value.files.some((file:any)=>!file||typeof file.path!=="string"||file.path.length>32768||file.path.includes("\0")||!path_api.isAbsolute(file.path)||typeof file.source!=="boolean"||typeof file.pinned!=="boolean"))throw new Error("工作区会话文件身份无效。");
    return value;
  };
  return {root_key,
    read(root:string):workspace_session|undefined{
      if(!root)return;
      try{const file=location(root);if(fs.statSync(file).size>2*1024*1024)throw new Error("工作区会话记录过大。");return validate(JSON.parse(fs.readFileSync(file,"utf8")),root);}
      catch(error){if((error as any)?.code==="ENOENT")return;throw error;}
    },
    write(root:string,files:workspace_session_file[],active:number){
      if(!root)return;
      const value=validate({schema:1,root:root_key(root),files,active},root),text=JSON.stringify(value);
      if(new TextEncoder().encode(text).length>2*1024*1024)throw new Error("工作区会话记录过大。");
      fs.mkdirSync(directory,{recursive:true});const file=location(root),temporary=file+"."+crypto.randomUUID()+".tmp";
      // 光标/布局事件可能重复提交同一会话；不变的身份不应反复替换磁盘文件。
      try { if (fs.readFileSync(file,"utf8") === text) return; }
      catch(error) { if((error as any)?.code!=="ENOENT")throw error; }
      try{fs.writeFileSync(temporary,text,{encoding:"utf8",flag:"wx",mode:0o600});fs.renameSync(temporary,file);}
      finally{try{fs.unlinkSync(temporary);}catch(error){if((error as any)?.code!=="ENOENT")throw error;}}
    },
  };
}
