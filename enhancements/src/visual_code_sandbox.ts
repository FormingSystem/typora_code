import {mermaid_theme_options} from './reading_mermaid_theme';

type visual_payload={source:string;theme:Record<string,unknown>;dark:boolean;foreground:string;background:string};
type visual_result={height?:number;svg?:string;error?:string;ready?:boolean;capture?:number};
const assets=new Map<string,Promise<string>>();

/** Only allow-listed bundled assets enter the document; author content never selects a path. */
export async function read_visual_asset(name:string):Promise<string>{
 const known=/^(svg|html|html_live|javascript_live|react|mermaid|graphviz|wavedrom|vega|vega_lite|echarts|plantuml|math|flow|sequence)\.(js|css)$/u;
 if(!known.test(name))throw Error('Unknown visual asset');
 let loading=assets.get(name);if(loading)return loading;
 const host=window as any;
 loading=(async()=>{
  if(!host.reqnode||!host._options?.userDataPath)throw Error('Local visual assets unavailable');
  const path=host.reqnode('path'),fs=host.reqnode('fs');
  return fs.promises.readFile(path.join(host._options.userDataPath,'typora_code','assets','visual',name),'utf8');
 })();
 assets.set(name,loading);loading.catch(()=>assets.delete(name));
 if(assets.size>4)assets.delete(assets.keys().next().value!);
 return loading;
}

function visual_document(script:string,css:string,payload:visual_payload,token:string):string{
 const encoded=JSON.stringify(payload).replace(/</gu,'\\u003c');
 const bootstrap=`(()=>{const token=${JSON.stringify(token)};const send=value=>parent.postMessage({visual_code:token,...value},'*');const root=document.getElementById('root');const snapshot=()=>root.querySelector('svg')?new XMLSerializer().serializeToString(root.querySelector('svg')):undefined;addEventListener('message',event=>{if(event.source===parent&&event.data?.visual_code===token&&event.data.capture)send({capture:event.data.capture,svg:snapshot()});});let last=0;const measure=()=>{const height=Math.min(8192,Math.max(64,Math.ceil(root.getBoundingClientRect().height)));if(height!==last){last=height;send({height});}};addEventListener('error',event=>send({error:event.message}));addEventListener('unhandledrejection',event=>send({error:String(event.reason)}));new ResizeObserver(measure).observe(root);Promise.resolve().then(()=>globalThis.render_visual(${encoded},root)).then(()=>{measure();send({ready:true,svg:snapshot()});}).catch(error=>send({error:String(error.message||error)}));})();`;
 return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;padding:0;background:transparent;color:${payload.foreground};font:14px system-ui}#root{box-sizing:border-box;padding:8px;min-height:64px;overflow:auto}svg{max-width:100%;height:auto}img{max-width:100%}${css}</style><div id="root"></div><script>${script.replace(/<\/script/giu,'<\\/script')}</script><script>${bootstrap}</script>`;
}

/** Opaque origin and allow-scripts alone prevent host DOM/Node/storage access. */
export function create_visual_sandbox(container:HTMLElement,format:string,source:string,on_result:(value:visual_result)=>void){
 const frame=document.createElement('iframe');frame.className='visual-code-frame';frame.title=format;
 frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');
 frame.setAttribute('allow','camera \'none\'; microphone \'none\'; geolocation \'none\'; clipboard-read \'none\'; clipboard-write \'none\'');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');let disposed=false,timer=0,serial=0;const captures=new Map<number,(svg:string|undefined)=>void>();
 const receive=(event:MessageEvent)=>{
  if(disposed||event.source!==frame.contentWindow||event.data?.visual_code!==token)return;
  const value=event.data as visual_result;
  if(value.capture){const resolve=captures.get(value.capture);captures.delete(value.capture);resolve?.(typeof value.svg==='string'&&value.svg.length<8_000_000?value.svg:undefined);return;}
  if(value.ready||value.error)clearTimeout(timer);
  if(typeof value.height==='number'&&Number.isFinite(value.height))frame.style.height=`${Math.max(64,Math.min(8192,value.height))}px`;
  on_result({ready:value.ready===true,svg:typeof value.svg==='string'&&value.svg.length<8_000_000?value.svg:undefined,error:typeof value.error==='string'?value.error.slice(0,1000):undefined});
 };
 window.addEventListener('message',receive);container.append(frame);
 const style=getComputedStyle(container),theme=mermaid_theme_options();
 void Promise.all([read_visual_asset(format+'.js'),format==='math'?read_visual_asset('math.css'):Promise.resolve('')]).then(([script,css])=>{
  if(disposed)return;
  timer=window.setTimeout(()=>{if(!disposed){frame.remove();on_result({error:'Rendering timed out'});}},30000);
  frame.srcdoc=visual_document(script,css,{source,theme,dark:theme.theme==='dark',foreground:style.color,background:style.backgroundColor},token);
 }).catch(error=>{if(!disposed)on_result({error:String(error.message||error)});});
 return {frame,capture():Promise<string|undefined>{if(disposed)return Promise.resolve(undefined);const id=++serial;return new Promise(resolve=>{const timeout=setTimeout(()=>{captures.delete(id);resolve(undefined);},2000);captures.set(id,value=>{clearTimeout(timeout);resolve(value);});frame.contentWindow?.postMessage({visual_code:token,capture:id},'*');});},dispose(){if(disposed)return;disposed=true;for(const resolve of captures.values())resolve(undefined);captures.clear();clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();}};
}
