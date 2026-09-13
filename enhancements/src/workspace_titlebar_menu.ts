import {capture_workspace_focus,register_workspace_dismissal,type workspace_focus_snapshot,type workspace_dismiss_layer} from "./workspace_focus";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {git_icon} from "./git_icons";

export type titlebar_menu_entry={label?:string;shortcut?:string;title?:string;separator?:boolean;checked?:boolean;disabled?:boolean;children?:titlebar_menu_entry[];action?:()=>unknown};
export type titlebar_menu_definition={label:string;mnemonic:string;entries():Promise<titlebar_menu_entry[]>};

/** 菜单从标题栏下方展开，超长内容只滚动自身，原生编辑选择保持到命令执行。 */
export function create_workspace_titlebar_menu(bar:HTMLElement,definitions:titlebar_menu_definition[]){
  const element=document.createElement("nav");element.className="workspace-titlebar-menu";element.setAttribute("role","menubar");element.setAttribute("aria-label","主菜单");
  const events=new AbortController(),signal=events.signal;
  const panels:HTMLElement[]=[];
  const panel_events=new Map<HTMLElement,AbortController>();
  let last_width=-1;
  let active_index=-1,generation=0,disposed=false;
  let previous_focus:workspace_focus_snapshot|undefined,escape_layer:workspace_dismiss_layer|undefined;
  const parents=new Map<HTMLElement,HTMLElement>();
  const save_focus=()=>{previous_focus=capture_workspace_focus();};
  const close_after=(depth:number)=>{for(const panel of panels.splice(depth)){panel_events.get(panel)?.abort();panel_events.delete(panel);parents.delete(panel);panel.remove();}};
  const close=(restore=false)=>{const owned=escape_layer?.owns_focus();escape_layer?.dispose();escape_layer=undefined;generation++;close_after(0);active_index=-1;for(const button of buttons)button.setAttribute("aria-expanded","false");more.setAttribute("aria-expanded","false");if(restore&&owned)previous_focus?.restore();};
  const actionable=(panel:HTMLElement)=>[...panel.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled)")];
  const focus_item=(panel:HTMLElement,index:number)=>{const items=actionable(panel);if(!items.length)return;const item=items[(index+items.length)%items.length];item.focus({preventScroll:true});item.scrollIntoView({block:"nearest"});};
  const show_panel=(entries:titlebar_menu_entry[],anchor:HTMLElement,depth:number,focus=false)=>{
    close_after(depth);
    const panel=document.createElement("div");panel.className="workspace-titlebar-popup";panel.setAttribute("data-workspace-surface","");panel.setAttribute("role","menu");panel.setAttribute("aria-label",anchor.getAttribute("aria-label")||anchor.textContent||"菜单");
    const panel_controller=new AbortController(),signal=panel_controller.signal;panel_events.set(panel,panel_controller);
    const top_limit=bar.getBoundingClientRect().bottom;
    const rect=anchor.getBoundingClientRect();
    panel.style.maxWidth=Math.max(0,innerWidth-8)+"px";
    panel.style.maxHeight=Math.max(10,innerHeight-top_limit-35)+"px";
    panel.style.visibility="hidden";document.body.append(panel);panels.push(panel);parents.set(panel,anchor);
    escape_layer??=register_workspace_dismissal(()=>panels,reason=>{if(reason!=="escape"){close();return;}if(panels.length>1){const parent=parents.get(panels.at(-1)!);close_after(panels.length-1);parent?.focus({preventScroll:true});}else close(true);},{inside:()=>[element,...panels],window_blur:true});
    for(const entry of entries){
      if(entry.separator){const line=document.createElement("div");line.className="workspace-titlebar-separator";line.setAttribute("role","separator");panel.append(line);continue;}
      const item=document.createElement("button");item.type="button";item.className="workspace-titlebar-entry";item.disabled=Boolean(entry.disabled);item.title=entry.title||"";
      item.setAttribute("role",entry.checked!==undefined?"menuitemcheckbox":"menuitem");if(entry.checked!==undefined)item.setAttribute("aria-checked",String(entry.checked));
      const check=document.createElement("span");check.className="workspace-titlebar-check";if(entry.checked)check.append(git_icon("check"));
      const label=document.createElement("span");label.className="workspace-titlebar-label";label.textContent=entry.label||"";item.append(check,label);
      if(entry.shortcut){const shortcut=document.createElement("span");shortcut.className="workspace-titlebar-shortcut";shortcut.textContent=entry.shortcut;item.append(shortcut);}
      if(entry.children){item.setAttribute("aria-haspopup","menu");item.append(git_icon("chevron-right"));}
      const activate=(keyboard=false)=>{
        if(item.disabled||!panel.isConnected||panels[depth]!==panel)return;
        if(entry.children){show_panel(entry.children,item,depth+1,keyboard);return;}
        close(true);try{Promise.resolve(entry.action?.()).catch(error=>console.error("Typora Code menu action:",error));}catch(error){console.error("Typora Code menu action:",error);}
      };
      item.addEventListener("mousedown",event=>event.preventDefault(),{signal});
      item.addEventListener("click",()=>activate(),{signal});
      item.addEventListener("mouseenter",()=>{if(item.disabled)return;item.focus({preventScroll:true});if(entry.children)show_panel(entry.children,item,depth+1);else close_after(depth+1);},{signal});
      item.addEventListener("keydown",event=>{if(event.key==="ArrowRight"&&entry.children){event.preventDefault();event.stopPropagation();activate(true);}},{signal});
      panel.append(item);
    }
    const size=panel.getBoundingClientRect();
    const left=depth===0?rect.left:(rect.right+size.width<=innerWidth-4?rect.right:rect.left-size.width);
    const top=depth===0?top_limit:Math.max(top_limit,Math.min(rect.top,innerHeight-size.height-4));
    panel.style.left=Math.max(4,Math.min(left,innerWidth-size.width-4))+"px";panel.style.top=top+"px";panel.style.visibility="";
    panel.addEventListener("wheel",event=>{
      // Shift+滚轮在部分平台变成 deltaX；这里仍沿长菜单纵向移动。
      event.preventDefault();event.stopPropagation();const delta=event.shiftKey?(event.deltaY||event.deltaX):event.deltaY;
      panel.scrollTop+=delta*(event.deltaMode===1?24:event.deltaMode===2?panel.clientHeight:1);close_after(depth+1);
    },{passive:false,signal});
    panel.addEventListener("scroll",()=>close_after(depth+1),{signal});
    panel.addEventListener("keydown",event=>{
      const items=actionable(panel),index=items.indexOf(document.activeElement as HTMLButtonElement);
      if(["ArrowDown","ArrowUp","Home","End","PageDown","PageUp"].includes(event.key)){
        event.preventDefault();event.stopPropagation();close_after(depth+1);
        const count=Math.max(1,Math.floor(panel.clientHeight/24));focus_item(panel,event.key==="Home"?0:event.key==="End"?items.length-1:index+(event.key==="ArrowDown"?1:event.key==="ArrowUp"?-1:event.key==="PageDown"?count:-count));
      }else if(event.key==="ArrowLeft"&&depth>0){
        event.preventDefault();event.stopPropagation();if(depth){close_after(depth);anchor.focus({preventScroll:true});}else close(true);
      }else if((event.key==="ArrowLeft"||event.key==="ArrowRight")&&depth===0){event.preventDefault();event.stopPropagation();void open_menu((active_index+(event.key==="ArrowLeft"?-1:1)+definitions.length)%definitions.length,true);}
      else if(event.key==="Tab"){event.preventDefault();event.stopPropagation();close(true);}
    },{signal});
    if(focus)focus_item(panel,0);
  };
  const open_menu=async(index:number,focus=false)=>{
    if(disposed)return;if(active_index===-1)save_focus();
    close();active_index=index;const request=generation;
    const button=buttons[index];button.setAttribute("aria-expanded","true");
    let entries:titlebar_menu_entry[];
    try{entries=await definitions[index].entries();}catch(error){console.error("Typora Code menu:",error);entries=[{label:"菜单暂不可用",disabled:true}];}
    if(disposed||generation!==request)return;
    const anchor=button.hidden?more:button;anchor.setAttribute("aria-expanded","true");show_panel(entries,anchor,0,focus);
  };
  const buttons=definitions.map((definition,index)=>{
    const button=document.createElement("button");button.type="button";button.dataset.workspaceInteraction="menu";button.textContent=definition.label;button.setAttribute("role","menuitem");button.setAttribute("aria-haspopup","menu");button.setAttribute("aria-expanded","false");
    button.addEventListener("mousedown",event=>event.preventDefault(),{signal});
    button.addEventListener("click",()=>{if(active_index===index)close(true);else void open_menu(index);},{signal});
    button.addEventListener("mouseenter",()=>{if(active_index!==-1&&active_index!==index)void open_menu(index);},{signal});
    button.addEventListener("keydown",event=>{if(["ArrowDown","Enter"," "].includes(event.key)){event.preventDefault();event.stopPropagation();void open_menu(index,true);}},{signal});
    element.append(button);return button;
  });
  const more=document.createElement("button");more.type="button";more.dataset.workspaceInteraction="menu";more.hidden=true;more.append(git_icon("more"));more.setAttribute("aria-label","更多菜单");more.setAttribute("aria-haspopup","menu");more.setAttribute("aria-expanded","false");element.append(more);
  more.addEventListener("mousedown",event=>event.preventDefault(),{signal});
  more.addEventListener("click",async()=>{
    if(more.getAttribute("aria-expanded")==="true"){close(true);return;}
    if(active_index===-1)save_focus();close();active_index=definitions.length;const request=generation;more.setAttribute("aria-expanded","true");
    const entries=await Promise.all(definitions.map(async(definition,index)=>{
      if(!buttons[index].hidden)return undefined;
      try{return{label:definition.label,children:await definition.entries()};}catch(error){console.error("Typora Code menu:",error);return{label:definition.label,children:[{label:"菜单暂不可用",disabled:true}]};}
    }));
    if(!disposed&&request===generation)show_panel(entries.filter(Boolean) as titlebar_menu_entry[],more,0,true);
  },{signal});
  const refresh=()=>{
    if(disposed)return;const width=element.clientWidth;if(width===last_width)return;last_width=width;
    close();for(const button of buttons)button.hidden=false;more.hidden=false;
    let used=more.getBoundingClientRect().width;const available=element.clientWidth;
    const widths=buttons.map(button=>button.getBoundingClientRect().width);
    if(widths.reduce((sum,width)=>sum+width,0)<=available){more.hidden=true;return;}
    let overflow=false;buttons.forEach((button,index)=>{used+=widths[index];if(used>available)overflow=true;button.hidden=overflow;});
  };
  const interaction=acquire_workspace_interaction(element);
  const observer=new ResizeObserver(refresh);observer.observe(element);
  window.addEventListener("keydown",event=>{
    if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.isComposing){const index=definitions.findIndex(definition=>definition.mnemonic.toLowerCase()===event.key.toLowerCase());if(index!==-1){event.preventDefault();event.stopImmediatePropagation();void open_menu(index,true);}}
    if(active_index!==-1&&(!(event.target instanceof Node)||!panels.some(panel=>panel.contains(event.target as Node)))){
      if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)&&panels[0]){event.preventDefault();event.stopImmediatePropagation();focus_item(panels[0],event.key==="ArrowUp"||event.key==="End"?-1:0);}
    }
  },{capture:true,signal});
  window.addEventListener("workspace-titlebar-dismiss",()=>close(true),{signal});
  window.addEventListener("resize",refresh,{signal});
  return {element,refresh,dispose(){if(disposed)return;disposed=true;close();observer.disconnect();events.abort();interaction.remove();element.remove();}};
}
