import {workspace_text} from "./workspace_i18n";
import {set_source_inactive_regions} from "./source_inactive_regions";
import type {language_navigation_kind,language_position,language_location,language_diagnostic} from "./language_locations";
import {read_language_service_profile,observe_language_services} from "./language_service_settings";
import {set_source_semantics} from "./source_semantic_tokens";
import {marked} from "marked";
import {create_source_symbol_service} from "./source_symbol_service";
import {create_language_analysis_service} from "./language_analysis_service";
import {read_source_outline_settings} from "./source_outline_settings";
import type {source_symbol} from "./source_symbols";

export type document_symbols={symbols:source_symbol[];version:number;language:string;loading:boolean;error:string;incomplete:boolean;provider:string;notice:string;diagnostics?:language_diagnostic[];diagnostics_version?:number};
type navigation_query=(kind:language_navigation_kind,position:language_position,signal:AbortSignal)=>Promise<language_location[]>;
type subscription={state:document_symbols;navigate:navigation_query;refresh():void;dispose():void};
const models=new WeakMap<object,Map<string,{state:document_symbols;navigate:navigation_query;listeners:Set<(value:document_symbols)=>void>;refresh():void;dispose():void}>>();

/** Use the Markdown lexical layer; the hash and HTML block in the fence will not become titles. The offset retains the original model CRLF. */
export function markdown_document_symbols(text:string):source_symbol[]{
  const source=text.replace(/\r\n?/g,"\n"),lines=text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)||[],starts=[0];for(const line of lines)starts.push(starts.at(-1)!+line.length);
  const offset=(n:number)=>{const before=source.slice(0,n),line=before.split("\n").length-1;return (starts[line]||0)+n-(before.lastIndexOf("\n")+1);};
  const roots:source_symbol[]=[],stack:{depth:number;symbol:source_symbol}[]=[];let position=0;
  for(const token of marked.lexer(source)){
    if(token.type==="heading"){
      while(stack.length&&stack.at(-1)!.depth>=token.depth)stack.pop()!.symbol.end=offset(position);
      const symbol:source_symbol={name:token.text,kind:"string",detail:"#".repeat(token.depth)+" "+token.text,start:offset(position),end:text.length,selection_start:offset(position),selection_end:offset(position+token.raw.trimEnd().split("\n")[0].length),children:[]};
      (stack.at(-1)?.symbol.children||roots).push(symbol);stack.push({depth:token.depth,symbol});
    }position+=token.raw.length;
  }return roots;
}
export function document_symbol_chain(symbols:source_symbol[],offset:number):source_symbol[]{for(const symbol of [...symbols].reverse())if(symbol.start<=offset&&offset<=symbol.end)return [symbol,...document_symbol_chain(symbol.children,offset)];return [];}

