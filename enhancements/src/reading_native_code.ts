/** Static tokenization through the same CodeMirror mode used by native fences. */
type native_stream = {pos:number;start:number;string:string;eol():boolean;current():string};
type native_mode = {token(stream:native_stream,state:unknown):string|null;blankLine?(state:unknown):void};
type native_code_api = {
  modes:Record<string,unknown>;
  getMode(options:{tabSize:number;indentUnit:number},spec:unknown):native_mode;
  startState(mode:native_mode):unknown;
  StringStream:new(text:string,tab_size:number)=>native_stream;
};
type native_code_host = {CodeMirror?:native_code_api;getCodeMirrorMode?:(language:string)=>unknown;File?:{isNode?:boolean;option?:{codeIndentSize?:number}};debugMode?:boolean};
let mode_loading:Promise<void>|undefined;

async function load_native_modes(host:native_code_host,doc:Document):Promise<void>{
  if(['shell','stex','javascript'].every(name=>host.CodeMirror!.modes[name]))return;
  // Typora 1.14.10 loads this registry from fences.lazyload. Do not call that
  // entry point: it also refreshes every native fence in the current document.
  if(!mode_loading)mode_loading=new Promise<void>((resolve,reject)=>{
    const script=doc.createElement('script');
    const finish=(error?:Error)=>{clearTimeout(timeout);script.onload=script.onerror=null;script.remove();error?reject(error):resolve();};
    const timeout=setTimeout(()=>finish(new Error('Native code modes timed out')),10000);
    script.onload=()=>finish();script.onerror=()=>finish(new Error('Native code modes unavailable'));
    script.src=new URL(`${host.File?.isNode&&!host.debugMode?'./lib.asar':'./lib'}/codemirror/mode.min.js`,doc.baseURI).href;
    doc.head.append(script);
  }).catch(error=>{mode_loading=undefined;throw error;});
  await mode_loading;
}

/** Return undefined only when the host port is absent; unknown languages stay plain. */
export async function native_code_fragment(text:string,language:string,doc:Document=document):Promise<DocumentFragment|undefined>{
  const host=doc.defaultView as unknown as native_code_host|null,api=host?.CodeMirror;
  if(!api?.getMode||!api.startState||!api.StringStream||!host?.getCodeMirrorMode)return undefined;
  await load_native_modes(host,doc);
  const tab_size=host.File?.option?.codeIndentSize||4;
  const mode=api.getMode({tabSize:tab_size,indentUnit:tab_size},host.getCodeMirrorMode(language));
  const state=api.startState(mode),fragment=doc.createDocumentFragment();
  text.split('\n').forEach((line,index)=>{
    if(index)fragment.append(doc.createTextNode('\n'));
    if(!line){mode.blankLine?.(state);return;}
    const stream=new api.StringStream(line,tab_size);
    while(!stream.eol()){
      const style=mode.token(stream,state);
      // A malformed third-party mode must never trap the renderer in a loop.
      if(stream.pos<=stream.start)stream.pos=stream.start+1;
      const value=stream.current();
      if(style){const span=doc.createElement('span');span.className=style.split(/\s+/u).filter(Boolean).map(role=>'cm-'+role).join(' ');span.textContent=value;fragment.append(span);}
      else fragment.append(doc.createTextNode(value));
      stream.start=stream.pos;
    }
  });
  return fragment;
}
