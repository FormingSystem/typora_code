import type {source_symbol} from "./source_symbols";
import {create_clangd_transport} from "./clangd_transport";

export type clangd_options={executable?:string;workspace_root?:string;compile_commands_dir?:string;fallback_flags?:string[]};
export type clangd_symbol_request=clangd_options&{file_path:string;language:"c"|"cpp";text:string};
export type clangd_environment={executable:string;compile_commands_dir:string;candidates:string[];compile_commands_candidates:string[]};
export type clangd_symbol_result={symbols:source_symbol[];incomplete:false;provider:"clangd";executable:string;compile_commands_dir:string;diagnostics:{received:boolean;errors:number;warnings:number;messages:string[]}};
const host_node=(name:string)=>(window as unknown as {reqnode:(name:string)=>any}).reqnode(name);

/** 有界查找 PATH、LLVM 标准安装目录和当前工作区构建目录，不扫描磁盘或执行编译器。 */
export async function discover_clangd_environment(options:clangd_options={},node=host_node):Promise<clangd_environment>{
  const fs=node("fs").promises,path=node("path"),process=node("process"),env=process.env,is_windows=process.platform==="win32";
  const name=is_windows?"clangd.exe":"clangd",candidates:string[]=[],seen=new Set<string>();
  const regular=async(file:string)=>{try{return (await fs.stat(file)).isFile();}catch{return false;}};
  const add=(file:string)=>{if(!file)return;const resolved=path.resolve(file),key=is_windows?resolved.toLowerCase():resolved;if(!seen.has(key)){seen.add(key);candidates.push(resolved);}};
  const path_dirs=String(env.PATH||env.Path||"").split(path.delimiter).filter(Boolean).map((item:string)=>item.replace(/^"|"$/g,""));
  if(options.executable?.trim()){
    const value=options.executable.trim();
    if(path.isAbsolute(value))add(value);else if(!/[\\/]/.test(value))for(const directory of path_dirs)add(path.join(directory,is_windows&&!path.extname(value)?value+".exe":value));
    else throw new Error("clangd 路径必须为绝对路径或 PATH 中的命令名。");
  }else{
    if(env.CLANGD_PATH&&path.isAbsolute(env.CLANGD_PATH))add(env.CLANGD_PATH);
    for(const directory of path_dirs)add(path.join(directory,name));
    if(env.LLVM_PATH){add(path.join(env.LLVM_PATH,"bin",name));add(path.join(env.LLVM_PATH,name));}
    if(is_windows){for(const directory of [env.ProgramFiles,env["ProgramFiles(x86)"]].filter(Boolean))add(path.join(directory,"LLVM","bin",name));}
    else for(const directory of ["/usr/bin","/usr/local/bin","/opt/homebrew/opt/llvm/bin","/usr/local/opt/llvm/bin"])add(path.join(directory,name));
  }
  const available:string[]=[];for(const candidate of candidates){
    if(is_windows&&path.extname(candidate).toLowerCase()!==".exe")continue;
    if(await regular(candidate)){try{if(!is_windows)await fs.access(candidate,node("fs").constants.X_OK);available.push(candidate);}catch{}}
  }
  if(!available.length)throw new Error(options.executable?"指定的 clangd 不存在，请在大纲解析设置中选择 clangd 可执行文件。":"未找到 clangd。请在大纲解析设置中选择 clangd，或将 LLVM 的 bin 目录加入 PATH。");
  const compile_commands_candidates:string[]=[];
  const database=async(directory:string)=>{if(await regular(path.join(directory,"compile_commands.json"))||await regular(path.join(directory,"compile_flags.txt")))compile_commands_candidates.push(directory);};
  const root=options.workspace_root&&path.isAbsolute(options.workspace_root)?path.resolve(options.workspace_root):"";
  if(options.compile_commands_dir?.trim()){
    const value=options.compile_commands_dir.trim();if(!path.isAbsolute(value)&&!root)throw new Error("相对编译数据库目录需要已打开的工作区。");
    const directory=path.resolve(root||"",value);await database(directory);if(!compile_commands_candidates.length)throw new Error("所选目录未找到 compile_commands.json 或 compile_flags.txt。");
  }else if(root){
    await database(root);const build_dir=path.join(root,"build");await database(build_dir);
    try{const directories=(await fs.readdir(build_dir,{withFileTypes:true})).filter((entry:any)=>entry.isDirectory()).sort((a:any,b:any)=>a.name.localeCompare(b.name)).slice(0,64);for(const entry of directories)await database(path.join(build_dir,entry.name));}catch{}
  }
  return {executable:available[0],compile_commands_dir:compile_commands_candidates[0]||"",candidates:available,compile_commands_candidates};
}

