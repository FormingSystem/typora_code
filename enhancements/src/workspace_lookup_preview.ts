import {markdown_theme_rules} from './workspace_markdown_theme';
import {bind_reading_reflow,capture_reflow_anchor,restore_reflow_anchor} from "./reading_reflow";
import {bind_reading_code_copy} from "./reading_code_copy";
import {acquire_workspace_style} from "./workspace_styles";
import { marked, type TokensList } from "marked";
import DOMPurify from "dompurify";
import type { workspace_file_host } from "./workspace_files";
import type { workspace_search_file, workspace_search_match } from "./workspace_search_engine";
import { decode_file_bytes, detect_binary_bytes, is_markdown_file } from "./file_language";
import { git_diff_editor } from "./git_diff_editor";
import { workspace_element as el } from "./workspace_widgets";
import preview_css from "./workspace_lookup_preview.css";
import { highlight_preview_code, create_preview_diagrams } from "./workspace_markdown_preview_render";

const SCALE_KEY = "linux-note:lookup:preview-scale:v1";
const clamp_scale = (value: number) => Number.isFinite(value) ? Math.min(150, Math.max(50, Math.round(value))) : 80;
// Marked 14 的 Lexer.blockTokens 会把行首制表符展开为四个空格；块偏移和命中偏移必须使用同一坐标。
const markdown_source = (text: string) => text.replace(/\r\n?/gu,"\n").replace(/^( *)(\t+)/gmu,(_,leading:string,tabs:string)=>leading+"    ".repeat(tabs.length));

