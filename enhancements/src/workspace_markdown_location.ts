import type {file_location} from "./workspace_files";

type source_position = {line: number; ch: number};
type native_cursor = {type: "cursor"; id?: string; startId?: string; endId?: string; start?: number; end?: number; [key: string]: unknown};
type native_range = {startContainer: Node; startOffset: number; endContainer: Node; endOffset: number; toString(): string};
type code_editor = {getCursor(): source_position; getRange(from: source_position, to: source_position): string; setSelection(from: source_position, to: source_position): void; focus(): void; scrollIntoView(range: {from: source_position; to: source_position}, margin: number): void; charCoords(position: source_position, mode: "window"): {top: number; bottom: number}};
type native_editor = {
  getMarkdown(): string;
  sourceView: {inSourceMode: boolean; gotoLine(position: {line: number; ch: number; lineText: string; textBefore: string}): void};
  selection: {buildUndo(): native_cursor | null; getRangy(): native_range | null};
  undo: {exeCommand(cursor: native_cursor): void};
};
const normalize_newlines = (value: string) => value.replace(/\r\n?/gu, "\n");
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
let revealed: {editor: native_editor; text: string; cursor: string; location: file_location} | undefined;

/** 只有正文和当前选区仍吻合时，阅读历史才能继续携带这次源码行列定位。 */
export function capture_markdown_location(): file_location | undefined {
  const editor = (window as unknown as {File?: {editor?: native_editor}}).File?.editor;
  if (!revealed || editor !== revealed.editor || normalize_newlines(editor.getMarkdown()) !== revealed.text
      || JSON.stringify(editor.selection.buildUndo()) !== revealed.cursor) return;
  return {...revealed.location};
}

/** 使用 Typora 1.14.9 源码行映射定位原生正文；不切源码模式、不重载正文，也不修改磁盘。 */
export async function reveal_markdown_location(location: file_location): Promise<void> {
  const editor = (window as unknown as {File?: {editor?: native_editor}}).File?.editor;
  if (!editor?.sourceView?.gotoLine || !editor.selection?.buildUndo || !editor.undo?.exeCommand) throw new Error("当前 Typora 没有可用的 Markdown 原生定位接口。");
  if (editor.sourceView.inSourceMode) throw new Error("请先退出 Markdown 源码模式，再打开渲染位置。");
  const root = document.querySelector<HTMLElement>("#write"), scroller = document.querySelector<HTMLElement>("content");
  if (!root || !scroller) throw new Error("Markdown 正文尚未准备好，请重试。");
  const text = normalize_newlines(editor.getMarkdown()), lines = text.split("\n");
  const from = {line: (location.line ?? 1) - 1, ch: (location.column ?? 1) - 1};
  const to = {line: (location.end_line ?? location.line ?? 1) - 1, ch: (location.end_column ?? location.column ?? 1) - 1};
  const offset = (position: source_position) => {
    if (!Number.isInteger(position.line) || !Number.isInteger(position.ch) || position.line < 0 || position.line >= lines.length || position.ch < 0 || position.ch > lines[position.line].length) throw new Error("目标行列已变化，请刷新跳转结果。");
    let result = position.ch; for (let line = 0; line < position.line; line++) result += lines[line].length + 1; return result;
  };
  const start = offset(from), end = offset(to), expected = location.expected_text === undefined ? text.slice(start, end) : normalize_newlines(location.expected_text);
  if (end < start || text.slice(start, end) !== expected) throw new Error("Markdown 当前内容与搜索位置不一致，请处理未保存的修改并刷新结果。");
  const previous = editor.selection.buildUndo(), previous_top = scroller.scrollTop, previous_left = scroller.scrollLeft;
  const goto = (position: source_position) => {
    editor.sourceView.gotoLine({line: position.line, ch: position.ch, lineText: lines[position.line], textBefore: lines[position.line].slice(0, position.ch)});
    const wrapper = document.activeElement?.closest("#write .CodeMirror") as (HTMLElement & {CodeMirror?: code_editor}) | null;
    const cm = wrapper?.CodeMirror;
    return {cursor: editor.selection.buildUndo(), cm, position: cm?.getCursor()};
  };
  try {
    // gotoLine 由 nodeMap 映射 Markdown 行；原生光标快照继续负责隐藏标记和跨块偏移。
    const first = goto(from), last = goto(to);
    if (first.cm || last.cm) {
      if (!first.cm || first.cm !== last.cm || !first.position || !last.position || normalize_newlines(first.cm.getRange(first.position, last.position)) !== expected) throw new Error("该匹配跨越不同编辑区，无法安全选中；请缩小关键词范围。");
      first.cm.setSelection(first.position, last.position); first.cm.focus(); first.cm.scrollIntoView({from: first.position, to: last.position}, 40);
      await frame();
      const rect = first.cm.charCoords(first.position, "window"), viewport = scroller.getBoundingClientRect();
      scroller.scrollTop += rect.top - viewport.top - Math.max(20, (viewport.height - (rect.bottom - rect.top)) / 2);
    } else {
      if (!first.cursor || !last.cursor || typeof first.cursor.start !== "number" || typeof last.cursor.start !== "number") throw new Error("该 Markdown 位置没有可选中的正文内容。");
      const first_id = first.cursor.id ?? first.cursor.startId, last_id = last.cursor.id ?? last.cursor.startId;
      if (!first_id || !last_id) throw new Error("无法确认 Markdown 命中所在的正文块。");
      editor.undo.exeCommand(first_id === last_id
        ? {type: "cursor", id: first_id, start: first.cursor.start, end: last.cursor.start}
        : {type: "cursor", startId: first_id, endId: last_id, start: first.cursor.start, end: last.cursor.start});
      let range = editor.selection.getRangy();
      if (!range || normalize_newlines(range.toString()) !== expected || !root.contains(range.startContainer) || !root.contains(range.endContainer)) throw new Error("原生正文选区与命中不一致，已取消定位；请刷新或缩小关键词范围。");
      await frame();
      range = editor.selection.getRangy();
      if (!range || normalize_newlines(range.toString()) !== expected) throw new Error("Markdown 选区已变化，请重新打开命中。");
      const visible_range = document.createRange(); visible_range.setStart(range.startContainer, range.startOffset); visible_range.setEnd(range.endContainer, range.endOffset);
      const rect = visible_range.getBoundingClientRect(), viewport = scroller.getBoundingClientRect();
      scroller.scrollTop += rect.top - viewport.top - Math.max(20, (viewport.height - rect.height) / 2);
    }
    await frame();
    revealed = {editor, text, cursor: JSON.stringify(editor.selection.buildUndo()), location: {...location}};
  } catch (error) {
    if (previous) editor.undo.exeCommand(previous);
    scroller.scrollTop = previous_top; scroller.scrollLeft = previous_left;
    throw error;
  }
}
