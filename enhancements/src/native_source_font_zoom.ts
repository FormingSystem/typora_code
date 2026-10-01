import {content_font_size,observe_content_zoom} from './workspace_content_zoom';
import {observe_workspace_theme} from './workspace_theme';

/** One native source geometry owner coordinates font changes and container layout around the same logical anchor. */
export function bind_native_source_font_zoom(root:HTMLElement){
  const editor=(root as any).CodeMirror;
  if(!editor)return;
  const original=['font-size','line-height'].map(name=>[name,root.style.getPropertyValue(name),root.style.getPropertyPriority(name)]);
  let base=14,line='normal',family='',signature='',width=0,height=0,disposed=false,restoring=false;
  let anchor:{position:{line:number;ch:number};offset:number;left:number}|undefined,restored_top:number|undefined;
  const restore_style=()=>{for(const[name,value,priority]of original)if(value)root.style.setProperty(name,value,priority);else root.style.removeProperty(name);};
  const capture=()=>{
    if(disposed||restoring||!root.getClientRects().length)return;
    const info=editor.getScrollInfo();
    // CodeMirror and the native scroller round fractional device pixels at different times.
    if(restored_top!==undefined&&Math.abs(restored_top-info.top)<1&&anchor)return;
    restored_top=undefined;
    const position=editor.coordsChar({left:info.left,top:info.top},'local');
    anchor={position,offset:info.top-editor.charCoords(position,'local').top,left:info.left};
  };
  const relayout=()=>{
    if(disposed||!root.getClientRects().length)return;
    if(!anchor)capture();
    restoring=true;
    try{
      editor.refresh();
      if(anchor){
        // Measure the retained line in the virtual viewport before deriving its new document coordinate.
        editor.scrollIntoView(anchor.position,0);
        editor.scrollTo(anchor.left,editor.charCoords(anchor.position,'local').top+anchor.offset);
      }
      restored_top=editor.getScrollInfo().top;
    }finally{restoring=false;}
  };
  const apply=()=>{
    const size=content_font_size(base),line_height=line==='normal'?line:String(Number.parseFloat(line)/base);
    const next=`${size}:${line_height}:${family}`;
    if(root.style.fontSize!==size+'px')root.style.setProperty('font-size',size+'px','important');
    if(root.style.lineHeight!==line_height)root.style.setProperty('line-height',line_height,'important');
    if(next===signature)return;
    signature=next;relayout();
  };
  const refresh=()=>{
    if(!anchor)capture();restore_style();const style=getComputedStyle(root);
    base=Number.parseFloat(style.fontSize)||14;line=style.lineHeight||'normal';family=style.fontFamily;apply();
  };
  const changed=()=>{anchor=undefined;restored_top=undefined;capture();};
  const prepare=()=>{restored_top=undefined;capture();};
  const resize=new ResizeObserver(records=>{
    const rect=records[0]?.contentRect;
    if(!rect||!rect.width||!rect.height||rect.width===width&&rect.height===height)return;
    width=rect.width;height=rect.height;relayout();
  });
  editor.on('scroll',capture);editor.on('changes',changed);resize.observe(root);
  window.addEventListener('pointerdown',prepare,true);
  const stop=observe_content_zoom(apply,prepare),theme=observe_workspace_theme(refresh);capture();refresh();
  return {dispose(){disposed=true;stop();theme();resize.disconnect();window.removeEventListener('pointerdown',prepare,true);editor.off('scroll',capture);editor.off('changes',changed);restore_style();anchor=undefined;editor.refresh();}};
}
