/** Document content geometry is measured only when layout is invalid; normal scrolling reuses document coordinates, and does not rescan off-screen blocks. */
type block_geometry={node:HTMLElement;bottom:number;top:number};
type block_index=ReturnType<typeof create_block_index>;
const indexes=new WeakMap<HTMLElement,{index:block_index;users:number}>();
function create_block_index(root:HTMLElement){
  let dirty=true,width=-1,height=-1;
  const projections=new Map<string,{items:block_geometry[];ordered:boolean}>();
  let content_revision = {};
  const invalidate=()=>{dirty=true;};
  const content_changed=()=>{content_revision={};invalidate();};
  const mutation=new MutationObserver(content_changed);mutation.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden']});
  const resize=new ResizeObserver(invalidate);resize.observe(root);
  // StyleSheet replacement/font loading does not necessarily modify document nodes.
  const styles=new MutationObserver(invalidate);styles.observe(document.head,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','media','disabled']});
  // Themes can be changed by an ancestor class/style; even if the height of two blocks is swapped and the total height remains unchanged, re-measurement is required.
  styles.observe(document.body,{attributes:true,attributeFilter:['class','style']});styles.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
  document.fonts?.addEventListener('loadingdone',invalidate);
  document.head.addEventListener('load',invalidate,true);
  return {
    revision(){if(mutation.takeRecords().length)content_changed();return content_revision;},
    read(selector=''){
      if(mutation.takeRecords().length)content_changed();
      if(styles.takeRecords().length)dirty=true;
      // Moving positions does not make internal geometry invalid; changes in width/height are handled in a timely manner, and are not asynchronous observers.
      const box=root.getBoundingClientRect();
      if(dirty||width!==box.width||height!==box.height){
        dirty=false;width=box.width;height=box.height;projections.clear();
      }
      let projection=projections.get(selector);
      if(!projection){
        const items:block_geometry[]=[];let ordered=true,previous=-Infinity;
        for(const node of root.children){
          if(!(node instanceof HTMLElement)||node.matches('script,style,button')||(selector&&!node.matches(selector)))continue;
          const rect=node.getBoundingClientRect();if(!rect.height)continue;
          const bottom=rect.bottom-box.top;
          if(bottom<previous)ordered=false;previous=bottom;
          items.push({node,top:rect.top-box.top,bottom});
        }
        projection={items,ordered};projections.set(selector,projection);
      }
      return {...projection,top:box.top};
    },
    invalidate,
    dispose(){mutation.disconnect();resize.disconnect();styles.disconnect();document.fonts?.removeEventListener('loadingdone',invalidate);document.head.removeEventListener('load',invalidate,true);projections.clear();}
  };
}
export function acquire_reading_blocks(root:HTMLElement){
  let entry=indexes.get(root);if(!entry){entry={index:create_block_index(root),users:0};indexes.set(root,entry);}entry.users++;
  let disposed=false;
  return {invalidate:entry.index.invalidate,dispose(){if(disposed)return;disposed=true;if(!--entry.users){entry.index.dispose();indexes.delete(root);}}};
}
export function reading_block_at(root:HTMLElement,target:number){
  const owned=indexes.get(root)?.index,temporary=owned?undefined:create_block_index(root),index=owned||temporary!;
  try{
    const {items,top,ordered}=index.read(),relative=target-top;
    let low=0,high=items.length;
    if(ordered){while(low<high){const mid=(low+high)>>>1;if(items[mid].bottom<=relative)low=mid+1;else high=mid;}}
    else {low=items.findIndex(item=>item.bottom>relative);if(low<0)low=items.length;}
    const at=Math.min(low,items.length-1),item=items[at];
    return item?{node:item.node,index:at,top:item.top+top}:undefined;
  }finally{temporary?.dispose();}
}
export function reading_block_snapshot(root:HTMLElement,selector=''){
  const owned=indexes.get(root)?.index,temporary=owned?undefined:create_block_index(root);
  try{return (owned||temporary!).read(selector);}finally{temporary?.dispose();}
}
/** Content consumers must not measure geometry merely to discover a text/tree revision. */
export function reading_block_revision(root:HTMLElement){
  return indexes.get(root)?.index.revision();
}
