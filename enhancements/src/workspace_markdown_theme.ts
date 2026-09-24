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
  const inherited='#write{'+properties.map(name=>name+':'+computed.getPropertyValue(name)+';').join('')+'}\n';
  if(users&&cached_rules!==undefined)return inherited+cached_rules;
  const rules:string[]=[];
  for(const sheet of [...document.styleSheets]){
    if(sheet.disabled)continue;
    try{
      const text=[...sheet.cssRules].map(rule=>{
        // 根主题变体只带入变量，避免:root默认值在Shadow内遮住html.dark等条件覆盖。
        if(rule instanceof CSSStyleRule&&/^(?:html|body)(?:[.#:\[]|$)/u.test(rule.selectorText)){
          const variables=[...rule.style].filter(name=>name.startsWith('--')).map(name=>name+':'+rule.style.getPropertyValue(name)+(rule.style.getPropertyPriority(name)?' !important':'')+';').join('');
          if(variables&&rule.selectorText.split(',').every(selector=>/^(?:html|body)(?:[.#][\w-]+)*$/u.test(selector.trim())))return rule.selectorText.split(',').map(selector=>':host-context('+selector.trim()+')').join(',')+'{'+variables+'}';
        }
        return rule.cssText;
      }).filter(rule=>rule.includes('#write')||rule.startsWith(':root')||rule.startsWith(':host-context(')||rule.startsWith('@font-face')||/^(?:h[1-6]|p|a|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|pre|code|strong|em|img|hr)(?:[\s.,:#\[]|\s*\{)/u.test(rule)).join('\n');
      if(text){const adapted=text.replace(/:root(\[data-workspace-colors(?:=[^\]]+)?\])/gu,':host-context(html$1)').replace(/:root\b/gu,':host').replace(/\b((?:body|html)(?:\.[\w-]+)*)\s+(?=#write)/gu,':host-context($1) ');rules.push(sheet.media.mediaText?'@media '+sheet.media.mediaText+'{'+adapted+'}':adapted);}
    }catch{/* 外部样式不可读时由只读视图的基本样式接续。 */}
  }
  const text=rules.join('\n');if(users)cached_rules=text;return inherited+text;
}
