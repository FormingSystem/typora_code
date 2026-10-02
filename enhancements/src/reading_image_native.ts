import type {image_alignment} from "./reading_image_settings";
import {workspace_text} from "./workspace_i18n";

export function read_image_alignment(image:HTMLImageElement):image_alignment|undefined{
  const {marginLeft:left,marginRight:right}=image.style;
  if(left==="auto"&&right==="auto")return "center";
  if(left==="auto"&&right&&right!=="auto")return "right";
  if(right==="auto"&&left&&left!=="auto")return "left";
}
export function capture_image_alignment(image:HTMLImageElement){
  const runtime=window as any,file=runtime.File,editor=file?.editor,wrapper=image.closest('.md-image');
  if(!wrapper||!image.closest('content > #write')||!editor?.imgEdit?.addStyle||!runtime.$||file.isLocked||file.isFileLoading?.()||editor.sourceView?.inSourceMode)return;
  const bundle=file.bundle,source=wrapper.textContent;
  return (alignment:image_alignment|undefined)=>{
    if(file.bundle!==bundle||file.editor!==editor||!image.isConnected||wrapper.textContent!==source||editor.sourceView?.inSourceMode||file.isLocked||file.isFileLoading?.())throw Error(workspace_text('image_layout_stale'));
    const left=alignment==='left'?'0px':'auto',right=alignment==='right'?'0px':'auto';
    const margin=alignment?`${image.style.marginTop||'0px'} ${right} ${image.style.marginBottom||'0px'} ${left}`:'';
    editor.imgEdit.addStyle(runtime.$(wrapper),'margin',margin);
  };
}
