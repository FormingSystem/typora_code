import type {preview_find_target,preview_find_result} from './workspace_preview_find';
import {workspace_text} from './workspace_i18n';

let next_id=0;
/** Paint ranges without rewriting reader text, links, code spans or search decorations. */
export function create_preview_document_find(reader:HTMLElement,scroll:HTMLElement,editor:()=>any,changed:()=>void){
  const name='preview-find-'+ ++next_id,current_name=name+'-current',style=document.createElement('style');
  style.textContent=`::highlight(${name}){background:var(--lookup-match-background,#0069cc40);color:inherit}::highlight(${current_name}){background:var(--lookup-anchor-background,#ea5c0080);color:inherit}`;
  reader.getRootNode().appendChild(style);
  let revision=0,disposed=false,query='',current=-1,ranges:Range[]=[],source_matches:any[]=[],decorations:string[]=[],source_editor:any,notify:((result:preview_find_result)=>void)|undefined;
  const registry=(CSS as any).highlights;
  const paint=()=>{
    registry?.delete(name);registry?.delete(current_name);
    if(source_editor){decorations=source_editor.deltaDecorations(decorations,source_matches.map((match,index)=>({range:match.range,options:{className:index===current?'lookup-anchor-match':'lookup-search-match'}})));return;}
    const highlight_type=(window as any).Highlight;if(!registry||!highlight_type)return;
    const all=new highlight_type();for(const range of ranges)all.add(range);registry.set(name,all);
    if(ranges[current])registry.set(current_name,new highlight_type(ranges[current]));
  };
  const reveal=()=>{
    const total=source_editor?source_matches.length:ranges.length;paint();
    if(source_editor&&source_matches[current])source_editor.revealRangeInCenter(source_matches[current].range);
    else if(ranges[current]){const rect=ranges[current].getBoundingClientRect(),viewport=scroll.getBoundingClientRect();scroll.scrollTop+=rect.top-viewport.top-Math.max(0,(scroll.clientHeight-rect.height)/2);}
    notify?.({current:total?current+1:0,total});
  };
  const clear=()=>{revision++;query='';current=-1;ranges=[];source_matches=[];registry?.delete(name);registry?.delete(current_name);if(source_editor&&!source_editor.getModel()?.isDisposed())source_editor.deltaDecorations(decorations,[]);decorations=[];source_editor=undefined;notify=undefined;observer.disconnect();};
  const observer=new MutationObserver(()=>{if(query&&!disposed){revision++;changed();}});
  const search:preview_find_target['search']=(value,direction,repeat,report)=>{
    if(disposed)return;notify=report;
    const total=source_editor?source_matches.length:ranges.length;
    if(repeat&&query===value&&total){current=(current+direction+total)%total;reveal();return;}
    clear();notify=report;query=value;if(!value){report({current:0,total:0});return;}
    const token=revision;source_editor=editor();
    if(source_editor){source_matches=source_editor.getModel()?.findMatches(value,false,false,false,null,false,Number.MAX_SAFE_INTEGER)||[];current=source_matches.length?0:-1;reveal();return;}
    observer.observe(reader,{subtree:true,childList:true,characterData:true});
    void(async()=>{
      const nodes:{node:Text;start:number;end:number}[]=[],parts:string[]=[];let length=0,last_block:Element|null=null,deadline=performance.now()+8;
      const walker=document.createTreeWalker(reader,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        if(disposed||token!==revision)return;
        const node=walker.currentNode as Text,parent=node.parentElement;
        if(!parent||!node.data||parent.closest('script,style,button,[hidden],svg')||!parent.getClientRects().length)continue;
        const block=parent.closest('p,li,pre,h1,h2,h3,h4,h5,h6,td,th,blockquote');
        if(block!==last_block&&parts.length){parts.push('\n');length++;}last_block=block;
        nodes.push({node,start:length,end:length+node.data.length});parts.push(node.data);length+=node.data.length;
        if(performance.now()>deadline){await new Promise(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}
      }
      const text=parts.join(''),pattern=new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'),'giu');
      const next:Range[]=[];let first=0,last=0;
      for(let match;(match=pattern.exec(text));){
        if(disposed||token!==revision)return;
        const end=match.index+match[0].length;while(first<nodes.length&&nodes[first].end<=match.index)first++;last=Math.max(last,first);while(last<nodes.length&&nodes[last].end<end)last++;
        if(nodes[first]&&nodes[last]){const range=document.createRange();range.setStart(nodes[first].node,match.index-nodes[first].start);range.setEnd(nodes[last].node,end-nodes[last].start);next.push(range);}
        if(performance.now()>deadline){await new Promise(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}
      }
      if(disposed||token!==revision)return;ranges=next;current=ranges.length?0:-1;reveal();
    })().catch(error=>{if(!disposed&&token===revision)report({current:0,total:0,error:workspace_text('preview_find_failed')+String(error)});});
  };
  return {search,clear,focus:()=>scroll.focus({preventScroll:true}),dispose(){clear();disposed=true;style.remove();}};
}
