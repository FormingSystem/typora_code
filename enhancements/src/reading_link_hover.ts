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
  let anchor:HTMLAnchorElement|undefined,timer=0,close_timer=0;
  const keep=()=>{window.clearTimeout(close_timer);close_timer=0;};
  const hide=()=>{window.clearTimeout(timer);keep();observer.disconnect();anchor=undefined;tip.hidden=true;tip.textContent="";};
  const inside=(node:EventTarget|null)=>node instanceof Node&&(tip.contains(node)||Boolean(anchor?.contains(node)));
  const leave_later=()=>{if(tip.hidden)return hide();keep();close_timer=window.setTimeout(hide,250);};
  const observer=new MutationObserver(records=>{if(anchor&&(!anchor.isConnected||records.some(record=>record.target===anchor&&record.type==="attributes")))hide();});
  const source_file=(link:HTMLElement)=>{
    const file=(window as any).File;
    if(link.closest("#write"))return String(file?.bundle?.filePath||"");
    let source="";get_workspace_app()?.workspace.eachLeaves(leaf=>{if(leaf.view?.containerEl.contains(link))source=leaf.state.path;});return source;
  };
  const target_info=(link:HTMLAnchorElement)=>{
    let href=link.getAttribute("href")||"";
    if(link.dataset.ref){const refs=(window as any).File?.editor?.nodeMap?.link_list;href=refs?.getHrefByRef?.(link.dataset.ref,true,true)||href;}
    if(!href)return {href:"",target:"未定义的链接"};
    const source=source_file(link);
    if(source){
      try{
        const path_api=(window as any).reqnode("path");
        const candidate=href.startsWith("<")&&href.endsWith(">")?href.slice(1,-1):href;
        if(!path_api.isAbsolute(candidate)&&/^(?!file:)[a-z][a-z0-9+.-]*:|^\/\//iu.test(candidate))return {href,target:""};
        const markdown=parse_markdown_file_target(candidate);
        const separator=candidate.indexOf("#");const file_part=markdown?.file_path??(separator<0?candidate:candidate.slice(0,separator));
        const hash=markdown?.hash??(separator<0?"":candidate.slice(separator));
        let decoded=file_part;if(!/^file:/iu.test(file_part)){try{decoded=decodeURIComponent(file_part);}catch{ /* 普通路径中的字面百分号仍作为路径文字。 */ }}
        const target=file_part?resolve_workspace_file(path_api,path_api.dirname(source),resolve_host_open_file_target(path_api,source,decoded)):source;
        if(target){
          const project_root=String((window as any).File?.getMountFolder?.()||"");
          if(!project_root||!path_api.isAbsolute(project_root))return {href,target:"目标：未打开项目，无法计算项目相对位置"};
          const relative=path_api.relative(project_root,target);
          if(path_api.isAbsolute(relative))return {href,target:"项目外：目标位于其他磁盘或共享位置"};
          const normalized=relative.split(path_api.sep).join("/"),outside=normalized===".."||normalized.startsWith("../");
          return {href,target:`${outside?"项目外：":"项目内：/"}${normalized}${hash}`};
        }
      }catch{ /* 非法转义保留原链接文本，提示不执行路径猜测或文件访问。 */ }
    }
    return {href,target:""};
  };
  const render=(link:HTMLAnchorElement)=>{
    const info=target_info(link),original=document.createElement("div");original.className="workspace-link-original";original.textContent=info.href;tip.replaceChildren(original);
    if(info.target){const target=document.createElement("div");target.className="workspace-link-target";target.textContent=info.target;tip.append(target);}
    if(info.href){
      const copy=document.createElement("button");copy.type="button";copy.className="workspace-link-copy";copy.textContent="复制链接";copy.setAttribute("aria-label","复制原始链接");
      copy.addEventListener("click",event=>{
        event.preventDefault();event.stopPropagation();keep();
        try{(window as any).reqnode("electron").clipboard.writeText(info.href);copy.textContent="已复制";}catch{copy.textContent="复制失败";}
      });tip.append(copy);
    }
  };
  const enter=(event:Event)=>{
    if(event.target instanceof Node&&tip.contains(event.target)){keep();return;}
    const target=event.target instanceof Element?event.target.closest<HTMLAnchorElement>("a[href],a[data-ref]"):null;
    if(!target||!target.closest("#write,.typ-markdown-preview"))return;
    if(target===anchor){keep();return;}hide();anchor=target;
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["href","data-ref"]});
    timer=window.setTimeout(()=>{
      if(anchor!==target||!target.isConnected)return hide();
      render(target);tip.hidden=false;
      const box=target.getBoundingClientRect(),bounds=tip.getBoundingClientRect();
      tip.style.left=Math.max(8,Math.min(box.left,window.innerWidth-bounds.width-8))+"px";
      tip.style.top=Math.max(8,box.bottom+bounds.height+8<window.innerHeight?box.bottom+6:box.top-bounds.height-6)+"px";
    },1000);
  };
  const leave=(event:MouseEvent)=>{if(anchor&&inside(event.target)&&!inside(event.relatedTarget))leave_later();};
  document.addEventListener("mouseover",enter,{signal:events.signal});
  document.addEventListener("mouseout",leave,{signal:events.signal});
  document.addEventListener("focusin",enter,{signal:events.signal});
  document.addEventListener("focusout",event=>{if(inside(event.target)&&!inside(event.relatedTarget))leave_later();},{signal:events.signal});
  document.addEventListener("pointerdown",event=>{if(!(event.target instanceof Node&&tip.contains(event.target)))hide();},{capture:true,signal:events.signal});
  document.addEventListener("scroll",event=>{if(!(event.target instanceof Node&&tip.contains(event.target)))hide();},{capture:true,signal:events.signal});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"){hide();return;}
    if(["Control","Meta","Shift","Alt"].includes(event.key))return;
    const selection=window.getSelection();
    if(event.target instanceof Node&&tip.contains(event.target))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="c"&&selection&&(tip.contains(selection.anchorNode)||tip.contains(selection.focusNode)))return;
    hide();
  },{capture:true,signal:events.signal});
  tip.addEventListener("pointerdown",event=>event.stopPropagation(),{signal:events.signal});
  tip.addEventListener("click",event=>event.stopPropagation(),{signal:events.signal});
  window.addEventListener("blur",hide,{signal:events.signal});window.addEventListener("resize",hide,{signal:events.signal});
  return{dispose(){hide();events.abort();tip.remove();style.remove();}};
}
