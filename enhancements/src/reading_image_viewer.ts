import {workspace_text} from "./workspace_i18n";
import {bind_reading_image_layout} from "./reading_image_layout";
import {create_reading_image_controls} from "./reading_image_controls";
import {open_reading_media} from "./reading_media_viewer";
import {bind_reading_media_entries,type reading_media_entry} from "./reading_media_entry";

type image_entry={control:reading_media_entry;extras:ReturnType<typeof create_reading_image_controls>};
/** Only adapt to the original image source; hover positioning and input are managed by the shared entry, and the original image and its parent nodes are preserved. */
export function bind_reading_images(root:HTMLElement,selector="img"){
  const layout=bind_reading_image_layout(root,selector);
  const controls=bind_reading_media_entries(root),entries=new Map<HTMLImageElement,image_entry>();
  const controller=new AbortController(),{signal}=controller;let disposed=false,frame=0;
  let session:{image:HTMLImageElement;url:string;close:(restore?:boolean)=>void}|undefined;
  const source_url=(image:HTMLImageElement)=>image.complete&&image.naturalWidth&&image.naturalHeight?(image.currentSrc||image.src):"";
  const close_session=()=>{session?.close(false);session=undefined;};
  const open=(image:HTMLImageElement,entry:image_entry,from_image=false)=>{
    const url=source_url(image);if(!url)return;close_session();
    const copy=new Image();copy.alt=image.alt;copy.draggable=false;
    const close=open_reading_media({content:copy,source:image,width:image.naturalWidth,height:image.naturalHeight,label:image.alt||workspace_text("reading_image_viewer_view_image_in_full_screen"),origin:from_image?undefined:entry.control.button,initial_fit:true});
    session={image,url,close};copy.src=url;
  };
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(update);};
  function update(){
    frame=0;if(disposed)return;
    const images=new Set([...root.querySelectorAll<HTMLImageElement>(selector)].filter(image=>!image.closest(".md-diagram-panel-preview,.reading-media-viewer,.CodeMirror")));
    layout.update(images);
    for(const [image,entry]of entries)if(!images.has(image)||!entry.control.button.isConnected){entry.extras.dispose();entry.control.dispose();entries.delete(image);}
    for(const image of images){
      let entry=entries.get(image);
      if(!entry){
        const extras=create_reading_image_controls(image);
        const control=controls.add({source:image,host:image,label:image.alt?workspace_text("reading_image_viewer_view_image_in_full_screen_0c6eb1c6", {value_0: String(image.alt)}):workspace_text("reading_image_viewer_view_image_in_full_screen_376a36ca"),button_class:"reading-image-open",controls:extras.controls,refresh_controls:extras.refresh,open:()=>open(image,entries.get(image)!)});
        entry={control,extras};entries.set(image,entry);
      }
      entry.control.set_enabled(Boolean(source_url(image)));entry.extras.refresh();
    }
    if(session&&(!entries.has(session.image)||source_url(session.image)!==session.url))close_session();
  }
  const observer=new MutationObserver(changes=>{
    if(changes.some(change=>!(change.target instanceof Element&&change.target.closest(".reading-media-entries,.reading-media-viewer"))))schedule();
  });
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["src","srcset","class","style","hidden"]});
  root.addEventListener("load",schedule,{capture:true,signal});root.addEventListener("error",schedule,{capture:true,signal});
  // Clicking the original image still passes it to the host for selection; it only takes over the left-click double-click without the modifier key.
  root.addEventListener("dblclick",event=>{
    if(!(event instanceof MouseEvent)||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    const image=event.composedPath().find(node=>node instanceof HTMLImageElement&&entries.has(node)) as HTMLImageElement|undefined;
    if(!image||!source_url(image))return;event.preventDefault();event.stopImmediatePropagation();open(image,entries.get(image)!,true);
  },{capture:true,signal});
  schedule();
  return {dispose(){if(disposed)return;disposed=true;close_session();controller.abort();cancelAnimationFrame(frame);observer.disconnect();for(const [image,entry]of entries){entry.extras.dispose();entry.control.dispose();}entries.clear();controls.dispose();layout.dispose();}};
}
