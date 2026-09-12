import {capture_text_color,apply_text_color,type text_color_selection,type text_color_runtime} from "./markdown_color_native";
import {text_color_presets,normalize_text_color,text_color_prefix} from "./markdown_text_color";
import {bind_markdown_color_theme} from "./markdown_color_theme";
import {workspace_dialog,workspace_element as el,workspace_button as button} from "./workspace_widgets";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import color_css from "./markdown_color_menu.css";
import type {graph_core} from "./git_graph_host";

export function bind_markdown_color_menu(core:graph_core){
  const runtime=window as unknown as text_color_runtime,e=runtime.File?.editor,menu=document.querySelector<HTMLElement>("#context-menu");
  const theme=bind_markdown_color_theme();
  if(!e?.contextMenu?.show||!menu)return {dispose:()=>theme.dispose()};
  const style=acquire_workspace_style("typora-code-style:markdown_color",color_css),events=new AbortController();
  let snapshot:text_color_selection|undefined,reason="",disposed=false,dialog:ReturnType<typeof workspace_dialog>|undefined;
  const item=el("li","workspace-font-color-item hide");item.dataset.key="typora-code-font-color";
  const anchor=el("a","","字体颜色…");anchor.setAttribute("role","menuitem");anchor.tabIndex=0;item.append(anchor);
  // 放在原生行内格式按钮之后、段落操作之前，原节点及原菜单处理器保持。
  const block=menu.querySelector('[data-key="block-style"]');menu.insertBefore(item,block);
  const interaction=acquire_workspace_interaction(item);
  const owner=()=>core.app.workspace.activeLeaf;
  const fail=(error:unknown)=>{new core.Notice(error instanceof Error?error.message:String(error),3500);};
  const native_show=e.contextMenu.show;
  const show=e.contextMenu.show=function(event,target){
    if(disposed)return native_show.call(this,event,target);
    snapshot=undefined;reason="";item.classList.add("hide");
    const element=target|| (event.target instanceof Element?event.target:null);
    if(element?.closest("#write"))try{snapshot=capture_text_color(runtime,owner());}catch(error){reason=error instanceof Error?error.message:String(error);}
    if(snapshot||reason){item.classList.remove("hide");item.classList.toggle("disabled",!snapshot);anchor.setAttribute("aria-disabled",String(!snapshot));anchor.title=reason;}
    return native_show.call(this,event,target);
  };
  const open=()=>{
    if(disposed)return;if(!snapshot){if(reason)fail(reason);return;}const selection=snapshot;
    const selected_colors=new Set(selection.blocks.flatMap(block=>block.runs.filter(run=>block.selected.some(hit=>hit.start<run.end&&hit.end>run.start)).map(run=>run.color||"")));
    const current_color=selected_colors.size===1?[...selected_colors][0]:"";
    e.contextMenu.hide();dialog?.close();
    const restore=()=>{if(runtime.File?.bundle===selection.bundle&&owner()===selection.owner&&e.getMarkdown()===selection.markdown)e.undo.exeCommand(selection.cursor);};
    const panel=dialog=workspace_dialog("字体颜色","取消",restore);panel.root.classList.add("workspace-color-dialog");panel.content.setAttribute("data-workspace-color-preview", "");
    panel.content.append(el("p","workspace-color-note","颜色会随文档的明暗主题调整。"));
    const apply=(color?:string)=>{try{if(color)color=normalize_text_color(color);panel.close();dialog=undefined;apply_text_color(runtime,owner(),selection,color);theme.refresh();}catch(error){fail(error);}};
    const grid=el("div","workspace-color-grid");grid.setAttribute("role","group");grid.setAttribute("aria-label","常用字体颜色");
    for(const [label,color]of text_color_presets){const control=button("",()=>apply(color));control.dataset.textColor=color;control.setAttribute("aria-pressed",String(color===current_color));control.setAttribute("aria-label",label);const sample=el("span","workspace-color-sample","A");sample.style.color=`var(${text_color_prefix}${color}, #${color})`;control.append(sample,el("span","",label));grid.append(control);}
    panel.content.append(grid);
    const custom=el("div","workspace-color-custom"),label=el("label","","自定义颜色"),input=el("input"),picker=el("input");input.type="text";input.value="#"+(current_color||"b42318").toUpperCase();input.maxLength=7;input.setAttribute("aria-label","十六进制颜色");picker.type="color";picker.value="#"+(current_color||"b42318");picker.setAttribute("aria-label","选择自定义颜色");label.append(input);
    picker.oninput=()=>{input.value=picker.value.toUpperCase();};input.oninput=()=>{if(/^#[0-9a-f]{6}$/iu.test(input.value))picker.value=input.value;};
    const custom_apply=button("应用",()=>{try{apply(normalize_text_color(input.value));}catch(error){fail(error);input.focus();}});input.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();custom_apply.click();}};
    custom.append(label,picker,custom_apply);panel.content.append(custom);
    panel.footer.prepend(button("恢复默认颜色",()=>apply()));
    grid.addEventListener("keydown",event=>{if(!["ArrowRight","ArrowLeft","ArrowUp","ArrowDown","Home","End"].includes(event.key))return;event.preventDefault();const controls=[...grid.querySelectorAll("button")],index=controls.indexOf(document.activeElement as HTMLButtonElement);controls[event.key==="Home"?0:event.key==="End"?controls.length-1:(index+({ArrowRight:1,ArrowLeft:-1,ArrowDown:4,ArrowUp:-4}[event.key]||0)+controls.length)%controls.length]?.focus();});
    theme.refresh();grid.querySelector("button")?.focus();
  };
  for(const name of ["pointerdown","mousedown","mouseup","click","keydown"]){document.addEventListener(name,event=>{if(!(event.target instanceof Node)||!item.contains(event.target))return;if(event instanceof KeyboardEvent&&!["Enter"," "].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();if(name==="click"||(event instanceof KeyboardEvent&&!event.repeat))open();},{capture:true,signal:events.signal});}
  return {dispose(){if(disposed)return;disposed=true;dialog?.close();events.abort();if(e.contextMenu.show===show)e.contextMenu.show=native_show;item.remove();interaction.remove();style.remove();theme.dispose();snapshot=undefined;}};
}
