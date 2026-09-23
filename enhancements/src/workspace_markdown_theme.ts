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
  if(users&&cached_rules!==undefined)return cached_rules;
  const rules:string[]=[];
  for(const sheet of [...document.styleSheets]){
    try{
      const text=[...sheet.cssRules].map(rule=>rule.cssText).filter(rule=>rule.includes('#write')||rule.startsWith(':root')||/^(?:h[1-6]|p|a|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|pre|code|strong|em|img|hr)(?:[\s.,:#\[]|\s*\{)/u.test(rule)).join('\n');
      if(text)rules.push(text.replace(/\b((?:body|html)(?:\.[\w-]+)*)\s+(?=#write)/gu,':host-context($1) '));
    }catch{/* 外部样式不可读时由只读视图的基本样式接续。 */}
  }
  const text=rules.join('\n');if(users)cached_rules=text;return text;
}
