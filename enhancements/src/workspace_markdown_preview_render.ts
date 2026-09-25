import {load_code_themes,initial_code_stack} from './reading_code_theme';
import * as monaco from "monaco-editor/editor/editor.api";
import DOMPurify from "dompurify";
import { initialize_editor } from "./git_diff_editor";
import { detect_file_language } from "./file_language";

type diagram_api = { initialize(options: Record<string,unknown>): void; render(id: string, source: string, container?: HTMLElement): Promise<{svg: string}> };
let diagram_serial = 0;

/** 复用源码编辑器的语言注册和 tokenizer，保留原文字节对应的字符及换行。 */
export async function highlight_preview_code(code: HTMLElement): Promise<void> {
  initialize_editor();
  const hint = (code.className.match(/language-([^\s]+)/u)?.[1] || "plaintext").toLowerCase();
  const aliases: Record<string,string> = {js:"javascript",ts:"typescript",sh:"shell",bash:"shell",py:"python",yml:"yaml","c++":"cpp",ps1:"powershell"};
  const language = aliases[hint] || (monaco.languages.getLanguages().some(item=>item.id===hint) ? hint : detect_file_language(`preview.${hint}`));
  const text = code.textContent || "";
  if(['c','cpp'].includes(language)){
    const grammar=(await load_code_themes())[language as 'c'|'cpp'];let stack=initial_code_stack();const fragment=document.createDocumentFragment();
    text.split('\n').forEach((line,index)=>{if(index)fragment.append(document.createTextNode('\n'));const result=grammar.tokenizeLine(line,stack);stack=result.ruleStack;for(const token of result.tokens){const span=document.createElement('span');span.className=token.style;span.textContent=line.slice(token.startIndex,token.endIndex);fragment.append(span);}});
    code.replaceChildren(fragment);return;
  }
  // colorize 等待语言的按需载入；实际 DOM 使用原文与 tokenizer 的字符偏移构造。
  await monaco.editor.colorize(text, language, {tabSize:4});
  const tokens = monaco.editor.tokenize(text, language), lines = text.split("\n"), fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    const line_tokens = tokens[index] || [];
    if (!line_tokens.length) fragment.append(document.createTextNode(line));
    line_tokens.forEach((token, position) => {
      const span = document.createElement("span");
      const kind = token.type.match(/^(comment|string|keyword|number|type|tag|attribute|metatag|regexp)/u)?.[1];
      if (kind) span.className = `lookup-code-${kind}`;
      span.textContent = line.slice(token.offset, line_tokens[position+1]?.offset ?? line.length); fragment.append(span);
    });
    if (index < lines.length-1) fragment.append(document.createTextNode("\n"));
  });
  code.replaceChildren(fragment);
}

/** 每个预览拥有隔离的 Mermaid 实例，避免图表指令污染正在渲染的中央正文配置。 */
export function create_preview_diagrams() {
  let frame:HTMLIFrameElement|undefined, loading:Promise<diagram_api>|undefined;
  let disposed=false, queued:Promise<unknown>=Promise.resolve(), cancel_load:(()=>void)|undefined;
  const load = () => loading ||= new Promise<diagram_api>((resolve,reject)=>{
    frame=document.createElement("iframe");frame.setAttribute("aria-hidden","true");frame.tabIndex=-1;
    frame.setAttribute("sandbox","allow-scripts allow-same-origin");
    frame.style.cssText="position:fixed;left:-100000px;top:0;width:600px;height:600px;border:0;pointer-events:none;visibility:hidden";
    document.body.append(frame);
    const doc=frame.contentDocument!;doc.open();doc.write("<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src file:; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'\"></head><body></body></html>");doc.close();
    const script=doc.createElement("script"), timeout=setTimeout(()=>finish(new Error("内置图表渲染器加载超时。")),10000);
    const finish=(error?:Error)=>{
      clearTimeout(timeout);cancel_load=undefined;script.onload=script.onerror=null;
      const api=(frame?.contentWindow as unknown as {mermaid?:diagram_api})?.mermaid;
      if(error||disposed||!api?.render)reject(error||new Error("内置图表渲染器不可用。"));else resolve(api);
    };
    cancel_load=()=>finish(new Error("预览已关闭。"));
    // Typora 1.14.9 diagrams.lazyload 使用此随应用分发的本地资源；按当前 window.html 解析，不固定安装目录。
    script.src=new URL("./lib.asar/diagram/mermaid.min.js",document.baseURI).href;
    script.onload=()=>finish();script.onerror=()=>finish(new Error("无法载入内置图表渲染器。"));doc.head.append(script);
  });
  const render=async(code:HTMLElement,width:number,show_source:boolean,current:()=>boolean):Promise<boolean>=>{
    const task=queued.then(async()=>{
      if(disposed||!current())return false;
      const api=await load();if(disposed||!current()||!frame)return false;
      frame.style.width=`${Math.max(180,width)}px`;
      const color=getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number)||[0,0,0];
      api.initialize({startOnLoad:false,securityLevel:"strict",suppressErrorRendering:true,theme:color[0]+color[1]+color[2]>450?"dark":"default",htmlLabels:false,flowchart:{htmlLabels:false}});
      const result=await api.render(`linux_note_lookup_diagram_${++diagram_serial}`,code.textContent||"");
      if(disposed||!current())return false;
      const diagram=document.createElement("div");diagram.className="lookup-diagram";
      diagram.innerHTML=DOMPurify.sanitize(result.svg,{ADD_TAGS:["foreignObject"],HTML_INTEGRATION_POINTS:{foreignobject:true},FORBID_TAGS:["script","img","image","iframe","object","embed","audio","video","source","form"],FORBID_ATTR:["href","xlink:href"]});
      if(!diagram.querySelector("svg"))return false;
      const pre=code.closest("pre");
      if(show_source){pre?.before(diagram);const label=document.createElement("div");label.className="lookup-diagram-source-label";label.textContent="命中源码";pre?.before(label);}
      else pre?.replaceWith(diagram);
      return true;
    }).catch(()=>false);
    queued=task;return task;
  };
  return {render,dispose(){disposed=true;cancel_load?.();frame?.remove();frame=undefined;}};
}
