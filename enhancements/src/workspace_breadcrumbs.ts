import {is_composing_key} from "./workspace_keyboard";
import css from "./workspace_breadcrumbs.css";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {workspace_element as el,workspace_menu} from "./workspace_widgets";
import {git_icon,type git_icon_name} from "./git_icons";
import {workspace_file_icon,acquire_workspace_file_icons} from "./workspace_file_icons";
import {source_file_path} from "./workspace_file_uri";
import {capture_workspace_focus,type workspace_focus_snapshot} from "./workspace_focus";
import {open_breadcrumb_picker,type breadcrumb_item} from "./workspace_breadcrumbs_picker";
import {read_breadcrumb_settings,observe_breadcrumb_settings,open_breadcrumb_settings,set_breadcrumb_enabled,type breadcrumb_settings} from "./workspace_breadcrumbs_settings";
import {subscribe_document_symbols,document_symbol_chain,type document_symbols} from "./workspace_document_symbols";
import {reading_viewport_bounds} from "./reading_viewport";
import {acquire_reading_blocks,reading_block_snapshot} from "./reading_blocks";
import type {source_symbol} from "./source_symbols";
import type {workspace_file_host} from "./workspace_files";
import type {graph_core} from "./git_graph_host";

type heading=source_symbol&{element?:HTMLElement};
type group_state={group:HTMLElement;bar:HTMLElement;trail:HTMLElement;type:HTMLElement;leaf:any;file:string;model:any;editor:any;symbols?:ReturnType<typeof subscribe_document_symbols>;symbol_state?:document_symbols;listeners:{dispose():void}[];signature:string;interaction:{remove():void};focus?:workspace_focus_snapshot;settings?:breadcrumb_settings;root:string;language:string;headings:heading[];chain:heading[]};
const icons:Record<string,git_icon_name>={string:"symbol-key",function:"symbol-method",method:"symbol-method",class:"symbol-class",struct:"symbol-structure",interface:"symbol-interface",variable:"symbol-variable",constant:"symbol-constant",property:"symbol-property",field:"symbol-field",namespace:"symbol-namespace",enum:"symbol-enum","enum-member":"symbol-enum-member","type-parameter":"symbol-parameter"};
export function breadcrumb_path_items(path:string,root:string,path_api:any){
  const relative=root?path_api.relative(root,path):"..",inside=!!root&&!path_api.isAbsolute(relative)&&relative!==".."&&!relative.startsWith(".."+path_api.sep);
  const base=inside?root:path_api.parse(path).root,parts=(inside?relative:path.slice(base.length)).split(/[\\/]/).filter(Boolean);let current=base;
  const items=parts.map((name:string,index:number)=>{current=path_api.join(current,name);return{label:name,path:current,file:index===parts.length-1};});
  if(!inside&&base)items.unshift({label:base,path:base,file:false});return items;
}
/** 每个编辑组一条导航；源模型和原生标题均沿原所有者读取。 */
export function bind_workspace_breadcrumbs(core:graph_core,files:workspace_file_host,outline?:{current_heading?():HTMLElement|undefined;select_heading?(heading:HTMLElement):void}){
  const style=acquire_workspace_style("typora-code-style:breadcrumbs",css),file_icons=acquire_workspace_file_icons(),groups=new Map<HTMLElement,group_state>();
  let disposed=false,frame=0,picker:ReturnType<typeof open_breadcrumb_picker>|undefined,picker_owner:group_state|undefined;
  const error=(message:string)=>new core.Notice(message,5000);
  const close_picker=(restore=false)=>{const open=picker;picker=undefined;picker_owner=undefined;open?.close(restore);};
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(()=>{frame=0;refresh();});};
  const group_active=(state:group_state)=>state.leaf?.parent?.activeLeaf||state.leaf;
  const valid=(state:group_state,leaf=state.leaf,model=state.model,version=model?.getVersionId())=>!disposed&&state.group.isConnected&&state.leaf===leaf&&group_active(state)===leaf&&(!model||state.model===model&&!model.isDisposed()&&model.getVersionId()===version);
  const file_path=(leaf:any)=>{const path=source_file_path(leaf.state.path)||(!String(leaf.state.path).startsWith("typ://")?leaf.state.path:"");if(path&&files.path_api.isAbsolute(path))return path;const document=leaf.view?.document,editor=leaf.view?.editor,name=editor?.data?.file||document?.options?.file,root=document?.options?.root||leaf.state.git_cwd;if(name&&root)return files.path_api.resolve(root,name);return "";};
  const markdown_trees=new Map<group_state,{root:HTMLElement;lease:ReturnType<typeof acquire_reading_blocks>;revision:unknown;roots:heading[];elements:HTMLElement[];chains:Map<HTMLElement,heading[]>}>();
  const clear_model=(state:group_state)=>{markdown_trees.get(state)?.lease.dispose();markdown_trees.delete(state);state.symbols?.dispose();state.symbols=undefined;state.symbol_state=undefined;for(const listener of state.listeners)listener.dispose();state.listeners=[];};
  const open_items=(state:group_state,anchor:HTMLElement,items:breadcrumb_item[]|Promise<breadcrumb_item[]>,label:string,selected?:string)=>{
    close_picker(false);const leaf=state.leaf,model=state.model,version=model?.getVersionId();picker_owner=state;
    picker=open_breadcrumb_picker(anchor,items,{label,selected,focus:state.focus,valid:()=>valid(state,leaf,model,version),closed:()=>{picker=undefined;picker_owner=undefined;},error});
  };
  const directory_items=async(state:group_state,directory:string,leaf:any):Promise<breadcrumb_item[]>=>{
    const entries=await files.fs.promises.readdir(directory,{withFileTypes:true});
    return entries.filter((entry:any)=>entry.isFile()||entry.isDirectory()||entry.isSymbolicLink()).sort((a:any,b:any)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name,undefined,{numeric:true})).map((entry:any)=>{
      const path=files.path_api.join(directory,entry.name),folder=entry.isDirectory();return{id:path,label:entry.name,title:path,icon:!folder&&state.settings?.icons?()=>workspace_file_icon(path):undefined,children:folder?()=>directory_items(state,path,leaf):undefined,select:folder?undefined:async()=>{if(!valid(state,leaf))return;await files.open_file(path,{preview:true},leaf.parent);}};
    });
  };
  const native_tree=(state:group_state)=>{
    state.chain=[];
    const native=state.leaf.view?.isEditor?.();
    // 原生正文由编辑模式和文件身份拥有；切换另一组焦点不会转移正文。
    const host=(window as any).File,host_file=host?.bundle?.filePath;
    if(native&&(!host_file||host.isFileLoading?.()||files.path_api.relative(state.file,host_file)!==""))return [];
    const container=native?document.querySelector<HTMLElement>("#write"):state.leaf.view?.containerEl as HTMLElement|undefined;
    if(!container||(!native&&!container.matches(".typ-markdown-view")))return [];
    let tree=markdown_trees.get(state);
    if(tree?.root!==container){tree?.lease.dispose();tree={root:container,lease:acquire_reading_blocks(container),revision:undefined,roots:[],elements:[],chains:new Map()};markdown_trees.set(state,tree);}
    const revision=reading_block_snapshot(container).items;
    if(tree.revision!==revision){
      tree.revision=revision;tree.roots=[];tree.chains.clear();
      tree.elements=[...container.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")].filter(node=>!node.closest("pre,code,.workspace-breadcrumbs"));
      const stack:{depth:number;symbol:heading}[]=[];
      for(const [index,element]of tree.elements.entries()){const depth=Number(element.tagName[1]);while(stack.length&&stack.at(-1)!.depth>=depth)stack.pop();const name=element.textContent||"",symbol:heading={name,kind:"string",detail:"#".repeat(depth)+" "+name,start:index,end:tree.elements.length,selection_start:index,selection_end:index,element,children:[]};(stack.at(-1)?.symbol.children||tree.roots).push(symbol);stack.push({depth,symbol});tree.chains.set(element,stack.map(item=>item.symbol));}
    }
    const {elements,roots}=tree;
    const selected=native?outline?.current_heading?.():undefined,scroller=native?document.querySelector<HTMLElement>("content"):state.leaf.containerEl as HTMLElement;
    let current=selected;if(!current&&scroller){const top=reading_viewport_bounds(scroller).top+12;current=elements[0];for(const element of elements){if(element.getBoundingClientRect().top<=top)current=element;else break;}}
    state.chain=current?tree.chains.get(current)||[]:[];return roots;
  };
  const reveal=(state:group_state,symbol:heading)=>{
    if(!valid(state))return;
    core.app.workspace.activeLeaf=state.leaf;
    if(state.model){if(state.symbol_state?.version!==state.model.getVersionId())return;const start=state.model.getPositionAt(symbol.selection_start),end=state.model.getPositionAt(symbol.selection_end),range={startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:end.column};state.editor.setSelection(range);state.editor.revealRangeInCenter(range);state.editor.focus();}
    else if(symbol.element?.isConnected){
      const native=state.leaf.view?.isEditor?.(),scroller=native?document.querySelector<HTMLElement>("content"):state.leaf.containerEl;
      if(scroller){scroller.scrollTop+=symbol.element.getBoundingClientRect().top-reading_viewport_bounds(scroller).top-12;}
      if(native){outline?.select_heading?.(symbol.element);const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(symbol.element);range.collapse(true);selection?.removeAllRanges();selection?.addRange(range);document.querySelector<HTMLElement>("#write")?.focus({preventScroll:true});}
      else {state.leaf.containerEl.tabIndex=-1;state.leaf.containerEl.focus({preventScroll:true});}
    }schedule();
  };
  const symbol_items=(state:group_state,items:heading[]):breadcrumb_item[]=>{
    const settings=state.settings!,kept=items.filter(item=>settings.symbol_kinds[item.kind]!==false);
    if(settings.symbol_sort_order!=="position")kept.sort((a,b)=>(settings.symbol_sort_order==="type"?a.kind.localeCompare(b.kind):0)||a.name.localeCompare(b.name));
    return kept.map(item=>({id:"symbol:"+item.selection_start,label:item.kind==="string"?item.detail:item.name,title:item.detail||item.name,icon:settings.icons?()=>git_icon(icons[item.kind]||"symbol-variable"):undefined,children:item.children.length?symbol_items(state,item.children):undefined,expanded:state.chain.includes(item),select:()=>reveal(state,item)}));
  };
  const render=(state:group_state)=>{
    const settings=state.settings!,paths=breadcrumb_path_items(state.file,state.root,files.path_api),trail=state.trail;
    const shown_paths=settings.file_path==="off"?[]:settings.file_path==="last"?paths.slice(-1):paths;
    const chain=state.chain.filter(item=>settings.symbol_kinds[item.kind]!==false),shown_symbols=settings.symbol_path==="off"?[]:settings.symbol_path==="last"?chain.slice(-1):chain;
    const language=state.language,has_symbols=state.headings.length>0;
    const signature=JSON.stringify([state.file,settings,shown_symbols.map(s=>[s.selection_start,s.name,s.detail]),state.symbol_state?.loading,state.symbol_state?.error,has_symbols,state.leaf.view?.isEditor?.(),state.leaf.view?.editor?.data?.right!=null]);
    if(state.signature===signature)return;state.signature=signature;
    const focused=trail.contains(document.activeElement),focus_index=[...trail.querySelectorAll("button")].indexOf(document.activeElement as HTMLButtonElement);trail.replaceChildren();
    const segment=(label:string,title:string,icon:Element|undefined,open:(button:HTMLElement)=>void)=>{
      if(trail.childElementCount)trail.append(git_icon("chevron-right"));const button=el("button","workspace-breadcrumb-segment");button.type="button";button.title=title;button.setAttribute("aria-haspopup","tree");button.tabIndex=-1;if(icon)button.append(icon);button.append(el("span","",label));button.onmousedown=event=>{if(event.button===0){state.focus=capture_workspace_focus();event.preventDefault();}};button.onclick=()=>{if(picker_owner===state&&button.getAttribute("aria-expanded")==="true")close_picker(true);else open(button);};trail.append(button);
    };
    for(const part of shown_paths)segment(part.label,part.path,settings.icons&&part.file?workspace_file_icon(part.path):undefined,button=>open_items(state,button,directory_items(state,files.path_api.dirname(part.path),state.leaf),"选择文件",part.path));
    for(const symbol of shown_symbols)segment(symbol.kind==="string"?symbol.detail:symbol.name,symbol.detail||symbol.name,settings.icons?git_icon(icons[symbol.kind]||"symbol-variable"):undefined,button=>open_items(state,button,symbol_items(state,state.headings),language==="markdown"?"选择标题":"选择符号","symbol:"+symbol.selection_start));
    if(settings.symbol_path!=="off"&&!shown_symbols.length){const status=state.symbol_state?.loading?"正在读取符号…":state.symbol_state?.error||(!has_symbols?"当前文件没有可显示的符号":"选择标题或符号");segment("…",status,undefined,button=>open_items(state,button,has_symbols?symbol_items(state,state.headings):[{id:"status",label:status}],"选择标题或符号"));}
    const buttons=[...trail.querySelectorAll<HTMLButtonElement>("button")];if(buttons.length){const target=buttons[Math.max(0,Math.min(buttons.length-1,focused?focus_index:buttons.length-1))];target.tabIndex=0;if(focused)target.focus({preventScroll:true});}trail.scrollLeft=trail.scrollWidth;
    state.type.replaceChildren();if(settings.show_editor_type){const diff=state.leaf.view?.editor?.data?.right!=null;
      if(diff){const mode=el("button","","差异编辑器");mode.append(git_icon("chevron-down"));mode.onclick=()=>{const r=mode.getBoundingClientRect(),editor=state.leaf.view.editor;workspace_menu(new MouseEvent("contextmenu",{clientX:r.left,clientY:r.bottom}),[{title:"内联显示",action:()=>editor.set_side_by_side(false)},{title:"并排显示",action:()=>{editor.inline_when_narrow=false;editor.set_side_by_side(true);}}]);};state.type.append(mode);}
      else if(/\.(md|markdown|mdown)$/i.test(state.file)){const mode=el("button","",state.model?"文本编辑器":state.leaf.view?.isEditor?.()?"Markdown 编辑器":"Markdown 预览");mode.append(git_icon("chevron-down"));mode.onclick=()=>{const leaf=state.leaf,r=mode.getBoundingClientRect();workspace_menu(new MouseEvent("contextmenu",{clientX:r.left,clientY:r.bottom}),[{title:"Markdown 编辑器",checked:!state.model,action:()=>{void files.reopen_leaf(leaf,false).catch(e=>error(String(e)));}},{title:"文本编辑器",checked:!!state.model,action:()=>{void files.reopen_leaf(leaf,true).catch(e=>error(String(e)));}}]);};state.type.append(mode);}
    }
  };
  const refresh=()=>{
    if(disposed)return;const active=new Map<HTMLElement,any>();core.app.workspace.eachLeaves((leaf:any)=>{const group=leaf.parent?.containerEl as HTMLElement;if(group?.isConnected&&(leaf.parent.activeLeaf===leaf||!active.has(group)))active.set(group,leaf);});
    for(const [group,leaf]of active){const strip=group.querySelector<HTMLElement>(":scope > .workspace-tab-strip");if(!strip)continue;const file=file_path(leaf);let state=groups.get(group);
      if(!state){const bar=el("nav","workspace-breadcrumbs"),trail=el("div","workspace-breadcrumb-trail"),type=el("div","workspace-breadcrumb-editor-type");bar.setAttribute("aria-label","文件与符号导航");bar.append(trail,type);strip.after(bar);group.classList.add("workspace-breadcrumbs-managed");state={group,bar,trail,type,leaf:null,file:"",model:null,editor:null,listeners:[],signature:"",interaction:acquire_workspace_interaction(bar),root:"",language:"",headings:[],chain:[]};groups.set(group,state);const owner=state;
        bar.oncontextmenu=event=>{event.preventDefault();workspace_menu(event,[{title:"显示面包屑",checked:read_breadcrumb_settings(files.context_root()).enabled,action:()=>{try{set_breadcrumb_enabled(files.context_root(),false);}catch(e){error(String(e));}}},{title:"复制面包屑路径",action:()=>files.copy([...breadcrumb_path_items(owner.file,owner.root,files.path_api).map(item=>item.label),...owner.chain.map(item=>item.name)].join(" > "))},{title:"复制符号路径",disabled:!owner.chain.length,action:()=>files.copy(owner.chain.map(item=>item.name).join(owner.settings?.symbol_path_separator??"."))},{title:"面包屑设置…",action:()=>open_breadcrumb_settings(owner.root,owner.language)}]);};
        bar.onkeydown=event=>{if(event.isComposing)return;const buttons=[...trail.querySelectorAll<HTMLButtonElement>("button")],index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();event.stopPropagation();const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==="ArrowLeft"?-1:1)));for(const b of buttons)b.tabIndex=-1;buttons[next]?.focus({preventScroll:true});if(buttons[next]){buttons[next].tabIndex=0;const r=buttons[next].getBoundingClientRect(),t=trail.getBoundingClientRect();if(r.left<t.left)trail.scrollLeft+=r.left-t.left;else if(r.right>t.right)trail.scrollLeft+=r.right-t.right;}}else if(event.key==="ArrowDown"){event.preventDefault();buttons[index]?.click();}else if(event.key==="Escape"){event.preventDefault();event.stopPropagation();owner.focus?.restore();}};
      }
      const editor=leaf.view?.editor?.focused_editor?.(),model=editor?.getModel(),root=files.context_root();
      if(state.leaf!==leaf||state.model!==model||state.file!==file||state.root!==root){if(picker_owner===state)close_picker(false);clear_model(state);Object.assign(state,{leaf,model,editor,file,root,signature:"",headings:[],chain:[]});
        if(model){state.language=model.getLanguageId();const owner=state;state.symbols=subscribe_document_symbols(model,file,root,result=>{owner.symbol_state=result;owner.language=result.language;if(picker_owner===owner)close_picker(false);schedule();});state.listeners.push(editor.onDidChangeCursorPosition(schedule));}
      }
      state.settings=read_breadcrumb_settings(root,state.language);state.bar.hidden=!file||!state.settings.enabled;if(state.bar.hidden){if(picker_owner===state)close_picker(false);continue;}
      if(model){state.headings=state.symbol_state?.symbols||[];state.chain=document_symbol_chain(state.headings,model.getOffsetAt(editor.getPosition()||{lineNumber:1,column:1}));}
      else {state.language="markdown";state.headings=native_tree(state);}render(state);
    }
    for(const [group,state]of groups)if(!active.has(group)||!group.isConnected){if(picker_owner===state)close_picker(false);clear_model(state);state.interaction.remove();state.bar.remove();group.classList.remove("workspace-breadcrumbs-managed");groups.delete(group);}
  };
  const focus_last=(open=false)=>{const leaf=core.app.workspace.activeLeaf as any,state=leaf&&groups.get(leaf.parent?.containerEl);if(!state)return;if(!state.settings?.enabled){try{set_breadcrumb_enabled(state.root,true);}catch(e){error(String(e));return;}refresh();}state.focus=capture_workspace_focus();const button=state.trail.querySelector<HTMLButtonElement>("button:last-child");button?.focus({preventScroll:true});if(open)button?.click();};
  const key=(event:KeyboardEvent)=>{if(is_composing_key(event))return;if((event.ctrlKey||event.metaKey)&&event.shiftKey&&!event.altKey&&["Period","Semicolon"].includes(event.code)&&!document.querySelector('[aria-modal=true]')){event.preventDefault();event.stopImmediatePropagation();focus_last(event.code==="Period");}};
  const mutation=new MutationObserver(records=>{if(records.some(record=>!(record.target instanceof Element)||!record.target.closest(".workspace-breadcrumbs,.workspace-breadcrumb-picker,.workspace-breadcrumb-settings")))schedule();});mutation.observe(document.body,{childList:true,subtree:true,characterData:true});
  const unsubscribe=core.app.workspace.on("active-leaf:change",schedule),settings=observe_breadcrumb_settings(()=>{close_picker(false);for(const state of groups.values())state.signature="";schedule();});
  const config=core.app.commands.register({id:"linux_note:breadcrumbs_settings",title:"视图：面包屑导航设置",scope:"global",callback:()=>open_breadcrumb_settings(files.context_root(),(core.app.workspace.activeLeaf as any)?.view?.editor?.focused_editor?.()?.getModel()?.getLanguageId()||"markdown")});
  const scroll=(event:Event)=>{const target=event.target;if(target instanceof HTMLElement&&(target.matches('content')||[...groups.values()].some(state=>state.leaf?.containerEl===target)))schedule();};
  window.addEventListener("keydown",key,true);document.addEventListener("focusin",schedule,true);document.addEventListener("selectionchange",schedule);document.addEventListener("scroll",scroll,true);window.addEventListener("linux-note-workspace-context-changed",schedule);refresh();
  return{refresh,dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);close_picker(false);mutation.disconnect();if(typeof unsubscribe==="function")unsubscribe();if(typeof config==="function")config();settings();window.removeEventListener("keydown",key,true);document.removeEventListener("focusin",schedule,true);document.removeEventListener("selectionchange",schedule);document.removeEventListener("scroll",scroll,true);window.removeEventListener("linux-note-workspace-context-changed",schedule);for(const state of groups.values()){clear_model(state);state.interaction.remove();state.bar.remove();state.group.classList.remove("workspace-breadcrumbs-managed");}groups.clear();style.remove();file_icons.remove();}};
}
