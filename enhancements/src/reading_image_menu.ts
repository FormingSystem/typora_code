import {IMAGE_ALIGNMENT_VALUES,read_reading_image_settings,reading_image_alignment_labels,write_reading_image_setting} from "./reading_image_settings";
import {workspace_element as el,workspace_menu} from "./workspace_widgets";
import {workspace_text} from "./workspace_i18n";
import {acquire_workspace_interaction} from "./workspace_interaction";
import type {graph_core} from "./git_graph_host";
import {capture_image_alignment,read_image_alignment} from "./reading_image_native";
import {get_workspace_app} from "./workspace_bootstrap";

export function open_image_layout_menu(image:HTMLImageElement,event:MouseEvent){
  const labels=reading_image_alignment_labels(),settings=read_reading_image_settings(),apply=capture_image_alignment(image),local=read_image_alignment(image);
  const run=(action:()=>void)=>()=>{try{action();}catch(error){const core=(window as any)[Symbol.for('typora-code:workspace')];if(core?.Notice)new core.Notice(String(error instanceof Error?error.message:error),3500);else console.error(error);}};
  return workspace_menu(event,[
    {title:workspace_text('image_layout_single'),disabled:!apply,action:()=>{},children:[{title:workspace_text('image_layout_follow'),checked:!local,action:run(()=>apply?.(undefined))},...IMAGE_ALIGNMENT_VALUES.map(value=>({title:labels[value],checked:local===value,action:run(()=>apply?.(value))}))]},
    {title:workspace_text('image_layout_global'),disabled:!get_workspace_app(),action:()=>{},children:IMAGE_ALIGNMENT_VALUES.map(value=>({title:labels[value],checked:settings.alignment===value,action:run(()=>write_reading_image_setting('alignment',value))}))},
    {title:workspace_text('image_layout_natural'),checked:settings.size_mode==='natural'&&settings.scale===100,action:run(()=>write_reading_image_setting('scale',100))},
    {title:workspace_text('image_layout_fit'),checked:settings.size_mode==='fit_width',action:run(()=>write_reading_image_setting('size_mode','fit_width'))}
  ],'workspace-menu-compact');
}

/** Contribute to the native menu without replacing its image commands or document selection. */
export function bind_reading_image_menu(core:graph_core){
  const context=(window as any).File?.editor?.contextMenu,menu=document.querySelector("#context-menu");
  if(!context?.show||!menu)return {dispose(){}};
  const item=el("li","hide"),anchor=el("a","",workspace_text("image_layout_menu"));
  item.dataset.key="typora-code-image-alignment";anchor.tabIndex=0;anchor.setAttribute("role","menuitem");item.append(anchor);
  menu.insertBefore(item,menu.querySelector('[data-key="zoom-img"]'));
  const interaction=acquire_workspace_interaction(item),events=new AbortController(),original=context.show;
  let disposed=false,target:HTMLImageElement|undefined,close_menu:(()=>void)|undefined;
  const show=context.show=function(event:MouseEvent,node?:Element){
    if(disposed)return original.call(this,event,node);
    const source=node||(event.target instanceof Element?event.target:undefined);
    target=source?.closest("#write")?(source.closest("img")||source.closest(".md-image")?.querySelector("img")) as HTMLImageElement|undefined:undefined;
    item.classList.toggle("hide",!target);return original.call(this,event,node);
  };
  const open=()=>{
    if(disposed||!target?.isConnected)return;
    const box=anchor.getBoundingClientRect();
    context.hide();close_menu?.();
    close_menu=open_image_layout_menu(target,new MouseEvent("contextmenu",{clientX:box.left,clientY:box.top}));
  };
  for(const name of ["pointerdown","mousedown","mouseup","click","keydown"])document.addEventListener(name,event=>{
    if(!(event.target instanceof Node)||!item.contains(event.target))return;
    if(event instanceof KeyboardEvent&&!["Enter"," "].includes(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();if(name==="click"||(event instanceof KeyboardEvent&&!event.repeat))open();
  },{capture:true,signal:events.signal});
  return {dispose(){if(disposed)return;disposed=true;events.abort();close_menu?.();if(context.show===show)context.show=original;item.remove();interaction.remove();}};
}
