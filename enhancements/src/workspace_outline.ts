import {workspace_text} from "./workspace_i18n";
import {install_workspace_source_outline} from "./workspace_source_outline";
import {acquire_workspace_style} from "./workspace_styles";
import {bind_workspace_control_icons} from "./workspace_control_icons";
import {reading_viewport_bounds} from "./reading_viewport";
import {reading_block_snapshot} from "./reading_blocks";
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

/** Outline is only responsible for title navigation; native shared filter box cannot remain in other workspace panels. */
export function install_workspace_outline(host: workspace_outline_host) {
  const sidebar = host.sidebar || document.querySelector<HTMLElement>("#typora-sidebar");
  if (!sidebar) return;
  const style = acquire_workspace_style("typora-code-style:workspace_outline", outline_css, {"data-workspace-outline-style":"ready"});
  document.documentElement.setAttribute("data-linux-note-workspace-outline", "ready");
  const previous_document_outline=sidebar.getAttribute("data-document-outline");
  const empty=document.createElement("p");empty.className="workspace-outline-empty";empty.textContent=workspace_text("outline_the_current_editor_does_not_provide_document_outline");
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
  // Title is only taken over once it is fully in the viewport; when leaving, retain 12 CSS px margin, avoiding edge micro-motion re-selection.
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
    const snapshot=reading_block_snapshot(write,"h1,h2,h3,h4,h5,h6"),heading_blocks=snapshot.items;
    const headings=heading_blocks.map(item=>item.node);
    if (!headings.length) return;
    // The reference of offsetTop changes with the main content container's positioning; compared within the same coordinate system as the scrolling viewport.
    const {top, bottom} = reading_viewport_bounds(content);
    const selected_index = selected_heading ? headings.indexOf(selected_heading) : -1;
    if (explicit_position === content.scrollTop && selected_index >= 0) return selected_heading;
    explicit_position = undefined;
    const bounds = heading_blocks.map(item=>({top:item.top+snapshot.top,bottom:item.bottom+snapshot.top,height:item.bottom-item.top}));
    const readable_top = top + heading_boundary_slack;
    const readable_bottom = bottom - heading_boundary_slack;
    const readable_height = Math.max(0, readable_bottom - readable_top);
    const visible_index = bounds.findIndex(rect => rect.height > 0 && (
      rect.top >= readable_top && rect.bottom <= readable_bottom
      // In narrow windows, multiple line titles may be higher than the entire viewport, and when they cover the readable area, they are still considered the current title.
      || readable_height > 0 && rect.height > readable_height && rect.top <= readable_top && rect.bottom >= readable_bottom
    ));
    if (selected_index >= 0) {
      const selected_bounds = bounds[selected_index];
      const still_visible = selected_bounds.height > 0 && selected_bounds.top >= top - heading_boundary_slack
        && selected_bounds.top < bottom + heading_boundary_slack;
      // Keep the currently reading title on screen; when scrolling up, earlier fully visible titles can re-take over.
      if (still_visible && (visible_index < 0 || visible_index >= selected_index)) return selected_heading;
    }
    if (visible_index >= 0) return headings[visible_index];
    // In long paragraphs/table, when there is no readable title, only revert to the chapter where the text is located, and cannot require the next title to be out of the viewport.
    let previous = headings[0];
    for (let index = 0; index < headings.length; index++) {
      if (bounds[index].top <= top) previous = headings[index];
      else break;
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
    // Only scroll the container of the outline; do not allow scrollIntoView to move the host page or take away the text position.
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
    // Native default judgment and delayed callback uniformly use this unique title, avoiding competition between two viewport rules.
    try { native_highlight?.call(native_outline, [heading], 0, true, false); } catch { /* Unstable host private interface returns to the same DOM semantic. */ }
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
    const content = document.querySelector<HTMLElement>("content");
    const viewport = content && reading_viewport_bounds(content);
    const targets = headings == null ? Array.from(write?.querySelectorAll(":scope > :is(h1,h2,h3,h4,h5,h6)") || [])
      : Array.from(headings as ArrayLike<unknown>);
    const explicit_target = (headings != null || index != null) && (index == null ? targets : [targets[index]])
      .some(node => {
        if (!(node instanceof HTMLElement) || node.parentElement !== write || !node.matches("h1,h2,h3,h4,h5,h6") || !viewport) return false;
        const rect = node.getBoundingClientRect();
        // Native delayed callback after click may be later than user continued scrolling; out-of-viewport old targets cannot lock new reading positions.
        return rect.height > 0 && rect.top >= viewport.top - heading_boundary_slack && rect.top < viewport.bottom + heading_boundary_slack;
      });
    if (explicit_target || blink === true) {
      // Explicit title jumps and manual 'highlight current title' still follow native semantics, and cancel any unexecuted old scroll synchronization.
      cancel_sync();
      native_highlight?.call(this, headings, index, expand, blink);
      const active = sidebar.querySelector<HTMLElement>("#outline-content .outline-label.outline-active");
      selected_label = active;
      selected_heading = Array.from(document.querySelectorAll<HTMLElement>("#write > :is(h1,h2,h3,h4,h5,h6)"))
        .find(heading => heading.getAttribute("cid") === active?.getAttribute("data-ref"));
      explicit_position = document.querySelector<HTMLElement>("content")?.scrollTop;
      return;
    }
    // Non-title targets of scrollAdjust pass empty array; it and parameterless delayed highlight are unified judgment, cannot lock old chapters or change neighbors.
    schedule_sync();
  };
  if (native_outline && native_highlight) native_outline.highlightVisibleHeader = coordinated_highlight;
  const on_document_scroll = (event: Event) => {
    if(!(event.target instanceof HTMLElement)||!event.target.matches('content'))return;
    schedule_sync();
  };
  const on_outline_click = (event: MouseEvent) => {
    if (event.button !== 0 || !is_outline_open()) return;
    const label = (event.target as Element)?.closest<HTMLElement>('#outline-content .outline-label');
    const cid = label?.getAttribute('data-ref');
    const content = document.querySelector<HTMLElement>('content');
    const heading = cid && [...document.querySelectorAll<HTMLElement>('#write > :is(h1,h2,h3,h4,h5,h6)')].find(node => node.getAttribute('cid') === cid);
    if (!heading || !content) return;
    event.preventDefault();event.stopImmediatePropagation();cancel_sync();
    let scale = 1;
    for (let node:HTMLElement|null = content; node; node = node.parentElement) scale *= Number.parseFloat(getComputedStyle(node).zoom) || 1;
    content.scrollTop += (heading.getBoundingClientRect().top - reading_viewport_bounds(content).top - heading_boundary_slack) / scale;
    selected_heading = heading;selected_label = undefined;explicit_position = content.scrollTop;sync_current_heading();
  };
  const refresh = () => {
    if(disposed)return;
    update_document();
    if (clearing) return;
    const filtering = sidebar.classList.contains("ty-show-outline-filter") || sidebar.classList.contains("ty-on-outline-filter") || host.outline?.isSearchShown?.();
    if (!filtering) return;
    clearing = true;
    try {
      // hideSearch returns to native state; clearSearch simultaneously clears old highlights and filtered titles.
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
  sidebar.addEventListener('click', on_outline_click, true);
  refresh();
  outline_open = is_outline_open();
  if (outline_open) schedule_sync();
  return {current_heading:()=>{selected_heading=current_heading();return selected_heading;},select_heading:(heading:HTMLElement)=>{selected_heading=heading;explicit_position=document.querySelector<HTMLElement>("content")?.scrollTop;schedule_sync();},refresh:()=>{refresh();schedule_sync();}, configure:source_outline.configure, dispose: () => {
    if(disposed)return;disposed=true;
    source_outline.dispose();control_icons.dispose();observer.disconnect();sidebar.removeEventListener('click',on_outline_click,true);document.removeEventListener("scroll", on_document_scroll, true);cancel_sync();style.remove();empty.remove();
    if (native_outline?.highlightVisibleHeader === coordinated_highlight) {
      if (native_highlight_descriptor) Object.defineProperty(native_outline, "highlightVisibleHeader", native_highlight_descriptor);
      else delete native_outline.highlightVisibleHeader;
    }
    if(previous_document_outline===null)sidebar.removeAttribute("data-document-outline");else sidebar.setAttribute("data-document-outline",previous_document_outline);
    document.documentElement.removeAttribute("data-linux-note-workspace-outline");
  }};
}