/** 侧栏预览独立于中央编辑器，不切换文档、不创建工作区标签，也不改变正文选区。 */
export function create_lookup_preview(files: workspace_file_host, read_content?:(file_path:string)=>Promise<string>, options:{navigate?:(href:string)=>void}={}) {
  const container = el("section", "workspace-lookup-preview");
  const style = acquire_workspace_style("typora-code-style:workspace_lookup_preview", preview_css, {});
  const body = el("div", "workspace-lookup-preview-body"); body.tabIndex = 0; body.setAttribute("aria-label", "命中内容预览");
  const markdown_host = el("div", "workspace-lookup-markdown");
  const shadow = markdown_host.attachShadow({mode: "open"});
  const reader = el("article"); reader.id = "write";
  const theme_style = el("style"); shadow.append(theme_style,reader);
  const reflow=bind_reading_reflow(body,reader);
  const code_copy=bind_reading_code_copy(reader,text=>files.copy(text));
  container.append(body); container.setAttribute("data-linux-note-lookup-preview", "ready");
  let scale = 80; try { scale = clamp_scale(Number(localStorage.getItem(SCALE_KEY) || 80)); } catch { /* 禁止存储时仍可调整本次字号。 */ }
  let editor: git_diff_editor | undefined; let generation = 0; let disposed = false;
  const diagrams=create_preview_diagrams();
  let selected: {file: workspace_search_file; match: workspace_search_match} | undefined;
  let selected_block: HTMLElement | undefined;
  const base_font = () => parseFloat(getComputedStyle(document.querySelector("#write") || document.body).fontSize) || 16;
  const reveal_code = () => {
    const view=editor?.focused_editor();if(!view)return;view.layout();const selection=view.getSelection();if(!selection)return;view.revealRangeInCenter(selection);
    const layout=view.getLayoutInfo();const end=view.getScrolledVisiblePosition(selection.getEndPosition()),start=view.getScrolledVisiblePosition(selection.getStartPosition());
    const right=layout.width-layout.verticalScrollbarWidth-4;
    if(end&&end.left>right)view.setScrollLeft(view.getScrollLeft()+end.left-right);
    else if(start&&start.left<layout.contentLeft)view.setScrollLeft(Math.max(0,view.getScrollLeft()+start.left-layout.contentLeft));
  };
  const retain_visible_code_selection=()=>{
    const view=editor?.focused_editor(),selection=view?.getSelection();if(!view||!selection)return;
    const start=view.getScrolledVisiblePosition(selection.getStartPosition()),end=view.getScrolledVisiblePosition(selection.getEndPosition()),layout=view.getLayoutInfo();
    if(!start||start.top<0||start.top>=layout.height)return;
    const right=layout.width-layout.verticalScrollbarWidth-4;
    if(start.left<layout.contentLeft)view.setScrollLeft(Math.max(0,view.getScrollLeft()+start.left-layout.contentLeft));
    else if(end&&end.left>right&&end.left-start.left<right-layout.contentLeft)view.setScrollLeft(view.getScrollLeft()+end.left-right);
  };
  const apply_scale = () => {
    container.dataset.previewScale = String(scale);
    reader.style.setProperty("font-size", `${base_font()}px`, "important");
    // zoom 保留主题中的 rem/em、表格和代码尺寸关系，容器据缩放后的宽度重新排版。
    reader.style.zoom = String(scale / 100);
    editor?.focused_editor().updateOptions({fontSize: base_font() * scale / 100, lineHeight: Math.round(base_font() * 1.5 * scale / 100), minimap: {enabled: false}});
    editor?.sync_theme();

  };
  const update_theme = () => {
    const rules: string[]=[];
    // Shadow DOM 中复用已有主题规则，既不影响正文，也不让预览内容被正文增强器再次接管。
    rules.push(markdown_theme_rules());
    const local = el("style"); local.textContent = `:host{display:block;color:inherit}#write{position:static!important;width:auto!important;max-width:none!important;min-width:0!important;margin:0!important;padding:12px!important;inset:auto!important;overflow-wrap:anywhere}#write img{max-width:100%}#write .lookup-target-block{outline:1px solid var(--select-text-bg-color,#007acc);outline-offset:2px}#write mark{background:#ffe799;color:#242424}#write a{cursor:${options.navigate?"pointer":"default"}}#write input{pointer-events:none}`;
    local.textContent += `#write{--lookup-code-keyword:#0000ff;--lookup-code-string:#a31515;--lookup-code-comment:#008000;--lookup-code-number:#098658;--lookup-code-type:#267f99}#write[data-preview-theme=dark]{--lookup-code-keyword:#569cd6;--lookup-code-string:#ce9178;--lookup-code-comment:#6a9955;--lookup-code-number:#b5cea8;--lookup-code-type:#4ec9b0}#write .lookup-code-keyword,#write .lookup-code-tag,#write .lookup-code-metatag{color:var(--lookup-code-keyword)}#write .lookup-code-string,#write .lookup-code-regexp{color:var(--lookup-code-string)}#write .lookup-code-comment{color:var(--lookup-code-comment)}#write .lookup-code-number{color:var(--lookup-code-number)}#write .lookup-code-type,#write .lookup-code-attribute{color:var(--lookup-code-type)}#write .lookup-diagram svg{max-width:100%;height:auto}#write .lookup-diagram-source-label{font-size:.8em;opacity:.65}`;
    rules.push(local.textContent||"");const text=rules.join("\n");
    // 原生侧栏反复修改 body.class。只更新样式，不能移走 reader 令预览滚动位置归零。
    if(theme_style.textContent!==text)theme_style.textContent=text;
    const color=getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number)||[0,0,0];
    reader.dataset.previewTheme=color[0]+color[1]+color[2]>450?"dark":"light";
    apply_scale();
  };
  const reveal = () => {
    if (!selected_block) return;
    const block_rect = selected_block.getBoundingClientRect(), body_rect = body.getBoundingClientRect();
    body.scrollTop += block_rect.top - body_rect.top - Math.max(8, (body.clientHeight - Math.min(block_rect.height, body.clientHeight)) / 2);
  };
  /** 重选命中是定位命令；复用当前内容，并恢复原搜索范围而非预览中后来改动的选区。 */
  const reveal_match = () => {
    if(disposed||!selected||!body.isConnected||!body.getClientRects().length)return;
    const view=editor?.focused_editor();
    if(view){
      const match=selected.match;
      view.setSelection({startLineNumber:match.line,startColumn:match.column,endLineNumber:match.end_line,endColumn:match.end_column});
      reveal_code();
    }else reveal();
  };
  const set_scale = (value: number) => {
    if (disposed) return;
    const view=editor?.focused_editor(),state=view?.saveViewState(),line=view?.getVisibleRanges()[0]?.startLineNumber;
    const offset=view&&line?view.getScrollTop()-view.getTopForLineNumber(line):0;
    reflow.change(()=>{scale = clamp_scale(value);apply_scale();});
    if(view&&state){view.restoreViewState(state);if(line)view.setScrollTop(view.getTopForLineNumber(line)+offset);retain_visible_code_selection();}
    try {localStorage.setItem(SCALE_KEY, String(scale));} catch { /* 本次设置仍生效。 */ }
  };
  const wheel = (event: WheelEvent) => {
    if (disposed || !(event.ctrlKey || event.metaKey) || !event.deltaY) return;
    // 捕获阶段先于 Monaco 和浏览器处理；到达缩放边界时也不能穿透为页面缩放。
    event.preventDefault(); event.stopImmediatePropagation();
    set_scale(scale + (event.deltaY < 0 ? 5 : -5));
  };
  body.addEventListener("wheel", wheel, {capture: true, passive: false});
  const render_markdown = async (text: string, match: workspace_search_match, request: number) => {
    update_theme();
    const content=document.createDocumentFragment();let target_block:HTMLElement|undefined;
    // 按 lexer 的完整块建立源码偏移映射，列表、表格和代码围栏不会被逐行拆坏。
    const normalized = markdown_source(text);
    const start = markdown_source(text.slice(0, match.start)).length;
    // Front Matter 不应被解释成分隔线和巨大标题；只在命中其内容时显示 YAML 源码。
    const front_matter=normalized.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/u)?.[0]||"";
    const tokens = marked.lexer(normalized.slice(front_matter.length), {gfm: true}); let offset = front_matter.length;
    if(front_matter&&start<front_matter.length)tokens.unshift({type:"code",raw:front_matter,text:front_matter,lang:"yaml"});
    const rendering:Promise<unknown>[]=[];
    for (const token of tokens) {
      const token_start = token.raw===front_matter?0:normalized.indexOf(token.raw, offset); const safe_start = token_start < 0 ? offset : token_start;
      const block = el("div"); block.dataset.sourceStart = String(safe_start);
      const single = Object.assign([token], {links: tokens.links}) as TokensList;
      block.innerHTML = DOMPurify.sanitize(marked.parser(single, {gfm: true}), {FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "img", "audio", "video", "source"], FORBID_ATTR: ["style", "id", "name", "contenteditable", "autofocus"], ALLOW_DATA_ATTR: false});
      // 仅由预览所有者处理；不把默认浏览器导航交给宿主正文。
      for (const link of block.querySelectorAll("a")) {
        const href=link.getAttribute("href");link.removeAttribute("href");link.removeAttribute("target");
        if(options.navigate&&href){link.dataset.previewHref=href;link.tabIndex=0;link.setAttribute("role","link");}
      }
      const target=start >= safe_start && start < safe_start + token.raw.length;
      if (target) { target_block = block; block.classList.add("lookup-target-block"); }
      for(const code of block.querySelectorAll<HTMLElement>("pre code")){
        rendering.push((async()=>{
          if(code.classList.contains("language-mermaid"))await diagrams.render(code,body.clientWidth,target,()=>!disposed&&request===generation);
          if(code.parentElement&&!disposed&&request===generation)await highlight_preview_code(code);
        })());
      }
      content.append(block); offset = safe_start + token.raw.length;
    }
    await Promise.all(rendering);
    if(disposed||request!==generation)return;
    reader.replaceChildren(content);selected_block=target_block;
    code_copy.reconcile([...reader.querySelectorAll<HTMLElement>("pre > code")].map(code=>({element:code.parentElement!,read_text:()=>code.textContent||""})));
    if (selected_block && match.text) {
      const needle = match.text.replace(/\r\n?/gu, "\n");
      const raw_start = Number(selected_block.dataset.sourceStart);
      // 链接目标地址等源码文字并不显示，先渲染命中前的块内容再计数，避免把 URL 中同名词算进正文。
      const prefix_tokens=marked.lexer(normalized.slice(raw_start,start),{gfm:true});prefix_tokens.links=tokens.links;
      const prefix=el("div");prefix.innerHTML=DOMPurify.sanitize(marked.parser(prefix_tokens),{FORBID_TAGS:["img","style","iframe","object","embed","audio","video","source"]});
      const occurrence = (prefix.textContent||"").split(needle).length - 1;
      const target_content=selected_block.querySelector(".lookup-diagram-source-label + pre code")||selected_block;
      const walker = document.createTreeWalker(target_content, NodeFilter.SHOW_TEXT); let node: Node | null; const nodes: {node: Node; start: number; end: number}[] = []; let visible = "";
      while ((node = walker.nextNode())) {const start = visible.length; visible += node.textContent || ""; nodes.push({node, start, end: visible.length});}
      let found = -1; for (let index = 0; index <= occurrence; index++) { const next = visible.indexOf(needle, found + 1); if (next < 0) break; found = next; }
      if (found >= 0) {
        const from = nodes.find(item => item.start <= found && item.end > found), to = nodes.find(item => item.start < found + needle.length && item.end >= found + needle.length);
        if (from && to) { const range = document.createRange(); range.setStart(from.node, found - from.start); range.setEnd(to.node, found + needle.length - to.start); const mark = el("mark"); mark.append(range.extractContents()); range.insertNode(mark); selected_block = mark; }
      }
    }
    body.replaceChildren(markdown_host); apply_scale(); reveal();reflow.capture();
  };
  const show = async (file: workspace_search_file, match: workspace_search_match, hash = "", live = false) => {
    const request = ++generation; selected = {file, match}; body.setAttribute("aria-label",`命中内容预览：${file.relative_path}，行 ${match.line}，列 ${match.column}`);
    for (const key of ["previewPath","previewKind","previewLine","previewColumn","previewEndLine","previewEndColumn","previewText"]) delete body.dataset[key];
    code_copy.reconcile([]);
    editor?.dispose(); editor = undefined; selected_block = undefined; body.replaceChildren(el("p", "workspace-lookup-preview-message", "正在读取预览…"));
    try {
      let text:string;
      if(read_content)text=await read_content(file.file_path);
      else {
      const stat = await files.fs.promises.stat(file.file_path);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error("预览支持 2 MiB 以内的文本文件；双击结果可打开完整文件。");
      const bytes = await files.fs.promises.readFile(file.file_path); if (disposed || request !== generation) return;
      if (detect_binary_bytes(bytes)) throw new Error("该文件已变为二进制，无法预览文本。");
      text = live&&files.read_text ? await files.read_text(file.file_path) : decode_file_bytes(bytes).text;
      }
      if(disposed||request!==generation)return;
      if(text.length>2*1024*1024)throw new Error("正文超过2 MiB预览上限。");
      if(hash&&is_markdown_file(file.file_path)){
        let name=hash.slice(1);try{name=decodeURIComponent(name);}catch{/* 非法编码按原文字匹配。 */}
        const slug=(value:string)=>value.toLowerCase().trim().replace(/<[^>]*>/gu,"").replace(/[\\`*_~]/gu,"").replace(/[^\p{L}\p{N}\s_-]/gu,"").replace(/\s/gu,"-");
        let offset=0;const used=new Map<string,number>(),normalized=text.replace(/\r\n?/gu,"\n");
        for(const token of marked.lexer(normalized)){
          const start=normalized.indexOf(token.raw,offset);offset=Math.max(offset,start)+token.raw.length;
          if(token.type!=="heading")continue;
          const base=slug(token.text),count=used.get(base)||0;used.set(base,count+1);
          if(name===token.text||name===(count?`${base}-${count}`:base)||slug(name)===(count?`${base}-${count}`:base)){
            const line=normalized.slice(0,start).split("\n").length;const original=text.split(/(?<=\n)/u).slice(0,line-1).join("").length;
            match={...match,start:original,end:original,line,end_line:line,text:""};selected={file,match};break;
          }
        }
      }
      if (is_markdown_file(file.file_path)) await render_markdown(text, match,request);
      else {
        editor = new git_diff_editor({title: file.relative_path, file: file.file_path, left: text, left_label: file.relative_path});
        body.replaceChildren(editor.container); apply_scale();
        reveal_match();
      }
      if(!disposed&&request===generation){
        Object.assign(body.dataset,{previewPath:file.file_path,previewKind:is_markdown_file(file.file_path)?"markdown":"source",previewLine:String(match.line),previewColumn:String(match.column),previewEndLine:String(match.end_line),previewEndColumn:String(match.end_column),previewText:match.text});
        return true;
      }
    } catch (error) { if (!disposed && request === generation) body.replaceChildren(el("p", "workspace-lookup-preview-message", String(error))); return false; }
  };
  const follow_link=(event:MouseEvent|KeyboardEvent)=>{
    if(event instanceof KeyboardEvent&&event.key!=="Enter")return;
    const link=(event.target instanceof Element?event.target:event.target instanceof Node?event.target.parentElement:null)?.closest<HTMLElement>('[data-preview-href]');
    if(!link||!reader.contains(link)||!options.navigate)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||(event instanceof MouseEvent&&event.button!==0)||(event instanceof KeyboardEvent&&event.repeat))return;
    options.navigate(link.dataset.previewHref!);
  };
  reader.addEventListener('click',follow_link);reader.addEventListener('keydown',follow_link);
  const capture_position=()=>{
    const anchor=capture_reflow_anchor(body,reader),path:number[]=[];
    if(anchor){let node:Node=anchor.node;while(node!==reader&&node.parentNode){path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes,node));node=node.parentNode;}}
    return {scroll_top:body.scrollTop,scroll_left:body.scrollLeft,editor_state:editor?.focused_editor().saveViewState(),anchor:anchor?{path,offset:anchor.offset,top:anchor.top,text:anchor.node.textContent}:undefined};
  };
  const restore_position=(position:ReturnType<typeof capture_position>)=>{
    const view=editor?.focused_editor();if(view&&position.editor_state)view.restoreViewState(position.editor_state);
    body.scrollTop=position.scroll_top;body.scrollLeft=position.scroll_left;
    const anchor=position.anchor;let node:Node|undefined=reader;
    if(anchor){for(const index of anchor.path)node=node?.childNodes[index];if(node instanceof Text&&node.textContent===anchor.text)restore_reflow_anchor(body,reader,{node,offset:anchor.offset,top:anchor.top});}
    reflow.capture();
  };
  const theme_observer = new MutationObserver(() => {if (selected && is_markdown_file(selected.file.file_path)) update_theme(); else apply_scale();});
  theme_observer.observe(document.documentElement, {attributes: true, attributeFilter: ["class", "style"]}); theme_observer.observe(document.body, {attributes: true, attributeFilter: ["class", "style"]});
  const resize_observer = new ResizeObserver(()=>{const view=editor?.focused_editor();if(view){const state=view.saveViewState();view.layout();if(state)view.restoreViewState(state);retain_visible_code_selection();}}); resize_observer.observe(body);
  apply_scale();
  const clear=()=>{generation++;code_copy.reconcile([]);selected=undefined;selected_block=undefined;editor?.dispose();editor=undefined;body.replaceChildren();};
  return {container, show, clear, reveal_match, capture_position, restore_position, focus:()=>body.focus({preventScroll:true}), get_scale:()=>scale, set_scale, dispose() {disposed = true; reader.removeEventListener("click",follow_link);reader.removeEventListener("keydown",follow_link);code_copy.dispose(); reflow.dispose(); generation++; body.removeEventListener("wheel", wheel, true); editor?.dispose(); diagrams.dispose(); theme_observer.disconnect(); resize_observer.disconnect(); style.remove(); container.remove();}};
}
