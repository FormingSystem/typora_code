import {adaptive_text_color,text_color_prefix} from "./markdown_text_color";
import {observe_workspace_theme,workspace_surface_background} from "./workspace_theme";
/** 只给阅读容器提供 CSS 变量；正文行内样式与 Markdown 不随主题重写。 */
export function bind_markdown_color_theme(){
  let frame=0,disposed=false;const owned=new Map<HTMLElement,Map<string,{previous:string;value:string;priority:string}>>();
  const release=(root:HTMLElement,key:string,entry:{previous:string;value:string;priority:string})=>{if(root.style.getPropertyValue(key)===entry.value){if(entry.previous)root.style.setProperty(key,entry.previous,entry.priority);else root.style.removeProperty(key);}};
  const refresh=()=>{
    if(disposed)return;const roots=new Map<HTMLElement,Set<string>>();
    for(const span of document.querySelectorAll<HTMLElement>('span[style*="--typora-code-color-"]')){
      if(span.closest(".CodeMirror,.monaco-editor,.xterm"))continue;
      const root=span.closest<HTMLElement>('#write,[data-workspace-color-preview]');
      if(!root)continue;
      const match=/^var\(--typora-code-color-([a-f0-9]{6}),\s*#[a-f0-9]{6}\)$/u.exec(span.style.color);if(!match)continue;
      if(!roots.has(root))roots.set(root,new Set());roots.get(root)!.add(match[1]);
    }
    for(const [root,entries]of owned){const active=roots.get(root);for(const [key,entry]of entries)if(!active?.has(key.slice(text_color_prefix.length))){release(root,key,entry);entries.delete(key);}if(!entries.size)owned.delete(root);}
    for(const [root,colors]of roots){const background=workspace_surface_background(root);let entries=owned.get(root);if(!entries){entries=new Map();owned.set(root,entries);}for(const color of colors){const key=text_color_prefix+color,value=adaptive_text_color(color,background);let entry=entries.get(key);if(!entry){entry={previous:root.style.getPropertyValue(key),priority:root.style.getPropertyPriority(key),value};entries.set(key,entry);}if(root.style.getPropertyValue(key)!==value)root.style.setProperty(key,value);entry.value=value;}}
  };
  const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(()=>{frame=0;refresh();});};
  // 终端输出、Git 列表等无关 DOM 变化不能触发正文扫描；属性仅关注颜色及阅读背景。
  const selector='#write,[data-workspace-color-preview]';
  const observer=new MutationObserver(records=>{
    if(records.some(record=>{
      const target=record.target instanceof Element?record.target:record.target.parentElement;
      if(target?.closest(selector))return true;
      return [...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&(node.matches(selector)||node.querySelector(selector)));
    }))schedule();
  });observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["style"]});
  const release_theme=observe_workspace_theme(schedule);schedule();
  return {refresh,dispose(){disposed=true;observer.disconnect();release_theme();cancelAnimationFrame(frame);for(const [root,entries]of owned)for(const [key,entry]of entries)release(root,key,entry);owned.clear();}};
}
