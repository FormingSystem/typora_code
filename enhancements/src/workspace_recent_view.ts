import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {capture_workspace_focus,register_workspace_dismissal,type workspace_dismiss_layer,type workspace_focus_snapshot} from "./workspace_focus";
import {workspace_button,workspace_dialog,workspace_element} from "./workspace_widgets";
import {git_icon} from "./git_icons";
import {acquire_workspace_file_icons,workspace_file_icon} from "./workspace_file_icons";
import {append_quick_highlights,create_quick_matcher} from "./workspace_quick_open_matcher";
import {is_composing_key} from "./workspace_keyboard";
import {workspace_context_epoch} from "./workspace_context";
import type {recent_service,recent_item} from "./workspace_recent_service";
import quick_css from "./workspace_quick_open.css";
import css from "./workspace_recent_view.css";

/** 历史QuickPick只持有展示快照；关闭和切库令迟到读取失效。 */
export function create_recent_view(service:recent_service,path_api:any,notice:(message:string)=>void){
  const style=acquire_workspace_style("typora-code-quick-open-style",quick_css),local_style=acquire_workspace_style("typora-code-recent-style",css);
  const icons=acquire_workspace_file_icons(),events=new AbortController();
  const root=workspace_element("section","workspace-quick-open workspace-recent-open");root.hidden=true;root.setAttribute("role","dialog");root.setAttribute("aria-label","打开最近");
  const input_row=workspace_element("div","workspace-quick-open-input-row"),input=workspace_element("input") as HTMLInputElement;
  input.placeholder="选择要打开的文件夹或文件";input.setAttribute("aria-label","筛选最近文件夹和文件");input.setAttribute("role","combobox");input.setAttribute("aria-controls","workspace-recent-list");input.setAttribute("aria-autocomplete","list");input.spellcheck=false;input.autocomplete="off";input_row.append(input);
  const status=workspace_element("div","workspace-quick-open-status is-visible");status.setAttribute("role","status");
  const results=workspace_element("div","workspace-quick-open-results");results.id="workspace-recent-list";results.setAttribute("role","listbox");
  root.append(input_row,status,results);document.body.append(root);
  const interaction=acquire_workspace_interaction(root);
  let items:recent_item[]=[],shown:recent_item[]=[],selected=0,generation=0,load_generation=0,busy=false,disposed=false;
  let previous:workspace_focus_snapshot|undefined,layer:workspace_dismiss_layer|undefined,confirmation:ReturnType<typeof workspace_dialog>|undefined;
  const close=(restore=true)=>{
    generation++;load_generation++;busy=false;const owned=layer?.owns_focus();layer?.dispose();layer=undefined;
    root.hidden=true;root.setAttribute("aria-modal","false");input.setAttribute("aria-expanded","false");input.removeAttribute("aria-activedescendant");results.replaceChildren();items=[];shown=[];
    if(restore&&owned)previous?.restore();previous=undefined;
  };
  const select=(index:number)=>{
    selected=shown.length?(index+shown.length)%shown.length:0;input.removeAttribute("aria-activedescendant");
    for(const row of results.querySelectorAll<HTMLElement>('.workspace-recent-row')){
      const active=Number(row.dataset.index)===selected;row.classList.toggle("is-selected",active);row.setAttribute("aria-selected",String(active));
      if(active){input.setAttribute("aria-activedescendant",row.id);row.scrollIntoView({block:"nearest"});}
    }
  };
  const refresh=async()=>{
    const revision=++load_generation,current=generation;
    try{const data=await service.read();if(disposed||root.hidden||current!==generation||revision!==load_generation)return;items=data;render();}
    catch(error){if(!disposed&&!root.hidden&&current===generation&&revision===load_generation){status.classList.add("is-visible");status.textContent=String(error);}}
  };
  const open_selected=async(item=shown[selected])=>{
    if(!item||busy)return;busy=true;const current=generation,epoch=workspace_context_epoch();
    try{const opened=await service.open(item,()=>!root.hidden&&current===generation&&epoch===workspace_context_epoch());if(current!==generation)return;if(opened)close(false);else await refresh();}
    catch(error){if(current===generation){status.classList.add("is-visible");status.textContent=String(error);}}
    finally{if(current===generation)busy=false;}
  };
  const remove_item=async(item:recent_item)=>{
    if(busy)return;busy=true;const current=generation;
    try{await service.remove(item);if(current===generation){await refresh();input.focus();}}
    catch(error){if(current===generation){status.classList.add("is-visible");status.textContent=String(error);}}
    finally{if(current===generation)busy=false;}
  };
  const render=()=>{
    const matcher=create_quick_matcher(input.value),matches=items.map(item=>({item,match:matcher.match({file_path:item.path,relative_path:item.path,name:path_api.basename(item.path)||item.path,directory:path_api.dirname(item.path)})})).filter(entry=>entry.match);
    shown=matches.map(entry=>entry.item);results.replaceChildren();status.textContent=shown.length?"":"没有匹配的最近项目";status.classList.toggle("is-visible",!shown.length);
    let kind="";
    matches.forEach(({item,match},index)=>{
      if(kind!==item.kind){kind=item.kind;const heading=workspace_element("div","workspace-recent-group",kind==="folder"?"文件夹":"文件");heading.setAttribute("role","presentation");results.append(heading);}
      const row=workspace_element("div","workspace-quick-open-result workspace-recent-row");row.dataset.index=String(index);row.id="workspace-recent-item-"+index;row.setAttribute("role","option");row.title=item.path;
      const open_button=workspace_button("",()=>void open_selected(item));open_button.className="workspace-recent-target";open_button.tabIndex=-1;open_button.setAttribute("aria-label","打开 "+item.path);
      open_button.append(item.kind==="folder"?git_icon("folder"):workspace_file_icon(item.path));
      const name=workspace_element("span","workspace-quick-open-name"),directory=workspace_element("span","workspace-quick-open-path");
      append_quick_highlights(name,match!.file.name,match!.score.labelMatch);append_quick_highlights(directory,match!.file.directory,match!.score.descriptionMatch);open_button.append(name,directory);
      const remove=workspace_button("",()=>void remove_item(item));remove.className="workspace-recent-remove";remove.title="从最近打开中移除";remove.setAttribute("aria-label","从最近打开中移除 "+item.path);remove.append(git_icon("close"));
      row.append(open_button,remove);results.append(row);
    });select(Math.min(selected,shown.length-1));
  };
  const open=async()=>{
    if(disposed)return;if(!root.hidden){select(selected+1);input.focus();return;}
    previous=capture_workspace_focus();generation++;root.hidden=false;root.setAttribute("aria-modal","true");input.setAttribute("aria-expanded","true");input.value="";selected=0;status.classList.add("is-visible");status.textContent="正在读取最近项目…";
    layer=register_workspace_dismissal(()=>[root],reason=>close(reason!=="window-blur"),{window_blur:true});input.focus();await refresh();
  };
  const confirm_clear=(snapshot:recent_item[])=>{
    if(disposed||confirmation)return;
    confirmation=workspace_dialog("清空最近打开记录", "取消",()=>{confirmation=undefined;});const dialog=confirmation;
    dialog.content.append(workspace_element("p","",`移除这${snapshot.length}项最近记录？不会删除磁盘文件、关闭编辑器或清除工作区会话。`));
    const message=workspace_element("p");message.setAttribute("role","status");dialog.content.append(message);
    const confirm=workspace_button("清空记录",async()=>{
      confirm.disabled=true;dialog.footer.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);
      try{await service.clear(snapshot);dialog.close();if(!disposed){notice("最近打开记录已清空。");if(!root.hidden)await refresh();}}
      catch(error){message.textContent=String(error);dialog.footer.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=false);}
    });dialog.footer.append(confirm);
  };
  input.addEventListener("input",()=>{selected=0;render();},{signal:events.signal});
  root.addEventListener("keydown",event=>{
    if(is_composing_key(event))return;
    if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)&&event.target===input){event.preventDefault();select(event.key==="Home"?0:event.key==="End"?shown.length-1:selected+(event.key==="ArrowDown"?1:-1));}
    else if(event.key==="Enter"&&event.target===input){event.preventDefault();void open_selected();}
    else if(event.code==="KeyR"&&(event.ctrlKey||event.metaKey)){event.preventDefault();select(selected+(event.shiftKey?-1:1));}
  },{signal:events.signal});
  window.addEventListener("linux-note-workspace-context-changed",()=>{close(false);confirmation?.close(false);},{signal:events.signal});
  window.addEventListener("focus",()=>{if(!root.hidden&&!busy)void refresh();},{signal:events.signal});
  return {open,confirm_clear,dispose(){disposed=true;close(false);confirmation?.close(false);events.abort();interaction.remove();icons.remove();style.remove();local_style.remove();root.remove();}};
}
