import {workspace_text} from "./workspace_i18n";
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
const frame = (signal?: AbortSignal) => new Promise<void>(resolve => {
  if (signal?.aborted) { resolve(); return; }
  const finish = () => { cancelAnimationFrame(id); signal?.removeEventListener("abort", finish); resolve(); };
  const id = requestAnimationFrame(finish);
  signal?.addEventListener("abort", finish, { once: true });
});
let revealed: {editor: native_editor; text: string; cursor: string; location: file_location} | undefined;

/** Only when the document and the current selection still match can the reading history continue to carry this source code line positioning. */
export function capture_markdown_location(): file_location | undefined {
  const editor = (window as unknown as {File?: {editor?: native_editor}}).File?.editor;
  if (!revealed || editor !== revealed.editor || normalize_newlines(editor.getMarkdown()) !== revealed.text
      || JSON.stringify(editor.selection.buildUndo()) !== revealed.cursor) return;
  return {...revealed.location};
}

/** Use Typora 1.14.9 source code line mapping to locate the native document; do not switch to source code mode, do not reload the document, and do not modify the disk. */
export async function reveal_markdown_location(location: file_location, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const editor = (window as unknown as {File?: {editor?: native_editor}}).File?.editor;
  if (!editor?.sourceView?.gotoLine || !editor.selection?.buildUndo || !editor.undo?.exeCommand) throw new Error(workspace_text("markdown_location_the_current_typora_does_not_have_a_usable_markdown_native_po"));
  if (editor.sourceView.inSourceMode) throw new Error(workspace_text("markdown_location_please_exit_the_markdown_source_code_mode_first_then_open_th"));
  const root = document.querySelector<HTMLElement>("#write"), scroller = document.querySelector<HTMLElement>("content");
  if (!root || !scroller) throw new Error(workspace_text("markdown_location_markdown_document_content_is_not_ready_yet_please_try_again"));
  const text = normalize_newlines(editor.getMarkdown()), lines = text.split("\n");
  const from = {line: (location.line ?? 1) - 1, ch: (location.column ?? 1) - 1};
  const to = {line: (location.end_line ?? location.line ?? 1) - 1, ch: (location.end_column ?? location.column ?? 1) - 1};
  const offset = (position: source_position) => {
    if (!Number.isInteger(position.line) || !Number.isInteger(position.ch) || position.line < 0 || position.line >= lines.length || position.ch < 0 || position.ch > lines[position.line].length) throw new Error(workspace_text("markdown_location_the_target_row_and_column_have_changed_please_refresh_the_ju"));
    let result = position.ch; for (let line = 0; line < position.line; line++) result += lines[line].length + 1; return result;
  };
  const start = offset(from), end = offset(to), expected = location.expected_text === undefined ? text.slice(start, end) : normalize_newlines(location.expected_text);
  if (end < start || text.slice(start, end) !== expected) throw new Error(workspace_text("markdown_location_markdown_the_current_content_is_inconsistent_with_the_search"));
  const previous = editor.selection.buildUndo(), previous_top = scroller.scrollTop, previous_left = scroller.scrollLeft;
  const goto = (position: source_position) => {
    editor.sourceView.gotoLine({line: position.line, ch: position.ch, lineText: lines[position.line], textBefore: lines[position.line].slice(0, position.ch)});
    const wrapper = document.activeElement?.closest("#write .CodeMirror") as (HTMLElement & {CodeMirror?: code_editor}) | null;
    const cm = wrapper?.CodeMirror;
    return {cursor: editor.selection.buildUndo(), cm, position: cm?.getCursor()};
  };
  try {
    // The gotoLine is mapped by nodeMap to Markdown lines; the native cursor snapshot continues to be responsible for hidden markers and cross-block offsets.
    const first = goto(from), last = goto(to);
    if (first.cm || last.cm) {
      if (!first.cm || first.cm !== last.cm || !first.position || !last.position || normalize_newlines(first.cm.getRange(first.position, last.position)) !== expected) throw new Error(workspace_text("markdown_location_this_match_spans_different_editing_areas_and_cannot_be_safel"));
      first.cm.setSelection(first.position, last.position); first.cm.focus(); first.cm.scrollIntoView({from: first.position, to: last.position}, 40);
      await frame(signal);
      signal?.throwIfAborted();
      const rect = first.cm.charCoords(first.position, "window"), viewport = scroller.getBoundingClientRect();
      scroller.scrollTop += rect.top - viewport.top - Math.max(20, (viewport.height - (rect.bottom - rect.top)) / 2);
    } else {
      if (!first.cursor || !last.cursor || typeof first.cursor.start !== "number" || typeof last.cursor.start !== "number") throw new Error(workspace_text("markdown_location_there_is_no_selectable_document_content_at_this_markdown_loc"));
      const first_id = first.cursor.id ?? first.cursor.startId, last_id = last.cursor.id ?? last.cursor.startId;
      if (!first_id || !last_id) throw new Error(workspace_text("markdown_location_cannot_confirm_the_document_content_block_where_markdown_hit"));
      editor.undo.exeCommand(first_id === last_id
        ? {type: "cursor", id: first_id, start: first.cursor.start, end: last.cursor.start}
        : {type: "cursor", startId: first_id, endId: last_id, start: first.cursor.start, end: last.cursor.start});
      let range = editor.selection.getRangy();
      if (!range || normalize_newlines(range.toString()) !== expected || !root.contains(range.startContainer) || !root.contains(range.endContainer)) throw new Error(workspace_text("markdown_location_native_document_selection_is_inconsistent_with_the_hit_posit"));
      await frame(signal);
      signal?.throwIfAborted();
      range = editor.selection.getRangy();
      if (!range || normalize_newlines(range.toString()) !== expected) throw new Error(workspace_text("markdown_location_markdown_selection_has_changed_please_reopen_the_hit"));
      const visible_range = document.createRange(); visible_range.setStart(range.startContainer, range.startOffset); visible_range.setEnd(range.endContainer, range.endOffset);
      const rect = visible_range.getBoundingClientRect(), viewport = scroller.getBoundingClientRect();
      scroller.scrollTop += rect.top - viewport.top - Math.max(20, (viewport.height - rect.height) / 2);
    }
    await frame(signal);
      signal?.throwIfAborted();
    revealed = {editor, text, cursor: JSON.stringify(editor.selection.buildUndo()), location: {...location}};
  } catch (error) {
    if (signal?.aborted) throw error;
    if (previous) editor.undo.exeCommand(previous);
    scroller.scrollTop = previous_top; scroller.scrollLeft = previous_left;
    throw error;
  }
}
