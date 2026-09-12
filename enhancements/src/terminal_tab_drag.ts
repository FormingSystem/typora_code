import {create_workspace_lifetime} from "./workspace_lifetime";
const MIME="application/x-typora-code-terminal-tab";

/** 原生DnD只传递本列表当前持有的会话身份；外部拖放不具有移动权限。 */
export function bind_terminal_tab_drag(tabs:HTMLElement,move:(source:string,target:string,after:boolean)=>void,settled:()=>void){
  const lifetime=create_workspace_lifetime();let source="",mark:HTMLElement|undefined,after=false;
  const clear_mark=()=>{mark?.removeAttribute("data-drop-edge");mark=undefined;tabs.classList.remove("is-drop-end");};
  const finish=()=>{clear_mark();if(!source)return;source="";settled();};
  lifetime.listen(tabs,"dragstart",event=>{const drag=event as DragEvent,row=(drag.target as Element).closest<HTMLElement>(".terminal-tab");
    if(!row||(drag.target as Element).closest("button")||!drag.dataTransfer){drag.preventDefault();return;}
    source=row.dataset.session||"";drag.dataTransfer.setData(MIME,source);drag.dataTransfer.effectAllowed="move";
  });
  lifetime.listen(tabs,"dragover",event=>{const drag=event as DragEvent;if(!source||!drag.dataTransfer?.types.includes(MIME))return;drag.preventDefault();drag.dataTransfer.dropEffect="move";clear_mark();
    mark=(drag.target as Element).closest<HTMLElement>(".terminal-tab")||undefined;
    if(mark){const rect=mark.getBoundingClientRect();after=drag.clientY>=rect.top+rect.height/2;mark.dataset.dropEdge=after?"after":"before";}
    else tabs.classList.add("is-drop-end");
    const rect=tabs.getBoundingClientRect();if(drag.clientY<rect.top+22)tabs.scrollTop-=22;else if(drag.clientY>rect.bottom-22)tabs.scrollTop+=22;
  });
  lifetime.listen(tabs,"dragleave",event=>{if(!(event as DragEvent).relatedTarget||!tabs.contains((event as DragEvent).relatedTarget as Node))clear_mark();});
  lifetime.listen(tabs,"drop",event=>{const drag=event as DragEvent;if(!source||drag.dataTransfer?.getData(MIME)!==source)return;drag.preventDefault();const id=source,target=mark?.dataset.session||"",edge=after;source="";clear_mark();move(id,target,edge);settled();});
  lifetime.listen(tabs,"dragend",finish);lifetime.listen(window,"blur",finish);
  lifetime.listen(document,"keydown",event=>{if((event as KeyboardEvent).key==="Escape")finish();},true);lifetime.add(finish);
  return {get active(){return Boolean(source);},dispose:lifetime.dispose};
}
