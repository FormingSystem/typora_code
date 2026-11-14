import {get_workspace_files} from './workspace_files';
import {file_key,resolve_workspace_file} from './workspace_file_uri';
import {observe_workspace_file_saved} from './workspace_file_events';
import {workspace_button,workspace_element as el} from './workspace_widgets';
import {workspace_text} from './workspace_i18n';
import {export_visual_png,export_visual_svg} from './visual_code_export';

/** File identity comes from the resolved image URL, never the active editor path. */
export function linked_svg_path(image:HTMLImageElement):string|undefined{
 const files=get_workspace_files(),url=image.src;
 if(!files||image.srcset||!/^file:/i.test(url))return;
 // Typora appends lastModify to local image URLs; it is not part of file identity.
 const resource=new URL(url);resource.search='';resource.hash='';
 const path=resolve_workspace_file(files.path_api,'',resource.href);
 return path&&/\.svg$/i.test(path)?path:undefined;
}

/** Source editing delegates to the document owner; only displayed bytes are refreshed here. */
export function create_reading_svg_controls(image:HTMLImageElement){
 const row=el('div','reading-image-control-row');let disposed=false,revision=0,object_url='',original='',identity='';
 const source=()=>object_url&&image.src===object_url?identity:linked_svg_path(image);
 const current=(path:string,version:number)=>!disposed&&image.isConnected&&revision===version&&source()===path;
 const fail=(error:unknown)=>{if(disposed)return;const core=(window as any)[Symbol.for('typora-code:workspace')];if(core?.Notice)new core.Notice(String(error instanceof Error?error.message:error),3500);else console.error(error);};
 const run=(action:(path:string,valid:()=>boolean)=>Promise<void>)=>{const path=source(),version=revision;if(path)void action(path,()=>current(path,version)).catch(fail);};
 const edit=workspace_button(workspace_text('svg_source_edit'),()=>run(async(path,valid)=>{const files=get_workspace_files();if(files&&valid())await files.open_file(path,{source:true,preview:false});}),'reading-media-open');
 const save=workspace_button(workspace_text('visual_code_export'),()=>run(async(path,valid)=>{const text=await get_workspace_files()!.read_text(path);if(valid())await export_visual_svg(text,valid,path);}),'reading-media-open');
 const png=workspace_button(workspace_text('visual_code_export_png'),()=>run(async(path,valid)=>{const text=await get_workspace_files()!.read_text(path);if(valid())await export_visual_png(text,valid,path);}),'reading-media-open');
 row.append(edit,save,png);
 const release=observe_workspace_file_saved(file=>{
  const path=source();if(!path||file_key(path)!==file_key(file.file_path))return;
  const version=++revision;
  void get_workspace_files()!.read_text(path).then(text=>{
   if(!current(path,version))return;
   if(!object_url){original=image.getAttribute('src')||'';identity=path;}
   const previous=object_url;object_url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}))+'#image.svg';image.src=object_url;if(previous)URL.revokeObjectURL(previous);
  }).catch(fail);
 });
 return {row,refresh(){if(object_url&&image.src!==object_url){URL.revokeObjectURL(object_url);object_url='';identity='';++revision;}row.hidden=!source();},dispose(){disposed=true;++revision;release();if(object_url){if(image.src===object_url)image.setAttribute('src',original);URL.revokeObjectURL(object_url);}row.remove();}};
}