/** Only one request is retained for the same model and parsing environment; the outline and breadcrumbs share version, cancellation, and service life. */
export function subscribe_document_symbols(model:any,file_path:string,workspace_root:string,listener:(state:document_symbols)=>void):subscription{
  let entries=models.get(model);if(!entries)models.set(model,entries=new Map());const key=file_path+"\0"+workspace_root;
  let owner=entries.get(key);
  if(!owner){
    const state:document_symbols={symbols:[],version:-1,language:"",loading:true,error:"",incomplete:false,provider:"",notice:""},listeners=new Set<(s:document_symbols)=>void>();
    let analysis_running=false,semantic_refresh_pending=false,navigation:AbortController|undefined;
    let disposed=false,timer=0,request:AbortController|undefined,worker:ReturnType<typeof create_source_symbol_service>|undefined,clangd:ReturnType<typeof create_language_analysis_service>|undefined;
    const notify=()=>{for(const callback of listeners)callback(state);};
    const parse=async()=>{
      timer=0;if(disposed||model.isDisposed())return;if(navigation){semantic_refresh_pending=true;return;}analysis_running=true;const controller=request=new AbortController(),version=model.getVersionId(),language=model.getLanguageId();
      Object.assign(state,{loading:true,symbols:[],error:"",notice:"",language,version:-1});notify();
      try{
        const profile=read_language_service_profile(workspace_root,language);
        const compiled=language==="c"||language==="cpp",settings=compiled?read_source_outline_settings(workspace_root):undefined;
        const use_lsp=profile.provider==="lsp"||(compiled&&profile.provider==="default");
        if(!use_lsp&&clangd){await clangd.dispose();clangd=undefined;}
        const result=profile.provider==="disabled"?{symbols:[],incomplete:false}:language==="markdown"?{symbols:markdown_document_symbols(model.getValue()),incomplete:false}:use_lsp?await (clangd??=create_language_analysis_service(undefined,semantic_refresh,receive_diagnostics)).parse({file_path,workspace_root,language,text:model.getValue(),server:profile,executable:settings?.clangd_path,compile_commands_dir:settings?.compile_commands_dir,fallback_flags:settings?.fallback_flags,background_index:settings?.background_index},controller.signal):await(worker??=create_source_symbol_service()).parse(language,model.getValue(),controller.signal);
        if(disposed||controller.signal.aborted||model.isDisposed()||version!==model.getVersionId())return;
        set_source_inactive_regions(model,"inactive_regions" in result?result.inactive_regions:[]);
        set_source_semantics(model,"semantic_tokens" in result?result.semantic_tokens:undefined);
        const notice="provider" in result?[result.notice,result.diagnostics.errors?workspace_text("document_symbols_report_item_diagnosis_please_check_the_parsing_settings", {value_0: String(result.provider), value_1: String(result.diagnostics.errors)}):result.provider==="clangd"&&!result.compile_commands_dir?workspace_text("document_symbols_no_compilation_database_found_using_fallback_parameters"):""].filter(Boolean).join(" "):profile.provider==="disabled"?workspace_text("document_symbols_this_language_analysis_has_been_closed"):result.incomplete?workspace_text("document_symbols_syntax_is_not_complete_display_recognizable_symbols"):"";
        Object.assign(state,{symbols:result.symbols,version,loading:false,incomplete:result.incomplete,provider:"provider" in result?result.provider:profile.provider==="disabled"?"disabled":language==="markdown"?"markdown":"tree-sitter",notice});notify();
      }catch(error){if(!disposed&&!controller.signal.aborted){set_source_inactive_regions(model,[]);Object.assign(state,{symbols:[],loading:false,error:String(error instanceof Error?error.message:error),version});notify();}}
      finally{analysis_running=false;if(semantic_refresh_pending){semantic_refresh_pending=false;semantic_refresh();}}
    };
    // Merge refresh after the service completes the engineering/standard library loading; do not interrupt the current response, and do not clear existing colors.
    const semantic_refresh=()=>{if(disposed||model.isDisposed())return;if(analysis_running){semantic_refresh_pending=true;return;}clearTimeout(timer);timer=window.setTimeout(parse,150);};
    const receive_diagnostics=(text:string,items:language_diagnostic[])=>{
      if(disposed||model.isDisposed()||model.getValue()!==text)return;
      state.diagnostics=items;state.diagnostics_version=model.getVersionId();notify();
    };
    const navigate:navigation_query=async(kind,position,signal)=>{
      if(disposed||model.isDisposed()||signal.aborted)throw new DOMException(workspace_text("document_symbols_navigation_has_been_canceled"),"AbortError");
      const language=model.getLanguageId(),profile=read_language_service_profile(workspace_root,language),compiled=language==="c"||language==="cpp";
      if(profile.provider!=="lsp"&&!(compiled&&profile.provider==="default"))throw Error(workspace_text("document_symbols_the_navigation_service_for_this_language_is_not_configured_p"));
      request?.abort();navigation?.abort();clearTimeout(timer);
      const controller=navigation=new AbortController(),version=model.getVersionId(),abort=()=>controller.abort();signal.addEventListener("abort",abort,{once:true});
      const settings=compiled?read_source_outline_settings(workspace_root):undefined;
      try{
        const result=await(clangd??=create_language_analysis_service(undefined,semantic_refresh,receive_diagnostics)).navigate({file_path,workspace_root,language,text:model.getValue(),server:profile,executable:settings?.clangd_path,compile_commands_dir:settings?.compile_commands_dir,fallback_flags:settings?.fallback_flags,background_index:settings?.background_index},kind,position,controller.signal);
        if(disposed||controller.signal.aborted||model.isDisposed()||version!==model.getVersionId())throw new DOMException(workspace_text("document_symbols_navigation_has_been_canceled"),"AbortError");return result;
      }finally{signal.removeEventListener("abort",abort);if(navigation===controller){navigation=undefined;semantic_refresh();}}
    };
    const refresh=()=>{navigation?.abort();request?.abort();state.diagnostics=[];state.diagnostics_version=-1;set_source_semantics(model);set_source_inactive_regions(model,[]);clearTimeout(timer);Object.assign(state,{symbols:[],loading:true,version:-1,error:""});notify();timer=window.setTimeout(parse,150);};
    const settings_release=observe_language_services(refresh);
    const content=model.onDidChangeContent(refresh),language=model.onDidChangeLanguage(refresh);
    owner={state,listeners,navigate,refresh,dispose(){if(disposed)return;disposed=true;navigation?.abort();settings_release();set_source_semantics(model);set_source_inactive_regions(model,[]);clearTimeout(timer);request?.abort();content.dispose();language.dispose();worker?.dispose();void clangd?.dispose();listeners.clear();}};entries.set(key,owner);refresh();
  }
  const target=owner;target.listeners.add(listener);listener(target.state);let released=false;
  return{get state(){return target.state;},navigate:target.navigate,refresh:target.refresh,dispose(){if(released)return;released=true;target.listeners.delete(listener);if(!target.listeners.size){target.dispose();entries!.delete(key);if(!entries!.size)models.delete(model);}}};
}
