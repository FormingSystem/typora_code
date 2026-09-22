import {bind_reading_media_entries,type reading_media_entry} from "./reading_media_entry";
import {git_icon} from "./git_icons";
import {workspace_element as el} from "./workspace_widgets";

export type reading_code_source={element:HTMLElement;read_text:()=>string};

/** 正文与只读预览共用复制状态；内容仍由各自编辑器/呈现器拥有。 */
export function bind_reading_code_copy(root:HTMLElement,copy:(text:string)=>void){
  const overlay=bind_reading_media_entries(root);
  const entries=new Map<HTMLElement,{source:reading_code_source;entry:reading_media_entry;feedback:HTMLElement;timer:number}>();
  let disposed=false;
  const remove=(element:HTMLElement)=>{const state=entries.get(element);if(!state)return;clearTimeout(state.timer);state.entry.dispose();entries.delete(element);};
  return {
    reconcile(sources:readonly reading_code_source[]){
      if(disposed)return;
      const current=new Set(sources.map(source=>source.element));
      for(const element of entries.keys())if(!current.has(element))remove(element);
      for(const source of sources){
        const existing=entries.get(source.element);if(existing){existing.source=source;continue;}
        const feedback=el("span","reading-copy-feedback");feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");
        const entry=overlay.add({source:source.element,host:source.element,label:"复制代码",button_class:"reading-code-copy",icon:"copy",compact:true,open:()=>{
          const state=entries.get(source.element);if(!state||!source.element.isConnected||disposed)return;
          clearTimeout(state.timer);
          let label="已复制",icon:"check"|"warning"="check";
          try{copy(state.source.read_text());}catch{label="复制失败，请重试";icon="warning";}
          entry.button.replaceChildren(git_icon(icon));entry.button.title=label;entry.button.setAttribute("aria-label",label);feedback.textContent=label;entry.button.parentElement!.classList.add("is-feedback");
          state.timer=window.setTimeout(()=>{entry.button.replaceChildren(git_icon("copy"));entry.button.title="复制代码";entry.button.setAttribute("aria-label","复制代码");feedback.textContent="";entry.button.parentElement?.classList.remove("is-feedback");},1800);
        }});
        entry.button.parentElement!.append(feedback);entries.set(source.element,{source,entry,feedback,timer:0});
      }
    },
    dispose(){if(disposed)return;disposed=true;for(const element of entries.keys())remove(element);overlay.dispose();}
  };
}
