import {workspace_element as el} from './workspace_widgets';
import {open_reading_media} from './reading_media_viewer';
import {workspace_text} from './workspace_i18n';

/** Keep original encoded frames; browser image decoding owns animation timing. */
export function preview_image_mime(path:string):string|undefined {
  const extension=path.split('.').at(-1)?.toLowerCase();
  return ({gif:'image/gif',png:'image/png',apng:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',bmp:'image/bmp',avif:'image/avif',svg:'image/svg+xml',ico:'image/x-icon'} as Record<string,string>)[extension||''];
}

export function create_preview_image(bytes:Uint8Array,mime:string,label:string) {
  const container=el('div','workspace-preview-image'),image=el('img');
  image.alt=label;image.draggable=false;container.tabIndex=0;container.append(image);
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:mime}));
  let disposed=false,close_viewer:((restore?:boolean)=>void)|undefined,cancel_load:()=>void=()=>{};
  const ready=new Promise<void>((resolve,reject)=>{
    const clear=()=>{image.onload=null;image.onerror=null;cancel_load=()=>{};};
    image.onload=()=>{clear();resolve();};
    image.onerror=()=>{clear();reject(new Error(workspace_text('reading_media_viewer_image_cannot_be_loaded_please_close_and_reopen')+': '+label));};
    cancel_load=()=>{clear();reject(new DOMException('Image preview cancelled','AbortError'));};
  });
  const open=()=>{
    if(disposed||!image.complete||!image.naturalWidth)return;
    close_viewer?.(false);const copy=new Image();copy.alt=label;copy.draggable=false;
    close_viewer=open_reading_media({content:copy,source:image,width:image.naturalWidth,height:image.naturalHeight,label,initial_fit:true});copy.src=url;
  };
  const double_click=(event:MouseEvent)=>{if(event.button||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();event.stopPropagation();open();};
  image.addEventListener('dblclick',double_click);image.src=url;
  return {container,ready,focus:()=>container.focus({preventScroll:true}),dispose(){if(disposed)return;disposed=true;cancel_load();close_viewer?.(false);image.removeEventListener('dblclick',double_click);image.removeAttribute('src');URL.revokeObjectURL(url);container.remove();}};
}
