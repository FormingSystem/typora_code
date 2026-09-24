/** 在渲染文本中强调实际改词；有界匹配避免长段落占用UI。原DOM语义和源位置不变。 */
export function highlight_markdown_inline(left: HTMLElement, right: HTMLElement): void {
  if (left.querySelector('pre,svg') || right.querySelector('pre,svg')) return;
  const a = left.textContent || '', b = right.textContent || '';
  if (a === b || a.length + b.length > 100000) return;
  const tokens = (text: string) => [...text.matchAll(/[\p{Script=Han}]|[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu)].map(m => ({text:m[0],start:m.index!,end:m.index!+m[0].length}));
  const aa=tokens(a),bb=tokens(b),same_a=new Set<number>(),same_b=new Set<number>();
  if (aa.length * bb.length <= 250000) {
    const width=bb.length+1, table=new Uint32Array((aa.length+1)*width);
    for(let i=aa.length-1;i>=0;i--)for(let j=bb.length-1;j>=0;j--)table[i*width+j]=aa[i].text===bb[j].text?1+table[(i+1)*width+j+1]:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
    let i=0,j=0;while(i<aa.length&&j<bb.length){if(aa[i].text===bb[j].text){same_a.add(i++);same_b.add(j++);}else if(table[(i+1)*width+j]>=table[i*width+j+1])i++;else j++;}
  } else {
    let i=0;while(i<aa.length&&i<bb.length&&aa[i].text===bb[i].text){same_a.add(i);same_b.add(i++);}
    let x=aa.length-1,y=bb.length-1;while(x>=i&&y>=i&&aa[x].text===bb[y].text){same_a.add(x--);same_b.add(y--);}
  }
  const paint=(root:HTMLElement,parts:ReturnType<typeof tokens>,same:Set<number>,side:string)=>{
    const ranges:{start:number;end:number}[]=[];
    parts.forEach((part,index)=>{if(same.has(index))return;const last=ranges[ranges.length-1];if(last&&last.end===part.start)last.end=part.end;else ranges.push({start:part.start,end:part.end});});
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes:Text[]=[];let item:Node|null;
    while((item=walker.nextNode()))nodes.push(item as Text);
    let offset=0,cursor=0;
    for(const node of nodes){const value=node.data,end=offset+value.length;while(cursor<ranges.length&&ranges[cursor].end<=offset)cursor++;
      let index=cursor,position=0;const fragment=document.createDocumentFragment();
      while(index<ranges.length&&ranges[index].start<end){const start=Math.max(0,ranges[index].start-offset),stop=Math.min(value.length,ranges[index].end-offset);if(start>position)fragment.append(document.createTextNode(value.slice(position,start)));
        const mark=document.createElement('mark');mark.dataset.diffInline=side;mark.textContent=value.slice(start,stop);fragment.append(mark);position=stop;index++;}
      if(position){if(position<value.length)fragment.append(document.createTextNode(value.slice(position)));node.replaceWith(fragment);}offset=end;
    }
  };
  paint(left,aa,same_a,'left');paint(right,bb,same_b,'right');
}
