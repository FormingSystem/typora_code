import {content_font_size,observe_content_zoom} from './workspace_content_zoom';
import {observe_workspace_theme} from './workspace_theme';

/** Native source code CodeMirror retains edit/selection ownership, and only adapts to font and logical positions. */
export function bind_native_source_font_zoom(root:HTMLElement){
  const editor=(root as any).CodeMirror;
  if(!editor)return;
  const original=['font-size','line-height'].map(name=>[name,root.style.getPropertyValue(name),root.style.getPropertyPriority(name)]);
  let base=14,line='normal',retained:{position:{line:number;ch:number};offset:number;left:number}|undefined;
  const restore_style=()=>{for(const[name,value,priority]of original)if(value)root.style.setProperty(name,value,priority);else root.style.removeProperty(name);};
  const capture=()=>{
    if(!root.getClientRects().length)return;
    const info=editor.getScrollInfo(),position=editor.coordsChar({left:info.left,top:info.top},'local');
    return {position,offset:info.top-editor.charCoords(position,'local').top,left:info.left};
  };
  const apply=()=>{
    const size=content_font_size(base),height=line==='normal'?line:String(Number.parseFloat(line)/base);
    if(root.style.fontSize===size+'px'&&root.style.lineHeight===height){retained=undefined;return;}
    const anchor=retained||capture();retained=undefined;
    root.style.setProperty('font-size',size+'px','important');root.style.setProperty('line-height',height,'important');editor.refresh();
    if(anchor)editor.scrollTo(anchor.left,editor.charCoords(anchor.position,'local').top+anchor.offset);
  };
  const refresh=()=>{
    retained=capture();restore_style();const style=getComputedStyle(root);
    base=Number.parseFloat(style.fontSize)||14;line=style.lineHeight||'normal';apply();
  };
  const stop=observe_content_zoom(apply,()=>{retained=capture();}),theme=observe_workspace_theme(refresh);refresh();
  return {dispose(){stop();theme();restore_style();retained=undefined;editor.refresh();}};
}
