/** 只拆分可靠的表格行/单元格与平铺列表项，保留渲染器生成的语义结构。 */
export function refine_markdown_change(row:HTMLElement):HTMLElement[]{
  const left=row.children[0] as HTMLElement,right=row.children[1] as HTMLElement;
  const a=left.querySelector(':scope > [data-source-line] > table,:scope > [data-source-line] > ul,:scope > [data-source-line] > ol');
  const b=right.querySelector(':scope > [data-source-line] > table,:scope > [data-source-line] > ul,:scope > [data-source-line] > ol');
  if(!a||!b||a.tagName!==b.tagName||left.querySelectorAll(':scope > [data-source-line]').length!==1||right.querySelectorAll(':scope > [data-source-line]').length!==1)return [row];
  const table=a.tagName==='TABLE';
  if(!table&&(a.querySelector('li ul,li ol')||b.querySelector('li ul,li ol')||a.getAttribute('start')!==b.getAttribute('start')))return [row];
  const aa=[...a.querySelectorAll<HTMLElement>(table?':scope > thead > tr,:scope > tbody > tr':':scope > li')],bb=[...b.querySelectorAll<HTMLElement>(table?':scope > thead > tr,:scope > tbody > tr':':scope > li')];
  const targets:HTMLElement[]=[],paint=(node:HTMLElement,side:string)=>{node.dataset.diffFragment=side;node.tabIndex=-1;targets.push(node);};
  const indexes=new Map<string,{positions:number[];cursor:number}>();
  bb.forEach((node,index)=>{const key=node.innerHTML;const entry=indexes.get(key)||{positions:[],cursor:0};entry.positions.push(index);indexes.set(key,entry);});
  const replacement=(xs:HTMLElement[],ys:HTMLElement[])=>{for(let k=0;k<Math.max(xs.length,ys.length);k++){
    const x=xs[k],y=ys[k];if(table&&x&&y&&x.children.length===y.children.length){for(let c=0;c<x.children.length;c++)if(x.children[c].outerHTML!==y.children[c].outerHTML){paint(x.children[c] as HTMLElement,'left');paint(y.children[c] as HTMLElement,'right');}}
    else{if(x)paint(x,'left');if(y)paint(y,'right');}
  }};
  let ai=0,bi=0;
  for(let i=0;i<aa.length;i++){const entry=indexes.get(aa[i].innerHTML);if(!entry)continue;while(entry.cursor<entry.positions.length&&entry.positions[entry.cursor]<bi)entry.cursor++;const j=entry.positions[entry.cursor];if(j===undefined)continue;replacement(aa.slice(ai,i),bb.slice(bi,j));ai=i+1;bi=j+1;}
  replacement(aa.slice(ai),bb.slice(bi));
  // 容器自身的语义变化不能因可见文字相同而被忽略。
  if(!targets.length)return [row];row.dataset.refined='true';return targets;
}
