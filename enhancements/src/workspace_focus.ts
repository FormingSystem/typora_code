/** 临时界面共用焦点快照；原生编辑器只在本文档、编辑组仍有效时恢复选区。 */
export type workspace_focus_snapshot={restore():void};
export type workspace_dismiss_layer={dispose():void;is_top():boolean;owns_focus():boolean};
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


export type workspace_dismiss_reason='escape'|'outside'|'focus-out'|'window-blur';
type dismissal_options={inside?:()=>Element[];outside?:boolean;consume_outside?:boolean;focus_out?:boolean;window_blur?:boolean};
type dismiss_record={roots:()=>Element[];cancel:(reason:workspace_dismiss_reason)=>void;options:dismissal_options;focused:boolean};
type dismiss_service={add(record:dismiss_record):workspace_dismiss_layer};
const service_key=Symbol.for('typora-code:workspace-dismissal');
/** 核心与工作台共用退出栈。一次按键或指针手势只取消当时最上层，不抢外部目标焦点。 */
export function register_workspace_dismissal(roots:()=>Element[],cancel:(reason:workspace_dismiss_reason)=>void,options:dismissal_options={}):workspace_dismiss_layer{
  const runtime=window as unknown as {[key:symbol]:dismiss_service|undefined};
  if(!runtime[service_key]){
    const stack:dismiss_record[]=[];
    let pending:dismiss_record|undefined,listening=false,dismissing=false;
    let gesture:{owner:dismiss_record|undefined;button:number;pointer:boolean;dismissed:boolean;consumed:boolean}|undefined;
    let gesture_timer:number|undefined;
    const top=()=>stack.findLast(record=>record.roots().some(visible));
    const inside=(record:dismiss_record,node:Element|null)=> (record.options.inside?.()||record.roots()).some(root=>within(root,node));
    const consume=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
    const cancel_record=(record:dismiss_record,reason:workspace_dismiss_reason)=>{if(dismissing)return;dismissing=true;try{record.cancel(reason);}finally{dismissing=false;}};
    const handlers:Record<string,EventListener>={keydown:event=>keydown(event as KeyboardEvent),keyup:event=>keyup(event as KeyboardEvent),pointerdown:event=>down(event as MouseEvent,true),mousedown:event=>down(event as MouseEvent,false),pointerup:event=>release(event as MouseEvent),mouseup:event=>release(event as MouseEvent),click:event=>complete(event as MouseEvent),auxclick:event=>complete(event as MouseEvent),contextmenu:event=>swallow(event as MouseEvent),pointercancel:event=>{swallow(event as MouseEvent);finish();},focusin:()=>focus_changed(),focusout:()=>focus_changed(),blur:()=>blur()};
    const cleanup=()=>{if(!stack.length&&!pending&&!gesture&&listening){listening=false;for(const [name,handler]of Object.entries(handlers))window.removeEventListener(name,handler,name!=='blur');}};
    const keydown=(event:KeyboardEvent)=>{
      if(!gesture?.consumed)gesture=undefined;
      if(event.key!=='Escape'||event.isComposing||event.keyCode===229)return;
      if(pending){consume(event);return;}
      const owner=top();if(!owner)return;consume(event);if(!event.repeat)pending=owner;
    };
    const keyup=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||!pending)return;
      const owner=pending;pending=undefined;consume(event);
      if(!event.isComposing&&top()===owner&&stack.includes(owner))cancel_record(owner,'escape');cleanup();
    };
    const down=(event:MouseEvent,pointer:boolean)=>{
      // pointerdown 后紧随的兼容 mousedown 属于同一次手势，不能重新选择背景层。
      if(!pointer&&gesture?.pointer&&gesture.button===event.button){gesture.pointer=false;if(gesture.consumed)consume(event);return;}
      window.clearTimeout(gesture_timer);gesture_timer=undefined;
      const owner=top();gesture={owner,button:event.button,pointer,dismissed:false,consumed:false};
      if(!owner||owner.options.outside===false)return;
      const hit=event.composedPath().some(node=>node instanceof Element&&inside(owner,node));
      if(!hit){gesture.dismissed=true;gesture.consumed=owner.options.consume_outside===true;if(gesture.consumed)consume(event);cancel_record(owner,'outside');}
    };
    // 模态遮罩关闭后，同次释放和 click 仍属于遮罩；不能让新露出的正文收到半次手势。
    // 使用任务尾清理，避免 mouseup 后的微任务早于浏览器紧随的 click。
    const swallow=(event:MouseEvent)=>{if(gesture?.consumed&&gesture.button===event.button)consume(event);};
    const finish=()=>{const current=gesture;window.clearTimeout(gesture_timer);gesture_timer=window.setTimeout(()=>{gesture_timer=undefined;if(gesture===current)gesture=undefined;cleanup();},0);};
    const release=(event:MouseEvent)=>{swallow(event);finish();};
    const complete=(event:MouseEvent)=>{swallow(event);if(gesture?.button===event.button){window.clearTimeout(gesture_timer);gesture_timer=undefined;gesture=undefined;}cleanup();};
    const focus_changed=()=>{
      if(dismissing)return;const owner=top();if(!owner)return;
      if(inside(owner,active_element()))owner.focused=true;
      queueMicrotask(()=>{
        if(dismissing||top()!==owner||!stack.includes(owner)||!owner.focused||owner.options.focus_out===false)return;
        if(gesture&&(gesture.dismissed||gesture.owner!==owner))return;
        // 窗口失焦由独立策略决定，系统颜色选择器不能取消所属设置对话框。
        if(active_element()===document.body||active_element()===document.documentElement||inside(owner,active_element()))return;
        cancel_record(owner,'focus-out');cleanup();
      });
    };
    const blur=()=>{pending=undefined;window.clearTimeout(gesture_timer);gesture_timer=undefined;gesture=undefined;const owner=top();if(owner?.options.window_blur)cancel_record(owner,'window-blur');cleanup();};
    runtime[service_key]={add(record){
      record.focused=inside(record,active_element());stack.push(record);
      if(!listening){listening=true;for(const [name,handler]of Object.entries(handlers))window.addEventListener(name,handler,name!=='blur');}
      return {is_top:()=>top()===record,owns_focus:()=>top()===record&&(active_element()===document.body||record.roots().some(root=>within(root,active_element()))),dispose(){const index=stack.indexOf(record);if(index!==-1)stack.splice(index,1);cleanup();}};
    }};
  }
  return runtime[service_key]!.add({roots,cancel,options,focused:false});
}
