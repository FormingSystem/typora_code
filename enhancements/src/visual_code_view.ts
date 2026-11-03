import {export_visual_svg} from './visual_code_export';
import {get_workspace_files} from './workspace_files';
import {create_visual_sandbox} from './visual_code_sandbox';
import {interactive_visual,visual_code_format,visual_code_language} from './visual_code_formats';
import {workspace_element as el,workspace_button} from './workspace_widgets';
import {workspace_text} from './workspace_i18n';
import {observe_mermaid_theme} from './reading_mermaid_theme';
import {open_reading_media} from './reading_media_viewer';
import {bind_reading_media_entries} from './reading_media_entry';
import {acquire_workspace_interaction} from './workspace_interaction';
import css from './visual_code_view_shadow.css';

type visual_options={edit_source?:()=>void;media?:ReturnType<typeof bind_reading_media_entries>};
/** Source stays with its owner; controls share the existing outside-document media layer. */
export function create_visual_code_view(format:string,source:string,options:visual_options={}){
 const root=el('div','visual-code-view');root.contentEditable='false';root.dataset.visualFormat=format;root.dataset.workspaceReaderControls='true';const interaction=acquire_workspace_interaction(root);
 const output=el('div','visual-code-output'),error=el('div','visual-code-error');error.setAttribute('role','status');
 const source_view=el('pre');source_view.textContent=source;source_view.hidden=true;
 const style=el('style');style.textContent=css;root.append(style,output,error,source_view);
 const owned_media=options.media?undefined:bind_reading_media_entries(root),media=options.media||owned_media!;
 let sandbox:ReturnType<typeof create_visual_sandbox>|undefined,disposed=false,revision=0,svg='',url='',close:(()=>void)|undefined;
 const show_source=()=>{entry.collapse();if(options.edit_source)options.edit_source();else source_view.hidden=!source_view.hidden;};
 const run=()=>{
  if(disposed)return;entry.collapse();const current=++revision;sandbox?.dispose();svg='';error.textContent='';root.dataset.visualState='loading';launch.hidden=true;entry.button.disabled=true;save.disabled=true;
  sandbox=create_visual_sandbox(output,format,source,value=>{if(disposed||current!==revision)return;if(value.error){sandbox?.dispose();error.textContent=workspace_text('visual_code_failed',{value_0:value.error});if(!options.edit_source)source_view.hidden=false;root.dataset.visualState='error';}if(value.svg)svg=value.svg;if(value.ready)root.dataset.visualState='ready';entry.button.disabled=!svg;save.disabled=!svg;});
  sandbox.frame.style.pointerEvents=interactive_visual(format)?'auto':'none';
 };
 const launch=workspace_button(workspace_text('visual_code_run'),run);launch.hidden=true;root.append(launch);
 const source_button=workspace_button(workspace_text('visual_code_source'),show_source);
 const run_button=workspace_button(workspace_text('visual_code_run'),run);
 const copy=workspace_button(workspace_text('reading_code_copy_copy_code'),()=>{try{const files=get_workspace_files();if(!files)throw Error(workspace_text('typora_enhancements_clipboard_is_not_ready'));files.copy(source);}catch(failure){error.textContent=String(failure);}});
 const enlarge=()=>{void (async()=>{const current=revision;svg=await sandbox?.capture()||'';if(disposed||current!==revision||!svg)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  const image=new Image();image.src=url;image.onload=()=>{if(!disposed&&current===revision)close=open_reading_media({content:image,source:root,width:image.naturalWidth,height:image.naturalHeight,label:format,initial_fit:true});};})();};
 const save=workspace_button(workspace_text('visual_code_export'),()=>{const current=revision;void (async()=>{const snapshot=await sandbox?.capture();if(snapshot&&current===revision&&!disposed)await export_visual_svg(snapshot,()=>!disposed&&current===revision);})().catch(failure=>{error.textContent=workspace_text('visual_code_failed',{value_0:String(failure.message||failure)});});});
 const controls=el('div','reading-image-control-row');for(const button of [source_button,copy,run_button,save])button.classList.add('reading-media-open');controls.append(source_button,copy,run_button,save);save.disabled=true;
 const entry=media.add({source:root,host:root,label:workspace_text('visual_code_enlarge'),controls_label:workspace_text('visual_code_actions'),button_class:'visual-code-enlarge',controls:[controls],open:enlarge});entry.button.disabled=true;
 const activate=(event:MouseEvent)=>{if(!interactive_visual(format)&&options.edit_source&&event.button===0){event.preventDefault();event.stopPropagation();options.edit_source();}};
 root.addEventListener('mousedown',activate);
 const unwatch=observe_mermaid_theme(()=>{if(!interactive_visual(format))run();});
 return {root,start(){if(!interactive_visual(format))run();else{root.dataset.visualState='idle';launch.hidden=false;}},dispose(){if(disposed)return;disposed=true;++revision;unwatch();sandbox?.dispose();entry.dispose();owned_media?.dispose();interaction.remove();root.removeEventListener('mousedown',activate);close?.();if(url)URL.revokeObjectURL(url);style.remove();root.remove();}};
}

/** Each reader owns one media layer for all its diagram views. */
export function create_visual_code_previews(){
 const views=new Set<ReturnType<typeof create_visual_code_view>>();let disposed=false,media:ReturnType<typeof bind_reading_media_entries>|undefined;
 const clear=()=>{for(const view of views)view.dispose();views.clear();media?.dispose();media=undefined;};
 return {async render(code:HTMLElement,_width:number,show_source:boolean,current:()=>boolean){
  const format=visual_code_format(visual_code_language(code));if(!format||disposed||!current())return false;
  const pre=code.closest('pre');if(!pre)return false;
  for(const old of views)if(!old.root.isConnected){old.dispose();views.delete(old);}
  const owner=pre.getRootNode();media??=bind_reading_media_entries(owner instanceof ShadowRoot?owner:document.body);const view=create_visual_code_view(format,code.textContent||'',{media});views.add(view);
  if(show_source)pre.before(view.root);else pre.replaceWith(view.root);view.start();return true;
 },clear,dispose(){disposed=true;clear();}};
}
