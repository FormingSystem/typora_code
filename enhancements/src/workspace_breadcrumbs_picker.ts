import {workspace_list_selection} from "./workspace_list_selection";
import {workspace_element as el} from "./workspace_widgets";
import {git_icon} from "./git_icons";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {capture_workspace_focus,register_workspace_dismissal,type workspace_focus_snapshot} from "./workspace_focus";

export type breadcrumb_item={id:string;label:string;title?:string;icon?:()=>Element;children?:breadcrumb_item[]|(()=>Promise<breadcrumb_item[]>);expanded?:boolean;select?:()=>void|Promise<unknown>};
/** 文件和符号共用树选择器；业务只提供条目，关闭与焦点交给公共浮层。 */
export function open_breadcrumb_picker(anchor:HTMLElement,items:breadcrumb_item[]|Promise<breadcrumb_item[]>,options:{label:string;selected?:string;focus?:workspace_focus_snapshot;closed?():void;valid?():boolean;error?(message:string):void}){
  const root=el("section","workspace-breadcrumb-picker"),filter_box=el("div","workspace-breadcrumb-filter"),filter=el("input"),tree=el("div","workspace-breadcrumb-tree");
  const selection_model=new workspace_list_selection(tree);root.setAttribute("role","dialog");root.setAttribute("aria-label",options.label);filter.type="search";filter.placeholder="输入以筛选";filter.setAttribute("aria-label",options.label+"筛选");tree.setAttribute("role","tree");tree.setAttribute("aria-label",options.label);tree.tabIndex=0;
  filter_box.append(filter);root.append(filter_box,tree);const focus=options.focus||capture_workspace_focus();document.body.append(root);const interaction=acquire_workspace_interaction(root);
  let closed=false,roots:breadcrumb_item[]=[],flat:{item:breadcrumb_item;depth:number;parent?:string}[]=[],selected=options.selected||"",pending=0;
  const expanded=new Set<string>(),loaded=new Map<string,breadcrumb_item[]>(),loading=new Set<string>();
  const place=()=>{const r=anchor.getBoundingClientRect(),width=Math.min(innerWidth-8,Math.max(240,(innerWidth-8)/4.17));root.style.width=width+"px";root.style.left=Math.max(4,Math.min(r.left,innerWidth-width-4))+"px";const desired=Math.min(300,innerHeight*.7),below=innerHeight-r.bottom-30,above=r.top-8;const down=below>=Math.min(desired,160)||below>=above;root.dataset.direction=down?"down":"up";root.style.maxHeight=Math.max(44,Math.min(desired,down?below:above))+"px";root.style.top=(down?r.bottom+8:Math.max(4,r.top-root.getBoundingClientRect().height-8))+"px";};
  const close=(restore=false)=>{if(closed)return;closed=true;pending++;dismiss.dispose();selection_model.dispose();interaction.remove();window.removeEventListener("resize",resize);document.removeEventListener("scroll",scroll,true);root.remove();anchor.removeAttribute("aria-expanded");if(restore)focus.restore();options.closed?.();};
  const dismiss=register_workspace_dismissal(()=>[root],reason=>close(reason==="escape"),{inside:()=>[root,anchor],window_blur:true});
  const resize=()=>close(false),scroll=(event:Event)=>{if(!(event.target instanceof Node)||!root.contains(event.target))close(false);};window.addEventListener("resize",resize);document.addEventListener("scroll",scroll,true);
  anchor.setAttribute("aria-expanded","true");
  const children=(item:breadcrumb_item)=>loaded.get(item.id)||(Array.isArray(item.children)?item.children:[]);
  const valid=()=>!closed&&anchor.isConnected&&options.valid?.()!==false;
  const visible_selection=()=>{const row=[...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(node=>node.dataset.itemId===selected);if(row){const r=row.getBoundingClientRect(),t=tree.getBoundingClientRect();if(r.top<t.top)tree.scrollTop+=r.top-t.top;else if(r.bottom>t.bottom)tree.scrollTop+=r.bottom-t.bottom;tree.setAttribute("aria-activedescendant",row.id);}};
  const mark=(id:string)=>{selected=id;selection_model.select([id]);visible_selection();};
  const activate=async(item:breadcrumb_item)=>{if(!valid())return close(false);if(!item.select)return toggle(item);close(false);try{await item.select();}catch(error){options.error?.(String(error instanceof Error?error.message:error));}};
  const toggle=async(item:breadcrumb_item)=>{
    if(!item.children||!valid())return;if(expanded.has(item.id)){expanded.delete(item.id);render();return;}expanded.add(item.id);
    if(typeof item.children==="function"&&!loaded.has(item.id)&&!loading.has(item.id)){
      loading.add(item.id);render();try{const result=await item.children();if(!valid())return;loaded.set(item.id,result);}catch(error){if(valid())loaded.set(item.id,[{id:item.id+"/error",label:String(error instanceof Error?error.message:error)}]);}finally{loading.delete(item.id);}
    }if(valid())render();
  };
  const matches=(item:breadcrumb_item,query:string):boolean=>item.label.toLocaleLowerCase().includes(query)||children(item).some(child=>matches(child,query));
  const render=()=>{
    if(!valid())return;const query=filter.value.toLocaleLowerCase();flat=[];tree.replaceChildren();
    const append=(items:breadcrumb_item[],depth:number,parent?:string)=>{for(const item of items){if(query&&!matches(item,query))continue;flat.push({item,depth,parent});const row=el("div","workspace-breadcrumb-item"),arrow=el("span","workspace-breadcrumb-disclosure"),label=el("span","workspace-breadcrumb-label",item.label);row.id="workspace-breadcrumb-item-"+flat.length;row.dataset.itemId=item.id;row.setAttribute("role","treeitem");row.setAttribute("aria-level",String(depth+1));selection_model.bind(row,item.id);row.style.paddingLeft=depth*16+"px";row.title=item.title||item.label;
      if(item.children){const open=!!query||expanded.has(item.id);arrow.append(git_icon(open?"chevron-down":"chevron-right"));row.setAttribute("aria-expanded",String(open));arrow.onclick=event=>{event.stopPropagation();mark(item.id);void toggle(item);};}
      if(item.icon)row.append(arrow,item.icon(),label);else row.append(arrow,label);row.onmousedown=event=>{event.preventDefault();tree.focus({preventScroll:true});};row.onclick=()=>{mark(item.id);void activate(item);};tree.append(row);
      if(item.children&&(query||expanded.has(item.id))){if(loading.has(item.id))tree.append(el("div","workspace-breadcrumb-status","正在读取目录…"));else append(children(item),depth+1,item.id);}
    }};append(roots,0);if(!flat.length)tree.append(el("div","workspace-breadcrumb-status",pending?"正在读取…":"没有匹配的条目。"));if(!flat.some(entry=>entry.item.id===selected))selected=flat[0]?.item.id||"";mark(selected);place();
  };
  root.onkeydown=event=>{
    if(event.isComposing)return;const index=flat.findIndex(entry=>entry.item.id===selected),entry=flat[index];
    if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)&&(event.target!==filter||!["Home","End"].includes(event.key))){event.preventDefault();event.stopPropagation();const next=event.key==="Home"?0:event.key==="End"?flat.length-1:Math.max(0,Math.min(flat.length-1,index+(event.key==="ArrowDown"?1:-1)));if(flat[next])mark(flat[next].item.id);return;}
    if(event.key==="Enter"&&entry){event.preventDefault();event.stopPropagation();void activate(entry.item);}
    if(event.target===tree&&entry&&["ArrowLeft","ArrowRight"].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==="ArrowRight"){if(entry.item.children&&!expanded.has(entry.item.id))void toggle(entry.item);else if(flat[index+1]?.parent===entry.item.id)mark(flat[index+1].item.id);}else if(expanded.has(entry.item.id))void toggle(entry.item);else if(entry.parent)mark(entry.parent);}
    if(event.target===tree&&event.key.length===1&&!event.ctrlKey&&!event.metaKey){event.preventDefault();filter.value+=event.key;filter.focus();render();}
  };
  filter.oninput=render;filter.focus({preventScroll:true});place();pending++;
  Promise.resolve(items).then(value=>{if(!valid())return;pending=0;roots=value;const collect=(nodes:breadcrumb_item[])=>{for(const item of nodes){if(item.expanded)expanded.add(item.id);if(Array.isArray(item.children))collect(item.children);}};collect(roots);render();},error=>{if(!valid())return;pending=0;tree.replaceChildren(el("div","workspace-breadcrumb-status",String(error instanceof Error?error.message:error)));place();});
  tree.append(el("div","workspace-breadcrumb-status","正在读取…"));return{root,close};
}
