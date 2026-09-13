import {acquire_workspace_style} from "./workspace_styles";
import minimap_css from "./reading_minimap.css";
import { get_workspace_app } from "./workspace_bootstrap";
import { reading_viewport_bounds } from "./reading_viewport";

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
    if (owner.isConnected) targets.push({ owner, root: owner, scroller: source.cm.getScrollerElement(), source: source.cm, path: "源码" });
  }
  const content = document.querySelector<HTMLElement>("content");
  const write = document.querySelector<HTMLElement>("#write");
  if (!source?.inSourceMode && content?.isConnected && write?.isConnected) targets.push({ owner: content, root: write, scroller: content, path: "当前文档" });
  get_workspace_app()?.workspace.eachLeaves(leaf => {
    const root = leaf.view?.containerEl;
    if (root?.classList.contains("typ-markdown-preview") && leaf.containerEl.isConnected && leaf.containerEl.classList.contains("mod-active")) {
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
  const previous_owner = target.owner.getAttribute("data-linux-note-minimap-owner");
  target.owner.setAttribute("data-linux-note-minimap-owner", target.source ? "source" : "reading");
  target.owner.append(rail);
  target.source?.refresh();
  rail.dataset.ready = "false";
  rail.dataset.updating = "false";
  rail.dataset.commitCount = "0";
  let disposed = false; let paint_timer = 0; let frame = 0; let generation = 0; let rail_height = 1;
  let content_revision = 0; let committed_signature = ""; let requested_signature = "";
  let active_rows: Generator<void> | undefined;
  let dragging: { pointer_id: number; offset: number } | undefined;
  const info = () => target.source?.getScrollInfo() ?? { top: target.scroller.scrollTop, height: target.scroller.scrollHeight, clientHeight: target.scroller.clientHeight };
  const content_height = () => Math.min(rail_height, info().height * MINIMAP_WIDTH / Math.max(1, target.source ? target.root.clientWidth - 96 : target.root.clientWidth));
  const scroll_to = (top: number) => {
    if (disposed) return;
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
  // 固定定位的缩略图会逃离归零中的 content；先判断宿主身份和稳定尺寸，再写入任何几何。
  const geometry_ready = () => !target.owner.closest(".typ-deactive") && visible(target.owner) && visible(target.root)
    && target.owner.clientWidth > MINIMAP_WIDTH && target.owner.clientHeight > 0
    && !target.owner.getAnimations().some(animation => animation instanceof CSSTransition
      && /^(?:width|height|left|right|top|bottom|inset|transform)$/u.test(animation.transitionProperty));
  const layout = () => {
    if (disposed) return false;
    if (!geometry_ready()) { rail.hidden = true; return false; }
    const bounds = reading_viewport_bounds(target.owner);
    rail_height = bounds.bottom - bounds.top;
    if (rail_height <= 0 || bounds.right - bounds.left <= MINIMAP_WIDTH) { rail.hidden = true; return false; }
    // 使用 clientWidth 留出宿主自身的细滚动条，不覆盖正文或相邻编辑组。
    rail.style.left = `${bounds.right - MINIMAP_WIDTH - 4}px`;
    rail.style.top = `${bounds.top}px`;
    rail.style.height = `${rail_height}px`;
    rail.hidden = false;
    update_viewport();
    return true;
  };
  const paint_style_signature = () => {
    const sample = target.source ? target.root.querySelector(".CodeMirror-line") ?? target.root
      : target.root.querySelector("h1,h2,h3,p,pre,code,li,td") ?? target.root;
    const values = [target.root, sample].map(node => {
      const style = getComputedStyle(node);
      return [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.color, style.display, style.visibility].join("|");
    });
    return values.join(";");
  };
  const geometry_signature = () => {
    const state = info();
    return [target.root.clientWidth, state.height, rail_height, Math.min(2, window.devicePixelRatio || 1)].join("|");
  };
  const render_signature = () => `${geometry_signature()}|${paint_style_signature()}|${content_revision}`;
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
    try {
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || !node.textContent?.trim() || parent.closest("script,style,button,textarea,.CodeMirror-linenumbers,.linux-note-code-toolbar")) continue;
        range.selectNodeContents(node);
        const boxes = Array.from(range.getClientRects()).filter(box => box.width > 0 && box.height > 0);
        if (!boxes.length) continue;
        // 所有分帧结果先写入离屏画布，可见画布在完成前保持上一帧。
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
    } finally { range.detach(); }
  }
  const paint = () => {
    paint_timer = 0; if (disposed) return;
    if (!layout()) {
      requested_signature = ""; rail.dataset.updating = "false"; return;
    }
    const signature = render_signature();
    if (signature === committed_signature && rail.dataset.ready === "true") {
      requested_signature = ""; rail.dataset.updating = "false"; return;
    }
    const token = ++generation;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const back = document.createElement("canvas");
    back.width = Math.round(MINIMAP_WIDTH * ratio); back.height = Math.round(rail_height * ratio);
    const context = back.getContext("2d"); if (!context) { rail.dataset.updating = "false"; return; }
    context.scale(ratio, ratio);
    const state = info();
    const scale_x = MINIMAP_WIDTH / Math.max(1, target.source ? target.root.clientWidth - 96 : target.root.clientWidth);
    const scale_y = Math.min(scale_x, rail_height / Math.max(1, state.height));
    const rows = target.source ? source_rows(context, scale_x, scale_y) : rendered_rows(context, scale_x, scale_y);
    active_rows = rows;
    // 长文按帧写入离屏缓冲；完成后在同一任务内原子提交，界面不会露出空白或半张缩略图。
    const advance = () => {
      if (disposed || token !== generation || !geometry_ready()) {
        if (!disposed && token === generation) { rail.hidden = true; rail.dataset.updating = "false"; requested_signature = ""; frame = 0; }
        rows.return(undefined); if (active_rows === rows) active_rows = undefined; return;
      }
      const deadline = performance.now() + 6;
      do {
        if (rows.next().done) {
          if (disposed || token !== generation) return;
          frame = 0; if (active_rows === rows) active_rows = undefined;
          layout();
          if (signature !== render_signature()) { requested_signature = ""; schedule_render(false); return; }
          // 前台节点始终不换；清空与复制处于同一任务，浏览器只会合成完整的新帧。
          if (canvas.width !== back.width) canvas.width = back.width;
          if (canvas.height !== back.height) canvas.height = back.height;
          const front = canvas.getContext("2d");
          if (!front) { requested_signature = ""; rail.dataset.updating = "false"; return; }
          front.setTransform(1, 0, 0, 1, 0, 0); front.clearRect(0, 0, canvas.width, canvas.height); front.drawImage(back, 0, 0);
          committed_signature = signature; requested_signature = "";
          rail.dataset.ready = "true"; rail.dataset.updating = "false";
          rail.dataset.commitCount = String(Number(rail.dataset.commitCount || 0) + 1);
          return;
        }
      } while (performance.now() < deadline);
      frame = requestAnimationFrame(advance);
    };
    advance();
  };
  const cancel_render = () => {
    generation += 1;
    if (paint_timer) { clearTimeout(paint_timer); paint_timer = 0; }
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    active_rows?.return(undefined); active_rows = undefined;
  };
  const schedule_render = (content_changed: boolean) => {
    if (disposed) return;
    if (content_changed) content_revision += 1;
    if (!layout()) {
      cancel_render(); requested_signature = ""; rail.dataset.updating = "false"; return;
    }
    const signature = render_signature();
    if (signature === committed_signature && rail.dataset.ready === "true") {
      cancel_render(); requested_signature = ""; rail.dataset.updating = "false"; return;
    }
    if (signature === requested_signature && (paint_timer || active_rows)) return;
    cancel_render(); requested_signature = signature;
    rail.dataset.updating = "true";
    paint_timer = window.setTimeout(paint, 160);
  };
  const refresh = () => schedule_render(true);
  const reconcile = () => schedule_render(false);
  const observer = new MutationObserver(records => {
    if (records.some(record => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(".linux-note-reading-minimap"))) refresh();
  });
  // CodeMirror 的 changes 事件是源码内容的权威信号；不观察其虚拟行 DOM，避免滚动时误判为正文变化。
  if (!target.source) observer.observe(target.root, { subtree: true, childList: true, characterData: true });
  const inner_scroll = (event: Event) => { if (event.target !== target.scroller) refresh(); };
  target.root.addEventListener("scroll", inner_scroll, true);
  const resize = new ResizeObserver(reconcile); resize.observe(target.owner);
  if (target.root !== target.owner) resize.observe(target.root);
  target.scroller.addEventListener("scroll", update_viewport, { passive: true });
  target.source?.on("changes", refresh); target.source?.on("scroll", update_viewport);
  const seek = (client_y: number, offset: number) => {
    const state = info(); const thumb_height = viewport.getBoundingClientRect().height;
    scroll_to((client_y - rail.getBoundingClientRect().top - offset) / Math.max(1, content_height() - thumb_height) * Math.max(0, state.height - state.clientHeight));
  };
  rail.addEventListener("pointerdown", event => {
    if (disposed || event.button !== 0) return;
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
  schedule_render(false);
  return { target, reconcile, dispose() {
    if (disposed) return;
    disposed = true; cancel_render(); observer.disconnect(); resize.disconnect();
    target.scroller.removeEventListener("scroll", update_viewport); target.source?.off("changes", refresh); target.source?.off("scroll", update_viewport);
    target.root.removeEventListener("scroll", inner_scroll, true);
    rail.remove();
    if (previous_owner === null) target.owner.removeAttribute("data-linux-note-minimap-owner"); else target.owner.setAttribute("data-linux-note-minimap-owner", previous_owner);
    target.source?.refresh();
  } };
}

let active_dispose: (() => void) | undefined;
export function bind_reading_minimap(): () => void {
  if (active_dispose) return active_dispose;
  if (document.getElementById("linux-note-reading-minimap-style")) return () => {};
  let disposed = false;
  const previous_ready = document.documentElement.getAttribute("data-linux-note-reading-minimap");
  const style = acquire_workspace_style("linux-note-reading-minimap-style", minimap_css, {});
  const maps = new Map<HTMLElement, ReturnType<typeof create_minimap>>();
  let scan_timer = 0;
  const scan = () => {
    scan_timer = 0;
    if (disposed) return;
    const targets = current_targets();
    for (const [owner, map] of maps) {
      if (!targets.some(target => target.owner === owner && target.root === map.target.root && target.source === map.target.source)) { map.dispose(); maps.delete(owner); }
    }
    for (const target of targets) {
      if (!maps.has(target.owner)) maps.set(target.owner, create_minimap(target));
      else maps.get(target.owner)!.reconcile();
    }
  };
  const schedule = () => { if (disposed) return; if (scan_timer) clearTimeout(scan_timer); scan_timer = window.setTimeout(scan, 100); };
  const observer = new MutationObserver(records => {
    if (records.some(record => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(".linux-note-reading-minimap"))) schedule();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  window.addEventListener("resize", schedule, { passive: true });
  const dispose = () => {
    if (disposed) return;
    disposed = true; observer.disconnect(); clearTimeout(scan_timer);
    window.removeEventListener("resize", schedule); window.removeEventListener("pagehide", dispose);
    for (const map of maps.values()) map.dispose(); maps.clear(); style.remove();
    if (previous_ready === null) document.documentElement.removeAttribute("data-linux-note-reading-minimap");
    else document.documentElement.setAttribute("data-linux-note-reading-minimap", previous_ready);
    if (active_dispose === dispose) active_dispose = undefined;
  };
  active_dispose = dispose;
  window.addEventListener("pagehide", dispose, { once: true });
  scan(); document.documentElement.setAttribute("data-linux-note-reading-minimap", "ready");
  return dispose;
}
