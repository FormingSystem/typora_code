import {workspace_text} from "./workspace_i18n";
import {terminal_theme} from './terminal_theme';
import {load_code_themes,initial_code_stack,workspace_code_theme} from './reading_code_theme';
import {WORKSPACE_COLOR_ROLES,type workspace_color_role} from './workspace_color_catalog';
import {color_config_css,empty_color_config,official_code_role,type color_mode} from './workspace_color_settings';

export function css_color_hex(value:string):string{
 if(/^#[\da-f]{3,8}$/iu.test(value))return value.toUpperCase();
 const channels=value.match(/[\d.]+/gu)?.map(Number);if(!/^rgba?\(/u.test(value)||!channels||channels.length<3)return '';
 return ('#'+channels.slice(0,3).map(n=>Math.round(n).toString(16).padStart(2,'0')).join('')+(channels[3]!==undefined&&channels[3]<1?Math.round(channels[3]*255).toString(16).padStart(2,'0'):'')).toUpperCase();
}
/** Templates are isolated from the main document content; only copy styles, not the host script, document content, or editor. */
export function create_color_preview(host:HTMLElement,on_select:(key:string)=>void){
 const frame=document.createElement('iframe');frame.className='workspace-color-preview';frame.title=workspace_text("color_preview_color_effect_preview_click_the_area_to_locate_the_color_item");frame.setAttribute('sandbox','allow-same-origin');host.append(frame);
 let disposed=false,request=0,doc:Document|undefined;
 const load=async(mode:color_mode,colors:Record<string,string>)=>{
  const revision=++request;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(disposed||revision!==request)return null;doc=frame.contentDocument!;doc.open();doc.write('<!doctype html><html><head></head><body></body></html>');doc.close();
  const current=doc,root=current.documentElement;root.dataset.workspaceColors=mode;root.dataset.workspaceCodeTheme=mode;
  const base=current.createElement('base');base.href=document.baseURI;current.head.append(base);
  const loads:Promise<void>[]=[];
  for(const source of document.head.querySelectorAll('style,link[rel=stylesheet],link#theme_css')){
   if(source.id==='typora-code-custom-colors')continue;
   if(source instanceof HTMLLinkElement&&!source.sheet&&!['theme_css','base_user_css','theme_user_css'].includes(source.id))continue;
   const clone=source.cloneNode(true) as HTMLElement;
   if(clone instanceof HTMLLinkElement){
    clone.href=(source as HTMLLinkElement).href;clone.rel='stylesheet';
    if(source.id==='theme_css')clone.href=clone.href.replace(/[^/\\]+(?:[?#].*)?$/u,`vscode2026_${mode}.css`);
    if(source.id==='theme_user_css')clone.href=clone.href.replace(/[^/\\]+(?:[?#].*)?$/u,`vscode2026_${mode}.user.css`);
    loads.push(new Promise((resolve,reject)=>{clone.onload=()=>resolve();clone.onerror=()=>['base_user_css','theme_user_css'].includes(source.id)?resolve():reject(Error(workspace_text("color_preview_theme_style_preview_loading_failed")+clone.href));}));
   }
   current.head.append(clone);
  }
  const layout=current.createElement('style');layout.textContent='html,body{height:auto!important;min-height:100%;overflow:auto!important}body{margin:0!important;padding:12px!important}#write{position:static!important;margin:0!important;padding:16px!important;max-width:none!important;width:auto!important;min-height:0!important;transform:none!important}#write h1{margin-top:0}#write table{display:table;width:100%}.color-role-samples{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;padding-top:12px}.color-role-sample{display:block;border:1px solid #80808066;border-radius:4px;padding:8px;cursor:pointer;font:12px/1.5 sans-serif}.color-role-sample i{display:inline-block;width:24px;height:16px;vertical-align:middle;margin-right:6px;border:1px solid #888} [data-color-target]{cursor:pointer}[data-color-highlight]{outline:2px solid var(--vscode-focusBorder)!important;outline-offset:2px}';current.head.append(layout);
  const custom=current.createElement('style');custom.id='color-preview-overrides';current.head.append(custom);
  current.body.innerHTML=workspace_text("color_preview_main_id_write_h1_data_color_target_markdown_heading_heading");
  current.addEventListener('click',event=>{const target=(event.target as Element).closest<HTMLElement>('[data-color-target]');if(target){event.preventDefault();on_select(target.dataset.colorTarget!);}});
  await Promise.all(loads);if(disposed||revision!==request)return null;
  root.dataset.workspaceCodeTheme=workspace_code_theme(current);
  const code_theme=await load_code_themes();if(disposed||revision!==request)return null;const code_style=current.createElement('style');code_style.textContent=code_theme.css;current.head.append(code_style);
  const code=current.querySelector('pre code')!;code.replaceChildren();const text='p = rcu_dereference(table[id]);';for(const token of code_theme.c.tokenizeLine(text,initial_code_stack()).tokens){const span=current.createElement('span');span.className=token.style;span.textContent=text.slice(token.startIndex,token.endIndex);code.append(span);}
  const fallback=current.createElement('pre');for(const [key,label]of Object.entries({comment:workspace_text("color_preview_comment"),keyword:'const',string:workspace_text("color_preview_string"),number:'42',type:'int',variable:'value',property:'field',operator:'=',def:'function()',atom:'true',meta:'#define',builtin:'sizeof',tag:'tag'})){const span=current.createElement('span');span.className='cm-'+key;span.textContent=label+' ';fallback.append(span);}current.getElementById('write')!.append(fallback);
  const defaults=read_colors();update(colors);return defaults;
 };
 const read_color=(role:workspace_color_role)=>{
  if(!doc)return '';const view=frame.contentWindow!;
  if(role.selector){const selector=role.selector.replace(/:is\([^)]*\)/gu,'').replace(/:(?:visited|hover|focus|active)/gu,'');const node=doc.querySelector(selector);if(node)return css_color_hex(view.getComputedStyle(node).getPropertyValue(role.property||'color'));}
  if(role.key.startsWith('terminal_')){const key=role.key.slice(9).replace(/_([a-z])/gu,(_,letter:string)=>letter.toUpperCase());const value=(terminal_theme(doc) as Record<string,string>)[key];if(value)return css_color_hex(value);}
  if(role.key.startsWith('markdown_selection_')){const style=view.getComputedStyle(doc.getElementById('write')!,'::selection');return css_color_hex(style.getPropertyValue(role.key.endsWith('background')?'background-color':'color'));}
  if(role.variable){const resolved=css_color_hex(view.getComputedStyle(doc.documentElement).getPropertyValue(role.variable).trim());if(resolved)return resolved;const probe=doc.createElement('span');probe.style.color=`var(${role.variable})`;doc.body.append(probe);const raw=view.getComputedStyle(doc.documentElement).getPropertyValue(role.variable).trim();const result=raw?css_color_hex(view.getComputedStyle(probe).color):'';probe.remove();return result;}
  return '';
 };
 const read_colors=()=>Object.fromEntries(WORKSPACE_COLOR_ROLES.map(role=>[role.key,read_color(role)]));
 const update=(colors:Record<string,string>)=>{
  if(!doc||disposed)return;const config=empty_color_config();config.themes[doc.documentElement.dataset.workspaceColors as color_mode]=colors;doc.getElementById('color-preview-overrides')!.textContent=color_config_css(config);
  const values=read_colors(),samples=doc.querySelector('.color-role-samples')!,fragment=doc.createDocumentFragment();
  for(const role of WORKSPACE_COLOR_ROLES){const sample=doc.createElement('div');sample.className='color-role-sample';sample.dataset.colorTarget=role.key;sample.tabIndex=0;sample.setAttribute('role','button');const swatch=doc.createElement('i'),value=values[role.key];swatch.style.backgroundColor=value||'transparent';sample.append(swatch,role.title+' '+(value||workspace_text("color_preview_undefined"))+(official_code_role(role.key)?' · VS Code':''));sample.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();on_select(role.key);}});fragment.append(sample);}
  samples.replaceChildren(fragment);
 };
 const highlight=(key:string)=>{if(!doc)return;doc.querySelectorAll('[data-color-highlight]').forEach(node=>node.removeAttribute('data-color-highlight'));const node=doc.querySelector<HTMLElement>(`[data-color-target="${key}"]`);node?.setAttribute('data-color-highlight','');node?.scrollIntoView({block:'nearest'});};
 return{load,update,highlight,read_colors,dispose(){disposed=true;request++;frame.remove();doc=undefined;}};
}
