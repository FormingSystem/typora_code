import {reading_viewport_bounds} from './reading_viewport';

/** 收起代码先完整进入正文视口，再允许原生CodeMirror消费垂直滚轮。 */
export function bind_reading_code_wheel(owner_document:Document=document):()=>void {
  const on_wheel=(event:WheelEvent)=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||!event.deltaY||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    const target=event.target;
    if(!(target instanceof Element))return;
    const fence=target.closest<HTMLElement>('.md-fences.linux-note-code-collapsible.is-code-collapsed');
    const owner=fence?.closest<HTMLElement>('content');
    const scroller=fence?.querySelector<HTMLElement>('.CodeMirror-scroll');
    const button=fence?.querySelector<HTMLElement>('.linux-note-code-toggle');
    if(!fence||!owner||!scroller||!button||!scroller.contains(target))return;
    const bounds=reading_viewport_bounds(owner),box=fence.getBoundingClientRect(),button_box=button.getBoundingClientRect();
    const fully_visible=box.height>0&&button_box.height>0&&box.top>=bounds.top&&box.bottom<=bounds.bottom
      &&button_box.top>=bounds.top&&button_box.bottom<=bounds.bottom;
    const can_scroll=event.deltaY<0?scroller.scrollTop>0:scroller.scrollTop+scroller.clientHeight<scroller.scrollHeight-1;
    if(fully_visible&&can_scroll)return;
    // preventDefault同时取消浏览器的嵌套滚动，捕获阶段阻止CodeMirror自行消费同一增量。
    event.preventDefault();event.stopPropagation();
    let amount=event.deltaY;
    if(event.deltaMode===WheelEvent.DOM_DELTA_LINE){
      const style=owner_document.defaultView!.getComputedStyle(owner);
      amount*=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2;
    }else if(event.deltaMode===WheelEvent.DOM_DELTA_PAGE)amount*=Math.max(0,bounds.bottom-bounds.top);
    owner.scrollTop+=amount;
  };
  owner_document.addEventListener('wheel',on_wheel,{capture:true,passive:false});
  return ()=>owner_document.removeEventListener('wheel',on_wheel,true);
}
