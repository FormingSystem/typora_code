/** Reading surfaces, terminals, and color panels share actual background compositing and theme events without relying on theme names. */
export function workspace_surface_background(element:Element):number[]{
  const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d");if(!context)return [255,255,255];
  const chain:Element[]=[];for(let node:Element|null=element;node;node=node.parentElement)chain.unshift(node);
  context.fillStyle="#ffffff";context.fillRect(0,0,1,1);
  for(const node of chain){context.fillStyle=getComputedStyle(node).backgroundColor;context.fillRect(0,0,1,1);}
  return Array.from(context.getImageData(0,0,1,1).data).slice(0,3);
}
const listeners=new Set<()=>void>(),palette_listeners=new Set<()=>void>();let observer:MutationObserver|undefined,frame=0;
/** The host background determines the theme; terminals and icons must not infer it from each other. */
export function workspace_theme_mode():"light"|"dark" {
  const rgb=workspace_surface_background(document.body);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<128?"dark":"light";
}
const scheme=typeof matchMedia==="function"?matchMedia("(prefers-color-scheme: dark)"):undefined;
const geometry_properties=new Set(['--sidebar-width','--typ-editor-top','--typ-editor-left','--typ-editor-width','--typ-editor-height']);
const theme_style=(element:HTMLElement)=>Array.from(element.style).filter(name=>!geometry_properties.has(name)).sort().map(name=>`${name}:${element.style.getPropertyValue(name)}:${element.style.getPropertyPriority(name)}`).join(';');
const update=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;for(const listener of palette_listeners)listener();for(const listener of listeners)listener();});};
export function observe_workspace_theme(listener:()=>void,role:"consumer"|"palette"="consumer"):()=>void{
  const owners=role==="palette"?palette_listeners:listeners;owners.add(listener);
  if(!observer){
    const styles=new Map([document.documentElement,document.body].map(element=>[element,theme_style(element)]));
    observer=new MutationObserver(records=>{
      let changed=false;
      for(const record of records){
        if(record.type==='attributes'&&record.attributeName==='style'&&styles.has(record.target as HTMLElement)){
          const element=record.target as HTMLElement,signature=theme_style(element);
          if(styles.get(element)!==signature){styles.set(element,signature);changed=true;}
        }else changed=true;
      }
      if(changed)update();
    });
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["class","style","data-theme"]});observer.observe(document.body,{attributes:true,attributeFilter:["class","style"]});observer.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["href","media","disabled"]});document.head.addEventListener("load",update,true);window.addEventListener("focus",update);scheme?.addEventListener("change",update);
  }
  update();return ()=>{owners.delete(listener);if(!listeners.size&&!palette_listeners.size){observer?.disconnect();observer=undefined;cancelAnimationFrame(frame);frame=0;document.head.removeEventListener("load",update,true);window.removeEventListener("focus",update);scheme?.removeEventListener("change",update);}};
}
