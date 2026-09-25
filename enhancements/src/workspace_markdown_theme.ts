import {observe_workspace_theme} from './workspace_theme';
let cached_rules:string|undefined,observer:MutationObserver|undefined,users=0;
const invalidate=()=>{cached_rules=undefined;};
/** 多个预览共用样式提取；宿主状态class变化不重新序列化全部CSS规则。 */
export function observe_markdown_theme(listener:()=>void){
  if(!users++){observer=new MutationObserver(invalidate);observer.observe(document.head,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','media','disabled']});document.head.addEventListener('load',invalidate,true);}
  const unsubscribe=observe_workspace_theme(listener);let disposed=false;
  return ()=>{if(disposed)return;disposed=true;unsubscribe();if(!--users){observer?.disconnect();observer=undefined;document.head.removeEventListener('load',invalidate,true);invalidate();}};
}
/** 只读Markdown复用当前正文主题，规则进入各自Shadow DOM，不重建正文。 */
export function markdown_theme_rules():string {
  if(observer?.takeRecords().length)invalidate();
  // Shadow宿主位于功能区，继承的是界面字体；以真实正文计算值建立阅读继承基线。
  const native=document.querySelector('content > #write')||document.querySelector('#write')||document.body;
  const computed=getComputedStyle(native),properties=['font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing','color','text-align','text-indent','text-transform'];
  // 无单位行高应继续随子元素字号缩放；不能把1.6冻结为正文的25.6px。
  const typed_line_height=(native as any).computedStyleMap?.().get('line-height');
  const inherited='#write{'+properties.map(name=>name+':'+(name==='line-height'&&typed_line_height?.unit==='number'?String(typed_line_height.value):computed.getPropertyValue(name))+';').join('')+'}\n';
  if(users&&cached_rules!==undefined)return inherited+cached_rules;
  const stack=new Set<CSSStyleSheet>();
  const collect=(sheet:CSSStyleSheet):string=>{
    if(sheet.disabled||stack.has(sheet))return '';stack.add(sheet);
    try{
      const text=[...sheet.cssRules].map(rule=>{
        // 按导入出现的位置递归，保留层叠次序及媒体条件，仍逐条筛选正文规则。
        if(rule instanceof CSSImportRule){const imported=rule.styleSheet?collect(rule.styleSheet):'';return imported&&rule.media.mediaText?'@media '+rule.media.mediaText+'{'+imported+'}':imported;}
        let text=rule.cssText;
        if(rule instanceof CSSStyleRule&&/^(?:html|body)(?:[.#:\[]|$)/u.test(rule.selectorText)){
          const variables=[...rule.style].filter(name=>name.startsWith('--')).map(name=>name+':'+rule.style.getPropertyValue(name)+(rule.style.getPropertyPriority(name)?' !important':'')+';').join('');
          if(variables&&rule.selectorText.split(',').every(selector=>/^(?:html|body)(?:[.#][\w-]+)*$/u.test(selector.trim())))text=rule.selectorText.split(',').map(selector=>':host-context('+selector.trim()+')').join(',')+'{'+variables+'}';
        }
        if(!(text.includes('#write')||text.startsWith(':root')||text.startsWith(':host-context(')||text.startsWith('@font-face')||/^\.(?:md-fences|cm-s-inner|CodeMirror)(?:[\s.,:#\[]|\s*\{)/u.test(text)||/^(?:h[1-6]|p|a|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|pre|code|strong|em|img|hr)(?:[\s.,:#\[]|\s*\{)/u.test(text)))return '';
        // 导入基础主题的字体资源相对于原CSS，不能相对于宿主HTML重新解释。
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
