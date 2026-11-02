import {marked as base_marked,Marked,type MarkedOptions,type Token,type TokensList} from 'marked';
import marked_katex from 'marked-katex-extension';
import katex from 'katex';
import {read_visual_asset} from './visual_code_sandbox';

const escape=(text:string)=>text.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');
const extension=marked_katex({throwOnError:false,trust:false});
for(const item of extension.extensions||[]){
 if('renderer' in item)item.renderer=(token:any)=>token.displayMode?`<div class="visual-math-block">${escape(token.text)}</div>`:`<span class="visual-math-inline">${escape(token.text)}</span>`;
}
/** Keep math placeholders inert through Markdown sanitation; KaTeX owns final typesetting. */
const parser=new Marked(extension);
export const visual_marked={Renderer:base_marked.Renderer,
 lexer:(source:string,options?:MarkedOptions)=>parser.lexer(source,{...parser.defaults,...options}),
 parser:(tokens:Token[]|TokensList,options?:MarkedOptions)=>parser.parser(tokens,{...parser.defaults,...options}),
 parse:(source:string)=>parser.parse(source)};
export async function render_visual_math(root:HTMLElement,current:()=>boolean){
 const nodes=[...root.querySelectorAll<HTMLElement>('.visual-math-block,.visual-math-inline')];if(!nodes.length)return;
 const css=await read_visual_asset('math.css');if(!current()||!root.isConnected)return;
 let style=root.querySelector<HTMLStyleElement>('style.visual-math-style');
 if(!style){style=document.createElement('style');style.className='visual-math-style';style.textContent=css;root.prepend(style);}
 for(const node of nodes){if(node.dataset.visualMath==='ready')continue;katex.render(node.textContent||'',node,{displayMode:node.classList.contains('visual-math-block'),throwOnError:false,trust:false});node.dataset.visualMath='ready';}
}