/** LSP 行列按 UTF-16 转成 Monaco 字符偏移，保留分析器给出的符号种类和选择范围。 */
export function clangd_document_symbols(items:any,text:string):source_symbol[]{
  const starts=[0];for(let index=0;index<text.length;index++)if(text.charCodeAt(index)===10)starts.push(index+1);
  const offset=(position:any)=>{const line=position?.line,character=position?.character;if(!Number.isInteger(line)||!Number.isInteger(character)||line<0||character<0||line>=starts.length)return undefined;const start=starts[line],end=line+1<starts.length?starts[line+1]-1:text.length;return Math.min(start+character,end);};
  const kinds:Record<number,string>={1:"file",2:"namespace",3:"namespace",4:"namespace",5:"class",6:"method",7:"property",8:"field",9:"method",10:"enum",11:"interface",12:"function",13:"variable",14:"constant",15:"string",16:"number",17:"boolean",18:"array",19:"object",20:"property",21:"namespace",22:"enum-member",23:"struct",24:"event",25:"operator",26:"type-parameter"};
  let count=0;
  const map=(values:any[],depth=0,parent_kind=0):source_symbol[]=>{if(depth>80)return [];return values.flatMap(item=>{
    if(++count>5000||typeof item?.name!=="string")return [];
    const range=item.range||item.location?.range,selection=item.selectionRange||range;
    const start=offset(range?.start),end=offset(range?.end),selection_start=offset(selection?.start),selection_end=offset(selection?.end);
    if(start===undefined||end===undefined||selection_start===undefined||selection_end===undefined||start>end||selection_start>selection_end)return [];
    // clangd 18 将 struct 返回为 Class，附带语义 detail；据此还原展示类别，不再解析源码。
    return [{name:item.name.slice(0,200),kind:item.kind===5&&item.detail==="struct"?"struct":item.kind===10&&parent_kind===10?"enum-member":kinds[item.kind]||"variable",detail:typeof item.detail==="string"?item.detail:"",start,end,selection_start,selection_end,children:Array.isArray(item.children)?map(item.children,depth+1,item.kind):[]}];
  });};
  return Array.isArray(items)?map(items):[];
}

