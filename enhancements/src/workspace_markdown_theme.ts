/** 只读Markdown复用当前正文主题，规则进入各自Shadow DOM，不重建正文。 */
export function markdown_theme_rules():string {
  const rules:string[]=[];
  for(const sheet of [...document.styleSheets]){
    try{
      const text=[...sheet.cssRules].map(rule=>rule.cssText).filter(rule=>rule.includes('#write')||rule.startsWith(':root')||/^(?:h[1-6]|p|a|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|pre|code|strong|em|img|hr)(?:[\s.,:#\[]|\s*\{)/u.test(rule)).join('\n');
      if(text)rules.push(text.replace(/\b((?:body|html)(?:\.[\w-]+)*)\s+(?=#write)/gu,':host-context($1) '));
    }catch{/* 外部样式不可读时由只读视图的基本样式接续。 */}
  }
  return rules.join('\n');
}
