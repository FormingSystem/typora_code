import {observe_workspace_theme} from './workspace_theme';

type native_diagrams={loadMermaidTheme:()=>void;getCurrentMermaidOptions:()=>Record<string,unknown>|undefined};
const listeners=new Set<()=>void>();
const runtime=()=>window as unknown as {File?:{editor?:{diagrams?:native_diagrams}}};
/** Prioritize reading the actual rendering configuration of Typora. When not yet lazy-loaded, follow the host's night -> dark agreement, and the color is still provided by the built-in Mermaid. */
export function mermaid_theme_options(){
 const configured=runtime().File?.editor?.diagrams?.getCurrentMermaidOptions?.();if(configured)return structuredClone(configured);
 const theme=getComputedStyle(document.body).getPropertyValue('--mermaid-theme').trim().replace(/["']/gu,'');
 return theme==='night'?{theme:'dark',themeVariables:{darkMode:false}}:{theme:['base','default','dark','forest','neutral'].includes(theme)?theme:'default',themeVariables:{}};
}
export function observe_mermaid_theme(listener:()=>void){listeners.add(listener);const unwatch=observe_workspace_theme(listener);return()=>{listeners.delete(listener);unwatch();};}
/** Only forward the notification of the host completing configuration loading, do not initialize or rewrite the central Mermaid instance. */
export function bind_native_mermaid_theme(){
 let owner:native_diagrams|undefined,original:(()=>void)|undefined,wrapper:(()=>void)|undefined,disposed=false;
 const restore=()=>{if(owner&&owner.loadMermaidTheme===wrapper&&original)owner.loadMermaidTheme=original;};
 const reconcile=()=>{if(disposed)return;const next=runtime().File?.editor?.diagrams;if(!next||next===owner)return;
  restore();owner=next;original=next.loadMermaidTheme;const load=original;wrapper=function(){const value=load.call(next);for(const listener of listeners)listener();return value;};next.loadMermaidTheme=wrapper;
 };
 const unwatch=observe_workspace_theme(reconcile);return{reconcile,dispose(){disposed=true;unwatch();restore();}};
}