export function create_clangd_symbol_service(node=host_node){
  const path=node("path"),url=node("url");
  let disposed=false,transport:ReturnType<typeof create_clangd_transport>|undefined,environment:clangd_environment|undefined,configuration="",document_uri="",document_text="",document_language="",document_version=0;
  let active:AbortController|undefined,queue:Promise<unknown>=Promise.resolve();
  const diagnostics=new Map<string,{version?:number;items:any[]}>();
  const abort_error=()=>new DOMException("分析已取消","AbortError");
  const close=async()=>{const previous=transport;transport=undefined;configuration="";document_uri="";document_text="";document_language="";diagnostics.clear();await previous?.dispose();};
  const parse=async(options:clangd_symbol_request,signal:AbortSignal):Promise<clangd_symbol_result>=>{
    if(disposed||signal.aborted)throw abort_error();if(!path.isAbsolute(options.file_path))throw new Error("代码大纲需要绝对文件路径。");
    if(options.language!=="c"&&options.language!=="cpp")throw new Error("clangd 仅用于 C/C++ 大纲。");
    if(options.text.length>2*1024*1024)throw new Error("文件超过 2 Mi 字符，暂不解析符号大纲。");
    if(options.fallback_flags&&(!Array.isArray(options.fallback_flags)||options.fallback_flags.some(flag=>typeof flag!=="string"||flag.includes("\0"))))throw new Error("备用编译参数必须为字符串列表。");
    active?.abort();const controller=active=new AbortController();const abort=()=>controller.abort();signal.addEventListener("abort",abort,{once:true});
    const check=()=>{if(disposed||controller.signal.aborted)throw abort_error();};
    const operation=queue.catch(()=>{}).then(async()=>{
      check();const root=options.workspace_root&&path.isAbsolute(options.workspace_root)?options.workspace_root:path.dirname(options.file_path);
      const key=JSON.stringify([root,options.executable||"",options.compile_commands_dir||"",options.fallback_flags||[]]);
      if(key!==configuration||!transport||transport.failure){
        await close();check();environment=await discover_clangd_environment({...options,workspace_root:root},node);check();
        const args=["--background-index=false","--clang-tidy=false","--pch-storage=memory","--log=error","--enable-config=false"];
        if(environment.compile_commands_dir)args.push(`--compile-commands-dir=${environment.compile_commands_dir}`);
        transport=create_clangd_transport(node,environment.executable,args,root,(method,params)=>{
          if(method==="textDocument/publishDiagnostics"&&typeof params?.uri==="string"&&Array.isArray(params.diagnostics))diagnostics.set(params.uri,{version:params.version,items:params.diagnostics});
        });
        try{
          const response=await transport.request("initialize",{processId:node("process").pid,rootUri:url.pathToFileURL(root).href,clientInfo:{name:"TyporaCode",version:"1"},capabilities:{general:{positionEncodings:["utf-16"]},offsetEncoding:["utf-16"],textDocument:{documentSymbol:{hierarchicalDocumentSymbolSupport:true,symbolKind:{valueSet:Array.from({length:26},(_,index)=>index+1)}},publishDiagnostics:{versionSupport:true}}},initializationOptions:{fallbackFlags:options.fallback_flags||[]}},controller.signal);
          const encoding=response?.capabilities?.positionEncoding||response?.offsetEncoding||"utf-16";
          if(encoding!=="utf-16")throw new Error("clangd 未接受 UTF-16 定位协议。");
          if(!response?.capabilities?.documentSymbolProvider)throw new Error("所选 clangd 未提供文档符号分析能力。");
          transport.notify("initialized",{});configuration=key;
        }catch(error){await close();throw error;}
      }
      check();const target=transport!,uri=url.pathToFileURL(options.file_path).href;
      if(document_uri!==uri||document_language!==options.language){
        if(document_uri)target.notify("textDocument/didClose",{textDocument:{uri:document_uri}});
        diagnostics.clear();document_uri=uri;document_language=options.language;document_text=options.text;document_version++;
        target.notify("textDocument/didOpen",{textDocument:{uri,languageId:options.language,version:document_version,text:options.text}});
      }else if(document_text!==options.text){document_text=options.text;document_version++;diagnostics.delete(uri);target.notify("textDocument/didChange",{textDocument:{uri,version:document_version},contentChanges:[{text:options.text}]});}
      const items=await target.request("textDocument/documentSymbol",{textDocument:{uri}},controller.signal);check();
      // 诊断通知可晚于 documentSymbol。只采样明确属于当前版本的结果，空缓存不表示无错误。
      const latest=diagnostics.get(uri),received=Boolean(latest&&latest.version===document_version),valid=received?latest!.items:[];
      return {symbols:clangd_document_symbols(items,options.text),incomplete:false as const,provider:"clangd" as const,executable:environment!.executable,compile_commands_dir:environment!.compile_commands_dir,diagnostics:{received,errors:valid.filter((item:any)=>item.severity===1).length,warnings:valid.filter((item:any)=>item.severity===2).length,messages:valid.filter((item:any)=>item.severity<=2&&typeof item.message==="string").slice(0,5).map((item:any)=>item.message)}};
    });
    queue=operation;try{return await operation;}finally{signal.removeEventListener("abort",abort);}
  };
  return {parse,async dispose(){if(disposed)return;disposed=true;active?.abort();await queue.catch(()=>{});await close();}};
}
