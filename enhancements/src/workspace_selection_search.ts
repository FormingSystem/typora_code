import type { graph_core } from "./git_graph_host";
import type { workspace_file_host } from "./workspace_files";

export type workspace_selection_request = {query: string; source_path?: string; line?: number; column?: number; end_line?: number; end_column?: number};
type source_position = {line: number; ch: number};
type source_editor = {getWrapperElement(): HTMLElement; listSelections(): {anchor: source_position; head: source_position}[]; getRange(from: source_position, to: source_position): string; coordsChar(point: {left: number; top: number}, mode: "window"): source_position};
const position_compare = (left: source_position, right: source_position) => left.line - right.line || left.ch - right.ch;

/** 正文、原生源码和 Monaco 的选区统一进入搜索，不注册第二个侧栏或快捷键。 */
export function bind_workspace_selection_search(core: graph_core, files: workspace_file_host, search: (request: workspace_selection_request) => void | Promise<void>) {
  const runtime = window as unknown as {File?: {editor?: {sourceView?: {inSourceMode: boolean; cm?: source_editor}}; bundle?: {filePath?: string}}};
  const source_path = (target: Element) => { let path = ""; core.app.workspace.eachLeaves(leaf => { if (leaf.view.containerEl.contains(target) && files.path_api.isAbsolute(leaf.state.path)) path = leaf.state.path; }); return path || files.current_file() || runtime.File?.bundle?.filePath || ""; };
  const selected_at = (event: MouseEvent): workspace_selection_request | undefined => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("a[href],a[data-href],.monaco-editor,.linux-note-workspace-search,input,textarea,button,select,.CodeMirror-gutters")) return;
    const wrapper = target.closest<HTMLElement>(".CodeMirror") as (HTMLElement & {CodeMirror?: source_editor}) | null;
    if (wrapper) {
      const source = runtime.File?.editor?.sourceView; const cm = wrapper.CodeMirror || (source?.inSourceMode && source.cm?.getWrapperElement() === wrapper ? source.cm : undefined);
      if (!cm || !target.closest(".CodeMirror-code,.CodeMirror-lines")) return;
      const selected_box = [...wrapper.querySelectorAll<HTMLElement>(".CodeMirror-selected")].some(node => { const box = node.getBoundingClientRect(); return event.clientX >= box.left && event.clientX < box.right && event.clientY >= box.top && event.clientY < box.bottom; });
      if (!selected_box) return;
      const point = cm.coordsChar({left: event.clientX, top: event.clientY}, "window");
      for (const selection of cm.listSelections()) {
        const [from, to] = position_compare(selection.anchor, selection.head) <= 0 ? [selection.anchor, selection.head] : [selection.head, selection.anchor];
        // coordsChar 会四舍五入到相邻插入点；实际选区矩形已排除尾部之外的点击。
        if (position_compare(from, to) === 0 || position_compare(point, from) < 0 || position_compare(point, to) > 0) continue;
        const query = cm.getRange(from, to); if (!query.trim()) return;
        return {query, source_path: source_path(target), line: from.line + 1, column: from.ch + 1, end_line: to.line + 1, end_column: to.ch + 1};
      }
      return;
    }
    const selection = window.getSelection(); if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0); const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    const owner = start?.closest("#write,.typ-markdown-preview"); if (!owner || !owner.contains(range.endContainer) || !owner.contains(target)) return;
    if (![...range.getClientRects()].some(box => event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom)) return;
    const query = range.toString(); return query.trim() ? {query, source_path: source_path(target)} : undefined;
  };
  let pending: {request: workspace_selection_request; x: number; y: number} | undefined;
  const pointer = (event: PointerEvent) => {
    pending = undefined; if (!event.isTrusted || event.button !== 0 || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const request = selected_at(event); if (!request) return;
    // 在原生 mousedown 折叠选区前拦截，直到同一次真实 click 才调度搜索。
    event.preventDefault(); event.stopImmediatePropagation(); pending = {request, x: event.clientX, y: event.clientY};
  };
  const click = (event: MouseEvent) => {
    const candidate = pending; pending = undefined;
    if (!candidate || !event.isTrusted || event.button !== 0 || !(event.ctrlKey || event.metaKey) || Math.abs(event.clientX - candidate.x) > 5 || Math.abs(event.clientY - candidate.y) > 5) return;
    event.preventDefault(); event.stopImmediatePropagation(); void search(candidate.request);
  };
  const selection_event = (event: Event) => { const request = (event as CustomEvent<workspace_selection_request>).detail; if (request) void search(request); };
  document.addEventListener("pointerdown", pointer, true); document.addEventListener("click", click, true); window.addEventListener("linux-note-search-selection", selection_event);
  return {dispose() { pending = undefined; document.removeEventListener("pointerdown", pointer, true); document.removeEventListener("click", click, true); window.removeEventListener("linux-note-search-selection", selection_event); }};
}
