import { move_workspace_leaf } from "../workspace_leaf_actions"
import { useService } from "src/common/service"
import {cancel_pointer_drag, create_drop_marker} from '../../components/pointer-drag'
import type { WorkspaceTabs } from "."
import type { WorkspaceRoot } from "../workspace-root"
import type { WorkspaceLeaf } from '../workspace-leaf'

/** Native drag and drop only carries a one-time token; document content, disk baseline and confirmation protocol are handled by workbench window bridge. */
export const TAB_DRAG_MIME = 'application/x-typora-code-tab';
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type local_drag = {
  leaf: WorkspaceLeaf; source_group: WorkspaceTabs; tab: HTMLElement;
  transfer_token: string; source_path: string; local_drop: boolean; cancelled: boolean;
};
type drop_target = {group: WorkspaceTabs; index: number; header?: HTMLElement};

/** Tab uses browser native HTML DnD, can enter another renderer; active bar still uses pointer sorting. */
export function draggableTabs(root: WorkspaceRoot, workspace = useService('workspace')) {
  const root_el = root.containerEl, doc = root_el.ownerDocument, view = doc.defaultView!;
  const marker = create_drop_marker(doc), events = new AbortController();
  let local: local_drag | undefined, disposed = false, blocked_start = false;
  let scroll_frame = 0, scroll_header: HTMLElement | undefined, last_over: DragEvent | undefined;
  const has_transfer = (event: DragEvent) => !!event.dataTransfer && Array.from(event.dataTransfer.types).includes(TAB_DRAG_MIME);
  const clear_feedback = () => {
    marker.hide(); scroll_header = undefined; last_over = undefined;
    view.cancelAnimationFrame(scroll_frame); scroll_frame = 0;
  };
  const group_at = (element: Element | null) => {
    const group_el = element?.closest('.typ-workspace-tabs');
    return group_el && root_el.contains(group_el)
      ? root.findNode(node => node.containerEl === group_el) as WorkspaceTabs | null : null;
  };
  const valid_source = (drag: local_drag) => drag.tab.isConnected && drag.source_group.containerEl.isConnected
    && drag.leaf.parent === drag.source_group && drag.leaf.state.path === drag.source_path;
  const end = (event?: DragEvent, cancelled = false) => {
    const drag = local; local = undefined; clear_feedback();
    if (!drag) return;
    drag.tab.removeAttribute('data-workspace-drag-source');
    // dragend's buttons is Chromium synthesized value, cannot be considered reliable evidence of mouse release or Esc.
    doc.dispatchEvent(new CustomEvent('typora-code:tab-drag-end', {detail: {
      leaf: drag.leaf, source_group: drag.source_group, transfer_token: drag.transfer_token,
      local_drop: drag.local_drop, cancelled: cancelled || drag.cancelled,
      drop_effect: event?.dataTransfer?.dropEffect || 'none',
      screen_x: event?.screenX ?? 0, screen_y: event?.screenY ?? 0,
      client_x: event?.clientX ?? 0, client_y: event?.clientY ?? 0
    }}));
  };
  const resolve_target = (event: DragEvent): drop_target | undefined => {
    scroll_header = undefined;
    const element = doc.elementFromPoint(event.clientX, event.clientY);
    if (element?.closest('.typ-ribbon,#typora-sidebar,#top-titlebar,footer,.workspace-menu,.workspace-titlebar-menu-panel')) return;
    // Native Markdown's content outside of workspace DOM, determined by actual editing group coordinates.
    const group = group_at(element) || (element?.closest('content') ? root.findNode(node => {
      if (node.type !== 'tabs') return false;
      const box = node.containerEl.getBoundingClientRect();
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    }) as WorkspaceTabs | null : null);
    if (!group || !group.containerEl.isConnected || (local && !valid_source(local))) return;
    if (local && group !== local.source_group && group.children.some(node => (node as WorkspaceLeaf).state.path === local!.source_path)) return;
    const header = group.tabHeader.containerEl, header_box = header.getBoundingClientRect();
    const tabs = [...group.tabHeader.container.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== local?.tab);
    if (event.clientY >= header_box.top && event.clientY <= header_box.bottom) {
      let index = tabs.findIndex(node => { const box = node.getBoundingClientRect(); return event.clientX < box.left + box.width / 2; });
      if (index < 0) index = tabs.length;
      const x = tabs[index]?.getBoundingClientRect().left ?? tabs[index - 1]?.getBoundingClientRect().right ?? header_box.left;
      marker.show({left: Math.max(header_box.left, Math.min(x, header_box.right - 2)), top: header_box.top, width: 2, height: header_box.height});
      scroll_header = header;
      return {group, index, header};
    }
    const body = group.tabContentEl.getBoundingClientRect();
    marker.highlight({left: body.left, top: body.top, width: body.width, height: body.height});
    return {group, index: tabs.length};
  };
  const scroll_direction = () => {
    if (!last_over || !scroll_header || !scroll_header.isConnected) return 0;
    const box = scroll_header.getBoundingClientRect(), edge = 24;
    if (last_over.clientX < box.left + edge && scroll_header.scrollLeft > 0) return -1;
    if (last_over.clientX > box.right - edge && scroll_header.scrollLeft < scroll_header.scrollWidth - scroll_header.clientWidth - 1) return 1;
    return 0;
  };
  const auto_scroll = () => {
    scroll_frame = 0;
    if (!last_over || disposed) return;
    const direction = scroll_direction();
    if (!direction || !scroll_header) return;
    const before = scroll_header.scrollLeft; scroll_header.scrollLeft += direction * 10;
    if (scroll_header.scrollLeft === before) return;
    if (!resolve_target(last_over)) { clear_feedback(); return; }
    if (scroll_direction()) scroll_frame = view.requestAnimationFrame(auto_scroll);
  };
  const on_start = (event: DragEvent) => {
    const element = event.target instanceof Element ? event.target : null;
    const tab = element?.closest<HTMLElement>('.typ-tab'), source_group = group_at(tab || null);
    if (!tab || !source_group || tab.parentElement !== source_group.tabHeader.container) return;
    if (blocked_start || element?.closest('.typ-close,button,input,textarea,select,a') || !event.dataTransfer) { event.preventDefault(); return; }
    const leaf = source_group.children.find(node => (node as WorkspaceLeaf).state.path === tab.dataset.id) as WorkspaceLeaf | undefined;
    if (!leaf) { event.preventDefault(); return; }
    end(undefined, true); cancel_pointer_drag(view, 'native-tab-drag');
    const transfer_token = view.crypto.randomUUID();
    local = {leaf, source_group, tab, transfer_token, source_path: leaf.state.path, local_drop: false, cancelled: false};
    event.dataTransfer.clearData();
    event.dataTransfer.setData(TAB_DRAG_MIME, transfer_token);
    event.dataTransfer.effectAllowed = 'move';
    // The same single tab path as fixed VS Code is used directly, using original tab (including current Seti icon).
    event.dataTransfer.setDragImage(tab, 0, 0);
    tab.dataset.workspaceDragSource = 'true';
    event.stopImmediatePropagation();
    doc.dispatchEvent(new CustomEvent('typora-code:tab-drag-start', {detail: {leaf, source_group, transfer_token}}));
  };
  const on_over = (event: DragEvent) => {
    if (!has_transfer(event)) return;
    // Must intercept exclusive type during document capture phase, avoid host changing to none or pasting from document content.
    event.stopImmediatePropagation();
    if (local?.cancelled) { event.dataTransfer!.dropEffect = 'none'; clear_feedback(); return; }
    const target = resolve_target(event);
    event.dataTransfer!.dropEffect = target ? 'move' : 'none';
    if (!target) { clear_feedback(); return; }
    event.preventDefault(); last_over = event;
    if (scroll_direction()) {
      if (!scroll_frame) scroll_frame = view.requestAnimationFrame(auto_scroll);
    } else {
      view.cancelAnimationFrame(scroll_frame); scroll_frame = 0;
    }
  };
  const move_local = (drag: local_drag, target: drop_target) => {
    drag.local_drop = true;
    move_workspace_leaf(drag.leaf, target.group, target.index, workspace);
  };
  const on_drop = (event: DragEvent) => {
    if (!has_transfer(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const target = resolve_target(event), transfer_token = event.dataTransfer!.getData(TAB_DRAG_MIME);
    clear_feedback(); event.dataTransfer!.dropEffect = 'none';
    if (!target || !TOKEN_PATTERN.test(transfer_token) || local?.cancelled) return;
    if (local) {
      if (local.transfer_token !== transfer_token || !valid_source(local)) return;
      event.dataTransfer!.dropEffect = 'move';
      move_local(local, target);
      // Cross-group movement replaces original tab node, dragend may not bubble to document; here completes local session.
      end(event);
    } else {
      const request = new CustomEvent('typora-code:tab-drop', {cancelable: true, detail: {transfer_token, target_group: target.group, target_index: target.index}});
      doc.dispatchEvent(request);
      if (request.defaultPrevented) event.dataTransfer!.dropEffect = 'move';
    }
  };
  const on_leave = (event: DragEvent) => {
    if (!has_transfer(event)) return;
    event.stopImmediatePropagation();
    if (!event.relatedTarget || !doc.documentElement.contains(event.relatedTarget as Node)) clear_feedback();
  };
  const on_end = (event: DragEvent) => {
    if (!local) return;
    event.stopImmediatePropagation(); end(event);
  };
  const on_escape = (event: KeyboardEvent) => {if (event.key === 'Escape' && local) { local.cancelled = true; end(undefined, true); }};
  const observer = new MutationObserver(() => {if (local && !local.local_drop && !valid_source(local)) end(undefined, true);});
  observer.observe(root_el, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-id']});
  root_el.addEventListener('pointerdown', event => {
    const element = event.target instanceof Element ? event.target : null;
    blocked_start = event.button !== 0 || !!element?.closest('.typ-close,button,input,textarea,select,a');
  }, {capture: true, signal: events.signal});
  doc.addEventListener('dragstart', on_start, {capture: true, signal: events.signal});
  doc.addEventListener('dragenter', on_over, {capture: true, signal: events.signal});
  doc.addEventListener('dragover', on_over, {capture: true, signal: events.signal});
  doc.addEventListener('drop', on_drop, {capture: true, signal: events.signal});
  doc.addEventListener('dragleave', on_leave, {capture: true, signal: events.signal});
  doc.addEventListener('dragend', on_end, {capture: true, signal: events.signal});
  doc.addEventListener('keydown', on_escape, {capture: true, signal: events.signal});
  view.addEventListener('pagehide', () => end(undefined, true), {signal: events.signal});
  return () => {if (disposed) return; disposed = true; end(undefined, true); observer.disconnect(); events.abort(); marker.dispose();};
}
