import { move_workspace_leaf } from "../workspace_leaf_actions"
import { useService } from "src/common/service"
import {cancel_pointer_drag, create_drop_marker} from '../../components/pointer-drag'
import type { WorkspaceTabs } from "."
import type { WorkspaceRoot } from "../workspace-root"
import type { WorkspaceLeaf } from '../workspace-leaf'

/** 原生拖放只携带一次性令牌；正文、磁盘基线与确认协议由工作台的窗口桥负责。 */
export const TAB_DRAG_MIME = 'application/x-typora-code-tab';
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type local_drag = {
  leaf: WorkspaceLeaf; source_group: WorkspaceTabs; tab: HTMLElement;
  transfer_token: string; source_path: string; local_drop: boolean; cancelled: boolean;
};
type drop_target = {group: WorkspaceTabs; index: number; header?: HTMLElement};

/** 标签采用浏览器原生 HTML DnD，可进入另一个 renderer；活动栏仍使用指针排序。 */
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
    // dragend 的 buttons 是 Chromium 合成值，不能当作鼠标释放或 Esc 的可靠证据。
    doc.dispatchEvent(new CustomEvent('typora-code:tab-drag-end', {detail: {
      leaf: drag.leaf, source_group: drag.source_group, transfer_token: drag.transfer_token,
      local_drop: drag.local_drop, cancelled: cancelled || drag.cancelled,
      drop_effect: event?.dataTransfer?.dropEffect || 'none',
      screen_x: event?.screenX ?? 0, screen_y: event?.screenY ?? 0,
      client_x: event?.clientX ?? 0, client_y: event?.clientY ?? 0
    }}));
  };
  const resolve_target = (event: DragEvent): drop_target | undefined => {
    marker.hide(); scroll_header = undefined;
    const element = doc.elementFromPoint(event.clientX, event.clientY);
    if (element?.closest('.typ-ribbon,#typora-sidebar,#top-titlebar,footer,.workspace-menu,.workspace-titlebar-menu-panel')) return;
    // 原生 Markdown 的 content 在 workspace DOM 外，按实际编辑组坐标确定归属。
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
      let index = tabs.findIndex(node => event.clientX < node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2);
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
  const auto_scroll = () => {
    scroll_frame = 0;
    if (!last_over || disposed) return;
    if (scroll_header) {
      const box = scroll_header.getBoundingClientRect(), edge = 24;
      const direction = last_over.clientX < box.left + edge ? -1 : last_over.clientX > box.right - edge ? 1 : 0;
      if (direction) {
        const before = scroll_header.scrollLeft; scroll_header.scrollLeft += direction * 10;
        if (scroll_header.scrollLeft !== before) resolve_target(last_over);
      }
    }
    scroll_frame = view.requestAnimationFrame(auto_scroll);
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
    // 与固定 VS Code 的单标签路径相同，直接使用原标签（含当前 Seti 图标）。
    event.dataTransfer.setDragImage(tab, 0, 0);
    tab.dataset.workspaceDragSource = 'true';
    event.stopImmediatePropagation();
    doc.dispatchEvent(new CustomEvent('typora-code:tab-drag-start', {detail: {leaf, source_group, transfer_token}}));
  };
  const on_over = (event: DragEvent) => {
    if (!has_transfer(event)) return;
    // 必须在 document capture 阶段拦截专属类型，避免宿主改成 none 或按正文粘贴。
    event.stopImmediatePropagation();
    if (local?.cancelled) { event.dataTransfer!.dropEffect = 'none'; clear_feedback(); return; }
    const target = resolve_target(event);
    event.dataTransfer!.dropEffect = target ? 'move' : 'none';
    if (!target) { clear_feedback(); return; }
    event.preventDefault(); last_over = event;
    if (!scroll_frame) scroll_frame = view.requestAnimationFrame(auto_scroll);
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
      // 跨组移动会替换原 tab 节点，dragend 未必冒泡到 document；这里完成本地会话。
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
