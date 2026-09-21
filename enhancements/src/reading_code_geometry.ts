/** 原生围栏的布局测量归各自CodeMirror；离屏延后、可见时合并刷新。 */
type fence_editor = {refresh():void};
type fence_measurement = {wrapper:HTMLElement;editor:fence_editor;visible:boolean;width:number;pending:boolean};
export function bind_reading_code_geometry() {
  const entries=new Map<HTMLElement,fence_measurement>();
  const wrappers=new Map<Element,HTMLElement>();
  const queued=new Set<HTMLElement>();let frame=0,disposed=false;
  const enqueue=(fence:HTMLElement)=>{
    const entry=entries.get(fence);if(!entry||disposed)return;entry.pending=true;
    if(!entry.visible)return;
    queued.add(fence);
    if(!frame)frame=requestAnimationFrame(()=>{
      frame=0;const batch=[...queued];queued.clear();
      for(const current of batch){const item=entries.get(current);
        if(disposed||!item?.pending||!item.visible||!current.isConnected||!item.wrapper.getBoundingClientRect().width)continue;
        if((item.wrapper as HTMLElement&{CodeMirror?:fence_editor}).CodeMirror!==item.editor)continue;
        item.pending=false;item.editor.refresh();
      }
    });
  };
  const intersection=new IntersectionObserver(records=>{
    for(const record of records){const fence=record.target as HTMLElement,entry=entries.get(fence);if(!entry)continue;
      const entered=record.isIntersecting&&!entry.visible;entry.visible=record.isIntersecting;
      if(entered)enqueue(fence);
    }
  });
  const resize=new ResizeObserver(records=>{
    for(const record of records){const fence=wrappers.get(record.target),entry=fence&&entries.get(fence);if(!entry||!fence)continue;
      const width=record.contentRect.width;if(width>0&&width!==entry.width){entry.width=width;enqueue(fence);}
    }
  });
  const invalidate=()=>{for(const fence of entries.keys())enqueue(fence);};
  window.addEventListener('resize',invalidate,{passive:true});document.fonts?.addEventListener('loadingdone',invalidate);
  const remove=(fence:HTMLElement,entry:fence_measurement)=>{intersection.unobserve(fence);resize.unobserve(entry.wrapper);wrappers.delete(entry.wrapper);entries.delete(fence);queued.delete(fence);};
  return {
    reconcile(fences:Iterable<HTMLElement>){
      if(disposed)return;const current=new Set(fences);
      for(const [fence,entry]of entries)if(!current.has(fence)||!fence.isConnected)remove(fence,entry);
      for(const fence of current){
        const wrapper=fence.querySelector<HTMLElement>('.CodeMirror');
        const editor=(wrapper as (HTMLElement&{CodeMirror?:fence_editor})|null)?.CodeMirror;
        const previous=entries.get(fence);
        if(previous?.wrapper===wrapper&&previous.editor===editor)continue;
        if(previous)remove(fence,previous);
        if(!wrapper||!editor?.refresh)continue;
        entries.set(fence,{wrapper,editor,visible:false,width:0,pending:true});wrappers.set(wrapper,fence);intersection.observe(fence);resize.observe(wrapper);
      }
    },
    refresh:enqueue,
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);frame=0;intersection.disconnect();resize.disconnect();queued.clear();entries.clear();wrappers.clear();window.removeEventListener('resize',invalidate);document.fonts?.removeEventListener('loadingdone',invalidate);}
  };
}
