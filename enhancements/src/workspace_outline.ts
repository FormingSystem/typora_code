import {install_workspace_source_outline} from "./workspace_source_outline";
import {acquire_workspace_style} from "./workspace_styles";
import {bind_workspace_control_icons} from "./workspace_control_icons";
import outline_css from "./workspace_outline.css";

export type workspace_outline_host = {
  sidebar?: HTMLElement;
  document_active?(): boolean;
  context_root?(): string;
  outline?: {
    hideSearch?(): void;
    clearSearch?(): void;
    isSearchShown?(): boolean;
    highlightVisibleHeader?(headings?: unknown, index?: number, expand?: boolean, blink?: boolean): void;
  };
};

/** 大纲只负责标题导航；原生共用过滤框不能残留到其他工作区面板。 */
export function install_workspace_outline(host: workspace_outline_host) {
  const sidebar = host.sidebar || document.querySelector<HTMLElement>("#typora-sidebar");
  if (!sidebar) return;
  const style = acquire_workspace_style("typora-code-style:workspace_outline", outline_css, {"data-workspace-outline-style":"ready"});
  document.documentElement.setAttribute("data-linux-note-workspace-outline", "ready");
  const previous_document_outline=sidebar.getAttribute("data-document-outline");
  const empty=document.createElement("p");empty.className="workspace-outline-empty";empty.textContent="当前编辑器不提供文档大纲。";
  (sidebar.querySelector("#sidebar-content")||sidebar).append(empty);
  const control_icons=bind_workspace_control_icons(sidebar,[["#outline-content .outline-expander","chevron-right"]]);
  const source_outline=install_workspace_source_outline(sidebar,host.context_root);
  let disposed=false;
  const update_document=()=>{
    const available=host.document_active?.()!==false;
    const value=String(available);
    if(sidebar.dataset.documentOutline!==value)sidebar.dataset.documentOutline=value;
    source_outline.refresh();
    const has_outline=available||source_outline.available();
    if(empty.hidden!==has_outline)empty.hidden=has_outline;
  };
  let clearing = false;
  let sync_frame = 0;
  let settle_frame = 0;
  let outline_open = false;
  let selected_heading:HTMLElement|undefined;
  let selected_label:HTMLElement|null|undefined;
  // 相邻章节边界留出 12 CSS px 的双向滞回，避免滚轮惯性／亚像素布局在边界反复改选。
  const heading_boundary_slack = 12;
  const native_outline = host.outline;
  const native_highlight = native_outline?.highlightVisibleHeader;
  const native_highlight_descriptor = native_outline && Object.getOwnPropertyDescriptor(native_outline, "highlightVisibleHeader");
  let explicit_position:number|undefined;
  const is_outline_open = () => !disposed && host.document_active?.()!==false && sidebar.classList.contains("open") && sidebar.classList.contains("active-tab-outline");
  const current_heading = () => {
    const content = document.querySelector<HTMLElement>("content");
    const write = document.querySelector<HTMLElement>("#write");
    if (!content || !write) return;
    const headings = Array.from(write.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node.matches("h1,h2,h3,h4,h5,h6"));
    if (!headings.length) return;
    // offsetTop 的参照物会随正文容器定位变化；与滚动视口在同一坐标系比较。
    const top = content.getBoundingClientRect().top + content.clientTop;
    const selected_index = selected_heading ? headings.indexOf(selected_heading) : -1;
    if (explicit_position === content.scrollTop && selected_index >= 0) return selected_heading;
    explicit_position = undefined;
    let previous = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= top) previous = heading;
      else break;
    }
    if (selected_index >= 0) {
      const next_index = headings.indexOf(previous);
      if (next_index === selected_index + 1 && previous.getBoundingClientRect().top > top - heading_boundary_slack) return selected_heading;
      if (next_index < selected_index && selected_heading!.getBoundingClientRect().top < top + heading_boundary_slack) return selected_heading;
    }
    return previous;
  };
  const label_for = (outline: HTMLElement, cid: string) => Array.from(outline.querySelectorAll<HTMLElement>(".outline-label"))
    .find(label => label.getAttribute("data-ref") === cid);
  const reveal = (label: HTMLElement) => {
    const outline = label.closest<HTMLElement>("#outline-content");
    const row = label.closest<HTMLElement>(".outline-item");
    if (!outline || !row) return;
    for (let wrapper = row.closest<HTMLElement>(".outline-item-wrapper"); wrapper && outline.contains(wrapper);
      wrapper = wrapper.parentElement?.closest<HTMLElement>(".outline-item-wrapper") ?? null) wrapper.classList.add("outline-item-open");
    // 仅滚动大纲自己的容器，不能让 scrollIntoView 顺带移动宿主页面或夺走正文位置。
    const bounds = outline.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    const top = bounds.top + outline.clientTop;
    const bottom = top + outline.clientHeight;
    if (rect.top < top) outline.scrollTop += rect.top - top;
    else if (rect.bottom > bottom) outline.scrollTop += rect.bottom - bottom;
  };
  const fallback_sync = (outline: HTMLElement, heading: HTMLElement) => {
    const cid = heading.getAttribute("cid");
    if (!cid) return;
    const label = label_for(outline, cid);
    if (!label) return;
    outline.querySelectorAll(".outline-active").forEach(node => node.classList.remove("outline-active"));
    outline.querySelectorAll(".outline-item-active").forEach(node => node.classList.remove("outline-item-active"));
    label.classList.add("outline-active");
    label.closest<HTMLElement>(".outline-item")?.classList.add("outline-item-active");
    reveal(label);
  };
  const sync_current_heading = () => {
    if (!is_outline_open()) return;
    const outline = sidebar.querySelector<HTMLElement>("#outline-content");
    const heading = current_heading();
    if (!outline || !heading || !outline.querySelector(".outline-label")) return;
    const cid = heading.getAttribute("cid");
    const expected=cid?label_for(outline,cid):undefined;
    if(selected_heading===heading&&selected_label===expected&&expected?.classList.contains("outline-active"))return;
    selected_heading=heading;selected_label=expected;
    // 传入已判定的唯一标题。宿主默认查找“首个可见标题”，不能再与当前章节选择竞争。
    try { native_highlight?.call(native_outline, [heading], 0, true, false); } catch { /* 不稳定的宿主私有接口退回同一 DOM 语义。 */ }
    const active = outline.querySelector<HTMLElement>(".outline-label.outline-active");
    if (!active || (cid && active.getAttribute("data-ref") !== cid)) fallback_sync(outline, heading);
    else reveal(active);
  };
  const cancel_sync = () => {
    if (sync_frame) cancelAnimationFrame(sync_frame);
    if (settle_frame) cancelAnimationFrame(settle_frame);
    sync_frame = 0; settle_frame = 0;
  };
  const schedule_sync = () => {
    if (!is_outline_open() || sync_frame || settle_frame) return;
    sync_frame = requestAnimationFrame(() => {
      sync_frame = 0;
      settle_frame = requestAnimationFrame(() => { settle_frame = 0; sync_current_heading(); });
    });
  };
  const coordinated_highlight:NonNullable<workspace_outline_host["outline"]>["highlightVisibleHeader"] = function(headings, index, expand, blink) {
    if (!is_outline_open()) {
      cancel_sync();selected_heading=undefined;selected_label=undefined;explicit_position=undefined;
      native_highlight?.call(this, headings, index, expand, blink);
      return;
    }
    const write = document.querySelector<HTMLElement>("#write");
    const targets = headings == null ? Array.from(write?.querySelectorAll(":scope > :is(h1,h2,h3,h4,h5,h6)") || [])
      : Array.from(headings as ArrayLike<unknown>);
    const explicit_target = (headings != null || index != null) && (index == null ? targets : [targets[index]])
      .some(node => node instanceof HTMLElement && node.parentElement === write && node.matches("h1,h2,h3,h4,h5,h6"));
    if (explicit_target || blink === true) {
      // 显式标题跳转和手动“高亮当前标题”仍走原生语义，且取消尚未执行的旧滚动同步。
      cancel_sync();
      native_highlight?.call(this, headings, index, expand, blink);
      const active = sidebar.querySelector<HTMLElement>("#outline-content .outline-label.outline-active");
      selected_label = active;
      selected_heading = Array.from(document.querySelectorAll<HTMLElement>("#write > :is(h1,h2,h3,h4,h5,h6)"))
        .find(heading => heading.getAttribute("cid") === active?.getAttribute("data-ref"));
      explicit_position = document.querySelector<HTMLElement>("content")?.scrollTop;
      return;
    }
    // scrollAdjust 的非标题目标会传空数组；它和无参延迟高亮统一判定，不能锁住旧章节或改选邻居。
    schedule_sync();
  };
  if (native_outline && native_highlight) native_outline.highlightVisibleHeader = coordinated_highlight;
  const on_document_scroll = (event: Event) => {
    const target = event.target;
    if (target instanceof Node && sidebar.contains(target)) return;
    schedule_sync();
  };
  const refresh = () => {
    if(disposed)return;
    update_document();
    if (clearing) return;
    const filtering = sidebar.classList.contains("ty-show-outline-filter") || sidebar.classList.contains("ty-on-outline-filter") || host.outline?.isSearchShown?.();
    if (!filtering) return;
    clearing = true;
    try {
      // hideSearch 归还原生状态；clearSearch 同时清空旧高亮和被筛掉的标题。
      host.outline?.hideSearch?.();
      host.outline?.clearSearch?.();
      sidebar.classList.remove("ty-show-outline-filter", "ty-on-outline-filter");
      const input = sidebar.querySelector<HTMLInputElement>("#file-library-search-input");
      if (input) { input.value = ""; input.style.removeProperty("width"); }
      const close = sidebar.querySelector<HTMLElement>("#close-outline-filter-btn");
      if (close) close.style.display = "none";
    } finally { clearing = false; }
  };
  const belongs_to_outline = (node: Node) => node instanceof Element
    && (node.matches("#outline-content") || Boolean(node.closest("#outline-content")) || Boolean(node.querySelector("#outline-content")));
  const observer = new MutationObserver(records => {
    refresh();
    const open = is_outline_open();
    const opened = open && !outline_open;
    outline_open = open;
    const rebuilt = open && records.some(record => record.type === "childList"
      && (belongs_to_outline(record.target) || Array.from(record.addedNodes).some(belongs_to_outline)));
    if (opened || rebuilt) schedule_sync();
    else if (!open) cancel_sync();
  });
  observer.observe(sidebar, {subtree: true, childList: true, attributes: true, attributeFilter: ["class","hidden"]});
  document.addEventListener("scroll", on_document_scroll, true);
  refresh();
  outline_open = is_outline_open();
  if (outline_open) schedule_sync();
  return {refresh:()=>{refresh();schedule_sync();}, configure:source_outline.configure, dispose: () => {
    if(disposed)return;disposed=true;
    source_outline.dispose();control_icons.dispose();observer.disconnect();document.removeEventListener("scroll", on_document_scroll, true);cancel_sync();style.remove();empty.remove();
    if (native_outline?.highlightVisibleHeader === coordinated_highlight) {
      if (native_highlight_descriptor) Object.defineProperty(native_outline, "highlightVisibleHeader", native_highlight_descriptor);
      else delete native_outline.highlightVisibleHeader;
    }
    if(previous_document_outline===null)sidebar.removeAttribute("data-document-outline");else sidebar.setAttribute("data-document-outline",previous_document_outline);
    document.documentElement.removeAttribute("data-linux-note-workspace-outline");
  }};
}
