import './draggable.scss'
import {create_drop_marker, start_pointer_drag, type pointer_drag_session, type pointer_drag_state} from './pointer-drag'

/** 通用工具项也复用对象拖动会话；不再在按下时立即重排。 */
export function draggable(container_el: HTMLElement, direction: 'x' | 'y', on_change?: () => void) {
  const doc=container_el.ownerDocument, marker=create_drop_marker(doc);
  let session:pointer_drag_session|undefined;
  const on_pointer_down=(event:PointerEvent)=>{
    const element=event.target instanceof Element?event.target:null;
    if(element?.closest('.typ-close,button,input,textarea,select,a'))return;
    const source=element?.closest<HTMLElement>('[draggable=true]');
    if(!source||!container_el.contains(source))return;
    const parent=source.parentElement!;
    let destination:HTMLElement|undefined,before=true;
    const update=(state:pointer_drag_state)=>{
      marker.hide();destination=undefined;
      const target=state.target?.closest<HTMLElement>('[draggable=true]');
      if(!target||target===source||target.parentElement!==parent)return;
      destination=target;
      const box=target.getBoundingClientRect();
      before=direction==='x'?state.client_x<box.left+box.width/2:state.client_y<box.top+box.height/2;
      marker.show(direction==='x'?{left:before?box.left:box.right-2,top:box.top,width:2,height:box.height}:{left:box.left,top:before?box.top:box.bottom-2,width:box.width,height:2});
    };
    session=start_pointer_drag(event,{
      source,on_move:update,
      on_drop(state){update(state);if(destination&&source.parentElement===parent&&destination.parentElement===parent){destination.insertAdjacentElement(before?'beforebegin':'afterend',source);on_change?.();}},
      on_end(){marker.hide();session=undefined;}
    });
  };
  container_el.addEventListener('pointerdown',on_pointer_down);
  return ()=>{session?.cancel('dispose');marker.dispose();container_el.removeEventListener('pointerdown',on_pointer_down);};
}
