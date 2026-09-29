import {reading_base_font} from './reading_font_zoom';
import {observe_workspace_theme} from './workspace_theme';
let cached_rules:string|undefined,observer:MutationObserver|undefined,users=0;
const invalidate=()=>{cached_rules=undefined;};
/** Multiple previews share the style extraction; host state class changes do not re-serialize all CSS rules. */
export function observe_markdown_theme(listener:()=>void){
  if(!users++){observer=new MutationObserver(invalidate);observer.observe(document.head,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','media','disabled']});document.head.addEventListener('load',invalidate,true);}
  const unsubscribe=observe_workspace_theme(listener);let disposed=false;
  return ()=>{if(disposed)return;disposed=true;unsubscribe();if(!--users){observer?.disconnect();observer=undefined;document.head.removeEventListener('load',invalidate,true);invalidate();}};
}
/** Read-only Markdown reuses the current document theme; the rules enter their respective Shadow DOM, without rebuilding the document. */
export function markdown_theme_rules():string {
  if(observer?.takeRecords().length)invalidate();
  // The Shadow host is located in the functional area, inheriting the interface font; the reading inheritance baseline is established based on the actual document value.
  const native=document.querySelector('content > #write')||document.querySelector('#write')||document.body;
  const base=reading_base_font(native as HTMLElement),computed=getComputedStyle(native),properties=['font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing','color','text-align','text-indent','text-transform'];
  // The unitless line height should continue to scale with the sub-element font size; it cannot freeze the 1.6 as the document's 25.6px.
  const typed_line_height=(native as any).computedStyleMap?.().get('line-height');
  const inherited='#write{'+properties.map(name=>name+':'+(name==='font-size'&&base?base.font+'px':name==='line-height'&&base?base.line:name==='line-height'&&typed_line_height?.unit==='number'?String(typed_line_height.value):computed.getPropertyValue(name))+';').join('')+'}\n';
  if(users&&cached_rules!==undefined)return inherited+cached_rules;
  const stack=new Set<CSSStyleSheet>();
  const collect=(sheet:CSSStyleSheet):string=>{
    if(sheet.disabled||stack.has(sheet))return '';stack.add(sheet);
    try{
      const text=[...sheet.cssRules].map(rule=>{
        // Recursively follow the import position, retain the stacking order and media conditions, and still filter the document rules one by one.
        if(rule instanceof CSSImportRule){const imported=rule.styleSheet?collect(rule.styleSheet):'';return imported&&rule.media.mediaText?'@media '+rule.media.mediaText+'{'+imported+'}':imported;}
        let text=rule.cssText;
        if(rule instanceof CSSStyleRule&&/^(?:html|body)(?:[.#:\[]|$)/u.test(rule.selectorText)){
          const variables=[...rule.style].filter(name=>name.startsWith('--')).map(name=>name+':'+rule.style.getPropertyValue(name)+(rule.style.getPropertyPriority(name)?' !important':'')+';').join('');
          if(variables&&rule.selectorText.split(',').every(selector=>/^(?:html|body)(?:[.#][\w-]+)*$/u.test(selector.trim())))text=rule.selectorText.split(',').map(selector=>':host-context('+selector.trim()+')').join(',')+'{'+variables+'}';
        }
        if(!(text.includes('#write')||text.startsWith(':root')||text.startsWith(':host-context(')||text.startsWith('@font-face')||/^\.(?:md-fences|cm-s-inner|CodeMirror)(?:[\s.,:#\[]|\s*\{)/u.test(text)||/^(?:h[1-6]|p|a|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|pre|code|strong|em|img|hr)(?:[\s.,:#\[]|\s*\{)/u.test(text)))return '';
        // The font resources of the imported base theme are relative to the original CSS, not to the host HTML reinterpreted.
        if(sheet.href)text=text.replace(/url\((['"]?)([^)'"\s]+)\1\)/gu,(_all,_quote,url:string)=>'url('+JSON.stringify(new URL(url,sheet.href!).href)+')');
        return text;
      }).join('\n');
      return text;
    }catch{return '';}
    finally{stack.delete(sheet);}
  };
  const rules=[...document.styleSheets].map(sheet=>{
    const text=collect(sheet),adapted=text.replace(/:root(\[data-workspace-(?:colors|code-theme)(?:=[^\]]+)?\])/gu,':host-context(html$1)').replace(/:root\b/gu,':host').replace(/\b((?:body|html)(?:\.[\w-]+)*)\s+(?=#write)/gu,':host-context($1) ');
    return text&&sheet.media.mediaText?'@media '+sheet.media.mediaText+'{'+adapted+'}':adapted;
  });
  const text=rules.join('\n');if(users)cached_rules=text;return inherited+text;
}
