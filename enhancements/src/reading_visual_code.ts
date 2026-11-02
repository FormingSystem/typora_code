import {visual_code_format} from './visual_code_formats';
import {create_visual_code_view} from './visual_code_view';

type native_fence={getValue():string;on?(event:string,callback:()=>void):void;off?(event:string,callback:()=>void):void;refresh?():void};
type entry={source:string;language:string;model:native_fence;view?:ReturnType<typeof create_visual_code_view>;change:()=>void;visible:boolean;timer:number};

/** Native fences keep the original CodeMirror model, selection, undo, and save path. */
export function bind_reading_visual_code(){
 const entries=new Map<HTMLElement,entry>();let disposed=false;
 const remove=(fence:HTMLElement)=>{const entry=entries.get(fence);if(!entry)return;clearTimeout(entry.timer);entry.model.off?.('change',entry.change);entry.view?.dispose();fence.classList.remove('visual-code-source-hidden');observer.unobserve(fence);entries.delete(fence);};
 const render=(fence:HTMLElement,entry:entry)=>{
  if(disposed||!entry.visible)return;entry.view?.dispose();
  const source=entry.model.getValue();entry.source=source;
  entry.view=create_visual_code_view(visual_code_format(entry.language)!,source,()=>{fence.classList.toggle('visual-code-source-hidden');entry.model.refresh?.();return !fence.classList.contains('visual-code-source-hidden');});
  fence.append(entry.view.root);entry.view.start();
 };
 const observer=new IntersectionObserver(items=>{for(const item of items){const fence=item.target as HTMLElement,entry=entries.get(fence);if(!entry)continue;entry.visible=item.isIntersecting;if(entry.visible&&!entry.view)render(fence,entry);else if(!entry.visible){entry.view?.dispose();entry.view=undefined;fence.classList.remove('visual-code-source-hidden');}}},{rootMargin:'300px'});
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
   entry={source:'',language,model,visible:false,timer:0,change:()=>{const current=entries.get(fence);if(!current||current.timer)return;current.timer=window.setTimeout(()=>{current.timer=0;render(fence,current);},300);}};
   entries.set(fence,entry);model.on?.('change',entry.change);observer.observe(fence);
  }
 },dispose(){if(disposed)return;disposed=true;for(const fence of [...entries.keys()])remove(fence);observer.disconnect();}};
}
