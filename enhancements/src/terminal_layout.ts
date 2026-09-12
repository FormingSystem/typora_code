import {workspace_element as el} from "./workspace_widgets";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {bind_terminal_sash} from "./terminal_sash";

const LIST_WIDTH_KEY="typora-code:terminal-list-width";
type split_layout={node:HTMLElement;panes:HTMLElement[];weights:Map<string,number>;signature:string;clear:()=>void};
/** 几何状态只引用已存在的会话表面，不拥有进程、正文或xterm实例。 */
export function create_terminal_layout(body:HTMLElement,tabs:HTMLElement,changed:()=>void){
  const lifetime=create_workspace_lifetime(),groups=new Map<string,split_layout>(),sash=el("div","terminal-tabs-sash");
  sash.setAttribute("aria-label","调整终端列表宽度");body.append(sash);
  let width=120,frame=0,direction=1;
  try{const saved=Number(localStorage.getItem(LIST_WIDTH_KEY));if(Number.isFinite(saved)&&saved>=46&&saved<=500)width=saved;}catch{}
  const save=()=>{try{localStorage.setItem(LIST_WIDTH_KEY,String(width));}catch{}};
  const schedule=()=>{if(!frame&&!lifetime.disposed)frame=requestAnimationFrame(layout);};
  const list_width=(value:number)=>value<63?46:Math.max(80,Math.min(500,value));
  lifetime.own(bind_terminal_sash(sash,{read:()=>{direction=body.dataset.tabsLocation==="left"?1:-1;return width*direction;},write:value=>{width=list_width(value*direction);layout();},commit:save,reset:()=>{width=120;layout();}}));
  function layout(){
    frame=0;if(lifetime.disposed)return;
    const available=body.clientWidth,effective=Math.min(width,Math.max(46,available-120));
    tabs.style.width=effective+"px";tabs.dataset.narrow=String(effective<80);sash.hidden=tabs.hidden;
    const bounds=body.getBoundingClientRect(),tab_bounds=tabs.getBoundingClientRect(),left=body.dataset.tabsLocation==="left";
    sash.style.left=((left?tab_bounds.right:tab_bounds.left)-bounds.left-2)+"px";
    sash.setAttribute("aria-valuemin","46");sash.setAttribute("aria-valuemax",String(Math.min(500,Math.max(46,available-120))));sash.setAttribute("aria-valuenow",String(Math.round(effective)));
    for(const group of groups.values()){
      if(group.node.hidden)continue;const total=group.node.clientWidth,count=group.panes.length;if(!count||!total)continue;
      const minimum=Math.min(80,total/count),remaining=new Set(group.panes),sizes=new Map<HTMLElement,number>();let space=total;
      // 小窗先满足每个可见分屏的最小份额，其余空间按身份权重分配。
      while(remaining.size){const weight=[...remaining].reduce((sum,node)=>sum+(group.weights.get(node.dataset.session!)||1),0);
        const limited=[...remaining].filter(node=>space*(group.weights.get(node.dataset.session!)||1)/weight<minimum);
        if(!limited.length){for(const node of remaining)sizes.set(node,space*(group.weights.get(node.dataset.session!)||1)/weight);break;}
        for(const node of limited){sizes.set(node,minimum);space-=minimum;remaining.delete(node);}
      }
      let offset=0;group.panes.forEach((node,index)=>{const size=sizes.get(node)||0;node.style.setProperty("--terminal-pane-width",size+"px");offset+=size;
        const divider=group.node.querySelector<HTMLElement>(`[data-split-index="${index}"]`);if(divider){divider.style.left=(offset-2)+"px";divider.setAttribute("aria-valuenow",String(Math.round(size)));divider.setAttribute("aria-valuemin",String(Math.round(minimum)));divider.setAttribute("aria-valuemax",String(Math.round(total-minimum)));}});
    }
    changed();
  }
  const observer=new ResizeObserver(schedule);observer.observe(body);lifetime.add(()=>observer.disconnect());
  function update(nodes:Map<string,HTMLElement>){
    for(const [id,group]of groups)if(!nodes.has(id)){group.clear();groups.delete(id);}
    for(const [id,node]of nodes){
      const panes=[...node.children].filter(child=>child.matches(".linux-note-terminal")) as HTMLElement[],signature=panes.map(pane=>pane.dataset.session).join("|");
      let group=groups.get(id);
      if(group?.signature===signature)continue;
      group?.clear();const previous=group?.weights||new Map<string,number>(),weights=new Map<string,number>();
      const retained=panes.filter(pane=>previous.has(pane.dataset.session!)),retained_weight=retained.reduce((sum,pane)=>sum+(previous.get(pane.dataset.session!)||0),0);
      for(const pane of panes)weights.set(pane.dataset.session!,previous.has(pane.dataset.session!)?(previous.get(pane.dataset.session!)||0)*retained.length/Math.max(1,panes.length)/Math.max(Number.EPSILON,retained_weight):1/Math.max(1,panes.length));
      const sum=[...weights.values()].reduce((a,b)=>a+b,0)||1;for(const [key,value]of weights)weights.set(key,value/sum);
      const bindings=create_workspace_lifetime();group={node,panes,signature,weights,clear:bindings.dispose};groups.set(id,group);
      for(let index=0;index<panes.length-1;index++){
        const left=panes[index],right=panes[index+1],divider=el("div","terminal-split-sash");divider.dataset.splitIndex=String(index);divider.setAttribute("aria-label",`调整终端分屏 ${index+1}`);node.append(divider);
        let pair_width=0;const current=group;
        bindings.own(bind_terminal_sash(divider,{read:()=>{pair_width=left.getBoundingClientRect().width+right.getBoundingClientRect().width;return left.getBoundingClientRect().width;},write:value=>{
          const minimum=Math.min(80,pair_width/2),size=Math.max(minimum,Math.min(pair_width-minimum,value)),pair_weight=(weights.get(left.dataset.session!)||0)+(weights.get(right.dataset.session!)||0);
          weights.set(left.dataset.session!,pair_weight*size/Math.max(1,pair_width));weights.set(right.dataset.session!,pair_weight*(pair_width-size)/Math.max(1,pair_width));layout();
        },reset:()=>{for(const pane of current.panes)weights.set(pane.dataset.session!,1/current.panes.length);layout();}}));bindings.add(()=>divider.remove());
      }
    }
    layout();
  }
  lifetime.add(()=>{cancelAnimationFrame(frame);for(const group of groups.values())group.clear();groups.clear();sash.remove();});
  return {update,layout:schedule,dispose:lifetime.dispose};
}
