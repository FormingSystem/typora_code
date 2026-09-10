export const WORKSPACE_STYLESHEET_ID = "typora-code-workspace-styles";
export type workspace_style_handle = {remove():void};
const owned = new Map<string,{node:HTMLStyleElement;users:number}>();
export function workspace_styles_preloaded(): boolean {
  const link=document.getElementById(WORKSPACE_STYLESHEET_ID);
  return link instanceof HTMLLinkElement && link.rel === "stylesheet" && !link.disabled;
}
/** 产品head拥有静态CSS；模块绑定只登记。独立模块测试可提供未被正式构建剥离的CSS。 */
export function acquire_workspace_style(id:string,css:string,attributes:Record<string,string>={},owner?:HTMLElement):workspace_style_handle {
  if(workspace_styles_preloaded()) {
    const link=document.getElementById(WORKSPACE_STYLESHEET_ID) as HTMLLinkElement;
    if(!link.sheet)throw new Error("Typora Code workspace stylesheet is not loaded.");
    return {remove(){}};
  }
  if(!css.trim())throw new Error("Typora Code workspace stylesheet is missing: "+id);
  let entry=owned.get(id);
  if(!entry){const node=document.createElement("style");node.id=id;node.dataset.typoraCodeWorkspaceStyle=id;for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);node.textContent=css;document.head.append(node);entry={node,users:0};owned.set(id,entry);}
  entry.users++;let removed=false;let observer:MutationObserver|undefined;
  const handle={remove(){if(removed)return;removed=true;observer?.disconnect();if(--entry!.users===0){entry!.node.remove();owned.delete(id);}}};
  if(owner){observer=new MutationObserver(()=>{if(!owner.isConnected)handle.remove();});observer.observe(document.documentElement,{childList:true,subtree:true});}
  return handle;
}
