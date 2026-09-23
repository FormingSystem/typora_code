/** 阅读区、终端和颜色面板共用实际背景合成与主题事件，不依赖主题名称。 */
export function workspace_surface_background(element:Element):number[]{
  const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d");if(!context)return [255,255,255];
  const chain:Element[]=[];for(let node:Element|null=element;node;node=node.parentElement)chain.unshift(node);
  context.fillStyle="#ffffff";context.fillRect(0,0,1,1);
  for(const node of chain){context.fillStyle=getComputedStyle(node).backgroundColor;context.fillRect(0,0,1,1);}
  return Array.from(context.getImageData(0,0,1,1).data).slice(0,3);
}
const listeners=new Set<()=>void>(),palette_listeners=new Set<()=>void>();let observer:MutationObserver|undefined,frame=0;
/** 主题归属为宿主背景，终端和图标不能互相推导主题。 */
export function workspace_theme_mode():"light"|"dark" {
  const rgb=workspace_surface_background(document.body);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<128?"dark":"light";
}
const scheme=typeof matchMedia==="function"?matchMedia("(prefers-color-scheme: dark)"):undefined;
const update=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;for(const listener of palette_listeners)listener();for(const listener of listeners)listener();});};
export function observe_workspace_theme(listener:()=>void,role:"consumer"|"palette"="consumer"):()=>void{
  const owners=role==="palette"?palette_listeners:listeners;owners.add(listener);
  if(!observer){observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:["class","style","data-theme"]});observer.observe(document.body,{attributes:true,attributeFilter:["class","style"]});observer.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["href","media","disabled"]});document.head.addEventListener("load",update,true);window.addEventListener("focus",update);scheme?.addEventListener("change",update);}
  update();return ()=>{owners.delete(listener);if(!listeners.size&&!palette_listeners.size){observer?.disconnect();observer=undefined;cancelAnimationFrame(frame);frame=0;document.head.removeEventListener("load",update,true);window.removeEventListener("focus",update);scheme?.removeEventListener("change",update);}};
}
