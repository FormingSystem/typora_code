import { marked, type TokensList } from "marked";
import DOMPurify from "dompurify";
import type { workspace_file_host } from "./workspace_files";
import type { workspace_search_file, workspace_search_match } from "./workspace_search_engine";
import { decode_file_bytes, detect_binary_bytes, is_markdown_file } from "./file_language";
import { git_diff_editor } from "./git_diff_editor";
import { graph_element as el } from "./git_graph_widgets";
import preview_css from "./workspace_lookup_preview.css";
import { highlight_preview_code, create_preview_diagrams } from "./workspace_markdown_preview_render";

const SCALE_KEY = "linux-note:lookup:preview-scale:v1";
const clamp_scale = (value: number) => Number.isFinite(value) ? Math.min(150, Math.max(50, Math.round(value))) : 80;
// Marked 14 的 Lexer.blockTokens 会把行首制表符展开为四个空格；块偏移和命中偏移必须使用同一坐标。
const markdown_source = (text: string) => text.replace(/\r\n?/gu,"\n").replace(/^( *)(\t+)/gmu,(_,leading:string,tabs:string)=>leading+"    ".repeat(tabs.length));

/** 侧栏预览独立于中央编辑器，不切换文档、不创建工作区标签，也不改变正文选区。 */
export function create_lookup_preview(files: workspace_file_host) {
  const container = el("section", "workspace-lookup-preview");
  const style = el("style"); style.textContent = preview_css; document.head.append(style);
  const body = el("div", "workspace-lookup-preview-body"); body.tabIndex = 0; body.setAttribute("aria-label", "命中内容预览");
  const markdown_host = el("div", "workspace-lookup-markdown");
  const shadow = markdown_host.attachShadow({mode: "open"});
  const reader = el("article"); reader.id = "write";
  const theme_style = el("style"); shadow.append(theme_style,reader);
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
  const apply_scale = () => {
    container.dataset.previewScale = String(scale);
    reader.style.setProperty("font-size", `${base_font()}px`, "important");
    // zoom 保留主题中的 rem/em、表格和代码尺寸关系，容器据缩放后的宽度重新排版。
    reader.style.zoom = String(scale / 100);
    editor?.focused_editor().updateOptions({fontSize: base_font() * scale / 100, lineHeight: Math.round(base_font() * 1.5 * scale / 100), minimap: {enabled: false}});
    editor?.sync_theme();
    requestAnimationFrame(reveal_code);
  };
  const update_theme = () => {
    const rules: string[]=[];
    // Shadow DOM 中复用已有主题规则，既不影响正文，也不让预览内容被正文增强器再次接管。
    for (const sheet of [...document.styleSheets]) {
      try {
        const text = [...sheet.cssRules].map(rule => rule.cssText).filter(rule => rule.includes("#write") || rule.startsWith(":root")).join("\n");
        if (text) rules.push(text);
      } catch { /* 不可读取的外部样式不阻塞内容，下面提供基本正文样式。 */ }
    }
    const local = el("style"); local.textContent = `:host{display:block;color:inherit}#write{position:static!important;width:auto!important;max-width:none!important;min-width:0!important;margin:0!important;padding:12px!important;inset:auto!important;color:inherit!important;overflow-wrap:anywhere;line-height:1.6}#write h1{font-size:1.8em}#write h2{font-size:1.5em}#write h3{font-size:1.25em}#write p{margin:.7em 0}#write pre{overflow:auto;background:rgba(127,127,127,.08);padding:8px}#write pre code{white-space:pre}#write table{border-collapse:collapse;width:100%}#write th,#write td{border:1px solid rgba(127,127,127,.3);padding:5px 8px}#write img{max-width:100%}#write .lookup-target-block{outline:1px solid var(--select-text-bg-color,#007acc);outline-offset:2px}#write mark{background:#ffe799;color:#242424}#write a{cursor:default}#write input{pointer-events:none}`;
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
  const set_scale = (value: number) => {
    if (disposed) return;
    scale = clamp_scale(value);
    apply_scale(); reveal();
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
      block.innerHTML = DOMPurify.sanitize(marked.parser(single, {gfm: true}), {FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "img", "audio", "video", "source"], FORBID_ATTR: ["style", "id", "name"], ALLOW_DATA_ATTR: false});
      // 预览中的链接仅作阅读，不让一次单击间接导航或离开当前文档。
      for (const link of block.querySelectorAll("a")) { link.removeAttribute("href"); link.removeAttribute("target"); }
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
    body.replaceChildren(markdown_host); apply_scale(); requestAnimationFrame(reveal);
  };
  const show = async (file: workspace_search_file, match: workspace_search_match) => {
    const request = ++generation; selected = {file, match}; body.setAttribute("aria-label",`命中内容预览：${file.relative_path}，行 ${match.line}，列 ${match.column}`);
    editor?.dispose(); editor = undefined; selected_block = undefined; body.replaceChildren(el("p", "workspace-lookup-preview-message", "正在读取预览…"));
    try {
      const stat = await files.fs.promises.stat(file.file_path);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error("预览支持 2 MiB 以内的文本文件；双击结果可打开完整文件。");
      const bytes = await files.fs.promises.readFile(file.file_path); if (disposed || request !== generation) return;
      if (detect_binary_bytes(bytes)) throw new Error("该文件已变为二进制，无法预览文本。");
      const text = decode_file_bytes(bytes).text;
      if (is_markdown_file(file.file_path)) await render_markdown(text, match,request);
      else {
        editor = new git_diff_editor({title: file.relative_path, file: file.file_path, left: text, left_label: file.relative_path});
        body.replaceChildren(editor.container); apply_scale();
        const view = editor.focused_editor(); const selection = {startLineNumber: match.line, startColumn: match.column, endLineNumber: match.end_line, endColumn: match.end_column}; view.setSelection(selection); view.layout(); view.revealRangeInCenter(selection);
      }
      if(!disposed&&request===generation)body.dataset.previewPath = file.file_path;
    } catch (error) { if (!disposed && request === generation) body.replaceChildren(el("p", "workspace-lookup-preview-message", String(error))); }
  };
  const theme_observer = new MutationObserver(() => {if (selected && is_markdown_file(selected.file.file_path)) update_theme(); else apply_scale();});
  theme_observer.observe(document.documentElement, {attributes: true, attributeFilter: ["class", "style"]}); theme_observer.observe(document.body, {attributes: true, attributeFilter: ["class", "style"]});
  const resize_observer = new ResizeObserver(reveal_code); resize_observer.observe(body);
  apply_scale();
  return {container, show, get_scale:()=>scale, set_scale, dispose() {disposed = true; generation++; body.removeEventListener("wheel", wheel, true); editor?.dispose(); diagrams.dispose(); theme_observer.disconnect(); resize_observer.disconnect(); style.remove(); container.remove();}};
}
