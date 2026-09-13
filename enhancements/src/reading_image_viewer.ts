import {open_reading_media} from "./reading_media_viewer";
import {bind_reading_media_entries,type reading_media_entry} from "./reading_media_entry";

type image_entry={control:reading_media_entry;host:HTMLElement;wrapped:boolean;original_class:string|null};
/** 只适配原图来源与原生包装；工具行布局及输入由共享入口管理。 */
export function bind_reading_images(root:HTMLElement,selector="img"){
  const controls=bind_reading_media_entries(root),entries=new Map<HTMLImageElement,image_entry>();
  const controller=new AbortController(),{signal}=controller;let disposed=false,frame=0;
  let session:{image:HTMLImageElement;url:string;close:(restore?:boolean)=>void}|undefined;
  const source_url=(image:HTMLImageElement)=>image.complete&&image.naturalWidth&&image.naturalHeight?(image.currentSrc||image.src):"";
  const close_session=()=>{session?.close(false);session=undefined;};
  const open=(image:HTMLImageElement,entry:image_entry,from_image=false)=>{
    const url=source_url(image);if(!url)return;close_session();
    const copy=new Image();copy.alt=image.alt;copy.draggable=false;
    const close=open_reading_media({content:copy,source:image,width:image.naturalWidth,height:image.naturalHeight,label:image.alt||"图片全屏查看",origin:from_image?undefined:entry.control.button,initial_fit:true});
    session={image,url,close};copy.src=url;
  };
  const release=(image:HTMLImageElement,entry:image_entry)=>{
    entry.control.dispose();
    if(entry.wrapped){if(image.parentElement===entry.host)entry.host.replaceWith(image);else entry.host.remove();}
    else{entry.host.classList.remove("reading-media-image-host");if(entry.original_class===null&&!entry.host.className)entry.host.removeAttribute("class");}
  };
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(update);};
  function update(){
    frame=0;if(disposed)return;
    const images=new Set([...root.querySelectorAll<HTMLImageElement>(selector)].filter(image=>!image.closest(".md-diagram-panel-preview,.reading-media-viewer,.CodeMirror")));
    for(const [image,entry]of entries)if(!images.has(image)||!entry.control.slot.isConnected){release(image,entry);entries.delete(image);}
    for(const image of images){
      let entry=entries.get(image);
      if(!entry){
        const native=image.parentElement?.matches('.md-image[md-inline="image"]')?image.parentElement:null;
        const host=native||document.createElement("span"),original_class=host.getAttribute("class");
        if(!native){host.style.cssText="display:inline-block;max-width:100%";image.replaceWith(host);host.append(image);}
        else host.classList.add("reading-media-image-host");
        const control=controls.add({source:image,host,before:image,label:image.alt?`全屏查看图片：${image.alt}`:"全屏查看图片",button_class:"reading-image-open",open:()=>open(image,entries.get(image)!)});
        entry={control,host,wrapped:!native,original_class};entries.set(image,entry);
      }
      entry.control.set_enabled(Boolean(source_url(image)));
    }
    if(session&&(!entries.has(session.image)||source_url(session.image)!==session.url))close_session();
  }
  const observer=new MutationObserver(changes=>{
    if(changes.some(change=>!(change.target instanceof Element&&change.target.closest(".reading-media-entries,.reading-media-entry-slot,.reading-media-viewer"))))schedule();
  });
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["src","srcset","class","style","hidden"]});
  root.addEventListener("load",schedule,{capture:true,signal});root.addEventListener("error",schedule,{capture:true,signal});
  // 单击原图仍交给宿主选中，只接管无修饰键的左键双击。
  root.addEventListener("dblclick",event=>{
    if(!(event instanceof MouseEvent)||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    const image=event.composedPath().find(node=>node instanceof HTMLImageElement&&entries.has(node)) as HTMLImageElement|undefined;
    if(!image||!source_url(image))return;event.preventDefault();event.stopImmediatePropagation();open(image,entries.get(image)!,true);
  },{capture:true,signal});
  schedule();
  return {dispose(){if(disposed)return;disposed=true;close_session();controller.abort();cancelAnimationFrame(frame);observer.disconnect();for(const [image,entry]of entries)release(image,entry);entries.clear();controls.dispose();}};
}
