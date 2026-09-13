import {open_reading_media} from "./reading_media_viewer";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {workspace_element as el} from "./workspace_widgets";
import {reading_viewport_bounds} from "./reading_viewport";
import {git_icon} from "./git_icons";
import css from "./reading_media_viewer.css";

type image_entry={button:HTMLButtonElement;url:string};
const parent_element=(node:Element):Element|null=>node.parentElement||(node.getRootNode() instanceof ShadowRoot?(node.getRootNode() as ShadowRoot).host:null);

/** 按钮在正文外的阅读层定位；不包装、写入或替换宿主图像节点。 */
export function bind_reading_images(root:HTMLElement,selector="img") {
  const layer=el("div","reading-image-actions");layer.contentEditable="false";
  const style=acquire_workspace_style("typora-code-style:reading_media_viewer",css),interaction=acquire_workspace_interaction(layer);
  document.body.append(layer);
  const entries=new Map<HTMLImageElement,image_entry>(),visible=new Set<HTMLImageElement>();
  let disposed=false,frame=0,scan_needed=true,session:{image:HTMLImageElement;url:string;close:()=>void}|undefined;
  const controller=new AbortController(),signal=controller.signal;
  const close_session=()=>{session?.close();session=undefined;};
  const schedule=(scan=false)=>{if(disposed)return;scan_needed ||= scan;if(!frame)frame=requestAnimationFrame(update);};
  const resize=new ResizeObserver(()=>schedule());
  const intersection=new IntersectionObserver(changes=>{for(const change of changes){if(change.isIntersecting)visible.add(change.target as HTMLImageElement);else visible.delete(change.target as HTMLImageElement);}schedule();});
  const source_url=(image:HTMLImageElement)=>image.complete&&image.naturalWidth&&image.naturalHeight?(image.currentSrc||image.src):"";
  const open=(image:HTMLImageElement,entry:image_entry,from_image=false)=>{
    const url=source_url(image);if(!url||!image.isConnected||(!from_image&&entry.button.hidden))return;
    const copy=new Image();copy.alt=image.alt;copy.draggable=false;
    // 只采用浏览器已经解析并展示的URL，不拷贝事件、样式、链接或srcset。
    const close=open_reading_media({content:copy,source:image,width:image.naturalWidth,height:image.naturalHeight,label:image.alt?`图片全屏查看：${image.alt}`:"图片全屏查看",origin:from_image?undefined:entry.button,initial_fit:true});
    copy.src=url;session={image,url,close};
  };
  const scan=()=>{
    const images=new Set([...root.querySelectorAll<HTMLImageElement>(selector)].filter(image=>!image.closest(".md-diagram-panel-preview,.reading-media-viewer,.CodeMirror")));
    for(const [image,entry]of entries)if(!images.has(image)){entry.button.remove();entries.delete(image);visible.delete(image);resize.unobserve(image);intersection.unobserve(image);}
    for(const image of images){
      if(entries.has(image))continue;
      const button=el("button","reading-image-open");button.type="button";button.hidden=true;button.title="全屏查看图片";button.setAttribute("aria-label",image.alt?`全屏查看图片：${image.alt}`:"全屏查看图片");button.append(git_icon("screen-full"),el("span","","全屏查看"));
      const entry={button,url:""};entries.set(image,entry);layer.append(button);resize.observe(image);intersection.observe(image);
      button.addEventListener("mousedown",event=>event.preventDefault(),{signal});
      button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();open(image,entry);},{signal});
    }
  };
  function update(){
    frame=0;if(disposed)return;if(scan_needed){scan_needed=false;scan();}
    const available=new Set<HTMLImageElement>();
    for(const [image,entry]of entries){
      const url=source_url(image);entry.url=url;const rect=image.getBoundingClientRect();
      let left=Math.max(0,rect.left),right=Math.min(window.innerWidth,rect.right),top=Math.max(0,rect.top),bottom=Math.min(window.innerHeight,rect.bottom);
      let shown=Boolean(url&&image.isConnected&&visible.has(image)&&getComputedStyle(image).visibility==="visible");
      for(let node:Element|null=image;shown&&node;node=parent_element(node)){
        const computed=getComputedStyle(node);
        if(computed.display==="none"||computed.visibility!=="visible"||Number(computed.opacity)===0||node.hasAttribute("hidden")||node.hasAttribute("inert")){shown=false;break;}
        if(node!==image && node!==document.body && node!==document.documentElement && /auto|scroll|hidden|clip/.test(computed.overflowX+computed.overflowY)){
          const bounds=node.getBoundingClientRect();
          if(/auto|scroll|hidden|clip/.test(computed.overflowX)){left=Math.max(left,bounds.left+node.clientLeft);right=Math.min(right,bounds.left+node.clientLeft+node.clientWidth);}
          if(/auto|scroll|hidden|clip/.test(computed.overflowY)){top=Math.max(top,bounds.top+node.clientTop);bottom=Math.min(bottom,bounds.top+node.clientTop+node.clientHeight);}
        }
        if(node instanceof HTMLElement&&node.tagName==="CONTENT"){const bounds=reading_viewport_bounds(node);left=Math.max(left,bounds.left);right=Math.min(right,bounds.right);top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom);}
      }
      if(shown&&right>left&&bottom>top)available.add(image);
      shown=shown&&right-left>=32&&bottom-top>=32;
      entry.button.hidden=!shown;
      if(shown){
        const small=right-left<160;entry.button.classList.toggle("is-small",small);
        entry.button.style.left=`${Math.max(left,right-entry.button.offsetWidth-4)}px`;entry.button.style.top=`${Math.min(bottom-32,top+4)}px`;
      }
    }
    if(session&&(!entries.has(session.image)||source_url(session.image)!==session.url||!available.has(session.image)))close_session();
  }
  const observer=new MutationObserver(changes=>{
    // 自有阅读层与查看器的变更不触发下一轮扫描，避免观察器自激。
    const relevant=changes.filter(change=>!(change.target instanceof Element&&change.target.closest(".reading-image-actions,.reading-media-viewer")));
    if(relevant.length)schedule(relevant.some(change=>change.type==="childList"));
  });
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["src","srcset","class","style","hidden"]});
  const geometry=new MutationObserver(()=>schedule());geometry.observe(document.body,{attributes:true,attributeFilter:["class","style"]});
  // 单击仍由宿主选中图片；只接管图片本身的左键双击，不触碰正文文字或修饰键链接操作。
  root.addEventListener("dblclick",event=>{
    if(!(event instanceof MouseEvent)||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    const image=event.composedPath().find(node=>node instanceof HTMLImageElement&&entries.has(node)) as HTMLImageElement|undefined;
    if(!image||!source_url(image))return;
    event.preventDefault();event.stopImmediatePropagation();open(image,entries.get(image)!,true);
  },{capture:true,signal});
  root.addEventListener("load",()=>schedule(),{capture:true,signal});root.addEventListener("error",()=>schedule(),{capture:true,signal});root.addEventListener("scroll",()=>schedule(),{capture:true,passive:true,signal});
  document.addEventListener("scroll",()=>schedule(),{capture:true,passive:true,signal});window.addEventListener("resize",()=>schedule(),{passive:true,signal});
  schedule(true);
  return {dispose(){if(disposed)return;disposed=true;close_session();controller.abort();cancelAnimationFrame(frame);observer.disconnect();geometry.disconnect();resize.disconnect();intersection.disconnect();entries.clear();visible.clear();layer.remove();interaction.remove();style.remove();}};
}
