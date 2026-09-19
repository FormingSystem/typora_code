import {marked} from "marked";
import DOMPurify from "dompurify";
import css from "./workspace_hover_markdown_shadow.css";

/** 信息浮层的只读块级正文；不继承文档主题，不允许正文创建可执行内容或远端图片。 */
export function create_workspace_hover_markdown(source:string,open_link:(url:string)=>void):HTMLElement {
  const host=document.createElement("div"),shadow=host.attachShadow({mode:"open"});
  const style=document.createElement("style"),body=document.createElement("div");style.textContent=css;
  const escape=(value:string)=>value.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;");
  const renderer=new marked.Renderer();
  renderer.html=token=>escape(token.text);renderer.image=token=>escape(token.text);
  const html=marked.parse(source,{async:false,gfm:true,renderer});
  const fragment=DOMPurify.sanitize(html,{
    ALLOWED_TAGS:["p","br","hr","ul","ol","li","strong","em","del","code","pre","blockquote","h1","h2","h3","h4","h5","h6","table","thead","tbody","tr","th","td","a"],
    ALLOWED_ATTR:["href","title","start"],ALLOW_DATA_ATTR:false,RETURN_DOM_FRAGMENT:true
  });
  for(const link of fragment.querySelectorAll<HTMLAnchorElement>("a")){
    const href=link.getAttribute("href")||"";
    if(!/^https?:\/\//iu.test(href)){link.replaceWith(...link.childNodes);continue;}
    link.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();open_link(href);});
  }
  body.append(fragment);shadow.append(style,body);return host;
}
