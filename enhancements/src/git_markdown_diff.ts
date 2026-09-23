import {marked,type TokensList} from 'marked';
import DOMPurify from 'dompurify';
import {markdown_theme_rules,observe_markdown_theme} from './workspace_markdown_theme';
import {create_preview_diagrams,highlight_preview_code} from './workspace_markdown_preview_render';
import {git_yield} from './git_status_snapshot';
import {create_markdown_overview} from './git_markdown_overview';
import type {git_diff_line_change} from './git_diff_ranges';
import css from './git_markdown_diff_shadow.css';

type markdown_block={raw:string;html:string;start:number;end:number};
type markdown_pair={left:markdown_block[];right:markdown_block[];changed:boolean};
const normalize=(value:string)=>value.replace(/\r\n?/gu,'\n').replace(/^( *)(\t+)/gmu,(_,leading:string,tabs:string)=>leading+'    '.repeat(tabs.length));
const escape=(value:string)=>value.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;');
async function blocks(source:string,current:()=>boolean):Promise<markdown_block[]>{
  const text=normalize(source),front=text.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/u)?.[0]||'';
  const tokens=marked.lexer(text.slice(front.length),{gfm:true});
  if(tokens.length>10000)throw Error('Markdown块超过10000项，请使用源码差异查看。');
  const result:markdown_block[]=[];let offset=0,line=1;
  if(front)tokens.unshift({type:'code',raw:front,text:front,lang:'yaml'});
  const renderer=new marked.Renderer();renderer.image=token=>`<span class="markdown-diff-attachment">${escape(token.text||'图片')} [${escape(token.href)}]</span>`;
  for(const token of tokens){
    if(!current())return [];
    const found=text.indexOf(token.raw,offset),start=found<0?offset:found;
    const gap=text.slice(offset,start);
    if(gap.trim())result.push({raw:gap,html:'<pre><code>'+escape(gap)+'</code></pre>',start:line,end:line+gap.replace(/\n$/u,'').split('\n').length-1});
    line+=gap.split('\n').length-1;
    const end=line+token.raw.replace(/\n$/u,'').split('\n').length-1;
    const single=Object.assign([token],{links:tokens.links}) as TokensList;
    let html=DOMPurify.sanitize(marked.parser(single,{gfm:true,renderer}),{FORBID_TAGS:['style','iframe','object','embed','form','img','audio','video','source','svg','math'],FORBID_ATTR:['style','id','name','contenteditable','autofocus'],ALLOW_DATA_ATTR:false});
    if(!html.trim()&&token.raw.trim())html='<pre><code>'+escape(token.raw)+'</code></pre>';
    if(token.raw.trim())result.push({raw:token.raw,html,start:line,end});
    line+=token.raw.split('\n').length-1;offset=start+token.raw.length;
    if(result.length%32===0)await git_yield();
  }
  const tail=text.slice(offset);
  if(tail.trim())result.push({raw:tail,html:'<pre><code>'+escape(tail)+'</code></pre>',start:line,end:line+tail.replace(/\n$/u,'').split('\n').length-1});
  return result;
}
/** 完整未改块是对齐锚点；跨列表/表格的差异按整块保留排版。 */
function pair_blocks(left:markdown_block[],right:markdown_block[],changes:readonly git_diff_line_change[]):markdown_pair[]{
  const pairs:markdown_pair[]=[],by_line=new Map(right.map((block,index)=>[block.start,index]));let a=0,b=0,change_index=0,delta=0;
  for(let i=0;i<left.length;i++){
    const block=left[i];
    while(change_index<changes.length){const c=changes[change_index],end=c.originalEndLineNumber||c.originalStartLineNumber;if(end>=block.start)break;delta+=(c.modifiedEndLineNumber?c.modifiedEndLineNumber-c.modifiedStartLineNumber+1:0)-(c.originalEndLineNumber?c.originalEndLineNumber-c.originalStartLineNumber+1:0);change_index++;}
    const c=changes[change_index];
    if(c&&(c.originalEndLineNumber?c.originalStartLineNumber<=block.end:c.originalStartLineNumber<block.end))continue;
    const j=by_line.get(block.start+delta);
    if(j===undefined||j<b||right[j].html!==block.html)continue;
    if(i>a||j>b)pairs.push({left:left.slice(a,i),right:right.slice(b,j),changed:true});
    pairs.push({left:[block],right:[right[j]],changed:false});a=i+1;b=j+1;
  }
  if(a<left.length||b<right.length)pairs.push({left:left.slice(a),right:right.slice(b),changed:true});
  return pairs;
}

