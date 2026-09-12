import {create_workspace_lifetime} from "./workspace_lifetime";

/** 拖动只有正常松开才提交；取消和所有者释放还原开始值。尺寸边界归布局所有者。 */
export function bind_terminal_sash(node:HTMLElement,options:{read:()=>number;write:(value:number)=>void;commit?:()=>void;reset:()=>void}){
  const lifetime=create_workspace_lifetime();let drag:{id:number;x:number;value:number}|undefined;
  node.tabIndex=0;node.setAttribute("role","separator");node.setAttribute("aria-orientation","vertical");
  const finish=(accept:boolean)=>{const previous=drag;if(!previous)return;drag=undefined;node.classList.remove("is-dragging");
    if(!accept)options.write(previous.value);else options.commit?.();
    if(node.hasPointerCapture(previous.id))node.releasePointerCapture(previous.id);
  };
  node.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();drag={id:event.pointerId,x:event.clientX,value:options.read()};node.classList.add("is-dragging");node.setPointerCapture(event.pointerId);};
  node.onpointermove=event=>{if(drag?.id===event.pointerId)options.write(drag.value+event.clientX-drag.x);};
  node.onpointerup=event=>{if(drag?.id===event.pointerId)finish(true);};
  node.onpointercancel=()=>finish(false);node.onlostpointercapture=()=>finish(false);
  node.ondblclick=event=>{event.preventDefault();finish(false);options.reset();options.commit?.();};
  node.onkeydown=event=>{if(!["ArrowLeft","ArrowRight","Home"].includes(event.key))return;event.preventDefault();event.stopPropagation();finish(false);
    if(event.key==="Home")options.reset();else options.write(options.read()+(event.key==="ArrowRight"?10:-10));options.commit?.();};
  lifetime.listen(document,"keydown",event=>{if((event as KeyboardEvent).key==="Escape"&&drag){event.preventDefault();event.stopPropagation();finish(false);}},true);
  lifetime.listen(window,"blur",()=>finish(false));lifetime.add(()=>finish(false));
  lifetime.add(()=>{node.onpointerdown=node.onpointermove=node.onpointerup=node.onpointercancel=node.onlostpointercapture=node.onkeydown=node.ondblclick=null;});
  return lifetime;
}
