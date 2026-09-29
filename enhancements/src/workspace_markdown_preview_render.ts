import {workspace_text} from "./workspace_i18n";
import {mermaid_theme_options,observe_mermaid_theme} from './reading_mermaid_theme';
import {load_code_themes,initial_code_stack} from './reading_code_theme';
import * as monaco from "monaco-editor/editor/editor.api";
import DOMPurify from "dompurify";
import { initialize_editor } from "./git_diff_editor";
import { detect_file_language } from "./file_language";

type diagram_api = { initialize(options: Record<string,unknown>): void; render(id: string, source: string, container?: HTMLElement): Promise<{svg: string}> };
let diagram_serial = 0;

/** Reuse the language registration of the source code editor and tokenizer, preserving the original text bytes corresponding to the characters and line breaks. */
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
  // The colorize waits for the language to be loaded on demand; the actual DOM uses the original text and tokenizer character offsets to construct.
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

/** Each preview has an isolated Mermaid instance to avoid chart instructions polluting the currently rendering central document configuration. */
export function create_preview_diagrams() {
  let frame:HTMLIFrameElement|undefined, loading:Promise<diagram_api>|undefined;
  const entries=new Set<{element:HTMLElement;source:string;width:number;current:()=>boolean;revision:number}>();
  let theme_fingerprint=JSON.stringify(mermaid_theme_options());
  let disposed=false, queued:Promise<unknown>=Promise.resolve(), cancel_load:(()=>void)|undefined;
  const load = () => loading ||= new Promise<diagram_api>((resolve,reject)=>{
    frame=document.createElement("iframe");frame.setAttribute("aria-hidden","true");frame.tabIndex=-1;
    frame.setAttribute("sandbox","allow-scripts allow-same-origin");
    frame.style.cssText="position:fixed;left:-100000px;top:0;width:600px;height:600px;border:0;pointer-events:none;visibility:hidden";
    document.body.append(frame);
    const doc=frame.contentDocument!;doc.open();doc.write("<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src file:; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'\"></head><body></body></html>");doc.close();
    const script=doc.createElement("script"), timeout=setTimeout(()=>finish(new Error(workspace_text("markdown_preview_render_built_in_chart_renderer_timeout"))),10000);
    const finish=(error?:Error)=>{
      clearTimeout(timeout);cancel_load=undefined;script.onload=script.onerror=null;
      const api=(frame?.contentWindow as unknown as {mermaid?:diagram_api})?.mermaid;
      if(error||disposed||!api?.render)reject(error||new Error(workspace_text("markdown_preview_render_built_in_chart_renderer_unavailable")));else resolve(api);
    };
    cancel_load=()=>finish(new Error(workspace_text("markdown_preview_render_preview_is_closed")));
    // The Typora 1.14.9 diagrams.lazyload uses this locally distributed resource with the application; parse it according to the current window.html, without fixing the installation directory.
    script.src=new URL("./lib.asar/diagram/mermaid.min.js",document.baseURI).href;
    script.onload=()=>finish();script.onerror=()=>finish(new Error(workspace_text("markdown_preview_render_cannot_load_built_in_chart_renderer")));doc.head.append(script);
  });
  // Theme switching may also occur during the initial rendering; only submit results that are consistent with the current native configuration.
  const render_current=async(api:diagram_api,source:string,current:()=>boolean)=>{
    while(!disposed&&current()){
      const options=mermaid_theme_options(),fingerprint=JSON.stringify(options);
      api.initialize({...options,startOnLoad:false,securityLevel:"strict",suppressErrorRendering:true,htmlLabels:false,flowchart:{...(options.flowchart as Record<string,unknown>|undefined),htmlLabels:false}});
      const result=await api.render(`linux_note_lookup_diagram_${++diagram_serial}`,source);
      if(fingerprint===JSON.stringify(mermaid_theme_options()))return result;
    }
    return undefined;
  };
  const render=async(code:HTMLElement,width:number,show_source:boolean,current:()=>boolean):Promise<boolean>=>{
    const task=queued.then(async()=>{
      if(disposed||!current())return false;
      const api=await load();if(disposed||!current()||!frame)return false;
      frame.style.width=`${Math.max(180,width)}px`;
      const result=await render_current(api,code.textContent||"",current);
      if(!result||disposed||!current())return false;
      const diagram=document.createElement("div");diagram.className="lookup-diagram";
      diagram.innerHTML=DOMPurify.sanitize(result.svg,{ADD_TAGS:["foreignObject"],HTML_INTEGRATION_POINTS:{foreignobject:true},FORBID_TAGS:["script","img","image","iframe","object","embed","audio","video","source","form"],FORBID_ATTR:["href","xlink:href"]});
      if(!diagram.querySelector("svg"))return false;
      entries.add({element:diagram,source:code.textContent||"",width,current,revision:0});
      const pre=code.closest("pre");
      if(show_source){pre?.before(diagram);const label=document.createElement("div");label.className="lookup-diagram-source-label";label.textContent=workspace_text("markdown_preview_render_matching_source");pre?.before(label);}
      else pre?.replaceWith(diagram);
      return true;
    }).catch(()=>false);
    queued=task;return task;
  };
  const unwatch=observe_mermaid_theme(()=>{
    const fingerprint=JSON.stringify(mermaid_theme_options());if(fingerprint===theme_fingerprint)return;theme_fingerprint=fingerprint;
    for(const entry of entries){
      if(!entry.element.isConnected||!entry.current()){entries.delete(entry);continue;}
      const revision=++entry.revision;
      queued=queued.then(async()=>{
        if(disposed||revision!==entry.revision||!entry.element.isConnected||!entry.current())return;
        const api=await load();if(disposed||!frame)return;frame.style.width=`${Math.max(180,entry.width)}px`;
        const result=await render_current(api,entry.source,()=>revision===entry.revision&&entry.element.isConnected&&entry.current());
        if(!result||disposed||revision!==entry.revision||!entry.element.isConnected||!entry.current())return;
        entry.element.innerHTML=DOMPurify.sanitize(result.svg,{ADD_TAGS:["foreignObject"],HTML_INTEGRATION_POINTS:{foreignobject:true},FORBID_TAGS:["script","img","image","iframe","object","embed","audio","video","source","form"],FORBID_ATTR:["href","xlink:href"]});
      }).catch(()=>{ /* Failure retains the previously readable SVG; subsequent theme events can be retried. */ });
    }
  });
  return {render,dispose(){disposed=true;unwatch();entries.clear();cancel_load?.();frame?.remove();frame=undefined;}};
}
