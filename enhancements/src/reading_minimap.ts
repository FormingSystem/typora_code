import minimap_css from "./reading_minimap.css";
import { get_workspace_app } from "./workspace_bootstrap";

// 仅使用宿主已有的 CodeMirror 5 公开方法；读取源码不会移动光标或激活其他编辑组。
type source_editor = {
  getWrapperElement(): HTMLElement;
  getScrollerElement(): HTMLElement;
  getScrollInfo(): { top: number; height: number; clientHeight: number };
  lineCount(): number;
  getLine(line: number): string;
  heightAtLine(line: number, mode: "local"): number;
  defaultTextHeight(): number;
  scrollTo(left: number | null, top: number): void;
  refresh(): void;
  on(name: string, callback: () => void): void;
  off(name: string, callback: () => void): void;
};
type minimap_target = { owner: HTMLElement; root: HTMLElement; scroller: HTMLElement; source?: source_editor; path: string };
const MINIMAP_WIDTH = 88;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function visible(element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect();
  return element.isConnected && bounds.width > 0 && bounds.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

function current_targets(): minimap_target[] {
  const source = (window as unknown as { File?: { editor?: { sourceView?: { inSourceMode: boolean; cm?: source_editor } } } }).File?.editor?.sourceView;
  const targets: minimap_target[] = [];
  if (source?.inSourceMode && source.cm) {
    const owner = source.cm.getWrapperElement();
    if (visible(owner)) targets.push({ owner, root: owner, scroller: source.cm.getScrollerElement(), source: source.cm, path: "源码" });
  }
  const content = document.querySelector<HTMLElement>("content");
  const write = document.querySelector<HTMLElement>("#write");
  if (!source?.inSourceMode && content && write && visible(content) && visible(write)) targets.push({ owner: content, root: write, scroller: content, path: "当前文档" });
  get_workspace_app()?.workspace.eachLeaves(leaf => {
    const root = leaf.view?.containerEl;
    if (root?.classList.contains("typ-markdown-preview") && leaf.containerEl.classList.contains("mod-active") && visible(root)) {
      targets.push({ owner: leaf.containerEl, root, scroller: leaf.containerEl, path: leaf.state.path.split(/[\\/]/u).pop() || "预览" });
    }
  });
  return targets;
}

/** 把实际渲染文本按原文档坐标缩小；不克隆正文节点，避免影响保存、选区与标题 ID。 */
function create_minimap(target: minimap_target) {
  const rail = document.createElement("div");
  rail.className = "linux-note-reading-minimap";
  rail.contentEditable = "false";
  rail.tabIndex = 0;
  rail.setAttribute("role", "scrollbar");
  rail.setAttribute("aria-label", `${target.path}缩略图：点击或拖动定位`);
  rail.setAttribute("aria-orientation", "vertical");
  rail.setAttribute("aria-valuemin", "0"); rail.setAttribute("aria-valuemax", "100");
  rail.title = "文档缩略图：点击跳转，拖动阅读位置；方向键、PageUp / PageDown、Home / End 定位";
  const canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true");
  const viewport = document.createElement("div"); viewport.className = "linux-note-reading-minimap-viewport";
  rail.append(canvas, viewport);
  target.owner.setAttribute("data-linux-note-minimap-owner", target.source ? "source" : "reading");
  target.owner.append(rail);
  target.source?.refresh();
  let disposed = false; let paint_timer = 0; let frame = 0; let generation = 0; let rail_height = 1;
  let dragging: { pointer_id: number; offset: number } | undefined;
  const info = () => target.source?.getScrollInfo() ?? { top: target.scroller.scrollTop, height: target.scroller.scrollHeight, clientHeight: target.scroller.clientHeight };
  const content_height = () => Math.min(rail_height, info().height * MINIMAP_WIDTH / Math.max(1, target.source ? target.root.clientWidth - 96 : target.root.clientWidth));
  const scroll_to = (top: number) => {
    const state = info(); const next = clamp(top, 0, Math.max(0, state.height - state.clientHeight));
    if (target.source) target.source.scrollTo(null, next); else target.scroller.scrollTop = next;
    update_viewport();
  };
  const update_viewport = () => {
    if (disposed) return;
    const state = info();
    const height = content_height();
    const thumb_height = clamp(height * state.clientHeight / Math.max(1, state.height), 12, height);
    const ratio = state.top / Math.max(1, state.height - state.clientHeight);
    viewport.style.height = `${thumb_height}px`;
    viewport.style.transform = `translateY(${ratio * (height - thumb_height)}px)`;
    rail.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
  };
  const layout = () => {
    if (disposed) return;
    const bounds = target.owner.getBoundingClientRect();
    rail_height = Math.max(1, target.owner.clientHeight);
    // 使用 clientWidth 留出宿主自身的细滚动条，不覆盖正文或相邻编辑组。
    rail.style.left = `${bounds.left + target.owner.clientWidth - MINIMAP_WIDTH - 4}px`;
    rail.style.top = `${bounds.top + target.owner.clientTop}px`;
    rail.style.height = `${rail_height}px`;
    rail.hidden = !visible(target.owner);
    update_viewport();
  };
  const draw_text = (context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) => {
    if (!text.trim() || width <= 0) return;
    context.fillText(text, x, y, width);
  };
  function* source_rows(context: CanvasRenderingContext2D, scale_x: number, scale_y: number): Generator<void> {
    const source = target.source!;
    const style = getComputedStyle(target.root.querySelector(".CodeMirror-line") ?? target.root);
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; context.fillStyle = style.color;
    const text_height = source.defaultTextHeight();
    const width = Math.max(1, target.root.clientWidth - 96);
    context.scale(scale_x, scale_y);
    for (let line = 0; line < source.lineCount(); line += 1) {
      // heightAtLine 会包含真实折行高度，长行不会让下方定位逐渐偏离。
      draw_text(context, source.getLine(line), 0, source.heightAtLine(line, "local") + text_height * .8, width);
      yield;
    }
  }
  function* rendered_rows(context: CanvasRenderingContext2D, scale_x: number, scale_y: number): Generator<void> {
    const walker = document.createTreeWalker(target.root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    context.scale(scale_x, scale_y);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || parent.closest("script,style,button,textarea,.CodeMirror-linenumbers,.linux-note-code-toolbar,.linux-note-mermaid-inline-toolbar")) continue;
      range.selectNodeContents(node);
      const boxes = Array.from(range.getClientRects()).filter(box => box.width > 0 && box.height > 0);
      if (!boxes.length) continue;
      // 绘制跨越多个帧；用户可能同时滚动，每段测量都使用同一时刻的布局与滚动值。
      const root_bounds = target.root.getBoundingClientRect();
      const scroller_top = target.scroller.getBoundingClientRect().top;
      const scroll_top = target.scroller.scrollTop;
      const style = getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none") continue;
      context.save();
      // Range 仍会返回滚动框缓冲行的矩形；按正文内部祖先的裁剪区域限制绘制。
      // 外层文档视口不参与裁剪，整篇尚未滚动到的段落仍须出现在缩略图上。
      for (let ancestor: HTMLElement | null = parent; ancestor && ancestor !== target.root; ancestor = ancestor.parentElement) {
        const ancestor_style = ancestor === parent ? style : getComputedStyle(ancestor);
        const clips_x = /^(?:auto|scroll|hidden|clip)$/u.test(ancestor_style.overflowX);
        const clips_y = /^(?:auto|scroll|hidden|clip)$/u.test(ancestor_style.overflowY);
        if (!clips_x && !clips_y) continue;
        const bounds = ancestor.getBoundingClientRect();
        context.beginPath();
        context.rect(clips_x ? bounds.left + ancestor.clientLeft - root_bounds.left : 0,
          clips_y ? bounds.top + ancestor.clientTop - scroller_top + scroll_top : 0,
          clips_x ? ancestor.clientWidth : target.root.scrollWidth,
          clips_y ? ancestor.clientHeight : target.scroller.scrollHeight);
        context.clip();
      }
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; context.fillStyle = style.color;
      const text = /^pre/u.test(style.whiteSpace) ? node.textContent : node.textContent.replace(/\s+/gu, " ");
      let offset = 0;
      for (let index = 0; index < boxes.length; index += 1) {
        const box = boxes[index];
        let length = text.length - offset;
        if (index < boxes.length - 1) {
          let low = 1; let high = length;
          while (low < high) { const middle = Math.ceil((low + high) / 2); if (context.measureText(text.slice(offset, offset + middle)).width <= box.width + .5) low = middle; else high = middle - 1; }
          length = low;
        }
        draw_text(context, text.slice(offset, offset + length), box.left - root_bounds.left,
          box.top - scroller_top + scroll_top + Number.parseFloat(style.fontSize) * .85, box.width);
        offset += length;
      }
      context.restore();
      yield;
    }
    range.detach();
  }
  const paint = () => {
    paint_timer = 0; if (disposed) return;
    layout();
    const token = ++generation;
    rail.dataset.ready = "false";
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(MINIMAP_WIDTH * ratio); canvas.height = Math.round(rail_height * ratio);
    const context = canvas.getContext("2d"); if (!context) return;
    context.scale(ratio, ratio);
    const state = info();
    const scale_x = MINIMAP_WIDTH / Math.max(1, target.source ? target.root.clientWidth - 96 : target.root.clientWidth);
    const scale_y = Math.min(scale_x, rail_height / Math.max(1, state.height));
    const rows = target.source ? source_rows(context, scale_x, scale_y) : rendered_rows(context, scale_x, scale_y);
    // 长文按帧处理全部文本；每帧限制约 6 ms，正文滚动仅移动视口框而不重绘整篇。
    const advance = () => {
      if (disposed || token !== generation) { rows.return(undefined); return; }
      const deadline = performance.now() + 6;
      do { if (rows.next().done) { rail.dataset.ready = "true"; return; } } while (performance.now() < deadline);
      frame = requestAnimationFrame(advance);
    };
    advance();
  };
  const refresh = () => { if (!disposed && !paint_timer) paint_timer = window.setTimeout(paint, 140); };
  const observer = new MutationObserver(records => {
    if (records.some(record => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(".linux-note-reading-minimap"))) refresh();
  });
  observer.observe(target.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
  const inner_scroll = (event: Event) => { if (event.target !== target.scroller) refresh(); };
  target.root.addEventListener("scroll", inner_scroll, true);
  const resize = new ResizeObserver(() => { layout(); refresh(); }); resize.observe(target.owner);
  if (target.root !== target.owner) resize.observe(target.root);
  target.scroller.addEventListener("scroll", update_viewport, { passive: true });
  target.source?.on("changes", refresh); target.source?.on("scroll", update_viewport);
  const seek = (client_y: number, offset: number) => {
    const state = info(); const thumb_height = viewport.getBoundingClientRect().height;
    scroll_to((client_y - rail.getBoundingClientRect().top - offset) / Math.max(1, content_height() - thumb_height) * Math.max(0, state.height - state.clientHeight));
  };
  rail.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const box = viewport.getBoundingClientRect();
    const offset = event.clientY >= box.top && event.clientY <= box.bottom ? event.clientY - box.top : box.height / 2;
    dragging = { pointer_id: event.pointerId, offset }; rail.setPointerCapture(event.pointerId); seek(event.clientY, offset);
  });
  rail.addEventListener("pointermove", event => { if (dragging?.pointer_id === event.pointerId) seek(event.clientY, dragging.offset); });
  const end_drag = () => { dragging = undefined; };
  rail.addEventListener("pointerup", end_drag); rail.addEventListener("pointercancel", end_drag); rail.addEventListener("lostpointercapture", end_drag);
  rail.addEventListener("wheel", event => { event.preventDefault(); event.stopPropagation(); scroll_to(info().top + event.deltaY); }, { passive: false });
  rail.addEventListener("keydown", event => {
    const state = info(); const offsets: Record<string, number> = { ArrowUp: -40, ArrowDown: 40, PageUp: -state.clientHeight, PageDown: state.clientHeight, Home: -state.height, End: state.height };
    if (!(event.key in offsets)) return;
    event.preventDefault(); event.stopPropagation(); scroll_to(state.top + offsets[event.key]);
  });
  refresh(); layout();
  return { target, refresh, layout, dispose() {
    disposed = true; generation += 1; clearTimeout(paint_timer); cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
    target.scroller.removeEventListener("scroll", update_viewport); target.source?.off("changes", refresh); target.source?.off("scroll", update_viewport);
    target.root.removeEventListener("scroll", inner_scroll, true);
    rail.remove(); target.owner.removeAttribute("data-linux-note-minimap-owner"); target.source?.refresh();
  } };
}