export function create_git_markdown_diff(){
  const container=document.createElement('section');container.className='git-markdown-diff';container.setAttribute('aria-label','Markdown渲染差异，只读');
  // 滚动宿主留在light DOM，复用工作台滚动条绘制与显隐；只有正文进入Shadow。
  const scroll=document.createElement('div');scroll.className='git-markdown-diff-scroll';container.append(scroll);
  const shadow=scroll.attachShadow({mode:'open'}),style=document.createElement('style'),reader=document.createElement('article');
  scroll.tabIndex=0;reader.id='write';shadow.append(style,reader);
  const overview=create_markdown_overview(scroll,reader);container.append(overview.container);
  let generation=0,disposed=false,active=-1;let changed:HTMLElement[]=[];const diagrams=create_preview_diagrams();
  const theme=()=>{const content=markdown_theme_rules()+'\n'+css;const changed=style.textContent!==content;if(changed)style.textContent=content;const color=getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number)||[0,0,0],mode=color[0]+color[1]+color[2]>450?'dark':'light';if(container.dataset.theme!==mode){container.dataset.theme=mode;scroll.dataset.theme=mode;}if(changed)overview.refresh();};
  const observer=observe_markdown_theme(theme);theme();
  const navigate=(direction:'previous'|'next')=>{if(!changed.length)return;active=(active+(direction==='next'?1:-1)+changed.length)%changed.length;const target=changed[active];scroll.scrollTop=target.offsetTop-reader.offsetTop;target.focus({preventScroll:true});};
  shadow.addEventListener('click',event=>{if((event.target as Element).closest('a,input'))event.preventDefault();});
  return {container,shadow,scroll,navigate,theme,
    async render(left:string,right:string,changes:readonly git_diff_line_change[],labels:[string,string]):Promise<void>{
      const request=++generation,current=()=>!disposed&&generation===request;
      container.dataset.ready='false';
      if(new TextEncoder().encode(left).length+new TextEncoder().encode(right).length>1024*1024)throw Error('Markdown渲染比较超过1MiB，请使用源码差异查看。');
      const [old_blocks,new_blocks]=await Promise.all([blocks(left,current),blocks(right,current)]);if(!current())return;
      const pairs=pair_blocks(old_blocks,new_blocks,changes),fragment=document.createDocumentFragment(),targets:HTMLElement[]=[],code_tasks:HTMLElement[]=[];
      const head=document.createElement('div');head.className='markdown-diff-row markdown-diff-head';
      for(const label of labels){const cell=document.createElement('div');cell.className='markdown-diff-cell';cell.textContent=label;cell.title=label;head.append(cell);}fragment.append(head);
      for(let i=0;i<pairs.length;i++){
        if(!current())return;const pair=pairs[i],row=document.createElement('section');row.className='markdown-diff-row';row.dataset.changed=String(pair.changed);row.tabIndex=-1;
        if(pair.changed)targets.push(row);
        for(const side of ['left','right'] as const){const cell=document.createElement('div');cell.className='markdown-diff-cell';cell.dataset.side=side;cell.dataset.empty=String(!pair[side].length);
          if(pair.changed&&pair[side].length){const sign=document.createElement('span');sign.className='markdown-diff-sign';sign.textContent=side==='left'?'− 删除 / 原内容':'+ 新增 / 修改后';cell.append(sign);}
          for(const block of pair[side]){const node=document.createElement('div');node.dataset.sourceLine=String(block.start);node.innerHTML=block.html;
            for(const link of node.querySelectorAll('a')){link.title=link.getAttribute('href')||'';link.removeAttribute('href');link.removeAttribute('target');}
            for(const input of node.querySelectorAll('input'))input.disabled=true;
            code_tasks.push(...node.querySelectorAll<HTMLElement>('pre code'));cell.append(node);
          }row.append(cell);
        }fragment.append(row);if(i%24===23)await git_yield();
      }
      if(!current())return;const top=scroll.scrollTop;reader.replaceChildren(fragment);changed=targets;overview.set_rows(targets);active=-1;scroll.scrollTop=top;container.dataset.ready='true';
      // 高亮和图表在当前文档发布后渐进完成；旧代不能再替换节点。
      for(const code of code_tasks){if(!current())return;if(code.classList.contains('language-mermaid'))await diagrams.render(code,container.clientWidth/2,false,current);else await highlight_preview_code(code);if(!current())return;await git_yield();}
    },
    invalidate(){generation++;container.dataset.ready='false';overview.suspend();},
    dispose(){disposed=true;generation++;observer();overview.dispose();diagrams.dispose();container.remove();}
  };
}
