import {workspace_text} from "./workspace_i18n";
import {markdown_theme_rules,observe_markdown_theme} from './workspace_markdown_theme';
import {bind_reading_reflow,capture_reflow_anchor,restore_reflow_anchor} from "./reading_reflow";
import {bind_reading_code_copy} from "./reading_code_copy";
import {acquire_workspace_style} from "./workspace_styles";
import { marked, type TokensList } from "marked";
import DOMPurify from "dompurify";
import type { workspace_file_host } from "./workspace_files";
import type { workspace_search_file, workspace_search_match } from "./workspace_search_engine";
import { decode_file_bytes, detect_binary_bytes, is_markdown_file } from "./file_language";
import { git_diff_editor } from "./git_diff_editor";
import { workspace_element as el, workspace_menu } from "./workspace_widgets";
import preview_css from "./workspace_lookup_preview.css";
import { highlight_preview_code, create_preview_diagrams } from "./workspace_markdown_preview_render";

const SCALE_KEY = "linux-note:lookup:preview-scale:v1";
const clamp_scale = (value: number) => Number.isFinite(value) ? Math.min(150, Math.max(50, Math.round(value))) : 80;
// The Lexer.blockTokens of Marked 14 will expand the leading tab character into four spaces; block offset and hit offset must use the same coordinate.
const markdown_source = (text: string) => text.replace(/\r\n?/gu,"\n").replace(/^( *)(\t+)/gmu,(_,leading:string,tabs:string)=>leading+"    ".repeat(tabs.length));

