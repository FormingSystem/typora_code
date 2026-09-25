import type {git_run} from "./git_graph_data";
import {repository_fingerprint, type action_plan} from "./git_graph_actions";
import {INDEX, WORKTREE} from "./git_graph_repository";

/** Monaco 的公开 ILineChange / ISelection 字段保留上游名称。 */
export type git_diff_line_change = {originalStartLineNumber: number; originalEndLineNumber: number; modifiedStartLineNumber: number; modifiedEndLineNumber: number};
export type git_diff_selection = {startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number};
export type git_diff_ranges_request = {
  action: "stage" | "revert"; root: string; file: string; original_revision: string; modified_revision: string;
  original_text: string; modified_text: string; worktree_bytes: Uint8Array; encoding?: string;
  line_changes: readonly git_diff_line_change[]; selections: readonly git_diff_selection[];
};
type source_line = {body: string; ending: string};
type source_text = {bom: string; lines: source_line[]; ending: string};
type line_edit = {start: number; count: number; lines: source_line[]};
const normalize_model = (value: string) => value.replace(/^\ufeff/u, "").replace(/\r\n/gu, "\n");
const failure = (reason: string): never => {throw new Error(reason);};
const stale = () => failure("比较内容已过期，请刷新差异后重新选择。");
const valid_integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
function parse_source(value: string): source_text {
  if (value.includes("\0") || /\r(?!\n)/u.test(value)) failure("选区操作仅支持 UTF-8 的 LF／CRLF 文本。");
  const bom = value.startsWith("\ufeff") ? "\ufeff" : "";
  const body = value.slice(bom.length), lines: source_line[] = [];
  let start = 0;
  for (const match of body.matchAll(/\r\n|\n/gu)) {lines.push({body: body.slice(start, match.index), ending: match[0]}); start = match.index! + match[0].length;}
  lines.push({body: body.slice(start), ending: ""});
  const counts = new Map<string, number>();
  for (const line of lines) if (line.ending) counts.set(line.ending, (counts.get(line.ending) || 0) + 1);
  return {bom, lines, ending: [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "\n"};
}
// ignoreTrimWhitespace 可以隐藏首尾空白；映射间隙仍需逐行对应，实际写入保留目标侧原字节。
const same_body = (left: source_line[], right: source_line[]) => left.length === right.length && left.every((line, index) => line.body.trim() === right[index].body.trim());
const raw_lines = (lines: source_line[]) => lines.map(line => line.body + line.ending).join("");
function selected_lines(selections: readonly git_diff_selection[], lines: source_line[]): Set<number> {
  const selected = new Set<number>();
  for (const selection of selections) {
    let {startLineNumber: start, startColumn: first, endLineNumber: end, endColumn: last} = selection;
    if (![start, first, end, last].every(value => valid_integer(value) && value >= 1) || start > lines.length || end > lines.length || first > lines[start - 1].body.length + 1 || last > lines[end - 1].body.length + 1) failure("选区位置无效，请重新选择。");
    if (start > end || start === end && first > last) {[start, end] = [end, start]; [first, last] = [last, first];}
    if (start === end && first === last) continue;
    // Monaco 选区尾端位于下一行第 1 列时，该行没有被选中。
    const final_line = end > start && last === 1 ? end - 1 : end;
    for (let line = start; line <= final_line; line++) selected.add(line - 1);
  }
  if (!selected.size) failure("请先在工作区一侧选择需要处理的更改行。");
  return selected;
}
function change_range(start: number, end: number, limit: number): [number, number] {
  if (!valid_integer(start) || !valid_integer(end)) stale();
  const offset = end === 0 ? start : start - 1, count = end === 0 ? 0 : end - start + 1;
  if (offset < 0 || count < 0 || offset + count > limit) stale();
  return [offset, count];
}
/** 行替换逐行对应；多出的删除归于末个修改行，纯删除归于其可见前一行锚点。 */
function select_edits(original: source_text, modified: source_text, changes: readonly git_diff_line_change[], selected: Set<number>, action: "stage" | "revert"): line_edit[] {
  const edits: line_edit[] = []; let original_cursor = 0, modified_cursor = 0;
  const target = action === "stage" ? original : modified;
  const copy_line = (source: source_line, previous?: source_line): source_line => ({body: source.body, ending: source.ending ? previous?.ending || target.ending : ""});
  for (const change of changes) {
    const [o, oc] = change_range(change.originalStartLineNumber, change.originalEndLineNumber, original.lines.length);
    const [m, mc] = change_range(change.modifiedStartLineNumber, change.modifiedEndLineNumber, modified.lines.length);
    if (o < original_cursor || m < modified_cursor || !oc && !mc || !same_body(original.lines.slice(original_cursor, o), modified.lines.slice(modified_cursor, m))) stale();
    original_cursor = o + oc; modified_cursor = m + mc;
    const paired = Math.min(oc, mc);
    for (let index = 0; index < paired; index++) {
      if (!selected.has(m + index)) continue;
      const source = action === "stage" ? modified.lines[m + index] : original.lines[o + index];
      const previous = target.lines[(action === "stage" ? o : m) + index];
      edits.push({start: (action === "stage" ? o : m) + index, count: 1, lines: [copy_line(source, previous)]});
    }
    if (mc > oc) for (let index = oc; index < mc; index++) {
      if (!selected.has(m + index)) continue;
      edits.push(action === "stage" ? {start: o + oc, count: 0, lines: [copy_line(modified.lines[m + index])]} : {start: m + index, count: 1, lines: []});
    }
    if (oc > mc && selected.has(mc ? m + mc - 1 : Math.max(0, m - 1))) {
      edits.push(action === "stage" ? {start: o + mc, count: oc - mc, lines: []} : {start: m + mc, count: 0, lines: original.lines.slice(o + mc, o + oc).map(line => copy_line(line))});
    }
  }
  if (!same_body(original.lines.slice(original_cursor), modified.lines.slice(modified_cursor))) stale();
  // 连续选中行合并，分离的选区仍保持分离；不会把同一 hunk 的未选行收入写入范围。
  const combined: line_edit[] = [];
  for (const edit of edits) {
    const previous = combined.at(-1);
    if (previous && previous.start + previous.count === edit.start) {previous.count += edit.count; previous.lines.push(...edit.lines);}
    else combined.push({...edit, lines: [...edit.lines]});
  }
  // 向无末尾换行的文件追加新行时，前一行必须补分隔符；不能把两行内容直接拼接。
  return combined.map(edit => {
    const previous = target.lines[edit.start - 1];
    if (!edit.count && previous?.body && !previous.ending && edit.lines.some(line => line.body || line.ending)) return {start: edit.start - 1, count: 1, lines: [{...previous, ending: target.ending}, ...edit.lines]};
    return edit;
  });
}
function quote_patch_path(file: string): string {
  let value = '"';
  for (const byte of new TextEncoder().encode(file)) value += byte >= 0x20 && byte <= 0x7e && byte !== 34 && byte !== 92 ? String.fromCharCode(byte) : byte === 34 ? '\\"' : byte === 92 ? '\\\\' : "\\" + byte.toString(8).padStart(3, "0");
  return value + '"';
}
function patch_lines(lines: source_line[], prefix: string): string {
  return lines.map(line => line.body || line.ending ? prefix + line.body + line.ending + (line.ending ? "" : "\n\\ No newline at end of file\n") : "").join("");
}
/** 生成只包含选中行变化的补丁；未选行及目标文件原来的逐行换行字节原样保留。 */
export function create_git_diff_range_patch(original_text: string, modified_text: string, line_changes: readonly git_diff_line_change[], selections: readonly git_diff_selection[], action: "stage" | "revert", file: string): {patch: string; result: string; selected_count: number} {
  const original = parse_source(original_text), modified = parse_source(modified_text);
  const selected = selected_lines(selections, modified.lines);
  const target = action === "stage" ? original : modified;
  const edits = select_edits(original, modified, line_changes, selected, action);
  // BOM 在首行插入或删除后仍留在文件起点；借相邻原行携带编码前缀，不改变该行正文。
  if (target.bom) for (const edit of edits) if (edit.start === 0 && (!edit.count || !edit.lines.length)) {
    const next = target.lines[edit.count];
    if (!next) failure("无法无损保留文件编码前缀，请使用文件级操作。");
    edit.count++; edit.lines.push({...next});
  }
  const output = [...target.lines]; let delta = 0, patch = "", selected_count = 0;
  for (const edit of edits) {
    let start = edit.start, old_lines = target.lines.slice(start, start + edit.count), new_lines = [...edit.lines];
    const keep_bom_carrier = start === 0 && target.bom && old_lines.length !== new_lines.length;
    while (!keep_bom_carrier && old_lines.length && new_lines.length && raw_lines([old_lines[0]]) === raw_lines([new_lines[0]])) {old_lines.shift(); new_lines.shift(); start++;}
    while (!keep_bom_carrier && old_lines.length && new_lines.length && raw_lines([old_lines.at(-1)!]) === raw_lines([new_lines.at(-1)!])) {old_lines.pop(); new_lines.pop();}
    if (raw_lines(old_lines) === raw_lines(new_lines)) continue;
    // 最后一行的空 Monaco 模型行没有磁盘字节，不计入 unified diff 的行数。
    const old_count = old_lines.filter(line => line.body || line.ending).length, new_count = new_lines.filter(line => line.body || line.ending).length;
    const old_patch = old_lines.map(line => ({...line})), new_patch = new_lines.map(line => ({...line}));
    if (start === 0 && target.bom) {
      // BOM 属于目标编码，不能被第一行的选区移动、丢弃或重复。
      if (!old_patch.length || !new_patch.length) failure("无法无损保留文件编码前缀，请使用文件级操作。");
      old_patch[0].body = target.bom + old_patch[0].body; new_patch[0].body = target.bom + new_patch[0].body;
    }
    patch += `@@ -${old_count ? start + 1 : start},${old_count} +${new_count ? start + delta + 1 : start + delta},${new_count} @@\n` + patch_lines(old_patch, "-") + patch_lines(new_patch, "+");
    output.splice(start + delta, old_lines.length, ...new_lines);
    delta += new_lines.length - old_lines.length; selected_count += Math.max(old_count, new_count);
  }
  if (!patch) failure("选区不包含可处理的更改。");
  const result = target.bom + raw_lines(output);
  return {patch: `diff --git ${quote_patch_path("a/" + file)} ${quote_patch_path("b/" + file)}\n--- ${quote_patch_path("a/" + file)}\n+++ ${quote_patch_path("b/" + file)}\n` + patch, result, selected_count};
}
/** 计划与现有 Git 操作共用 fingerprint、仓库锁、原文 dirty 保护和 writer；准备过程不写 index 或工作区。 */
export async function plan_git_diff_ranges(run: git_run, request: git_diff_ranges_request): Promise<action_plan> {
  const {root, file, action} = request;
  if (request.original_revision !== INDEX || request.modified_revision !== WORKTREE) failure("历史比较不支持选区写入；请打开暂存区与工作区比较。");
  if (action !== "stage" && action !== "revert") failure("未知的选区操作。");
  if (!file || /[\0\r\n\\]/u.test(file) || /^(?:[a-z]:|\/)/iu.test(file) || file.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) failure("选区文件路径无效。");
  if (request.encoding && !/^utf-?8$/iu.test(request.encoding)) failure("选区操作目前仅支持无损 UTF-8 文本，请使用文件级操作。");
  const fingerprint = await repository_fingerprint(run, root);
  const [index, attributes, raw_work_guard, original_raw, working_state] = await Promise.all([
    run(root, ["ls-files", "--stage", "-z", "--", file]),
    run(root, ["check-attr", "-z", "filter", "working-tree-encoding", "ident", "--", file]),
    run(root, ["hash-object", "--no-filters", "--", file]),
    run(root, ["show", ":" + file]),
    run(root, ["diff", "--raw", "--no-abbrev", "--no-renames", "--no-ext-diff", "--no-textconv", "-z", "--", file]),
  ]);
  const entries = index.split("\0").filter(Boolean);
  if (entries.length !== 1 || !/^100(?:644|755) [a-f0-9]{40}(?:[a-f0-9]{24})? 0\t/u.test(entries[0]) || entries[0].split("\t").slice(1).join("\t") !== file) failure("选区操作仅支持无冲突的已跟踪普通文本文件。");
  if (working_state && !/^:100(?:644|755) 100(?:644|755) [a-f0-9]+ [a-f0-9]+ M\0/u.test(working_state)) failure("文件类型或状态已改变，不能应用选区。");
  const attr_fields = attributes.split("\0");
  for (let index = 2; index < attr_fields.length - 1; index += 3) if (!["unspecified", "unset"].includes(attr_fields[index])) failure("该文件配置了内容过滤或编码转换，不能安全应用选区。");
  let modified_raw: string;
  try {modified_raw = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(request.worktree_bytes);} catch {return failure("文件不是有效 UTF-8，不能无损应用选区。");}
  const index_oid = entries[0].split(" ")[1];
  const [model_index_oid, model_work_oid] = await Promise.all([
    run(root, ["hash-object", "--stdin", "--no-filters"], {stdin: original_raw}),
    run(root, ["hash-object", "--stdin", "--no-filters"], {stdin: modified_raw}),
  ]);
  if (model_index_oid.trim() !== index_oid) failure("暂存区不是无损 UTF-8 文本，不能应用选区。");
  if (model_work_oid !== raw_work_guard || normalize_model(original_raw) !== normalize_model(request.original_text) || normalize_model(modified_raw) !== normalize_model(request.modified_text)) stale();
  const prepared = create_git_diff_range_patch(original_raw, modified_raw, request.line_changes, request.selections, action, file);
  const args = ["apply", ...(action === "stage" ? ["--cached"] : []), "--unidiff-zero", "--whitespace=nowarn", "-"];
  await run(root, [...args.slice(0, -1), "--check", "-"], {stdin: prepared.patch});
  if (await repository_fingerprint(run, root) !== fingerprint || await run(root, ["hash-object", "--no-filters", "--", file]) !== raw_work_guard || await run(root, ["ls-files", "--stage", "-z", "--", file]) !== index) stale();
  return {
    action: {id: action === "stage" ? "stage_ranges" : "revert_ranges", title: action === "stage" ? "暂存所选行" : "撤销所选行", targets: ["file"], fields: [], touches_files: true},
    context: {root, target: file, hash: "", operation: "", paths: [file]}, args, stdin: prepared.patch,
    preview: `处理 ${prepared.selected_count} 行更改`, fingerprint, file_guard: raw_work_guard, index_guard: index,
  };
}
