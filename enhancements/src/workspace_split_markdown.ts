import {markdown_scoped_theme_rules,observe_markdown_theme} from './workspace_markdown_theme';
import {highlight_preview_code,create_preview_diagrams} from './workspace_markdown_preview_render';
import {bind_reading_images} from './reading_image_viewer';
import {bind_reading_code_copy} from './reading_code_copy';
import type {workspace_file_host} from './workspace_files';

/** Inactive split panes share reading services and release them with each render generation. */
export function bind_workspace_split_markdown(files:workspace_file_host){
  const style=document.createElement('style');style.setAttribute('data-markdown-reader-style','split');document.head.append(style);
  const update_theme=()=>{const text=markdown_scoped_theme_rules('.typ-markdown-preview');if(style.textContent!==text)style.textContent=text;};
  const release_theme=observe_markdown_theme(update_theme);update_theme();
  let next_reader=0;
  const sessions=new Map<HTMLElement,()=>void>();
  const bind=(root:HTMLElement,signal?:AbortSignal)=>{
    sessions.get(root)?.();
    const reader=String(++next_reader);root.dataset.splitReader=reader;
    const images=bind_reading_images(root,'[data-split-reader="'+reader+'"] img'),copy=bind_reading_code_copy(root,text=>files.copy(text)),diagrams=create_preview_diagrams();
    let disposed=false;
    const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);const code=entry.target as HTMLElement;if(code.classList.contains('language-mermaid'))void diagrams.render(code,root.clientWidth,false,()=>!disposed);else void highlight_preview_code(code).catch(()=>{});}}, {root:root.parentElement});
    for(const code of root.querySelectorAll<HTMLElement>('pre > code'))observer.observe(code);
    const dispose=()=>{if(disposed)return;disposed=true;observer.disconnect();images.dispose();copy.dispose();diagrams.dispose();signal?.removeEventListener('abort',dispose);if(root.dataset.splitReader===reader)delete root.dataset.splitReader;sessions.delete(root);};
    sessions.set(root,dispose);signal?.addEventListener('abort',dispose,{once:true});
  };
  const rendered=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.root instanceof HTMLElement)bind(detail.root,detail.signal);};
  document.addEventListener('typora-code:markdown-pane-rendered',rendered);
  for(const root of document.querySelectorAll<HTMLElement>('.typ-markdown-preview'))bind(root);
  const removed=new MutationObserver(()=>{for(const [root,dispose] of sessions)if(!root.isConnected||!root.matches('.typ-markdown-preview'))dispose();});removed.observe(document.body,{subtree:true,childList:true});
  return {dispose(){removed.disconnect();document.removeEventListener('typora-code:markdown-pane-rendered',rendered);for(const dispose of [...sessions.values()])dispose();release_theme();style.remove();}};
}
