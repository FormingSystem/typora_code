import {workspace_text} from './workspace_i18n';
/** Save only the current rendered snapshot using the established native Save As port. */
export async function export_visual_svg(svg:string,current:()=>boolean,source_path?:string):Promise<void>{
 await save_visual(svg,'svg',current,source_path);
}

async function save_visual(data:string|Uint8Array,format:'svg'|'png',current:()=>boolean,source_path?:string){
 const runtime=window as any;
 if(!current())return;
 if(!runtime.JSBridge?.invoke||!runtime.reqnode)throw Error(workspace_text('color_files_the_current_host_does_not_support_exporting_files'));
 const path=runtime.reqnode('path');
 const name=source_path?path.basename(source_path,path.extname(source_path)):'diagram';
 const result=await runtime.JSBridge.invoke('dialog.showSaveDialog',{title:workspace_text(format==='png'?'visual_code_export_png':'visual_code_export'),defaultPath:name+'.'+format,properties:['showOverwriteConfirmation'],filters:[{name:format.toUpperCase(),extensions:[format]}]});
 if(!current()||result?.canceled||!result?.filePath)return;
 if(!runtime.reqnode('path').isAbsolute(result.filePath))throw Error(workspace_text('color_files_the_save_path_returned_by_the_system_is_invalid'));
 const fs=runtime.reqnode('fs').promises;
 if(source_path){
  const original=await fs.realpath(source_path),target=await fs.realpath(result.filePath).catch(()=>result.filePath);
  const key=(value:string)=>path.sep==='\\'?path.resolve(value).toLowerCase():path.resolve(value);
  if(key(original)===key(target))throw Error(workspace_text('svg_export_source_protected'));
 }
 if(current())await fs.writeFile(result.filePath,data,typeof data==='string'?'utf8':undefined);
}

/** Decode as an image: SVG scripts cannot run in the workbench or access its DOM. */
export async function export_visual_png(svg:string,current:()=>boolean,source_path?:string):Promise<void>{
 if(!current())return;
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();
 try{
  image.src=url;await image.decode();if(!current())return;
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width>16384||height>16384||width*height>32*1024*1024)throw Error(workspace_text('svg_export_size_limit'));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context)throw Error(workspace_text('svg_export_size_limit'));
  context.drawImage(image,0,0,width,height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error(workspace_text('svg_export_size_limit'))),'image/png'));
  canvas.width=canvas.height=0;
  if(current())await save_visual(new Uint8Array(await blob.arrayBuffer()),'png',current,source_path);
 }finally{image.src='';URL.revokeObjectURL(url);}
}