export function bind_reading_minimap(): void {
  if (document.getElementById("linux-note-reading-minimap-style")) return;
  const style = document.createElement("style"); style.id = "linux-note-reading-minimap-style"; style.textContent = minimap_css; document.head.append(style);
  const maps = new Map<HTMLElement, ReturnType<typeof create_minimap>>();
  let scan_timer = 0;
  const scan = () => {
    scan_timer = 0;
    const targets = current_targets();
    for (const [owner, map] of maps) {
      if (!targets.some(target => target.owner === owner && target.root === map.target.root && target.source === map.target.source)) { map.dispose(); maps.delete(owner); }
    }
    for (const target of targets) {
      if (!maps.has(target.owner)) maps.set(target.owner, create_minimap(target));
      else maps.get(target.owner)!.layout();
    }
  };
  const schedule = () => { if (!scan_timer) scan_timer = window.setTimeout(scan, 100); };
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target === document.body && record.type === "attributes")) for (const map of maps.values()) map.refresh();
    if (records.some(record => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(".linux-note-reading-minimap"))) schedule();
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("pagehide", () => { observer.disconnect(); clearTimeout(scan_timer); window.removeEventListener("resize", schedule); for (const map of maps.values()) map.dispose(); maps.clear(); }, { once: true });
  scan(); document.documentElement.setAttribute("data-linux-note-reading-minimap", "ready");
}
