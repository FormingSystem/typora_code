import type {graph_settings} from "./git_graph_settings";

type column_key = keyof graph_settings["column_widths"];
type column_widths = graph_settings["column_widths"];
type column_entry = {key:column_key;node:HTMLElement;title:string};
const MIN_WIDTH=40,MAX_WIDTH=1500;

/** 边界由两侧共同约束；说明列保持弹性，不能用剩余空间覆盖其最小宽度。 */
export function resize_graph_column_pair(left:column_key,left_width:number,right_width:number,delta:number,widths:column_widths) {
  const minimum=Math.max(MIN_WIDTH-left_width,right_width-MAX_WIDTH);
  const maximum=Math.min(left==='subject'?Infinity:MAX_WIDTH-left_width,right_width-MIN_WIDTH);
  const movement=Math.max(minimum,Math.min(maximum,delta));
  return {left:left==='subject'?Math.min(widths.subject,left_width+movement):left_width+movement,right:right_width-movement,movement,minimum,maximum};
}

/** 只拥有本表头的调整事务；设置、失败反馈与表格数据仍由panel管理。 */
export function bind_git_graph_columns(options:{container:HTMLElement;columns:column_entry[];widths:column_widths;save():void;report(error:unknown):void;label(left:string,right:string):string}) {
  const handles:HTMLElement[]=[];
  let active:{handle:HTMLElement;pointer:number;start:number;left:column_entry;right:column_entry;left_width:number;right_width:number;before:column_widths}|undefined;
  const apply=(left:column_entry,right:column_entry,left_width:number,right_width:number,delta:number,before:column_widths)=>{
    const result=resize_graph_column_pair(left.key,left_width,right_width,delta,before);
    options.widths[left.key]=result.left;options.widths[right.key]=result.right;
    paint();return result;
  };
  const paint=()=>{
    for(const [key,width]of Object.entries(options.widths))options.container.style.setProperty(`--git-${key}-width`,width+'px');
    handles.forEach((handle,index)=>{
      const left=options.columns[index],right=options.columns[index+1],left_width=left.node.getBoundingClientRect().width,right_width=right.node.getBoundingClientRect().width;
      if(left_width<=0||right_width<=0)return;
      const limits=resize_graph_column_pair(left.key,left_width,right_width,0,options.widths);
      handle.setAttribute('aria-valuenow',String(Math.round(left_width)));
      handle.setAttribute('aria-valuemin',String(Math.round(left_width+limits.minimum)));
      handle.setAttribute('aria-valuemax',String(Math.round(left_width+limits.maximum)));
    });
  };
  const restore=(before:column_widths)=>{Object.assign(options.widths,before);paint();};
  const save=(before:column_widths)=>{
    if(Object.keys(before).every(key=>before[key as column_key]===options.widths[key as column_key]))return;
    try{options.save();}catch(error){restore(before);options.report(error);}
  };
  const finish=(commit:boolean)=>{
    const drag=active;if(!drag)return;active=undefined;drag.handle.classList.remove('dragging');
    if(drag.handle.hasPointerCapture(drag.pointer))drag.handle.releasePointerCapture(drag.pointer);
    if(commit)save(drag.before);else restore(drag.before);
  };
  const cancel=()=>finish(false);
  for(let index=0;index<options.columns.length-1;index++){
    const left=options.columns[index],right=options.columns[index+1],handle=document.createElement('span');
    handle.className='git-graph-column-resize';handle.tabIndex=0;handle.dataset.leftColumn=left.key;handle.dataset.rightColumn=right.key;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',options.label(left.title,right.title));
    handle.onpointerdown=event=>{
      if(event.button!==0||active)return;event.preventDefault();event.stopPropagation();
      handle.focus({preventScroll:true});handle.setPointerCapture(event.pointerId);handle.classList.add('dragging');
      active={handle,pointer:event.pointerId,start:event.clientX,left,right,left_width:left.node.getBoundingClientRect().width,right_width:right.node.getBoundingClientRect().width,before:{...options.widths}};
    };
    handle.onpointermove=event=>{
      const drag=active;if(!drag||drag.pointer!==event.pointerId)return;event.preventDefault();
      apply(drag.left,drag.right,drag.left_width,drag.right_width,event.clientX-drag.start,drag.before);
    };
    handle.onpointerup=event=>{if(active?.pointer===event.pointerId)finish(true);};
    handle.onpointercancel=handle.onlostpointercapture=event=>{if(active?.handle===handle&&active.pointer===event.pointerId)cancel();};
    handle.onkeydown=event=>{
      if(event.key==='Escape'&&active){event.preventDefault();event.stopPropagation();cancel();return;}
      if(active||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();const before={...options.widths};
      apply(left,right,left.node.getBoundingClientRect().width,right.node.getBoundingClientRect().width,(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?50:10),before);save(before);
    };
    handle.onfocus=paint;left.node.append(handle);handles.push(handle);
  }
  const resize=()=>{cancel();paint();};
  // 隐藏标签恢复、侧栏调整也会改变表头；不把脱离布局的零值发布为列宽。
  const header=options.columns[0]?.node.parentElement;
  let header_width=header?.getBoundingClientRect().width;
  const observer=new ResizeObserver(()=>{const width=header?.getBoundingClientRect().width;if(width!==header_width){header_width=width;cancel();}paint();});
  if(header)observer.observe(header);
  window.addEventListener('blur',cancel);window.addEventListener('resize',resize);paint();
  return {cancel,dispose(){observer.disconnect();cancel();window.removeEventListener('blur',cancel);window.removeEventListener('resize',resize);for(const handle of handles){handle.onpointerdown=handle.onpointermove=handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=null;handle.onkeydown=null;handle.onfocus=null;handle.remove();}handles.length=0;}};
}
