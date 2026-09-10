/** 所有对象拖动共用一次指针会话；跨 core / workbench bundle 仍只允许一个活动会话。 */
export type pointer_drag_state = {
  event: PointerEvent; client_x: number; client_y: number; screen_x: number; screen_y: number;
  delta_x: number; delta_y: number; target: Element | null;
};
export type pointer_drag_options = {
  source: HTMLElement; threshold?: number; preview?: boolean; cursor?: string;
  on_start?(state: pointer_drag_state): void;
  on_move(state: pointer_drag_state): void;
  on_drop(state: pointer_drag_state): void;
  on_cancel?(reason: string): void;
  on_end?(started: boolean): void;
};
export type pointer_drag_session = {cancel(reason?: string): void; set_drop_effect(effect: 'move' | 'none' | 'detach'): void; readonly started: boolean};
const session_key = Symbol.for('typora-code:pointer-drag');
type drag_window = Window & {[session_key]?: pointer_drag_session};

export function cancel_pointer_drag(view: Window, reason = 'cancelled'): void {
  (view as drag_window)[session_key]?.cancel(reason);
}

/** 克隆的是当前控件的真实图标和文字，不制造文件类型图标或改写源节点。 */
function create_preview(source: HTMLElement): HTMLElement {
  const doc = source.ownerDocument, view = doc.defaultView!;
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  for (let index = 0; index < copies.length; index++) {
    const node = copies[index], original = originals[index], style = view.getComputedStyle(original);
    node.removeAttribute('id'); node.removeAttribute('title'); node.removeAttribute('tabindex');
    node.removeAttribute('draggable'); node.setAttribute('aria-hidden', 'true');
    for (const name of node.getAttributeNames()) if (name.startsWith('data-')) node.removeAttribute(name);
    for (const name of ['font','color','fill','background-color','border-color','border-width','border-style','border-radius','padding','gap','display','align-items','justify-content','line-height','white-space','text-overflow','overflow','width','height','box-sizing','flex','min-width','max-width']) {
      node.style.setProperty(name, style.getPropertyValue(name));
    }
  }
  const box = source.getBoundingClientRect();
  let background='var(--bg-color, white)';
  for(let node:HTMLElement|null=source;node;node=node.parentElement){const color=view.getComputedStyle(node).backgroundColor;if(color!=='transparent'&&color!=='rgba(0, 0, 0, 0)'){background=color;break;}}
  Object.assign(clone.style, {position:'fixed',left:'0',top:'0',width:box.width+'px',height:box.height+'px',margin:'0',pointerEvents:'none',zIndex:'2147483646',backgroundColor:background,opacity:'.95',transition:'none',animation:'none',transform:'none',boxShadow:'0 2px 8px rgba(0,0,0,.2)'});
  clone.dataset.workspaceDragPreview = 'true'; doc.body.append(clone); return clone;
}

