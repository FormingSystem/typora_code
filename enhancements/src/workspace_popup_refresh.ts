/** 展开表面的布局事务：事件按帧合并，自身布局通知不再成为下一轮输入。 */
export function create_workspace_popup_refresh(layout:()=>void){
  let frame=0,disposed=false,running=false;
  const sizes=new Map<Element,{width:number;height:number}>();
  const measure=(node:Element)=>{const box=node.getBoundingClientRect();return {width:box.width,height:box.height};};
  const cancel=()=>{cancelAnimationFrame(frame);frame=0;};
  const refresh=()=>{
    cancel();if(disposed||running)return;
    running=true;
    try{layout();}
    finally{
      // 本事务已读到此前所有DOM状态；只消费本观察器的布局写入，不影响宿主观察器。
      mutation.takeRecords();
      for(const node of sizes.keys())sizes.set(node,measure(node));
      running=false;
    }
  };
  const schedule=()=>{if(!disposed&&!running&&!frame)frame=requestAnimationFrame(refresh);};
  const mutation=new MutationObserver(records=>{
    // 宿主可能反复设置相同class/style；按本批次前后值比较，忽略无变化通知。
    const seen=new Map<Node,Set<string>>();
    for(const record of records){
      if(record.type!=="attributes"){schedule();return;}
      const name=record.attributeName!,names=seen.get(record.target)||new Set<string>();
      if(names.has(name))continue;names.add(name);seen.set(record.target,names);
      if((record.target as Element).getAttribute(name)!==record.oldValue){schedule();return;}
    }
  });
  const resize=new ResizeObserver(entries=>{
    for(const entry of entries){
      const previous=sizes.get(entry.target),next=measure(entry.target);
      if(!previous||previous.width!==next.width||previous.height!==next.height){schedule();return;}
    }
  });
  const reset=()=>{cancel();mutation.disconnect();resize.disconnect();sizes.clear();};
  return {schedule,refresh,cancel,reset,
    observe_mutations(node:Node,options:MutationObserverInit){if(!disposed)mutation.observe(node,{...options,...(options.attributes?{attributeOldValue:true}:{})});},
    observe_size(node:Element){if(!disposed){sizes.set(node,measure(node));resize.observe(node);}},
    dispose(){if(disposed)return;disposed=true;reset();}
  };
}
