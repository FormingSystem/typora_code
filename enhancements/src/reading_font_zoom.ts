import {bind_reading_vector_size} from './reading_vector_size';
import {content_font_size,observe_content_zoom} from './workspace_content_zoom';
import {change_reading_geometry,capture_reflow_anchor} from './reading_reflow';
import {observe_workspace_theme} from './workspace_theme';
const fonts=new WeakMap<HTMLElement,{font:number;line:string}>();
export function reading_base_font(root:HTMLElement){return fonts.get(root);}
/** Publish reader typography while preserving native editing and media ownership. */
export function bind_reading_font_zoom(scroller:HTMLElement,root:HTMLElement){
  const original=['font-size','line-height','--reading-diagram-font-size'].map(name=>[name,root.style.getPropertyValue(name),root.style.getPropertyPriority(name)]);
  const vectors=bind_reading_vector_size(root);
  let base=16,line='normal',disposed=false,retained:ReturnType<typeof capture_reflow_anchor>;
  const restore=()=>{for(const [name,value,priority]of original)if(value)root.style.setProperty(name,value,priority);else root.style.removeProperty(name);};
  const apply=()=>{
    const size=content_font_size(base),height=line==='normal'?line:String(Number.parseFloat(line)/base);
    if(root.style.fontSize===size+'px'&&root.style.lineHeight===height&&root.style.getPropertyValue('--reading-diagram-font-size')===size+'px'){retained=undefined;return;}
    change_reading_geometry(scroller,root,()=>{root.style.setProperty('--reading-diagram-font-size',size+'px');root.style.setProperty('font-size',size+'px','important');root.style.setProperty('line-height',height,'important');},retained);vectors.update();retained=undefined;
  };
  const refresh=()=>{
    if(disposed)return;
    const current_font=root.style.getPropertyValue('font-size'),current_line=root.style.getPropertyValue('line-height');
    restore();const style=getComputedStyle(root),next=Number.parseFloat(style.fontSize)||16,next_line=style.lineHeight||'normal';
    const typed=(root as any).computedStyleMap?.().get('line-height');fonts.set(root,{font:next,line:typed?.unit==='number'?String(typed.value):next_line});
    if(current_font)root.style.setProperty('font-size',current_font,'important');if(current_line)root.style.setProperty('line-height',current_line,'important');
    base=next;line=next_line;apply();
  };
  const stop=observe_content_zoom(apply,()=>{retained=capture_reflow_anchor(scroller,root);}),theme=observe_workspace_theme(refresh);refresh();
  return {refresh,dispose(){disposed=true;vectors.dispose();stop();theme();fonts.delete(root);restore();}};
}
