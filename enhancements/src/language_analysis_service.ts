import {workspace_text} from "./workspace_i18n";
import {language_locations,valid_language_range,type language_navigation_kind,type language_position,type language_location,type language_diagnostic,type language_range} from "./language_locations";
import type {language_service_profile} from "./language_service_settings";
import type {semantic_tokens} from "./source_semantic_tokens";
import {SEMANTIC_TYPES,SEMANTIC_MODIFIERS} from "./source_semantic_tokens";
import type {source_symbol} from "./source_symbols";
import {create_language_server_transport} from "./language_server_transport";

export type clangd_options={executable?:string;workspace_root?:string;compile_commands_dir?:string;fallback_flags?:string[];background_index?:boolean};
export type language_analysis_request=clangd_options&{file_path:string;language:string;text:string;server?:language_service_profile};
export type clangd_environment={executable:string;compile_commands_dir:string;candidates:string[];compile_commands_candidates:string[]};
export type language_analysis_result={symbols:source_symbol[];incomplete:false;provider:string;semantic_tokens?:semantic_tokens;inactive_regions?:language_range[];notice:string;executable:string;compile_commands_dir:string;diagnostics:{received:boolean;errors:number;warnings:number;messages:string[]}};
const host_node=(name:string)=>(window as unknown as {reqnode:(name:string)=>any}).reqnode(name);

