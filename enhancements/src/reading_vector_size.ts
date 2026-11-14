import {observe_content_zoom} from './workspace_content_zoom';
export function reading_vector_font(element:Element){const style=getComputedStyle(element);return parseFloat(style.getPropertyValue('--reading-diagram-font-size'))||parseFloat(style.fontSize)||16;}

/** Measure rendered labels, including SVG transforms and Mermaid HTML labels. */
export function readable_svg_width(svg:SVGSVGElement,font:number):number|undefined{
 const sizes:number[]=[];
 for(const node of svg.querySelectorAll('text,foreignObject .nodeLabel,foreignObject .edgeLabel')){
  if(!node.textContent?.trim())continue;
  const element=node as SVGGraphicsElement;
  const matrix=typeof element.getScreenCTM==='function'?element.getScreenCTM():node.closest('foreignObject')?.getScreenCTM();
  const style=getComputedStyle(node),size=parseFloat(style.fontSize)*(matrix?Math.hypot(matrix.c,matrix.d):1);
  if(style.display!=='none'&&style.visibility!=='hidden'&&Number.isFinite(size)&&size>0)sizes.push(size);
 }
 if(!sizes.length)return;
 sizes.sort((a,b)=>a-b);
 const width=svg.getBoundingClientRect().width*font/sizes[Math.floor(sizes.length/2)];
 return Number.isFinite(width)&&width>0?width:undefined;
}

/** Only derived diagram nodes are changed; authored Markdown and host renderer stay owned. */
export function bind_reading_vector_size(root:HTMLElement){
 let frame=0,disposed=false;
 const update=()=>{frame=0;if(disposed)return;const font=reading_vector_font(root);
  for(const svg of root.querySelectorAll<SVGSVGElement>('.md-diagram-panel-preview svg,.lookup-diagram svg,:scope.lookup-diagram > svg')){
   if(svg.ownerSVGElement)continue;const width=readable_svg_width(svg,font);if(!width)continue;
   const value=width.toFixed(3)+'px';if(svg.style.width!==value)svg.style.width=value;
   svg.style.maxWidth='100%';svg.style.height='auto';
  }
 };
 const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(update);};
 const release=observe_content_zoom(schedule);
 const observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});
 const resize=new ResizeObserver(schedule);resize.observe(root);schedule();
 return {update:schedule,dispose(){disposed=true;release();cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();}};
}

/** Decode local vector metadata without executing author code or loading external resources. */
export async function linked_svg_text_width(source:string,signal:AbortSignal):Promise<number|undefined>{
 let text:string;
 if(/^file:/i.test(source)){
  const host=window as any;if(!host.reqnode)return;
  const url=new URL(source);url.search='';url.hash='';
  const fs=host.reqnode('fs'),path=host.reqnode('url').fileURLToPath(url.href);
  if((await fs.promises.stat(path)).size>8_000_000)return;
  text=await fs.promises.readFile(path,'utf8');
 }else if(/^(data:image\/svg\+xml[;,]|blob:)/i.test(source)){
  try{text=await (await fetch(source,{signal})).text();}catch(error){if(signal.aborted)return;throw error;}
 }else return;
 if(signal.aborted||text.length>8_000_000)return;
 const document_svg=new DOMParser().parseFromString(text,'image/svg+xml');
 if(document_svg.querySelector('parsererror')||document_svg.documentElement.localName!=='svg')return;
 if(!document_svg.querySelector('text,foreignObject'))return;
 const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-same-origin');
 frame.style.cssText='position:fixed;left:-100000px;top:0;width:1600px;height:1000px;visibility:hidden;pointer-events:none;border:0';
 return new Promise(resolve=>{
  let done=false;const finish=(value?:number)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);frame.remove();resolve(value);};
  const abort=()=>finish(),timer=setTimeout(abort,3000);signal.addEventListener('abort',abort,{once:true});
  frame.onload=()=>{try{const svg=frame.contentDocument?.querySelector('svg');finish(svg?readable_svg_width(svg,1):undefined);}catch{finish();}};
  frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;"><style>body{margin:0}svg{max-width:none}</style>'+new XMLSerializer().serializeToString(document_svg.documentElement);
  document.body.append(frame);
 });
}
