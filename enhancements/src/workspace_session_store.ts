import {workspace_text} from "./workspace_i18n";
export type workspace_session_file = {path:string;source:boolean;pinned:boolean};
export type workspace_session = {schema:1;root:string;files:workspace_session_file[];active:number};

/** Each directory has an independent atomic record; only saves identity, not document content or competes with other configurations for writing. */
export function create_workspace_session_store(fs:any,path_api:any,crypto:any,directory:string){
  const root_key=(root:string)=>{const resolved=path_api.resolve(root);return path_api.sep==="\\"?resolved.toLowerCase():resolved;};
  const location=(root:string)=>path_api.join(directory,crypto.createHash("sha256").update(root_key(root)).digest("hex")+".json");
  const validate=(value:any,root:string):workspace_session=>{
    if(value?.schema!==1||value.root!==root_key(root)||!Array.isArray(value.files)||!Number.isInteger(value.active)||value.active< -1||value.active>=value.files.length)throw new Error(workspace_text("session_store_workspace_session_record_is_invalid"));
    if(value.files.some((file:any)=>!file||typeof file.path!=="string"||file.path.includes("\0")||!path_api.isAbsolute(file.path)||typeof file.source!=="boolean"||typeof file.pinned!=="boolean"))throw new Error(workspace_text("session_store_workspace_session_file_identity_is_invalid"));
    return value;
  };
  return {root_key,
    read(root:string):workspace_session|undefined{
      if(!root)return;
      try{const file=location(root);return validate(JSON.parse(fs.readFileSync(file,"utf8")),root);}
      catch(error){if((error as any)?.code==="ENOENT")return;throw error;}
    },
    write(root:string,files:workspace_session_file[],active:number){
      if(!root)return;
      const value=validate({schema:1,root:root_key(root),files,active},root),text=JSON.stringify(value);
      fs.mkdirSync(directory,{recursive:true});const file=location(root),temporary=file+"."+crypto.randomUUID()+".tmp";
      // Cursor/layout events may resubmit the same session; unchanged identity should not repeatedly replace disk files.
      try { if (fs.readFileSync(file,"utf8") === text) return; }
      catch(error) { if((error as any)?.code!=="ENOENT")throw error; }
      try{fs.writeFileSync(temporary,text,{encoding:"utf8",flag:"wx",mode:0o600});fs.renameSync(temporary,file);}
      finally{try{fs.unlinkSync(temporary);}catch(error){if((error as any)?.code!=="ENOENT")throw error;}}
    },
  };
}
