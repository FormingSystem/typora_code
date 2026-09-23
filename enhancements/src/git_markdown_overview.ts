/** 渲染差异的局部概览；仅映射已有排版，不读取Git或重新计算diff。 */
export function create_markdown_overview(scroll:HTMLElement,reader:HTMLElement){
  const container=document.createElement('div'),canvas=document.createElement('canvas'),viewport=document.createElement('div');
  container.className='git-markdown-overview';canvas.className='git-markdown-overview-marks';viewport.className='git-markdown-overview-viewport';
  container.tabIndex=0;container.setAttribute('role','scrollbar');container.setAttribute('aria-label','Markdown差异概览');container.setAttribute('aria-orientation','vertical');container.setAttribute('aria-valuemin','0');
  container.append(canvas,viewport);
  const events=new AbortController(),signal=events.signal;
  let disposed=false,frame=0,layout_dirty=true,rows:HTMLElement[]=[],marks:{top:number;height:number;left:boolean;right:boolean}[]=[];
  let height=0,total=1,slider_height=0,slider_top=0,drag:{id:number;y:number;top:number}|undefined;
  const update_viewport=()=>{
    const max=Math.max(0,scroll.scrollHeight-scroll.clientHeight);
    slider_height=Math.min(height,Math.max(20,height*scroll.clientHeight/total));
    slider_top=max?scroll.scrollTop/max*(height-slider_height):0;
    viewport.style.top=slider_top+'px';viewport.style.height=slider_height+'px';
    viewport.hidden=max===0;container.setAttribute('aria-valuemax',String(Math.round(max)));container.setAttribute('aria-valuenow',String(Math.round(scroll.scrollTop)));
  };
  const paint=()=>{
    frame=0;if(disposed)return;
    if(!container.clientHeight||!scroll.clientHeight)return;
    if(layout_dirty){
      layout_dirty=false;height=container.clientHeight;total=Math.max(scroll.scrollHeight,scroll.clientHeight,1);
      const origin=reader.getBoundingClientRect().top;
      marks=rows.map(row=>{const box=row.getBoundingClientRect();return {top:box.top-origin,height:box.height,left:row.children[0]?.getAttribute('data-empty')!=='true',right:row.children[1]?.getAttribute('data-empty')!=='true'};});
      const ratio=window.devicePixelRatio||1;canvas.width=Math.round(30*ratio);canvas.height=Math.round(height*ratio);
      const ctx=canvas.getContext('2d');if(ctx){
        ctx.scale(ratio,ratio);const style=getComputedStyle(container);
        for(const mark of marks){const top=mark.top/total*height,size=Math.max(2,mark.height/total*height);
          if(mark.left){ctx.fillStyle=style.getPropertyValue('--git-overview-removed').trim()||'#ff000066';ctx.fillRect(0,top,15,size);}
          if(mark.right){ctx.fillStyle=style.getPropertyValue('--git-overview-inserted').trim()||'#9ccc2c80';ctx.fillRect(15,top,15,size);}
        }
      }
      container.dataset.markCount=String(marks.length);
    }
    update_viewport();
  };
  const schedule=(layout=false)=>{layout_dirty||=layout;if(!disposed&&!frame)frame=requestAnimationFrame(paint);};
  const end_drag=()=>{if(drag&&container.hasPointerCapture(drag.id))container.releasePointerCapture(drag.id);drag=undefined;delete container.dataset.dragging;};
  container.addEventListener('pointerdown',event=>{
    if(event.button!==0||!height)return;event.preventDefault();container.focus({preventScroll:true});
    const box=container.getBoundingClientRect(),y=(event.clientY-box.top)*height/box.height;
    if(event.target===viewport){drag={id:event.pointerId,y:event.clientY,top:scroll.scrollTop};container.dataset.dragging='true';try{container.setPointerCapture(event.pointerId);}catch{/* 合成测试事件没有原生指针捕获。 */}return;}
    const left=event.clientX-box.left<box.width/2;
    const match=marks.find(mark=>(left?mark.left:mark.right)&&y>=mark.top/total*height&&y<=mark.top/total*height+Math.max(2,mark.height/total*height));
    const header=reader.querySelector('.markdown-diff-head')?.getBoundingClientRect().height||0;
    scroll.scrollTop=match?Math.max(0,match.top-header):y/height*total-scroll.clientHeight/2;schedule();
  },{signal});
  container.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();const ratio=height/container.getBoundingClientRect().height;scroll.scrollTop=drag.top+(event.clientY-drag.y)*ratio/Math.max(1,height-slider_height)*Math.max(0,total-scroll.clientHeight);schedule();},{signal});
  for(const name of ['pointerup','pointercancel','lostpointercapture','blur'])container.addEventListener(name,end_drag,{signal});
  window.addEventListener('blur',end_drag,{signal});
  container.addEventListener('keydown',event=>{
    const step=event.key==='ArrowDown'?40:event.key==='ArrowUp'?-40:event.key==='PageDown'?scroll.clientHeight:event.key==='PageUp'?-scroll.clientHeight:undefined;
    if(step!==undefined||event.key==='Home'||event.key==='End'){event.preventDefault();event.stopPropagation();scroll.scrollTop=event.key==='Home'?0:event.key==='End'?scroll.scrollHeight:scroll.scrollTop+step!;schedule();}
    else if(event.key==='Escape')end_drag();
  },{signal});
  container.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey)return;event.preventDefault();scroll.scrollTop+=event.deltaY*(event.deltaMode===1?20:event.deltaMode===2?scroll.clientHeight:1);schedule();},{signal,passive:false});
  scroll.addEventListener('scroll',()=>schedule(),{signal,passive:true});
  const observer=new ResizeObserver(()=>schedule(true));observer.observe(scroll);observer.observe(reader);observer.observe(container);
  return {container,refresh(){schedule(true);},set_rows(value:HTMLElement[]){end_drag();rows=value;schedule(true);},suspend(){end_drag();if(frame)cancelAnimationFrame(frame);frame=0;},dispose(){disposed=true;end_drag();if(frame)cancelAnimationFrame(frame);observer.disconnect();events.abort();container.remove();rows=[];marks=[];}};
}
