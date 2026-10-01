import {reading_viewport_bounds} from './reading_viewport';

type markdown_span = {node: HTMLElement; start: number; end: number; code_start?: number; cm?: any};
const normalize = (text: string) => text.replace(/\r\n?/g, '\n');

/** Match native serialized blocks against the same in-memory Markdown, in document order.
 * Unmatched blocks are omitted instead of guessing a different occurrence or moving the cursor. */
export function native_markdown_spans(editor: any): markdown_span[] {
  const root = document.querySelector('#write');
  if (!root || !editor?.getNode) return [];
  const text = normalize(editor.nodeMap.toMark());
  const starts = [0];
  for (let index = 0; index < text.length; index++) if (text[index] === '\n') starts.push(index + 1);
  const line_at = (offset: number) => {
    let low = 0, high = starts.length;
    while (low < high) { const mid = (low + high) >>> 1; if (starts[mid] <= offset) low = mid + 1; else high = mid; }
    return Math.max(0, low - 1);
  };
  const spans: markdown_span[] = [];
  let offset = 0;
  for (const node of root.children) {
    if (!(node instanceof HTMLElement) || !node.hasAttribute('cid')) continue;
    const fragment = normalize(editor.getNode(node.getAttribute('cid'))?.toMark?.() || '').trim();
    if (!fragment) continue;
    const start = text.indexOf(fragment, offset);
    if (start < 0) continue;
    offset = start + fragment.length;
    const cm = (node.querySelector('.CodeMirror') as any)?.CodeMirror;
    const code = cm && node.matches('.md-fences') ? normalize(cm.getValue()) : '';
    const code_offset = code ? text.indexOf(code, start) : -1;
    spans.push({node, start: line_at(start), end: line_at(offset), cm,
      code_start: code_offset >= start && code_offset + code.length <= offset ? line_at(code_offset) : undefined});
  }
  return spans;
}

export function capture_native_markdown_line(editor: any): number | undefined {
  const scroller = document.querySelector<HTMLElement>('content.typ-workspace-binding');
  if (!scroller) return;
  const viewport = reading_viewport_bounds(scroller), y = (viewport.top + viewport.bottom) / 2;
  const spans = native_markdown_spans(editor);
  const span = spans.find(item => item.node.getBoundingClientRect().bottom > y) || spans.at(-1);
  if (!span) return;
  if (span.cm && span.code_start !== undefined) {
    const rect = span.cm.getWrapperElement().getBoundingClientRect();
    return span.code_start + span.cm.coordsChar({left: rect.left + 8, top: y}, 'window').line;
  }
  const rect = span.node.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(.999, (y - rect.top) / Math.max(1, rect.height)));
  return span.start + Math.floor(fraction * (span.end - span.start + 1));
}

export function reveal_native_markdown_line(editor: any, line: number): void {
  const scroller = document.querySelector<HTMLElement>('content.typ-workspace-binding');
  if (!scroller) return;
  const spans = native_markdown_spans(editor);
  const span = spans.find(item => item.end >= line) || spans.at(-1);
  if (!span) return;
  const viewport = reading_viewport_bounds(scroller), center = (viewport.top + viewport.bottom) / 2;
  let top: number;
  if (span.cm && span.code_start !== undefined) {
    const position = {line: Math.max(0, Math.min(span.cm.lineCount() - 1, line - span.code_start)), ch: 0};
    span.cm.scrollTo(null, span.cm.charCoords(position, 'local').top - span.cm.getScrollInfo().clientHeight / 2);
    top = span.cm.charCoords(position, 'window').top;
  } else {
    const rect = span.node.getBoundingClientRect();
    top = rect.top + rect.height * Math.max(0, Math.min(1, (line - span.start + .5) / (span.end - span.start + 1)));
  }
  scroller.scrollTop += top - center;
}
