import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_preview_resize.css';

type preview_size={width:number;height:number};
/** 两种预览共用指针捕获、缩放换算、键盘及销毁；尺寸边界留给布局所有者。 */
export function bind_preview_resize(root:HTMLElement,read:()=>preview_size,change:(size:preview_size)=>void,edges=['north','east','north-east']){
  const style=acquire_workspace_style('typora-code-style:workspace_preview_resize',css,{});
  const handles:HTMLElement[]=[];
  let active:{handle:HTMLElement;id:number;x:number;y:number;size:preview_size;scale:number}|undefined;
  const finish=()=>{const previous=active;active=undefined;if(previous){previous.handle.classList.remove('is-dragging');if(previous.handle.hasPointerCapture(previous.id))previous.handle.releasePointerCapture(previous.id);}};
  for(const edge of edges){
    const handle=document.createElement('div');handle.className='workspace-preview-sash';handle.dataset.edge=edge;handle.tabIndex=0;handle.setAttribute('role','separator');
    handle.setAttribute('aria-label',edge==='north'?'调整预览高度':edge==='east'?'调整预览宽度':'同时调整预览宽高');
    handle.setAttribute('aria-orientation',edge==='north'?'horizontal':'vertical');
    const resize=(size:preview_size,x:number,y:number)=>change({width:size.width+(edge.includes('east')?x:0),height:size.height-(edge.includes('north')?y:0)});
    handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();finish();handle.focus({preventScroll:true});active={handle,id:event.pointerId,x:event.clientX,y:event.clientY,size:read(),scale:root.offsetWidth?root.getBoundingClientRect().width/root.offsetWidth:1};handle.setPointerCapture(event.pointerId);handle.classList.add('is-dragging');};
    handle.onpointermove=event=>{if(active?.handle!==handle||active.id!==event.pointerId)return;event.preventDefault();resize(active.size,(event.clientX-active.x)/active.scale,(event.clientY-active.y)/active.scale);};
    handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=finish;
    handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?50:10;resize(read(),event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);};
    root.append(handle);handles.push(handle);
  }
  window.addEventListener('blur',finish);
  return {cancel:finish,dispose(){finish();window.removeEventListener('blur',finish);handles.forEach(handle=>handle.remove());style.remove();}};
}