/** Bounded search PATH, LLVM standard installation directory and current workspace build directory, no disk scanning or compiler execution. */
export async function discover_clangd_environment(options:clangd_options={},node=host_node):Promise<clangd_environment>{
  const fs=node("fs").promises,path=node("path"),process=node("process"),env=process.env,is_windows=process.platform==="win32";
  const name=is_windows?"clangd.exe":"clangd",candidates:string[]=[],seen=new Set<string>();
  const regular=async(file:string)=>{try{return (await fs.stat(file)).isFile();}catch{return false;}};
  const add=(file:string)=>{if(!file)return;const resolved=path.resolve(file),key=is_windows?resolved.toLowerCase():resolved;if(!seen.has(key)){seen.add(key);candidates.push(resolved);}};
  const path_dirs=String(env.PATH||env.Path||"").split(path.delimiter).filter(Boolean).map((item:string)=>item.replace(/^"|"$/g,""));
  if(options.executable?.trim()){
    const value=options.executable.trim();
    if(path.isAbsolute(value))add(value);else if(!/[\\/]/.test(value))for(const directory of path_dirs)add(path.join(directory,is_windows&&!path.extname(value)?value+".exe":value));
    else throw new Error(workspace_text("language_analysis_service_clangd_path_must_be_an_absolute_path_or_path_command_name"));
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
  if(!available.length)throw new Error(options.executable?workspace_text("language_analysis_service_the_specified_clangd_does_not_exist_please_select_clangd_exe"):workspace_text("language_analysis_service_could_not_find_clangd_please_select_clangd_in_the_outline_pa"));
  const compile_commands_candidates:string[]=[];
  const database=async(directory:string)=>{if(await regular(path.join(directory,"compile_commands.json"))||await regular(path.join(directory,"compile_flags.txt")))compile_commands_candidates.push(directory);};
  const root=options.workspace_root&&path.isAbsolute(options.workspace_root)?path.resolve(options.workspace_root):"";
  if(options.compile_commands_dir?.trim()){
    const value=options.compile_commands_dir.trim();if(!path.isAbsolute(value)&&!root)throw new Error(workspace_text("language_analysis_service_the_relative_compile_database_directory_requires_an_open_wor"));
    const directory=path.resolve(root||"",value);await database(directory);if(!compile_commands_candidates.length)throw new Error(workspace_text("language_analysis_service_the_selected_directory_does_not_contain_compile_commands_jso"));
  }else if(root){
    await database(root);const build_dir=path.join(root,"build");await database(build_dir);
    try{const directories=(await fs.readdir(build_dir,{withFileTypes:true})).filter((entry:any)=>entry.isDirectory()).sort((a:any,b:any)=>a.name.localeCompare(b.name));for(const entry of directories)await database(path.join(build_dir,entry.name));}catch{}
  }
  return {executable:available[0],compile_commands_dir:compile_commands_candidates[0]||"",candidates:available,compile_commands_candidates};
}

/** Explicit programs or system PATH discovery; Windows only executes exe, without cmd interpreting script parameters. */
export async function discover_language_server(command:string,node=host_node):Promise<string>{
 const path=node("path"),process=node("process"),fs=node("fs").promises;
 if(typeof command!=="string"||!command.trim()||/[\r\n\0]/.test(command))throw Error(workspace_text("language_analysis_service_the_language_service_command_must_be_a_valid_program_name_or"));
 const value=command.trim(),windows=process.platform==="win32";
 if(!path.isAbsolute(value)&&/[\\/]/.test(value))throw Error(workspace_text("language_analysis_service_the_language_service_must_use_an_absolute_path_or_system_pat"));
 const name=windows&&!path.extname(value)?value+".exe":value;
 const paths=path.isAbsolute(name)?[name]:String(process.env.PATH||process.env.Path||"").split(path.delimiter).filter(Boolean).map((dir:string)=>path.join(dir.replace(/^"|"$/g,""),name));
 for(const candidate of paths){if(windows&&path.extname(candidate).toLowerCase()!==".exe")continue;try{if((await fs.stat(candidate)).isFile()){if(!windows)await fs.access(candidate,node("fs").constants.X_OK);return candidate;}}catch{}}
 throw Error(workspace_text("language_analysis_service_the_language_service_program_could_not_be_found_please_insta"));
}

/** The LSP rows and columns are converted into Monaco character offsets according to UTF-16, keeping the symbol type and selection range given by the analyzer. */
export function language_document_symbols(items:any,text:string):source_symbol[]{
  const starts=[0];for(let index=0;index<text.length;index++)if(text.charCodeAt(index)===10)starts.push(index+1);
  const offset=(position:any)=>{const line=position?.line,character=position?.character;if(!Number.isInteger(line)||!Number.isInteger(character)||line<0||character<0||line>=starts.length)return undefined;const start=starts[line],end=line+1<starts.length?starts[line+1]-1:text.length;return Math.min(start+character,end);};
  const kinds:Record<number,string>={1:"file",2:"namespace",3:"namespace",4:"namespace",5:"class",6:"method",7:"property",8:"field",9:"method",10:"enum",11:"interface",12:"function",13:"variable",14:"constant",15:"string",16:"number",17:"boolean",18:"array",19:"object",20:"property",21:"namespace",22:"enum-member",23:"struct",24:"event",25:"operator",26:"type-parameter"};
  const map=(values:any[],depth=0,parent_kind=0):source_symbol[]=>{return values.flatMap(item=>{
    if(typeof item?.name!=="string")return [];
    const range=item.range||item.location?.range,selection=item.selectionRange||range;
    const start=offset(range?.start),end=offset(range?.end),selection_start=offset(selection?.start),selection_end=offset(selection?.end);
    if(start===undefined||end===undefined||selection_start===undefined||selection_end===undefined||start>end||selection_start>selection_end)return [];
    // The clangd 18 returns struct as Class, with semantic detail; based on this, the display category is restored, no longer parsing source code.
    return [{name:item.name,kind:item.kind===5&&item.detail==="struct"?"struct":item.kind===10&&parent_kind===10?"enum-member":kinds[item.kind]||"variable",detail:typeof item.detail==="string"?item.detail:"",start,end,selection_start,selection_end,children:Array.isArray(item.children)?map(item.children,depth+1,item.kind):[]}];
  });};
  return Array.isArray(items)?map(items):[];
}

export function create_language_analysis_service(node=host_node,on_semantic_refresh:()=>void=()=>{},on_diagnostics:(text:string,items:language_diagnostic[])=>void=()=>{}){
  const path=node("path"),url=node("url");
  let disposed=false,transport:ReturnType<typeof create_language_server_transport>|undefined,environment:clangd_environment|undefined,configuration="",document_uri="",document_text="",document_language="",document_version=0;
  let capabilities:any;
  let active:AbortController|undefined,queue:Promise<unknown>=Promise.resolve();
  const inactive_regions=new Map<string,language_range[]>();
  const diagnostics=new Map<string,{version?:number;items:any[]}>();
  const abort_error=()=>new DOMException(workspace_text("language_analysis_service_analysis_has_been_canceled"),"AbortError");
  const close=async()=>{const previous=transport;transport=undefined;configuration="";document_uri="";document_text="";document_language="";diagnostics.clear();inactive_regions.clear();await previous?.dispose();};
  const run=async(options:language_analysis_request,signal:AbortSignal,navigation?:{kind:language_navigation_kind;position:language_position;fallback:boolean}):Promise<language_analysis_result|language_location[]>=>{
    if(disposed||signal.aborted)throw abort_error();if(!path.isAbsolute(options.file_path))throw new Error(workspace_text("language_analysis_service_the_code_outline_requires_an_absolute_file_path"));
    const generic=options.server?.provider==="lsp";
    if(!generic&&options.language!=="c"&&options.language!=="cpp")throw new Error(workspace_text("language_analysis_service_please_configure_lsp_service_for_this_language"));
    if(options.fallback_flags&&(!Array.isArray(options.fallback_flags)||options.fallback_flags.some(flag=>typeof flag!=="string"||flag.includes("\0"))))throw new Error(workspace_text("language_analysis_service_the_backup_compile_parameters_must_be_a_string_list"));
    active?.abort();const controller=active=new AbortController();const abort=()=>controller.abort();signal.addEventListener("abort",abort,{once:true});
    const check=()=>{if(disposed||controller.signal.aborted)throw abort_error();};
    const operation=queue.catch(()=>{}).then(async()=>{
      check();const root=options.workspace_root&&path.isAbsolute(options.workspace_root)?options.workspace_root:path.dirname(options.file_path);
      const key=JSON.stringify([root,options.executable||"",options.compile_commands_dir||"",options.fallback_flags||[],options.background_index===true,options.server]);
      if(key!==configuration||!transport||transport.failure){
        await close();check();environment=generic?{executable:await discover_language_server(options.server!.command!,node),compile_commands_dir:"",candidates:[],compile_commands_candidates:[]}:await discover_clangd_environment({...options,workspace_root:root},node);check();
        const args=generic?[...(options.server!.args||[])]:[`--background-index=${options.background_index===true}`,"--clang-tidy=false","--pch-storage=memory","--log=error","--enable-config=false"];
        if(environment.compile_commands_dir)args.push(`--compile-commands-dir=${environment.compile_commands_dir}`);
        let current_transport:ReturnType<typeof create_language_server_transport>;
        transport=current_transport=create_language_server_transport(node,environment.executable,args,root,(method,params)=>{
          if(disposed||transport!==current_transport)return;
          if(method==="textDocument/inactiveRegions"&&params?.textDocument?.uri===document_uri&&Array.isArray(params.regions)){
            const version=params.textDocument.version;
            if(version==null||version===document_version)inactive_regions.set(document_uri,params.regions.filter(valid_language_range));
          }
          if(method==="textDocument/publishDiagnostics"&&typeof params?.uri==="string"&&Array.isArray(params.diagnostics)){
            diagnostics.set(params.uri,{version:params.version,items:params.diagnostics});
            if(!disposed&&params.uri===document_uri&&params.version===document_version)on_diagnostics(document_text,params.diagnostics.filter((item:any)=>valid_language_range(item?.range)&&typeof item.message==="string").map((item:any)=>({range:item.range,message:item.message,severity:item.severity||1,source:item.source})));
          }
        },(method,params)=>{
          if(method==="workspace/configuration")return (params?.items||[]).map((item:any)=>{let value:any=options.server?.settings||{};for(const part of String(item.section||"").split(".").filter(Boolean))value=value?.[part];return value??null;});
          if(method==="workspace/workspaceFolders")return [{uri:url.pathToFileURL(root).href,name:path.basename(root)}];
          if(method==="workspace/semanticTokens/refresh"){if(!disposed)on_semantic_refresh();return null;}
          if(method==="window/workDoneProgress/create")return null;
          return undefined;
        });
        try{
          const response=await transport.request("initialize",{processId:node("process").pid,rootUri:url.pathToFileURL(root).href,clientInfo:{name:"TyporaCode",version:"1"},workspaceFolders:[{uri:url.pathToFileURL(root).href,name:path.basename(root)}],capabilities:{workspace:{configuration:true,workspaceFolders:true,semanticTokens:{refreshSupport:true}},general:{positionEncodings:["utf-16"]},offsetEncoding:["utf-16"],textDocument:{inactiveRegionsCapabilities:{inactiveRegions:true},definition:{linkSupport:true},declaration:{linkSupport:true},implementation:{linkSupport:true},references:{},semanticTokens:{requests:{full:true},tokenTypes:SEMANTIC_TYPES,tokenModifiers:SEMANTIC_MODIFIERS,formats:["relative"],overlappingTokenSupport:false,multilineTokenSupport:false},documentSymbol:{hierarchicalDocumentSymbolSupport:true,symbolKind:{valueSet:Array.from({length:26},(_,index)=>index+1)}},publishDiagnostics:{versionSupport:true}}},initializationOptions:generic?options.server?.initialization_options||{}:{fallbackFlags:options.fallback_flags||[]}},controller.signal);
          const encoding=response?.capabilities?.positionEncoding||response?.offsetEncoding||"utf-16";
          if(encoding!=="utf-16")throw new Error(workspace_text("language_analysis_service_clangd_does_not_accept_utf_16_location_protocol"));
          capabilities=response?.capabilities||{};
          if(!capabilities.documentSymbolProvider&&!capabilities.semanticTokensProvider?.full&&!capabilities.definitionProvider&&!capabilities.declarationProvider)throw new Error(workspace_text("language_analysis_service_the_selected_language_service_does_not_provide_document_symb"));
          transport.notify("initialized",{});if(generic)transport.notify("workspace/didChangeConfiguration",{settings:options.server?.settings||{}});configuration=key;
        }catch(error){await close();throw error;}
      }
      check();const target=transport!,uri=url.pathToFileURL(options.file_path).href;
      if(document_uri!==uri||document_language!==options.language){
        if(document_uri)target.notify("textDocument/didClose",{textDocument:{uri:document_uri}});
        diagnostics.clear();inactive_regions.clear();document_uri=uri;document_language=options.language;document_text=options.text;document_version++;
        target.notify("textDocument/didOpen",{textDocument:{uri,languageId:options.language,version:document_version,text:options.text}});
      }else if(document_text!==options.text){document_text=options.text;document_version++;diagnostics.delete(uri);inactive_regions.delete(uri);target.notify("textDocument/didChange",{textDocument:{uri,version:document_version},contentChanges:[{text:options.text}]});}
      if(navigation){
        const query=async(kind:language_navigation_kind)=>{
          if(!capabilities[kind+"Provider"])return undefined;
          const result=await target.request("textDocument/"+kind,{textDocument:{uri},position:navigation.position,...(kind==="references"?{context:{includeDeclaration:true}}:{})},controller.signal);check();return language_locations(result,node);
        };
        let result=await query(navigation.kind);
        if(navigation.kind==="definition"&&navigation.fallback&&!result?.length)result=await query("declaration")??result;
        if(!result)throw Error(workspace_text("language_analysis_service_the_current_language_service_does_not_support_this_navigatio"));
        return result;
      }
      const items=capabilities.documentSymbolProvider?await target.request("textDocument/documentSymbol",{textDocument:{uri}},controller.signal):[];check();
      let semantic_tokens:semantic_tokens|undefined,notice=capabilities.documentSymbolProvider?"":workspace_text("language_analysis_service_the_service_does_not_provide_document_symbols");
      const semantic=capabilities.semanticTokensProvider;
      if(semantic?.full&&Array.isArray(semantic.legend?.tokenTypes)){
        try{const result=await target.request("textDocument/semanticTokens/full",{textDocument:{uri}},controller.signal);check();if(Array.isArray(result?.data))semantic_tokens={data:result.data,token_types:semantic.legend.tokenTypes,token_modifiers:semantic.legend.tokenModifiers||[]};}
        catch(error){check();notice+=workspace_text("language_analysis_service_semantic_coloring_is_not_available_keep_basic_coloring")+String((error as Error).message||error);}
      }else notice+=workspace_text("language_analysis_service_the_service_does_not_provide_complete_semantic_coloring_keep");
      // Diagnostic notifications can be later than documentSymbol. Only sample results explicitly belonging to the current version, empty cache does not indicate no errors.
      const latest=diagnostics.get(uri),received=Boolean(latest&&latest.version===document_version),valid=received?latest!.items:[];
      // The clangd18 notification has no version; only submit snapshot after the documentSymbol/semantic requested AST barrier.
      return {inactive_regions:inactive_regions.get(uri),symbols:language_document_symbols(items,options.text),incomplete:false as const,provider:generic?"lsp":"clangd",semantic_tokens,notice,executable:environment!.executable,compile_commands_dir:environment!.compile_commands_dir,diagnostics:{received,errors:valid.filter((item:any)=>item.severity===1).length,warnings:valid.filter((item:any)=>item.severity===2).length,messages:valid.filter((item:any)=>item.severity<=2&&typeof item.message==="string").slice(0,5).map((item:any)=>item.message)}};
    });
    queue=operation;try{return await operation;}finally{signal.removeEventListener("abort",abort);}
  };
  return {parse:(options:language_analysis_request,signal:AbortSignal)=>run(options,signal) as Promise<language_analysis_result>,
    navigate:(options:language_analysis_request,kind:language_navigation_kind,position:language_position,signal:AbortSignal,fallback=true)=>run(options,signal,{kind,position,fallback}) as Promise<language_location[]>,
    async dispose(){if(disposed)return;disposed=true;active?.abort();await queue.catch(()=>{});await close();}};
}