/** Sidebar preview is independent of the central editor, does not switch documents, does not create workspace tabs, and does not change the selection of the document content. */
export function create_lookup_preview(files: workspace_file_host, read_content?:(file_path:string)=>Promise<string>, options:{search_anchor?:boolean;navigate?:(href:string)=>void; visible_match?:(file:workspace_search_file,match:workspace_search_match)=>void}={}) {
  const container = el("section", "workspace-lookup-preview");
  const style = acquire_workspace_style("typora-code-style:workspace_lookup_preview", preview_css, {});
  const body = el("div", "workspace-lookup-preview-body"); body.tabIndex = 0; body.setAttribute("aria-label", workspace_text("lookup_preview_hit_content_preview"));
  const markdown_host = el("div", "workspace-lookup-markdown");
  const shadow = markdown_host.attachShadow({mode: "open"});
  const reader = el("article"); reader.id = "write";
  const theme_style = el("style"); shadow.append(theme_style,reader);
  const reflow=bind_reading_reflow(body,reader);
  const code_copy=bind_reading_code_copy(reader,text=>files.copy(text));
  container.append(body); container.setAttribute("data-linux-note-lookup-preview", "ready");
  let scale = 80; try { scale = clamp_scale(Number(localStorage.getItem(SCALE_KEY) || 80)); } catch { /* Adjustment of the font size is allowed even if it is not stored. */ }
  let editor: git_diff_editor | undefined; let generation = 0; let disposed = false;
  const diagrams=create_preview_diagrams();
  let selected: {file: workspace_search_file; match: workspace_search_match} | undefined;
  let selected_block: HTMLElement | undefined;
  let ready = false, loaded_text = "";
  let targets = new Map<string, HTMLElement>();
  let source_decorations: string[] = [];
  let source_scroll: {dispose():void} | undefined;
  let visible_id = "", scroll_frame = 0, geometry_dirty = true;
  let positions: {match:workspace_search_match;top:number}[] = [];
  const publish_position = () => {
    scroll_frame = 0;
    if(disposed || !ready || !selected || !options.visible_match || !body.getClientRects().length)return;
    const view = editor?.focused_editor();
    if(geometry_dirty){
      const top = body.getBoundingClientRect().top;
      positions = selected.file.matches.map(match => ({match,top:view ? view.getTopForLineNumber(match.line) : targets.has(match.id) ? targets.get(match.id)!.getBoundingClientRect().top-top+body.scrollTop : NaN})).filter(item=>Number.isFinite(item.top)).sort((a,b)=>a.top-b.top||a.match.start-b.match.start);
      geometry_dirty = false;
    }
    if(!positions.length)return;
    const scroll_top=view?view.getScrollTop():body.scrollTop;
    const height=view?view.getLayoutInfo().height:body.clientHeight;
    const scroll_height=view?view.getScrollHeight():body.scrollHeight;
    const center=scroll_top<=1?0:scroll_top+height>=scroll_height-1?scroll_height:scroll_top+height/2;
    let low=0,high=positions.length;
    while(low<high){const middle=(low+high)>>>1;if(positions[middle].top<center)low=middle+1;else high=middle;}
    const next=positions[Math.min(low,positions.length-1)],previous=positions[Math.max(0,low-1)];
    const current=Math.abs(previous.top-center)<=Math.abs(next.top-center)?previous:next;
    if(current.match.id===visible_id)return;
    visible_id=current.match.id;options.visible_match(selected.file,current.match);
  };
  const schedule_position = () => {if(!scroll_frame&&!disposed)scroll_frame=requestAnimationFrame(publish_position);};
  const invalidate_positions = () => {geometry_dirty=true;schedule_position();};
  body.addEventListener("scroll",schedule_position,{passive:true});
  const match_resize = new ResizeObserver(invalidate_positions);match_resize.observe(reader);match_resize.observe(body);
  const paint_anchor = () => {
    if(!selected)return;
    for(const mark of reader.querySelectorAll<HTMLElement>("mark[data-lookup-match]"))mark.classList.toggle("lookup-anchor-match",options.search_anchor!==false&&mark.dataset.lookupMatch===selected.match.id);
    for(const block of reader.querySelectorAll(".lookup-target-block"))block.classList.remove("lookup-target-block");
    selected_block=targets.get(selected.match.id);
    selected_block?.closest<HTMLElement>("[data-source-start]")?.classList.add("lookup-target-block");
    const view=editor?.focused_editor();
    if(view)source_decorations=view.deltaDecorations(source_decorations,selected.file.matches.map(match=>({range:{startLineNumber:match.line,startColumn:match.column,endLineNumber:match.end_line,endColumn:match.end_column},options:{className:options.search_anchor!==false&&match.id===selected!.match.id?"lookup-search-match lookup-anchor-match":"lookup-search-match"}})));
  };
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
    if(container.dataset.previewScale!==String(scale))container.dataset.previewScale = String(scale);
    const font=base_font();
    if(reader.style.fontSize!==`${font}px`)reader.style.setProperty("font-size", `${font}px`, "important");
    // CSS zoom preserves relative theme sizes; the container reflows at the scaled width.
    if(reader.style.zoom!==String(scale/100))reader.style.zoom = String(scale / 100);
    editor?.focused_editor().updateOptions({fontSize: font * scale / 100, lineHeight: Math.round(font * 1.5 * scale / 100), minimap: {enabled: false}});
    editor?.sync_theme();
    const color=getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number)||[0,0,0];
    const dark=color[0]+color[1]+color[2]>450;
    container.style.setProperty("--lookup-match-background",dark?"#27678280":"#0069CC1A");
    container.style.setProperty("--lookup-anchor-background",dark?"#27678290":"#0069CC40");
    invalidate_positions();

  };
  const update_theme = () => {
    const rules: string[]=[];
    // Shadow DOM reuses theme rules while isolating the preview from document enhancers.
    rules.push(markdown_theme_rules());
    const local = el("style"); local.textContent = `:host{display:block;color:inherit}#write{position:static!important;width:auto!important;max-width:none!important;min-width:0!important;margin:0!important;padding:12px!important;inset:auto!important;overflow-wrap:anywhere}#write img{max-width:100%}#write .lookup-target-block{outline:1px solid var(--select-text-bg-color,#007acc);outline-offset:2px}#write mark[data-lookup-match]{background:var(--lookup-match-background);color:inherit}#write mark.lookup-anchor-match{background:var(--lookup-anchor-background);outline:1px solid var(--vscode-focusBorder,#0069CC)}#write a{cursor:${options.navigate?"pointer":"default"}}#write input{pointer-events:none}`;
    local.textContent += `#write .lookup-diagram svg{max-width:100%;height:auto}#write .lookup-diagram-source-label{font-size:.8em;opacity:.65}`;
    rules.push(local.textContent||"");const text=rules.join("\n");
    // Native sidebar repeatedly modifies body.class. Only update styles, cannot remove reader to make the preview scroll position return to zero.
    if(theme_style.textContent!==text)theme_style.textContent=text;
    const color=getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number)||[0,0,0];
    const mode=color[0]+color[1]+color[2]>450?"dark":"light";if(reader.dataset.previewTheme!==mode)reader.dataset.previewTheme=mode;
    apply_scale();
  };
  const reveal = () => {
    if (!selected_block) return;
    const block_rect = selected_block.getBoundingClientRect(), body_rect = body.getBoundingClientRect();
    body.scrollTop += block_rect.top - body_rect.top - Math.max(8, (body.clientHeight - Math.min(block_rect.height, body.clientHeight)) / 2);
  };
  /** Re-selection hit is a positioning command; reuse current content, and restore original search range rather than the later modified selection in the preview. */
  const reveal_match = () => {
    if(disposed||!selected||!body.isConnected||!body.getClientRects().length)return;
    const view=editor?.focused_editor();
    if(view){
      const match=selected.match;
      view.setSelection({startLineNumber:match.line,startColumn:match.column,endLineNumber:match.end_line,endColumn:match.end_column});
      reveal_code();
    }else {reveal();reflow.capture();}
    schedule_position();
  };
  const set_scale = (value: number) => {
    if (disposed) return;
    const view=editor?.focused_editor(),state=view?.saveViewState(),line=view?.getVisibleRanges()[0]?.startLineNumber;
    const offset=view&&line?view.getScrollTop()-view.getTopForLineNumber(line):0;
    reflow.change(()=>{scale = clamp_scale(value);apply_scale();});
    if(view&&state){view.restoreViewState(state);if(line)view.setScrollTop(view.getTopForLineNumber(line)+offset);retain_visible_code_selection();}
    try {localStorage.setItem(SCALE_KEY, String(scale));} catch { /* The current setting is still effective. */ }
  };
  const wheel = (event: WheelEvent) => {
    if (disposed || !(event.ctrlKey || event.metaKey) || !event.deltaY) return;
    // Capture phase is prior to Monaco and browser processing; when reaching the zoom boundary, it cannot penetrate as page zoom.
    event.preventDefault(); event.stopImmediatePropagation();
    set_scale(scale + (event.deltaY < 0 ? 5 : -5));
  };
  body.addEventListener("wheel", wheel, {capture: true, passive: false});
  const render_markdown = async (text: string, match: workspace_search_match, request: number, preserve_position=false) => {
    update_theme();
    const render_targets=new Map<string,HTMLElement>();
    const content=document.createDocumentFragment();let target_block:HTMLElement|undefined;
    const matches=selected!.file.matches.length?selected!.file.matches:[match];
    const mapped=matches.map(hit=>({hit,start:markdown_source(text.slice(0,hit.start)).length}));
    // Establish source code offset mapping based on the complete block of lexer; lists, tables, and code fences will not be line-by-line broken down.
    const normalized = markdown_source(text);
    const start = markdown_source(text.slice(0, match.start)).length;
    // The Front Matter should not be interpreted as a separator and a large heading; it will only display the YAML source code when its content is hit.
    const front_matter=normalized.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/u)?.[0]||"";
    const tokens = marked.lexer(normalized.slice(front_matter.length), {gfm: true}); let offset = front_matter.length;
    if(front_matter&&mapped.some(item=>item.start<front_matter.length))tokens.unshift({type:"code",raw:front_matter,text:front_matter,lang:"yaml"});
    const rendering:Promise<unknown>[]=[];
    for (const token of tokens) {
      const token_start = token.raw===front_matter?0:normalized.indexOf(token.raw, offset); const safe_start = token_start < 0 ? offset : token_start;
      const block = el("div"); block.dataset.sourceStart = String(safe_start); block.dataset.sourceEnd=String(safe_start+token.raw.length);
      const single = Object.assign([token], {links: tokens.links}) as TokensList;
      block.innerHTML = DOMPurify.sanitize(marked.parser(single, {gfm: true}), {FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "img", "audio", "video", "source"], FORBID_ATTR: ["style", "id", "name", "contenteditable", "autofocus"], ALLOW_DATA_ATTR: false});
      // Only preview owners handle it; do not pass default browser navigation to the host document.
      for (const link of block.querySelectorAll("a")) {
        const href=link.getAttribute("href");link.removeAttribute("href");link.removeAttribute("target");
        if(options.navigate&&href){link.dataset.previewHref=href;link.tabIndex=0;link.setAttribute("role","link");}
      }
      const block_matches=mapped.filter(item=>item.start>=safe_start&&item.start<safe_start+token.raw.length);
      for(const item of block_matches)render_targets.set(item.hit.id,block);
      const target=block_matches.length>0;
      if (start>=safe_start&&start<safe_start+token.raw.length) target_block=block;
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
    if(target_block&&!render_targets.has(match.id))render_targets.set(match.id,target_block);
    let decorated=0;
    for(const item of [...mapped].reverse()){
      const match=item.hit,start=item.start;
      const selected_block=render_targets.get(match.id);
      if(!selected_block||!match.text||text.slice(match.start,match.end)!==match.text)continue;
      if(++decorated%64===0){await new Promise<void>(resolve=>setTimeout(resolve,0));if(disposed||request!==generation)return;}
      const block_source=normalized.slice(Number(selected_block.dataset.sourceStart),Number(selected_block.dataset.sourceEnd));
      const local_start=start-Number(selected_block.dataset.sourceStart);
      // Link destinations and HTML attributes are source-only matches, not visible words.
      if(!selected_block.querySelector("pre code")&&[...block_source.matchAll(/\]\((?:\\.|[^)])*\)|<[^>]*>/gu)].some(hidden=>local_start>=hidden.index!+(hidden[0].startsWith("](")?2:0)&&local_start<hidden.index!+hidden[0].length))continue;
      const needle = match.text.replace(/\r\n?/gu, "\n");
      const raw_start = Number(selected_block.dataset.sourceStart);
      // The target address of links and other source code text do not display; first render the content of the block before it is hit, and avoid counting the URL same-named words into the document.
      const prefix_tokens=marked.lexer(normalized.slice(raw_start,start),{gfm:true});prefix_tokens.links=tokens.links;
      const prefix=el("div");prefix.innerHTML=DOMPurify.sanitize(marked.parser(prefix_tokens),{FORBID_TAGS:["img","style","iframe","object","embed","audio","video","source"]});
      const occurrence = (prefix.textContent||"").split(needle).length - 1;
      const target_content=selected_block.querySelector(".lookup-diagram-source-label + pre code")||selected_block;
      const walker = document.createTreeWalker(target_content, NodeFilter.SHOW_TEXT); let node: Node | null; const nodes: {node: Node; start: number; end: number}[] = []; let visible = "";
      while ((node = walker.nextNode())) {const start = visible.length; visible += node.textContent || ""; nodes.push({node, start, end: visible.length});}
      let found = -1; for (let index = 0; index <= occurrence; index++) { const next = visible.indexOf(needle, found + 1); if (next < 0) break; found = next; }
      if (found >= 0) {
        const from = nodes.find(item => item.start <= found && item.end > found), to = nodes.find(item => item.start < found + needle.length && item.end >= found + needle.length);
        if (from && to) { const range = document.createRange(); range.setStart(from.node, found - from.start); range.setEnd(to.node, found + needle.length - to.start); const mark = el("mark"); mark.dataset.lookupMatch=match.id; mark.append(range.extractContents()); range.insertNode(mark); render_targets.set(match.id,mark); }
      }
    }
    const position=preserve_position?capture_position():undefined;
    reader.replaceChildren(content);selected_block=target_block;targets=render_targets;
    code_copy.reconcile([...reader.querySelectorAll<HTMLElement>("pre > code")].map(code=>({element:code.parentElement!,read_text:()=>code.textContent||""})));
    body.replaceChildren(markdown_host); paint_anchor(); apply_scale();
    if(position)restore_position(position);else {reveal();reflow.capture();}
  };
  const show = async (file: workspace_search_file, match: workspace_search_match, hash = "", live = false) => {
    close_menu?.();
    if(ready&&selected?.file===file&&!hash){
      selected={file,match};paint_anchor();reveal_match();
      body.setAttribute("aria-label",workspace_text("lookup_preview_hit_content_preview_line_column",{value_0:file.relative_path,value_1:String(match.line),value_2:String(match.column)}));
      Object.assign(body.dataset,{previewLine:String(match.line),previewColumn:String(match.column),previewEndLine:String(match.end_line),previewEndColumn:String(match.end_column),previewText:match.text});
      return true;
    }
    ready=false;visible_id="";targets.clear();positions=[];geometry_dirty=true;source_scroll?.dispose();source_scroll=undefined;source_decorations=[];
    const request = ++generation; selected = {file, match}; body.setAttribute("aria-label",workspace_text("lookup_preview_hit_content_preview_line_column", {value_0: String(file.relative_path), value_1: String(match.line), value_2: String(match.column)}));
    for (const key of ["previewPath","previewKind","previewLine","previewColumn","previewEndLine","previewEndColumn","previewText"]) delete body.dataset[key];
    code_copy.reconcile([]);
    editor?.dispose(); editor = undefined; selected_block = undefined; body.replaceChildren(el("p", "workspace-lookup-preview-message", workspace_text("lookup_preview_reading_preview")));
    try {
      let text:string;
      if(read_content)text=await read_content(file.file_path);
      else {
      const stat = await files.fs.promises.stat(file.file_path);
      if (!stat.isFile()) throw new Error(workspace_text("lookup_preview_the_preview_target_is_not_a_regular_text_file"));
      const bytes = await files.fs.promises.readFile(file.file_path); if (disposed || request !== generation) return;
      if (detect_binary_bytes(bytes)) throw new Error(workspace_text("lookup_preview_the_file_has_become_binary_and_text_preview_is_not_possible"));
      text = live&&files.read_text ? await files.read_text(file.file_path) : decode_file_bytes(bytes).text;
      }
      if(disposed||request!==generation)return;
      loaded_text=text;
      if(hash&&is_markdown_file(file.file_path)){
        let name=hash.slice(1);try{name=decodeURIComponent(name);}catch{/* Illegal encoding is matched against the original text. */}
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
        paint_anchor();
        source_scroll=editor.focused_editor().onDidScrollChange(schedule_position);
        reveal_match();
      }
      if(!disposed&&request===generation){
        ready=true;invalidate_positions();
        Object.assign(body.dataset,{previewPath:file.file_path,previewKind:is_markdown_file(file.file_path)?"markdown":"source",previewLine:String(match.line),previewColumn:String(match.column),previewEndLine:String(match.end_line),previewEndColumn:String(match.end_column),previewText:match.text});
        return true;
      }
    } catch (error) { if (!disposed && request === generation) body.replaceChildren(el("p", "workspace-lookup-preview-message", String(error))); return false; }
  };
  let close_menu:(()=>void)|undefined;
  const link_at=(event:Event)=>(event.target instanceof Element?event.target:event.target instanceof Node?event.target.parentElement:null)?.closest<HTMLElement>('[data-preview-href]');
  const update_matches = async (file:workspace_search_file,match=selected!.match) => {
    if(disposed||!selected)return false;
    const request=++generation;
    selected={file,match};ready=false;visible_id="";targets.clear();
    if(editor)paint_anchor();else await render_markdown(loaded_text,match,request,true);
    if(disposed||generation!==request)return false;
    ready=true;invalidate_positions();return true;
  };
  const selected_link_text=()=>{
    const selection=(shadow as ShadowRoot & {getSelection?:()=>Selection|null}).getSelection?.()||window.getSelection();
    return !!selection&&!selection.isCollapsed&&!!selection.anchorNode&&reader.contains(selection.anchorNode);
  };
  const follow_link=(event:MouseEvent|KeyboardEvent)=>{
    if(event instanceof KeyboardEvent&&event.key!=="Enter")return;
    const link=link_at(event);
    if(!link||!reader.contains(link)||!options.navigate)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(disposed||event.altKey||event.shiftKey||(event.ctrlKey&&event.metaKey)||(event instanceof MouseEvent&&(event.button!==0||(!event.ctrlKey&&!event.metaKey&&selected_link_text())))||(event instanceof KeyboardEvent&&event.repeat))return;
    options.navigate(link.dataset.previewHref!);
  };
  const context_link=(event:MouseEvent)=>{
    const link=link_at(event);if(!link||!reader.contains(link)||!options.navigate||disposed)return;
    event.preventDefault();event.stopImmediatePropagation();const href=link.dataset.previewHref!,version=generation;
    close_menu=workspace_menu(event,[{title:workspace_text("lookup_preview_jump_link"),action:()=>{if(!disposed&&version===generation)options.navigate!(href);}}],'workspace-menu-compact workspace-link-preview-menu',()=>{close_menu=undefined;});
  };
  reader.addEventListener('click',follow_link);reader.addEventListener('keydown',follow_link);reader.addEventListener('contextmenu',context_link);
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
  const theme_observer = observe_markdown_theme(() => {if (selected && is_markdown_file(selected.file.file_path)) update_theme(); else apply_scale();});
  const resize_observer = new ResizeObserver(()=>{const view=editor?.focused_editor();if(view){const state=view.saveViewState();view.layout();if(state)view.restoreViewState(state);retain_visible_code_selection();}}); resize_observer.observe(body);
  apply_scale();
  const clear=()=>{ready=false;visible_id="";targets.clear();positions=[];source_scroll?.dispose();source_scroll=undefined;close_menu?.();generation++;code_copy.reconcile([]);selected=undefined;selected_block=undefined;editor?.dispose();editor=undefined;body.replaceChildren();};
  return {container, show, clear, update_matches, reveal_match, capture_position, restore_position, focus:()=>body.focus({preventScroll:true}), get_scale:()=>scale, set_scale, dispose() {disposed = true;cancelAnimationFrame(scroll_frame);body.removeEventListener("scroll",schedule_position);match_resize.disconnect();source_scroll?.dispose();targets.clear(); close_menu?.();reader.removeEventListener("contextmenu",context_link); reader.removeEventListener("click",follow_link);reader.removeEventListener("keydown",follow_link);code_copy.dispose(); reflow.dispose(); generation++; body.removeEventListener("wheel", wheel, true); editor?.dispose(); diagrams.dispose(); theme_observer(); resize_observer.disconnect(); style.remove(); container.remove();}};
}
