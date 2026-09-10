import css from "./reading_link_hover.css";
import {acquire_workspace_style} from "./workspace_styles";
import {get_workspace_app} from "./workspace_bootstrap";
import {parse_markdown_file_target,resolve_host_open_file_target,resolve_workspace_file} from "./workspace_file_uri";

/** 悬停只读取链接和所属文档身份，不触发打开、读取正文或改变编辑选区。 */
export function bind_reading_link_hover() {
  const style=acquire_workspace_style("typora-code-link-hover",css);
  const events=new AbortController();
  const tip=document.createElement("div");tip.className="workspace-link-hover";tip.id="typora-code-link-hover";
  tip.setAttribute("role","tooltip");tip.hidden=true;document.body.append(tip);
  let anchor:HTMLAnchorElement|undefined,timer=0;
  const hide=()=>{window.clearTimeout(timer);observer.disconnect();anchor=undefined;tip.hidden=true;tip.textContent="";};
  const observer=new MutationObserver(records=>{if(anchor&&(!anchor.isConnected||records.some(record=>record.target===anchor&&record.type==="attributes")))hide();});
  const source_file=(link:HTMLElement)=>{
    const file=(window as any).File;
    if(link.closest("#write"))return String(file?.bundle?.filePath||"");
    let source="";get_workspace_app()?.workspace.eachLeaves(leaf=>{if(leaf.view?.containerEl.contains(link))source=leaf.state.path;});return source;
  };
  const target_text=(link:HTMLAnchorElement)=>{
    let href=link.getAttribute("href")||"";
    if(link.dataset.ref){const refs=(window as any).File?.editor?.nodeMap?.link_list;href=refs?.getHrefByRef?.(link.dataset.ref,true,true)||href;}
    if(!href)return "未定义的链接";
    const source=source_file(link);
    if(source&&!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(href)){
      try{
        const path_api=(window as any).reqnode("path");
        const markdown=parse_markdown_file_target(href);
        const separator=href.indexOf("#");const file_part=markdown?.file_path??(separator<0?href:href.slice(0,separator));
        const hash=markdown?.hash??(separator<0?"":href.slice(separator));
        const decoded=decodeURIComponent(file_part);
        const target=file_part?resolve_workspace_file(path_api,path_api.dirname(source),resolve_host_open_file_target(path_api,source,decoded)):source;
        if(target)return `${href}\n${target}${hash}`;
      }catch{ /* 非法转义保留原链接文本，提示不执行路径猜测或文件访问。 */ }
    }
    return href;
  };
  const enter=(event:Event)=>{
    const target=event.target instanceof Element?event.target.closest<HTMLAnchorElement>("a[href],a[data-ref]"):null;
    if(!target||!target.closest("#write,.typ-markdown-preview"))return;
    if(target===anchor)return;hide();anchor=target;
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["href","data-ref"]});
    timer=window.setTimeout(()=>{
      if(anchor!==target||!target.isConnected)return hide();
      tip.textContent=target_text(target);tip.hidden=false;
      const box=target.getBoundingClientRect(),bounds=tip.getBoundingClientRect();
      tip.style.left=Math.max(8,Math.min(box.left,window.innerWidth-bounds.width-8))+"px";
      tip.style.top=Math.max(8,box.bottom+bounds.height+8<window.innerHeight?box.bottom+6:box.top-bounds.height-6)+"px";
    },1000);
  };
  const leave=(event:MouseEvent)=>{if(anchor&&!(event.relatedTarget instanceof Node&&anchor.contains(event.relatedTarget)))hide();};
  document.addEventListener("mouseover",enter,{signal:events.signal});
  document.addEventListener("mouseout",leave,{signal:events.signal});
  document.addEventListener("focusin",enter,{signal:events.signal});
  document.addEventListener("focusout",hide,{signal:events.signal});
  for(const name of ["pointerdown","keydown","scroll"])document.addEventListener(name,hide,{capture:true,signal:events.signal});
  window.addEventListener("blur",hide,{signal:events.signal});window.addEventListener("resize",hide,{signal:events.signal});
  return{dispose(){hide();events.abort();tip.remove();style.remove();}};
}
