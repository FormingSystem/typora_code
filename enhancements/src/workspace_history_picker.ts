import {workspace_element as el} from "./workspace_widgets";
import {capture_workspace_focus,register_workspace_dismissal} from "./workspace_focus";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_file_icons,workspace_file_icon} from "./workspace_file_icons";
import {git_icon} from "./git_icons";
import css from "./workspace_quick_open.css";

export type history_picker_item<T>={label:string;description:string;file_path?:string;value:T};
/** 两阶段历史选择共用同一键盘和取消路径；选择只返回条目，不执行文件写入。 */
export function pick_history_item<T>(title:string,items:history_picker_item<T>[],signal?:AbortSignal):Promise<T|undefined>{
  if(signal?.aborted)return Promise.resolve(undefined);
  return new Promise(resolve=>{
    const root=el("section","workspace-quick-open workspace-history-picker"),input_row=el("div","workspace-quick-open-input-row"),input=el("input"),list=el("div","workspace-quick-open-results");
    root.setAttribute("role","dialog");root.setAttribute("aria-label",title);input.placeholder=title;input.setAttribute("aria-label",title);input.setAttribute("role","combobox");input.setAttribute("aria-expanded","true");input.setAttribute("aria-autocomplete","list");
    const list_id="history-picker-"+crypto.randomUUID();list.id=list_id;list.setAttribute("role","listbox");input.setAttribute("aria-controls",list_id);
    const style=acquire_workspace_style("typora-code-quick-open-style",css),icons=acquire_workspace_file_icons(),interaction=acquire_workspace_interaction(root),focus=capture_workspace_focus();
    let selected=0,shown=items,closed=false;
    const close=(value?:T,restore=true)=>{if(closed)return;closed=true;layer.dispose();signal?.removeEventListener("abort",cancel);root.remove();style.remove();icons.remove();interaction.remove();if(restore)focus.restore();resolve(value);};
    const cancel=()=>close();
    const layer=register_workspace_dismissal(()=>[root],reason=>close(undefined,reason==="escape"),{window_blur:true});
    const update=()=>{
      const query=input.value.toLocaleLowerCase().trim().split(/\s+/u);shown=items.filter(item=>query.every(part=>(item.label+" "+item.description).toLocaleLowerCase().includes(part)));selected=Math.min(selected,Math.max(0,shown.length-1));
      list.replaceChildren();shown.forEach((item,index)=>{
        const row=el("button","workspace-quick-open-result"+(index===selected?" is-selected":""));row.type="button";row.tabIndex=-1;row.id=list_id+"-"+index;row.setAttribute("role","option");row.setAttribute("aria-selected",String(index===selected));row.title=item.label+"\n"+item.description;
        row.append(item.file_path?workspace_file_icon(item.file_path):git_icon("history"),el("span","workspace-quick-open-name",item.label),el("span","workspace-quick-open-path",item.description));
        row.onmousedown=event=>event.preventDefault();row.onclick=()=>close(item.value);list.append(row);
      });
      if(!shown.length)list.append(el("p","","没有匹配的历史记录。"));
      input.setAttribute("aria-activedescendant",shown.length?list_id+"-"+selected:"");list.children[selected]?.scrollIntoView({block:"nearest"});
    };
    input.oninput=()=>{selected=0;update();};input.onkeydown=event=>{
      if(event.isComposing)return;
      if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();selected=event.key==="Home"?0:event.key==="End"?shown.length-1:(selected+(event.key==="ArrowDown"?1:shown.length-1))%Math.max(1,shown.length);update();}
      if(event.key==="Enter"){event.preventDefault();if(shown[selected])close(shown[selected].value);}
      event.stopPropagation();
    };
    input_row.append(input);root.append(input_row,list);document.body.append(root);signal?.addEventListener("abort",cancel,{once:true});update();input.focus();
  });
}
