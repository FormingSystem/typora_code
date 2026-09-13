import {bind_reading_images} from "./reading_image_viewer";
import {marked} from "marked";
import DOMPurify from "dompurify";
import {workspace_element as el} from "./workspace_widgets";
import {highlight_preview_code, create_preview_diagrams} from "./workspace_markdown_preview_render";

/** 历史正文在隔离阅读容器中渲染，不载入 Typora 可编辑文档，也不写工作区或临时正文。 */
export function create_git_revision_reader(source: string, label: string, on_link: (href: string) => Promise<void>, on_image: (href: string) => Promise<string>) {
  const container = el("section", "git-revision-reader"), heading = el("div", "git-revision-reader-heading", label);
  heading.title = label;
  const body = el("div", "git-revision-reader-body"), host = el("div", "git-revision-markdown");
  body.tabIndex = 0; body.setAttribute("role", "document"); body.setAttribute("aria-label", label);
  const shadow = host.attachShadow({mode: "open"}), article = el("article"), style = el("style");
  article.id = "write"; article.contentEditable = "false"; shadow.append(style, article); body.append(host); container.append(heading, body);
  const diagrams = create_preview_diagrams(); let disposed = false;
  const image_viewer=bind_reading_images(article);
  const update_theme = () => {
    const rules: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      try { rules.push([...sheet.cssRules].map(rule => rule.cssText).filter(rule => rule.includes("#write") || rule.startsWith(":root")).join("\n")); }
      catch { /* 与搜索预览一样，不可读主题由基本排版补齐。 */ }
    }
    style.textContent = rules.join("\n") + `
      :host{display:block;color:inherit}#write{position:static!important;width:auto!important;max-width:none!important;min-width:0!important;margin:0!important;padding:18px 24px!important;inset:auto!important;color:inherit!important;overflow-wrap:anywhere;line-height:1.6;user-select:text}
      #write h1{font-size:1.8em}#write h2{font-size:1.5em}#write h3{font-size:1.25em}#write p{margin:.7em 0}#write pre{overflow:auto;background:rgba(127,127,127,.08);padding:8px}#write pre code{white-space:pre}#write table{border-collapse:collapse;width:100%}#write th,#write td{border:1px solid rgba(127,127,127,.3);padding:5px 8px}#write input{pointer-events:none}#write img{max-width:100%;height:auto}#write .lookup-diagram svg{max-width:100%;height:auto}
      #write .lookup-code-keyword,#write .lookup-code-tag,#write .lookup-code-metatag{color:var(--revision-keyword,#0000ff)}#write .lookup-code-string,#write .lookup-code-regexp{color:var(--revision-string,#a31515)}#write .lookup-code-comment{color:var(--revision-comment,#008000)}#write .lookup-code-number{color:var(--revision-number,#098658)}#write .lookup-code-type,#write .lookup-code-attribute{color:var(--revision-type,#267f99)}
    `;
    const native = document.querySelector("content > #write"), font = getComputedStyle(native || document.body);
    article.style.fontSize = font.fontSize; article.style.fontFamily = font.fontFamily;
    const rgb = getComputedStyle(document.body).color.match(/\d+/gu)?.map(Number) || [0,0,0], dark = rgb[0] + rgb[1] + rgb[2] > 450;
    for (const [name, value] of Object.entries(dark ? {keyword:"#569cd6",string:"#ce9178",comment:"#6a9955",number:"#b5cea8",type:"#4ec9b0"} : {keyword:"#0000ff",string:"#a31515",comment:"#008000",number:"#098658",type:"#267f99"})) article.style.setProperty('--revision-' + name, value);
  };
  const normalized = source.replace(/\r\n?/gu, "\n").replace(/^---\n[\s\S]*?\n---(?:\n|$)/u, "");
  const fragment = DOMPurify.sanitize(marked.parse(normalized, {gfm: true, async: false}), {
    FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "audio", "video", "source"],
    FORBID_ATTR: ["style", "id", "name", "srcset"], ALLOW_DATA_ATTR: false, RETURN_DOM_FRAGMENT: true
  });
  // 清除图片原 URL 后才挂载，历史图片只允许异步 Git blob 转换后的 data URL。
  const images = [...fragment.querySelectorAll<HTMLImageElement>('img')].map(image => {const href=image.getAttribute('src')||'';image.removeAttribute('src');return {image,href};});
  article.append(fragment);
  const anchors = new Map<string, HTMLElement>();
  for (const node of article.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')) {
    const slug = (node.textContent || '').trim().toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, '').replace(/\s+/gu, '-');
    let id = slug, suffix = 1; while (anchors.has(id)) id = `${slug}-${suffix++}`;
    node.id = id; anchors.set(id, node);
  }
  for (const input of article.querySelectorAll<HTMLInputElement>('input')) input.disabled = true;
  const reveal_fragment = (fragment: string) => {try { const target = anchors.get(decodeURIComponent(fragment.replace(/^#/u,''))); if (target) body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top; else if (!fragment || fragment === '#') body.scrollTop = 0; } catch { /* 无效片段不交给宿主导航。 */ }};
  article.addEventListener('click', event => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]'); if (!link) return;
    event.preventDefault(); event.stopPropagation(); const href = link.getAttribute('href') || '';
    if (href.startsWith('#')) {
      reveal_fragment(href);
      return;
    }
    void on_link(href).catch(error => {if (!disposed) heading.textContent = `${label} · ${error instanceof Error ? error.message : String(error)}`;});
  });
  update_theme();
  for (const {image, href} of images) void on_image(href).then(url=>{if(!disposed)image.src=url;}).catch(error=>{if(!disposed){const fallback=el('span','',image.alt||href);fallback.title=error instanceof Error?error.message:String(error);image.replaceWith(fallback);}});
  const observer = new MutationObserver(update_theme); observer.observe(document.documentElement, {attributes: true}); observer.observe(document.body, {attributes: true, attributeFilter: ['class','style']});
  void (async () => {
    for (const code of article.querySelectorAll<HTMLElement>('pre > code')) {
      if (disposed) return;
      if (code.classList.contains('language-mermaid') && await diagrams.render(code, body.clientWidth, false, () => !disposed)) continue;
      if (!disposed) await highlight_preview_code(code);
    }
  })().catch(() => {});
  return {container, reveal_fragment, dispose() {if (disposed) return; disposed = true; image_viewer.dispose(); observer.disconnect(); diagrams.dispose();}};
}
