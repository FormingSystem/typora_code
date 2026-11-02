import {export_visual_svg} from './visual_code_export';
import {get_workspace_files} from './workspace_files';
import {create_visual_sandbox} from './visual_code_sandbox';
import {interactive_visual,visual_code_format,visual_code_language} from './visual_code_formats';
import {workspace_element as el,workspace_button} from './workspace_widgets';
import {acquire_workspace_interaction} from './workspace_interaction';
import {workspace_text} from './workspace_i18n';
import {observe_mermaid_theme} from './reading_mermaid_theme';
import {open_reading_media} from './reading_media_viewer';
import css from './visual_code_view_shadow.css';

/** A view owns one render generation; source remains owned by the editor/reader. */
export function create_visual_code_view(format:string,source:string,source_action?:()=>boolean){
 const root=el('div','visual-code-view');root.contentEditable='false';root.setAttribute('data-workspace-reader-controls','');
 const toolbar=el('div','visual-code-toolbar'),output=el('div'),error=el('div','visual-code-error');error.setAttribute('role','status');
 const source_view=el('pre');source_view.textContent=source;source_view.hidden=true;
 const interaction=acquire_workspace_interaction(root),style=el('style');style.textContent=css;root.append(style);
 let sandbox:ReturnType<typeof create_visual_sandbox>|undefined,disposed=false,revision=0,svg='',url='',close:(()=>void)|undefined;
 const show_source=()=>{const visible=source_action?source_action():(source_view.hidden=!source_view.hidden,!source_view.hidden);source_button.setAttribute('aria-expanded',String(visible));};
 const run=()=>{
  if(disposed)return;const current=++revision;sandbox?.dispose();svg='';error.textContent='';
  sandbox=create_visual_sandbox(output,format,source,value=>{if(disposed||current!==revision)return;if(value.error){sandbox?.dispose();error.textContent=workspace_text('visual_code_failed',{value_0:value.error});source_view.hidden=false;root.dataset.visualState='error';}if(value.svg)svg=value.svg;if(value.ready)root.dataset.visualState='ready';enlarge.disabled=!svg;save.disabled=!svg;});
 };
 const source_button=workspace_button(workspace_text('visual_code_source'),show_source);
 source_button.setAttribute('aria-expanded',String(Boolean(source_action)));
 const run_button=workspace_button(workspace_text('visual_code_run'),run);
 const copy=workspace_button(workspace_text('reading_code_copy_copy_code'),()=>{try{const files=get_workspace_files();if(!files)throw Error(workspace_text('typora_enhancements_clipboard_is_not_ready'));files.copy(source);}catch(failure){error.textContent=String(failure);}});
 const enlarge=workspace_button(workspace_text('visual_code_enlarge'),()=>{void (async()=>{const current=revision;svg=await sandbox?.capture()||'';if(disposed||current!==revision||!svg)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  const image=new Image();image.src=url;image.onload=()=>{if(!disposed)close=open_reading_media({content:image,source:root,width:image.naturalWidth,height:image.naturalHeight,label:format,initial_fit:true});};})();
 });
 const save=workspace_button(workspace_text('visual_code_export'),()=>{const current=revision;void (async()=>{const snapshot=await sandbox?.capture();if(snapshot&&current===revision&&!disposed)await export_visual_svg(snapshot,()=>!disposed&&current===revision);})().catch(failure=>{error.textContent=workspace_text('visual_code_failed',{value_0:String(failure.message||failure)});});});
 save.disabled=true;enlarge.disabled=true;toolbar.append(source_button,copy,run_button,enlarge,save);root.append(toolbar,output,error,source_view);
 const unwatch=observe_mermaid_theme(()=>{if(!interactive_visual(format))run();});
 return {root,start(){if(interactive_visual(format)){source_view.hidden=false;return;}run();},dispose(){if(disposed)return;disposed=true;++revision;unwatch();sandbox?.dispose();close?.();if(url)URL.revokeObjectURL(url);interaction.remove();style.remove();root.remove();}};
}

/** Shared preview dispatch retains source on failure and releases every mounted renderer. */
export function create_visual_code_previews(){
 const views=new Set<ReturnType<typeof create_visual_code_view>>();let disposed=false;
 const clear=()=>{for(const view of views)view.dispose();views.clear();};
 return {async render(code:HTMLElement,_width:number,show_source:boolean,current:()=>boolean){
  const format=visual_code_format(visual_code_language(code));if(!format||disposed||!current())return false;
  const pre=code.closest('pre');if(!pre)return false;
  for(const old of views)if(!old.root.isConnected){old.dispose();views.delete(old);}
  const view=create_visual_code_view(format,code.textContent||'');views.add(view);
  if(show_source)pre.before(view.root);else pre.replaceWith(view.root);view.start();return true;
 },clear,dispose(){disposed=true;clear();}};
}