export function start_pointer_drag(event: PointerEvent, options: pointer_drag_options): pointer_drag_session | undefined {
  if (event.button !== 0 || event.isPrimary === false || !options.source.isConnected) return;
  const source = options.source, doc = source.ownerDocument, view = doc.defaultView as drag_window;
  cancel_pointer_drag(view, 'replaced');
  const start_x = event.clientX, start_y = event.clientY, pointer_id = event.pointerId;
  const origin = source.getBoundingClientRect(), previous_cursor = doc.documentElement.style.cursor, previous_select = doc.documentElement.style.userSelect, previous_opacity = source.style.opacity;
  let started = false, ended = false, preview: HTMLElement | undefined, drop_hint: HTMLElement | undefined;
  const events = new AbortController();
  const observer = new MutationObserver(() => {if(!source.isConnected)cancel('source-removed');});
  const point = (input: PointerEvent): pointer_drag_state => ({event:input,client_x:input.clientX,client_y:input.clientY,screen_x:input.screenX,screen_y:input.screenY,delta_x:input.clientX-start_x,delta_y:input.clientY-start_y,target:doc.elementFromPoint(input.clientX,input.clientY)});
  const cleanup = () => {
    ended = true; events.abort(); observer.disconnect(); preview?.remove(); source.removeAttribute('data-workspace-drag-source');
    if (started) {doc.documentElement.style.cursor=previous_cursor;doc.documentElement.style.userSelect=previous_select;source.style.opacity=previous_opacity;}
    if (source.hasPointerCapture?.(pointer_id)) source.releasePointerCapture(pointer_id);
    if (view[session_key] === session) delete view[session_key];
    options.on_end?.(started);
  };
  const suppress_click = (released: boolean) => {
    // Esc 可发生在按住左键期间，必须等这次释放后的 click，不能在一个定时器回合后放行。
    const suppression = new AbortController();
    const clear = () => suppression.abort();
    doc.addEventListener('click',input=>{input.preventDefault();input.stopImmediatePropagation();clear();},{capture:true,signal:suppression.signal});
    doc.addEventListener('pointerup',input=>{if(input.pointerId===pointer_id)view.setTimeout(clear,0);},{capture:true,signal:suppression.signal});
    doc.addEventListener('pointerdown',clear,{capture:true,once:true,signal:suppression.signal});
    view.addEventListener('pagehide',clear,{once:true,signal:suppression.signal});
    if(released)view.setTimeout(clear,0);
  };
  const cancel = (reason = 'cancelled') => {if(ended)return;try{if(started){suppress_click(false);options.on_cancel?.(reason);}}finally{cleanup();}};
  const session: pointer_drag_session = {cancel,get started(){return started;},set_drop_effect(effect){
    if(!started||ended)return;
    doc.documentElement.style.cursor=effect==='none'?'not-allowed':options.cursor||'grabbing';
    if(preview){
      preview.dataset.workspaceDropEffect=effect;
      if(effect==='detach'&&!drop_hint){drop_hint=doc.createElement('span');drop_hint.textContent='移到新窗口';Object.assign(drop_hint.style,{position:'absolute',top:'100%',left:'0',padding:'3px 6px',font:'12px system-ui',whiteSpace:'nowrap',background:'var(--bg-color, white)',color:'var(--text-color, #333)',border:'1px solid var(--vscode-focusBorder, #0078d4)',borderRadius:'3px'});preview.append(drop_hint);preview.style.overflow='visible';}
      if(drop_hint)drop_hint.hidden=effect!=='detach';
    }
  }};
  view[session_key] = session;
  const move = (input: PointerEvent) => {
    if (ended || input.pointerId !== pointer_id) return;
    if (!source.isConnected) {cancel('source-removed');return;}
    if (!(input.buttons & 1)) {cancel('button-lost');return;}
    const state = point(input);
    if (!started) {
      if (Math.hypot(state.delta_x,state.delta_y)<(options.threshold??6)) return;
      started=true;doc.documentElement.style.cursor=options.cursor||'grabbing';doc.documentElement.style.userSelect='none';
      try {
        if(options.preview!==false)preview=create_preview(source);
        source.dataset.workspaceDragSource='true';source.style.opacity='.45';
        try {source.setPointerCapture(pointer_id);} catch { /* document 监听仍保证同窗清理，宿主可能不支持捕获。 */ }
        observer.observe(doc.documentElement,{childList:true,subtree:true});
        options.on_start?.(state);
      } catch(error){cancel('error');throw error;}
    }
    if(ended)return;
    input.preventDefault();input.stopPropagation();
    if(preview)preview.style.transform=`translate3d(${origin.left+state.delta_x}px,${origin.top+state.delta_y}px,0)`;
    try{options.on_move(state);}catch(error){cancel('error');throw error;}
  };
  const up = (input: PointerEvent) => {
    if(ended||input.pointerId!==pointer_id||input.button!==0)return;
    if(started){input.preventDefault();input.stopPropagation();suppress_click(true);}
    try{if(started&&source.isConnected)options.on_drop(point(input));else if(started)options.on_cancel?.('source-removed');}finally{cleanup();}
  };
  doc.addEventListener('pointermove',move,{capture:true,signal:events.signal});
  doc.addEventListener('pointerup',up,{capture:true,signal:events.signal});
  doc.addEventListener('pointercancel',input=>{if(input.pointerId===pointer_id)cancel('pointer-cancel');},{capture:true,signal:events.signal});
  source.addEventListener('lostpointercapture',()=>cancel('capture-lost'),{signal:events.signal});
  doc.addEventListener('keydown',input=>{if(input.key==='Escape'){input.preventDefault();input.stopImmediatePropagation();cancel('escape');}},{capture:true,signal:events.signal});
  doc.addEventListener('dragstart',input=>{input.preventDefault();input.stopImmediatePropagation();},{capture:true,signal:events.signal});
  view.addEventListener('blur',()=>cancel('window-blur'),{signal:events.signal});
  view.addEventListener('pagehide',()=>cancel('pagehide'),{signal:events.signal});
  event.preventDefault();event.stopPropagation();
  return session;
}

/** 落点线不接收指针，真实命中始终来自下方控件。 */
type marker_rect = {left:number;top:number;width:number;height:number};
export function create_drop_marker(doc: Document): {show(rect: marker_rect): void; highlight(rect: marker_rect): void; hide(): void; dispose(): void} {
  const marker=doc.createElement('div');marker.dataset.workspaceDropMarker='true';
  Object.assign(marker.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483645',background:'var(--vscode-focusBorder, var(--primary-color, #0078d4))'});
  const place=(rect:marker_rect)=>{if(!marker.isConnected)doc.body.append(marker);Object.assign(marker.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',display:'block'});};
  return {show(rect){place(rect);Object.assign(marker.style,{background:'var(--vscode-focusBorder, var(--primary-color, #0078d4))',border:'none'});},highlight(rect){place(rect);Object.assign(marker.style,{boxSizing:'border-box',background:'color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent)',border:'1px solid var(--vscode-focusBorder, #0078d4)'});},hide(){marker.style.display='none';},dispose(){marker.remove();}};
}
