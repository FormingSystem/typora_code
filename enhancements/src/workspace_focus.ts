/** 临时界面共用焦点快照；原生编辑器只在本文档、编辑组仍有效时恢复选区。 */
export type workspace_focus_snapshot={restore():void};
export type workspace_escape_layer={dispose():void;is_top():boolean;owns_focus():boolean};
const active_element=():Element|null=>{let node=document.activeElement;while(node?.shadowRoot?.activeElement)node=node.shadowRoot.activeElement;return node;};
const parent_element=(node:Element):Element|null=>node.parentElement||(node.getRootNode() instanceof ShadowRoot?(node.getRootNode() as ShadowRoot).host:null);
const within=(root:Element,node:Element|null):boolean=>{for(let current=node;current;current=parent_element(current))if(root===current)return true;return false;};
const visible=(node:Element)=>node.isConnected&&node.getClientRects().length>0&&!node.closest('[hidden],[inert]')&&getComputedStyle(node).visibility==='visible';
type native_file={bundle?:object;isFileLoading?():boolean;editor?:{sourceView?:{inSourceMode:boolean};selection?:{getRangy():{select():void}|null}}};
const file_state=()=> (window as unknown as {File?:native_file}).File;
const workspace_state=()=> (window as unknown as {[key:symbol]:{app?:{workspace?:{activeLeaf?:unknown;activeFile?:unknown}}}})[Symbol.for('typora-code:workspace')]?.app?.workspace;
export function capture_workspace_focus(fallback?:HTMLElement):workspace_focus_snapshot{
  const current=active_element(),selection=window.getSelection(),write=document.querySelector<HTMLElement>('#write');
  const native_owner=!!write&&(current===document.body||current===document.documentElement||!!current&&within(write,current))&&!!selection?.anchorNode&&write.contains(selection.anchorNode);
  const previous=(native_owner?write:current instanceof HTMLElement&&current!==document.body&&current!==document.documentElement?current:fallback)||null;
  const input=previous instanceof HTMLInputElement||previous instanceof HTMLTextAreaElement?previous:undefined;
  const input_selection=input&&input.selectionStart!==null?{start:input.selectionStart,end:input.selectionEnd!,direction:input.selectionDirection!,value:input.value}:undefined;
  const dom_selection=!input&&selection?.anchorNode&&selection.focusNode?{anchor:selection.anchorNode,anchor_offset:selection.anchorOffset,focus:selection.focusNode,focus_offset:selection.focusOffset,anchor_text:selection.anchorNode.textContent,focus_text:selection.focusNode.textContent}:undefined;
  const file=file_state(),bundle=file?.bundle,workspace=workspace_state(),leaf=workspace?.activeLeaf,active_file=workspace?.activeFile;
  let rangy:{select():void}|null|undefined;
  if(native_owner&&!file?.isFileLoading?.()&&!file?.editor?.sourceView?.inSourceMode){try{rangy=file?.editor?.selection?.getRangy();}catch{/* 宿主暂未准备好时仅使用有效DOM选区。 */}}
  const scroll:{node:Element;top:number;left:number}[]=[];
  for(let node:Element|null=previous;node;node=parent_element(node))if(node.scrollHeight>node.clientHeight||node.scrollWidth>node.clientWidth)scroll.push({node,top:node.scrollTop,left:node.scrollLeft});
  return {restore(){
    if(!previous||!visible(previous)||previous.matches(':disabled'))return;
    const now=workspace_state();if(now?.activeLeaf!==leaf||now?.activeFile!==active_file)return;
    if(native_owner&&(file_state()!==file||file_state()?.bundle!==bundle||file?.isFileLoading?.()||file?.editor?.sourceView?.inSourceMode))return;
    previous.focus({preventScroll:true});
    if(input&&input_selection&&input.value===input_selection.value)input.setSelectionRange(input_selection.start,input_selection.end,input_selection.direction);
    else if(rangy){try{rangy.select();}catch{/* 不在失效的宿主选区上猜测新位置。 */}}
    else if(dom_selection&&dom_selection.anchor.isConnected&&dom_selection.focus.isConnected&&dom_selection.anchor.textContent===dom_selection.anchor_text&&dom_selection.focus.textContent===dom_selection.focus_text){
      try{window.getSelection()?.setBaseAndExtent(dom_selection.anchor,dom_selection.anchor_offset,dom_selection.focus,dom_selection.focus_offset);}catch{/* 节点变化时保留当前光标。 */}
    }
    for(const item of scroll)if(item.node.isConnected){item.node.scrollTop=item.top;item.node.scrollLeft=item.left;}
  }};
}

type escape_record={roots:()=>Element[];cancel:()=>void};
type escape_service={add(record:escape_record):workspace_escape_layer};
const service_key=Symbol.for('typora-code:workspace-escape');
/** 核心包和工作台包共享窗口级退出栈，每次按下/释放只归最上层所有者。 */
export function register_workspace_escape(roots:()=>Element[],cancel:()=>void):workspace_escape_layer{
  const runtime=window as unknown as {[key:symbol]:escape_service|undefined};
  if(!runtime[service_key]){
    const stack:escape_record[]=[];let pending:escape_record|undefined,listening=false;
    const top=()=>stack.findLast(record=>record.roots().some(visible));
    const consume=(event:KeyboardEvent)=>{event.preventDefault();event.stopImmediatePropagation();};
    const cleanup=()=>{if(!stack.length&&!pending&&listening){listening=false;window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',blur);}};
    const keydown=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.isComposing||event.keyCode===229)return;
      if(pending){consume(event);return;}
      const owner=top();if(!owner)return;consume(event);if(!event.repeat)pending=owner;
    };
    const keyup=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||!pending)return;
      const owner=pending;pending=undefined;consume(event);
      if(!event.isComposing&&top()===owner&&stack.includes(owner))owner.cancel();cleanup();
    };
    const blur=()=>{pending=undefined;cleanup();};
    runtime[service_key]={add(record){
      stack.push(record);if(!listening){listening=true;window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);window.addEventListener('blur',blur);}
      return {is_top:()=>top()===record,owns_focus:()=>top()===record&&(active_element()===document.body||record.roots().some(root=>within(root,active_element()))),dispose(){const index=stack.indexOf(record);if(index!==-1)stack.splice(index,1);cleanup();}};
    }};
  }
  return runtime[service_key]!.add({roots,cancel});
}
