/** 纯文本匹配，不访问 DOM 或文件系统，可由浏览器与 Node Worker 共用。 */
export type search_query_options = {query: string; regex?: boolean; case_sensitive?: boolean; whole_word?: boolean};
export type search_captured_match = {start: number; end: number; line: number; column: number; end_line: number; end_column: number; text: string; preview: string; preview_ranges: {start: number; end: number}[]; captures: (string | undefined)[]; groups?: Record<string, string | undefined>};
export type search_match_reply = {matches: search_captured_match[]; limit_reached: boolean};
const escape_regex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export function query_expression(options: search_query_options): RegExp {
  if (!options.query) throw new Error("请输入搜索内容。");
  if (options.query.length > 32768) throw new Error("搜索表达式过长。");
  const pattern = options.regex ? options.query : escape_regex(options.query).replace(/\r?\n/gu, "\\r?\\n");
  try { return new RegExp(pattern, "gmu" + (options.case_sensitive ? "" : "i")); }
  catch (error) { throw new Error("正则表达式无效：" + String(error instanceof Error ? error.message : error)); }
}

export function line_starts(text: string): number[] {
  const starts = [0]; const newline = /\r\n|\r|\n/gu; let match: RegExpExecArray | null;
  while ((match = newline.exec(text))) starts.push(match.index + match[0].length);
  return starts;
}
function position(starts: number[], offset: number): {line: number; column: number} {
  let low = 0; let high = starts.length;
  while (low + 1 < high) { const middle = (low + high) >>> 1; if (starts[middle] <= offset) low = middle; else high = middle; }
  return {line: low + 1, column: offset - starts[low] + 1};
}
export function whole_word(text: string, start: number, end: number): boolean {
  const before = start ? [...text.slice(Math.max(0, start - 2), start)].at(-1) || "" : "";
  const after = text.slice(end)[Symbol.iterator]().next().value || "";
  return !/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after);
}
export function capture_match(text: string, starts: number[], found: RegExpExecArray): search_captured_match {
  const start = found.index; const end = start + found[0].length;
  const begin = position(starts, start); const finish = position(starts, end);
  const preview_start = Math.max(starts[begin.line - 1], start - 80); const preview_end = Math.min(starts[finish.line] ?? text.length, preview_start + 400);
  const preview = text.slice(preview_start, preview_end).replace(/[\r\n]+$/u, "");
  return {start, end, ...begin, end_line: finish.line, end_column: finish.column, text: found[0], preview, preview_ranges: [{start: Math.min(start - preview_start, preview.length), end: Math.min(end - preview_start, preview.length)}], captures: Array.from(found), groups: found.groups ? {...found.groups} : undefined};
}

export function collect_search_matches(text: string, options: search_query_options, max_results: number): search_match_reply {
  const expression = query_expression(options); let starts: number[] | undefined; const matches: search_captured_match[] = [];
  let found: RegExpExecArray | null;
  while ((found = expression.exec(text))) {
    if (!found[0].length) expression.lastIndex += text.codePointAt(expression.lastIndex)! > 0xffff ? 2 : 1;
    if (options.whole_word && !whole_word(text, found.index, found.index + found[0].length)) continue;
    starts ||= line_starts(text);
    matches.push(capture_match(text, starts, found));
    if (matches.length >= max_results) return {matches, limit_reached: true};
  }
  return {matches, limit_reached: false};
}
