import {acquire_workspace_style} from './workspace_styles';
import css from './reading_visual_code.css';
import {bind_reading_media_entries} from './reading_media_entry';
import {visual_code_format} from './visual_code_formats';
import {create_visual_code_view} from './visual_code_view';

type native_fence={getValue():string;on?(event:string,callback:()=>void):void;off?(event:string,callback:()=>void):void;refresh?():void;focus?():void};
type entry={source:string;language:string;model:native_fence;view?:ReturnType<typeof create_visual_code_view>;change:()=>void;visible:boolean;timer:number;placeholder:HTMLDivElement};

/** Native fences keep the original CodeMirror model, selection, undo, and save path. */
export function bind_reading_visual_code(){
 const entries=new Map<HTMLElement,entry>(),media=bind_reading_media_entries(),style=acquire_workspace_style('typora-code-style:reading_visual_code',css);let disposed=false;
 const remove=(fence:HTMLElement)=>{const entry=entries.get(fence);if(!entry)return;clearTimeout(entry.timer);entry.model.off?.('change',entry.change);entry.view?.dispose();entry.placeholder.remove();fence.classList.remove('visual-code-native','visual-code-opening');observer.unobserve(fence);entries.delete(fence);};
 const render=(fence:HTMLElement,entry:entry)=>{
  if(disposed||!entry.visible)return;entry.view?.dispose();entry.placeholder.hidden=true;
  const source=entry.model.getValue();entry.source=source;
  entry.view=create_visual_code_view(visual_code_format(entry.language)!,source,{media,edit_source:()=>{fence.classList.add('visual-code-opening');entry.model.refresh?.();entry.model.focus?.();queueMicrotask(()=>fence.classList.remove('visual-code-opening'));}});
  fence.append(entry.view.root);entry.view.start();
 };
 const observer=new IntersectionObserver(items=>{for(const item of items){const fence=item.target as HTMLElement,entry=entries.get(fence);if(!entry)continue;entry.visible=item.isIntersecting;if(entry.visible&&!entry.view)render(fence,entry);else if(!entry.visible){if(entry.view)entry.placeholder.style.height=entry.view.root.getBoundingClientRect().height+'px';entry.placeholder.hidden=false;entry.view?.dispose();entry.view=undefined;}}},{rootMargin:'300px'});
 return {reconcile(fences:HTMLElement[]){
  const live=new Set(fences);for(const fence of entries.keys())if(!live.has(fence)||!fence.isConnected)remove(fence);
  for(const fence of fences){
   const language=(fence.getAttribute('lang')||'').trim().toLowerCase(),format=visual_code_format(language);
   // Existing native diagram families retain their verified editor and rendering owner.
   const native=['mermaid','flow','flowchart','sequence'].includes(language);
   const model=(fence.querySelector('.CodeMirror') as any)?.CodeMirror as native_fence|undefined;
   if(!format||native||!model?.getValue){remove(fence);continue;}
   let entry=entries.get(fence);
   if(entry&&(entry.model!==model||entry.language!==language)){remove(fence);entry=undefined;}
   if(entry)continue;
   const placeholder=document.createElement('div');placeholder.className='visual-code-placeholder';placeholder.contentEditable='false';fence.append(placeholder);
   entry={source:'',language,model,visible:false,timer:0,placeholder,change:()=>{const current=entries.get(fence);if(!current||current.timer)return;current.timer=window.setTimeout(()=>{current.timer=0;render(fence,current);},300);}};
   fence.classList.add('visual-code-native');entries.set(fence,entry);model.on?.('change',entry.change);observer.observe(fence);
  }
 },dispose(){if(disposed)return;disposed=true;for(const fence of [...entries.keys()])remove(fence);observer.disconnect();media.dispose();style.remove();}};
}
