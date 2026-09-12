/** 阅读区、终端和颜色面板共用实际背景合成与主题事件，不依赖主题名称。 */
export function workspace_surface_background(element:Element):number[]{
  const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d");if(!context)return [255,255,255];
  const chain:Element[]=[];for(let node:Element|null=element;node;node=node.parentElement)chain.unshift(node);
  context.fillStyle="#ffffff";context.fillRect(0,0,1,1);
  for(const node of chain){context.fillStyle=getComputedStyle(node).backgroundColor;context.fillRect(0,0,1,1);}
  return Array.from(context.getImageData(0,0,1,1).data).slice(0,3);
}
const listeners=new Set<()=>void>();let observer:MutationObserver|undefined,frame=0;
const scheme=typeof matchMedia==="function"?matchMedia("(prefers-color-scheme: dark)"):undefined;
const update=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;for(const listener of listeners)listener();});};
export function observe_workspace_theme(listener:()=>void):()=>void{
  listeners.add(listener);
  if(!observer){observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:["class","style","data-theme"]});observer.observe(document.body,{attributes:true,attributeFilter:["class","style"]});observer.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["href","media","disabled"]});document.head.addEventListener("load",update,true);window.addEventListener("focus",update);scheme?.addEventListener("change",update);}
  update();return ()=>{listeners.delete(listener);if(!listeners.size){observer?.disconnect();observer=undefined;cancelAnimationFrame(frame);frame=0;document.head.removeEventListener("load",update,true);window.removeEventListener("focus",update);scheme?.removeEventListener("change",update);}};
}
