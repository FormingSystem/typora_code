/// <reference path="./search_worker_types.d.ts" />
import { decode_file_bytes, detect_binary_bytes, type decoded_file } from "./file_language";
import {query_expression, line_starts, whole_word, capture_match, type search_captured_match} from "./workspace_search_matcher";
import {create_search_matcher, search_match_failure, type search_matcher_factory} from "./workspace_search_worker_client";
import {file_key} from "./workspace_file_uri";

export type workspace_search_options = {
  query: string; case_sensitive?: boolean; whole_word?: boolean; regex?: boolean; include?: string; exclude?: string;
  use_ignore?: boolean; exclude_settings?: string; max_results?: number; max_file_bytes?: number; encoding?: string; glob_case_sensitive?: boolean;
  preserve_case?: boolean; file_paths?: string[]; folder_path?: string;
};
export type workspace_search_match = {id: string; start: number; end: number; line: number; column: number; end_line: number; end_column: number; text: string; preview: string; preview_ranges: {start: number; end: number}[]};
export type workspace_search_file = {file_path: string; relative_path: string; matches: workspace_search_match[]};
export type workspace_search_counts = {scanned_files: number; searched_files: number; matched_files: number; matches: number; skipped: {binary: number; large: number; ignored: number; excluded: number; links: number; unreadable: number}};
export type workspace_search_result = {root: string; options: workspace_search_options; files: workspace_search_file[]; counts: workspace_search_counts; cancelled: boolean; limit_reached: boolean; notices: string[]};
export type workspace_replace_file = {file_path: string; relative_path: string; before_text: string; after_text: string; match_count: number};
export type workspace_replace_plan = {root: string; replacement: string; files: workspace_replace_file[]; match_count: number};
export type workspace_search_modules = {fs: any; path_api: any; git_run?: (root: string, args: string[]) => Promise<string>; platform?: string; matcher_factory?: search_matcher_factory};
type captured_match = search_captured_match & {id: string};
type file_snapshot = {bytes: Uint8Array; decoded: decoded_file; identity: string; mode: number; matches: captured_match[]};
type result_snapshot = {root: string; options: workspace_search_options; files: Map<string, file_snapshot>; incomplete: boolean; replace_blocked: boolean};
type prepared_file = workspace_replace_file & {snapshot: file_snapshot; bytes: Uint8Array};
const DEFAULT_EXCLUDES = "**/.git, **/.svn, **/.hg, **/CVS, **/.DS_Store, **/Thumbs.db, **/node_modules, **/bower_components, **/*.code-search";
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MAX_READ_CONCURRENCY = 4;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const escape_regex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const same_bytes = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index]);
const identity = (stat: any) => `${String(stat.dev)}:${String(stat.ino)}`;
const bounded_integer = (value: number | undefined, fallback: number, maximum: number) => value === undefined ? fallback : Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : (() => { throw new Error("搜索上限必须为范围内的正整数。"); })();

/** 逗号只分隔最外层模式，保留 {a,b} 与字符类里的逗号。 */
function split_globs(value: string): string[] {
  const output: string[] = []; let start = 0; let braces = 0; let brackets = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === "[" && !brackets) brackets++;
    else if (character === "]" && brackets) brackets--;
    else if (!brackets && character === "{") braces++;
    else if (!brackets && character === "}") { if (!braces) throw new Error("文件模式的大括号不匹配。"); braces--; }
    else if (!braces && !brackets && character === ",") { output.push(value.slice(start, index).trim()); start = index + 1; }
  }
  if (braces || brackets) throw new Error("文件模式的括号不匹配。");
  output.push(value.slice(start).trim()); return output.filter(Boolean);
}

/** 对齐 Search 输入框的隐含递归前缀及目录后代匹配，不将此解析器用于 .gitignore。 */
export function compile_workspace_globs(value: string, case_sensitive = true, search_prefix = true): (relative_path: string) => boolean {
  if (value.length > 8192) throw new Error("文件模式过长。");
  const patterns = split_globs(value).map(pattern => {
    if (pattern.includes("\\")) throw new Error("文件模式请使用正斜线 /。");
    const anchored = pattern.startsWith("./") || pattern.startsWith("/");
    pattern = pattern.replace(/^(?:\.\/|\/)/u, "").replace(/\/+$/u, "");
    let result = ""; let index = 0;
    while (index < pattern.length) {
      const character = pattern[index++];
      if (character === "*") {
        if (pattern[index] === "*") { while (pattern[index] === "*") index++; if (pattern[index] === "/") { index++; result += "(?:[^/]+/)*"; } else result += ".*"; }
        else result += "[^/]*";
      } else if (character === "?") result += "[^/]";
      else if (character === "{") result += "(?:";
      else if (character === "}") result += ")";
      else if (character === ",") result += "|";
      else if (character === "[") {
        const end = pattern.indexOf("]", index); let contents = pattern.slice(index, end);
        if (!contents || contents.includes("/")) throw new Error("文件模式字符类无效。");
        if (contents[0] === "!") contents = "^" + contents.slice(1);
        else if (contents[0] === "^") contents = "\\^" + contents.slice(1);
        result += "[" + contents + "]"; index = end + 1;
      } else result += escape_regex(character);
    }
    try { return new RegExp("^" + (search_prefix && !anchored ? "(?:[^/]+/)*" : "") + result + "(?:/.*)?$", case_sensitive ? "u" : "iu"); }
    catch { throw new Error("文件包含或排除模式无效。"); }
  });
  return relative_path => patterns.some(pattern => pattern.test(relative_path));
}

/** 正则替换支持捕获组、换行和 VS Code 的大小写修饰；普通文本替换保持字面值。 */
function replacement_text(replacement: string, match: captured_match, source: string, regex: boolean): string {
  if (!regex) return replacement;
  let result = ""; let mode = ""; const pending: string[] = [];
  const append = (text: string) => { for (const character of text) { const change = pending.shift() || mode; result += change === "upper" ? character.toUpperCase() : change === "lower" ? character.toLowerCase() : character; } };
  for (let index = 0; index < replacement.length; index++) {
    const character = replacement[index]; const next = replacement[index + 1];
    if (character === "\\" && next) {
      if (["u", "l"].includes(next)) { pending.push(next === "u" ? "upper" : "lower"); index++; continue; }
      if (["U", "L"].includes(next)) { mode = next === "U" ? "upper" : "lower"; index++; continue; }
      if (next === "E") { mode = ""; pending.length = 0; index++; continue; }
      if (["n", "r", "t", "\\"].includes(next)) { append(({n: "\n", r: "\r", t: "\t", "\\": "\\"} as Record<string, string>)[next]); index++; continue; }
    }
    if (character === "$" && next) {
      if (next === "$") { append("$"); index++; continue; }
      if (next === "&" || next === "0") { append(match.text); index++; continue; }
      if (next === "`") { append(source.slice(0, match.start)); index++; continue; }
      if (next === "'") { append(source.slice(match.end)); index++; continue; }
      if (/[1-9]/u.test(next)) {
        let digits = next; if (/\d/u.test(replacement[index + 2] || "") && Number(next + replacement[index + 2]) < match.captures.length) digits += replacement[index + 2];
        if (Number(digits) < match.captures.length) { append(match.captures[Number(digits)] || ""); index += digits.length; continue; }
      }
      if (next === "<") { const close = replacement.indexOf(">", index + 2); const name = replacement.slice(index + 2, close); if (close >= 0 && match.groups && name in match.groups) { append(match.groups[name] || ""); index = close; continue; } }
    }
    append(character);
  }
  return result;
}

function encode_file(text: string, decoded: decoded_file): Uint8Array {
  if (decoded.encoding === "utf-8") {
    const body = new TextEncoder().encode(text); if (!decoded.bom) return body;
    const output = new Uint8Array(body.length + 3); output.set([0xef, 0xbb, 0xbf]); output.set(body, 3); return output;
  }
  if (!["utf-16le", "utf-16be"].includes(decoded.encoding)) throw new Error(`当前文件使用 ${decoded.encoding}；只能搜索，尚不能保证此编码的无损替换。`);
  const little = decoded.encoding === "utf-16le"; const offset = decoded.bom ? 2 : 0;
  const output = new Uint8Array(text.length * 2 + offset); const view = new DataView(output.buffer);
  if (decoded.bom) output.set(little ? [0xff, 0xfe] : [0xfe, 0xff]);
  for (let index = 0; index < text.length; index++) view.setUint16(offset + index * 2, text.charCodeAt(index), little);
  return output;
}

/** 大小写保留按原匹配文字处理，并允许 foo-bar 与 foo_bar 的各段分别保留。 */
function preserve_case(source: string, replacement: string): string {
  for (const separator of ["-", "_"]) {
    const source_parts = source.split(separator); const replacement_parts = replacement.split(separator);
    if (source_parts.length > 1 && source_parts.length === replacement_parts.length) return replacement_parts.map((part, index) => preserve_case(source_parts[index], part)).join(separator);
  }
  if (source && source === source.toUpperCase() && source !== source.toLowerCase()) return replacement.toUpperCase();
  if (source && source === source.toLowerCase() && source !== source.toUpperCase()) return replacement.toLowerCase();
  const first = [...source][0] || "";
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) return [...replacement].map((character, index) => index ? character : character.toUpperCase()).join("");
  return replacement;
}

/** 文件系统、路径与 Git 均由宿主注入；搜索和预览从不写磁盘，只有 apply_replace 能写。 */
export function create_workspace_search_engine(modules: workspace_search_modules) {
  const {fs, path_api, git_run} = modules; const files_api = fs.promises;
  const results = new WeakMap<workspace_search_result, result_snapshot>();
  const plans = new WeakMap<workspace_replace_plan, {root: string; files: prepared_file[]}>();
  let serial = 0; let applying = false;
  const inside = (root: string, target: string) => { const relative = path_api.relative(root, target); return relative !== ".." && !relative.startsWith(".." + path_api.sep) && !path_api.isAbsolute(relative); };
  const assert_file = async (root: string, target: string) => {
    if (!inside(root, target)) throw new Error("文件位于搜索目录之外。");
    const stat = await files_api.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new Error("替换仅支持无符号链接或硬链接的普通文件。");
    const real = await files_api.realpath(target);
    if (real !== target || !inside(root, real)) throw new Error("文件或父目录已变成符号链接，请重新搜索。");
    return stat;
  };
  const verify_file = async (root: string, file: prepared_file) => {
    const stat = await assert_file(root, file.file_path);
    if (identity(stat) !== file.snapshot.identity || !same_bytes(new Uint8Array(await files_api.readFile(file.file_path)), file.snapshot.bytes)) throw new Error(`文件已被修改或替换，请重新搜索并预览：${file.relative_path}`);
  };

  async function search(input_root: string, options: workspace_search_options, callbacks: {signal?: AbortSignal; on_file?: (file: workspace_search_file, counts: workspace_search_counts) => void} = {}): Promise<workspace_search_result> {
    const root = await files_api.realpath(path_api.resolve(input_root));
    if (!(await files_api.stat(root)).isDirectory()) throw new Error("搜索范围必须是文件夹。");
    const folder=options.folder_path?await files_api.realpath(path_api.resolve(options.folder_path)):root;
    if(!inside(root,folder)||!(await files_api.stat(folder)).isDirectory())throw new Error("所选搜索文件夹已不在当前工作区内。");
    // 调用方可限制为已经打开的文件；不接受越界路径，也不把空列表解释成全目录。
    const selected_files = options.file_paths?.map(file => path_api.resolve(file)).filter(file => inside(root, file));
    const selected_paths = selected_files ? new Set(selected_files.map(file_key)) : undefined;
    const selected_directories = new Set<string>();
    for (const file of selected_files || []) { let directory = path_api.dirname(file); while (inside(root, directory)) { selected_directories.add(file_key(directory)); if (file_key(directory) === file_key(root)) break; directory = path_api.dirname(directory); } }
    const expression = query_expression(options); const max_results = bounded_integer(options.max_results, 5000, 100000);
    const max_file_bytes = bounded_integer(options.max_file_bytes, 8 * 1024 * 1024, 64 * 1024 * 1024);
    const case_sensitive = options.glob_case_sensitive ?? (modules.platform ? !["win32", "darwin"].includes(modules.platform) : path_api.sep !== "\\");
    const include = compile_workspace_globs(options.include || "", case_sensitive);
    const exclude = compile_workspace_globs(options.exclude || "", case_sensitive);
    const settings_exclude = compile_workspace_globs(options.exclude_settings ?? DEFAULT_EXCLUDES, case_sensitive, false);
    const result: workspace_search_result = {root, options: {...options}, files: [], counts: {scanned_files: 0, searched_files: 0, matched_files: 0, matches: 0, skipped: {binary: 0, large: 0, ignored: 0, excluded: 0, links: 0, unreadable: 0}}, cancelled: false, limit_reached: false, notices: []};
    const snapshots = new Map<string, file_snapshot>(); let snapshot_bytes = 0; let replace_blocked = false;
    // 普通查询也在隔离线程中建立行索引和匹配；无 Worker 的纯 Node 调用仍可执行普通搜索。
    const matcher = options.regex || modules.matcher_factory || typeof Worker !== "undefined" ? create_search_matcher(modules.matcher_factory) : undefined;
    const notice = (message: string) => { if (result.notices.length < 20 && !result.notices.includes(message)) result.notices.push(message); };
    const cancelled = () => { result.cancelled ||= callbacks.signal?.aborted === true; return result.cancelled; };
    const ignore_cache = new Map<string, Set<string> | null>();
    const read_ignored = async (directory: string): Promise<Set<string> | null> => {
      if (options.use_ignore === false) return null;
      if (ignore_cache.has(directory)) return ignore_cache.get(directory)!;
      let allowed: Set<string> | null = null;
      if (git_run) try {
        const source = await git_run(directory, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."]);
        allowed = new Set(source.split("\0").filter(Boolean));
        // 预先索引祖先目录，避免每个目录项重新遍历整个 Git 文件列表。
        for (const file of [...allowed]) { let end = file.lastIndexOf("/"); while (end > 0) { allowed.add(file.slice(0, end)); end = file.lastIndexOf("/", end - 1); } }
      } catch (error) { notice("Git 忽略规则未应用：" + String(error instanceof Error ? error.message : error)); }
      else notice("未提供 Git；未应用 .gitignore，仍使用文件排除设置。");
      ignore_cache.set(directory, allowed); return allowed;
    };
    try {
    matcher?.start();
    const allowed = await read_ignored(root);
    const stack: {directory: string; relative: string; ignore_root: string; allowed: Set<string> | null}[] = [{directory: root, relative: "", ignore_root: root, allowed}];
    async function* candidates(): AsyncGenerator<{file_path: string; relative: string} | null> {
    while (stack.length && !cancelled() && !result.limit_reached) {
      const current = stack.pop()!; let entries: any[];
      try {
        if (selected_paths && !selected_directories.has(file_key(current.directory))) continue;
        if(!inside(folder,current.directory)&&!inside(current.directory,folder))continue;
        if (await files_api.realpath(current.directory) !== current.directory) { result.counts.skipped.links++; continue; }
        entries = (await files_api.readdir(current.directory, {withFileTypes: true})).sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
      catch (error) { result.counts.skipped.unreadable++; notice(`无法读取目录 ${current.relative || "."}：${String(error)}`); continue; }
      const directories: typeof stack = [];
      for (const entry of entries) {
        if (cancelled() || result.limit_reached) break;
        const relative = current.relative ? current.relative + "/" + entry.name : entry.name;
        const file_path = path_api.join(current.directory, entry.name);
        if (entry.isSymbolicLink()) { result.counts.skipped.links++; continue; }
        if (exclude(relative) || options.use_ignore !== false && settings_exclude(relative)) { result.counts.skipped.excluded++; continue; }
        const ignore_relative = path_api.relative(current.ignore_root, file_path).split(path_api.sep).join("/");
        if (current.allowed && !current.allowed.has(ignore_relative) && !current.allowed.has(ignore_relative + "/")) { result.counts.skipped.ignored++; continue; }
        if (entry.isDirectory()) {
          const nested = current.allowed?.has(ignore_relative + "/") ? await read_ignored(file_path) : undefined;
          directories.push({directory: file_path, relative, ignore_root: nested === undefined ? current.ignore_root : file_path, allowed: nested === undefined ? current.allowed : nested}); continue;
        }
        if (!entry.isFile()) { result.counts.skipped.unreadable++; continue; }
        if(!inside(folder,file_path))continue;
        if (selected_paths && !selected_paths.has(file_key(file_path))) continue;
        result.counts.scanned_files++;
        if (options.include?.trim() && !include(relative)) { result.counts.skipped.excluded++; continue; }
        yield {file_path, relative};
        if (result.counts.scanned_files % 32 === 0) await pause();
      }
      stack.push(...directories.reverse());
      // 目录边界让已读取的文件先交付，不能为凑齐预读数量等待下一个慢目录。
      yield null;
    }
    }
    type read_candidate = {file_path: string; relative: string; stat?: any; bytes?: Uint8Array; decoded?: decoded_file; skipped?: keyof workspace_search_counts["skipped"]; message?: string};
    const read_candidate = async (candidate: {file_path: string; relative: string}): Promise<read_candidate> => {
      const {file_path, relative} = candidate;
      try {
        if (cancelled()) return candidate;
        const stat = await files_api.lstat(file_path);
        if (cancelled()) return candidate;
        if (!stat.isFile() || stat.isSymbolicLink() || await files_api.realpath(file_path) !== file_path) return {...candidate, skipped: "links"};
        if (stat.size > max_file_bytes) return {...candidate, skipped: "large"};
        if (cancelled()) return candidate;
        const bytes = new Uint8Array(await files_api.readFile(file_path, callbacks.signal ? {signal: callbacks.signal} : undefined));
        if (cancelled()) return candidate;
        if (bytes.length > max_file_bytes) return {...candidate, skipped: "large"};
        if (detect_binary_bytes(bytes)) return {...candidate, skipped: "binary"};
        let decoded: decoded_file;
        try { decoded = decode_file_bytes(bytes, options.encoding || "utf-8"); }
        catch { return {...candidate, skipped: "unreadable", message: `无法按指定编码解码：${relative}`}; }
        const after_stat = await files_api.lstat(file_path);
        if (identity(stat) !== identity(after_stat) || stat.mtimeMs !== after_stat.mtimeMs || stat.size !== after_stat.size) return {...candidate, skipped: "unreadable", message: `读取时文件发生改变，已跳过：${relative}`};
        return {...candidate, bytes, decoded, stat};
      } catch (error) { return {...candidate, skipped: "unreadable", message: `无法搜索 ${relative}：${String(error)}`}; }
    };
    // 只预读四个文件，保持确定的目录顺序；不把整个工程正文排进消息队列或内存。
    const iterator = candidates(); const pending: Promise<read_candidate>[] = []; let exhausted = false; let directory_boundary = false;
    const fill = async () => {
      if(directory_boundary&&pending.length)return;
      directory_boundary=false;
      while (!exhausted && pending.length < MAX_READ_CONCURRENCY && !cancelled() && !result.limit_reached) {
        const next = await iterator.next(); exhausted = next.done === true;
        if (!next.done) {if(next.value===null){directory_boundary=true;break;}pending.push(read_candidate(next.value));}
      }
    };
    await fill();
    while ((pending.length||!exhausted) && !cancelled() && !result.limit_reached) {
      if(!pending.length){await fill();if(!pending.length)continue;}
      const {file_path, relative, bytes, decoded, stat, skipped, message} = await pending.shift()!;
      if (cancelled()) break;
      if(!directory_boundary)await fill();
      if (skipped) { result.counts.skipped[skipped]++; if (message) notice(message); continue; }
      if (!bytes || !decoded || !stat) continue;
      try {
          result.counts.searched_files++; const matches: captured_match[] = [];
          if (matcher) {
            try {
              const reply = await matcher.match(decoded.text, options, max_results - result.counts.matches, callbacks.signal);
              for (const match of reply.matches) matches.push({...match, id: `match_${result.files.length}_${matches.length}`});
              result.counts.matches += matches.length; result.limit_reached = reply.limit_reached;
            } catch (error) {
              if (error instanceof search_match_failure && error.reason === "cancelled") result.cancelled = true;
              else { replace_blocked = true; result.counts.skipped.unreadable++; notice(`${relative}：${String(error instanceof Error ? error.message : error)} 本次搜索不完整，不能执行替换。`); }
              continue;
            }
          } else {
            let starts: number[] | undefined; expression.lastIndex = 0; let found: RegExpExecArray | null;
            while (!cancelled() && (found = expression.exec(decoded.text))) {
              if (!found[0].length) expression.lastIndex += decoded.text.codePointAt(expression.lastIndex)! > 0xffff ? 2 : 1;
              if (options.whole_word && !whole_word(decoded.text, found.index, found.index + found[0].length)) continue;
              starts ||= line_starts(decoded.text);
              matches.push({...capture_match(decoded.text, starts, found), id: `match_${result.files.length}_${matches.length}`});
              result.counts.matches++;
              if (result.counts.matches >= max_results) { result.limit_reached = true; break; }
              if (matches.length % 128 === 0) await pause();
            }
          }
          if (matches.length) {
            if (snapshot_bytes + bytes.length > MAX_SNAPSHOT_BYTES) { result.counts.matches -= matches.length; result.limit_reached = true; notice("匹配文件快照达到 64 MiB 上限，请缩小搜索范围。"); break; }
            snapshot_bytes += bytes.length; snapshots.set(file_path, {bytes, decoded, identity: identity(stat), mode: stat.mode, matches});
            const file = {file_path, relative_path: relative, matches: matches.map(({captures, groups, ...match}) => match)};
            result.files.push(file); result.counts.matched_files++; callbacks.on_file?.(file, structuredClone(result.counts));
          }
        } catch (error) { result.counts.skipped.unreadable++; notice(`无法搜索 ${relative}：${String(error instanceof Error ? error.message : error)}`); }
    }
    cancelled();
    if (result.limit_reached) notice(`搜索已达到结果或快照上限；当前显示 ${result.counts.matches} 处匹配。`);
    if (result.counts.skipped.large) notice(`已跳过 ${result.counts.skipped.large} 个大于 ${max_file_bytes} 字节的文件。`);
    if (result.counts.skipped.binary) notice(`已跳过 ${result.counts.skipped.binary} 个二进制文件。`);
    if (result.counts.skipped.links) notice(`已跳过 ${result.counts.skipped.links} 个链接，避免越出搜索范围或形成目录循环。`);
    if (result.cancelled) notice("搜索已取消；显示取消前找到的结果。");
    results.set(result, {root, options: {...options, file_paths: options.file_paths?.slice()}, files: snapshots, incomplete: result.cancelled || result.limit_reached || replace_blocked, replace_blocked}); return result;
    } finally { matcher?.dispose(); }
  }

  async function prepare_replace(result: workspace_search_result, replacement: string, selection: {file_path?: string; match_ids?: string[]} = {}): Promise<workspace_replace_plan> {
    const snapshot = results.get(result); if (!snapshot) throw new Error("搜索结果已失效，请重新搜索。");
    if (snapshot.replace_blocked) throw new Error("正则匹配超时或失败，本次搜索不完整，不能执行替换。请简化表达式或缩小范围后重新搜索。");
    if (snapshot.incomplete && !selection.match_ids?.length) throw new Error("搜索未完成或达到上限，不能执行整文件或全部替换。请缩小范围后重新搜索，或明确选择单条结果。");
    const selected_ids = selection.match_ids ? new Set(selection.match_ids) : undefined; const found_ids = new Set<string>(); const prepared: prepared_file[] = [];
    let prepared_bytes = 0;
    if (selected_ids && !selected_ids.size) throw new Error("请选择要替换的搜索结果。");
    for (const [file_path, file] of snapshot.files) {
      if (selection.file_path && selection.file_path !== file_path) continue;
      const matches = file.matches.filter(match => !selected_ids || selected_ids.has(match.id)); if (!matches.length) continue;
      matches.forEach(match => found_ids.add(match.id));
      const relative_path = path_api.relative(snapshot.root, file_path).split(path_api.sep).join("/");
      const newline = /\r\n|\r|\n/u.exec(file.decoded.text)?.[0] || "\n";
      let after_text = ""; let offset = 0;
      for (const match of matches) {
        let value = replacement_text(replacement, match, file.decoded.text, snapshot.options.regex === true);
        if (snapshot.options.preserve_case) value = preserve_case(match.text, value);
        after_text += file.decoded.text.slice(offset, match.start) + value.replace(/\r\n|\r|\n/gu, newline); offset = match.end;
        if (after_text.length > MAX_SNAPSHOT_BYTES) throw new Error("单文件替换结果过大，请缩小替换范围。");
      }
      after_text += file.decoded.text.slice(offset); const bytes = encode_file(after_text, file.decoded);
      if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error("单文件替换结果超过 64 MiB，请缩小替换范围。");
      prepared_bytes += bytes.length;
      if (prepared_bytes > MAX_SNAPSHOT_BYTES) throw new Error("本次替换结果合计超过 64 MiB，请缩小替换范围后分批预览。");
      const prepared_file = {file_path, relative_path, before_text: file.decoded.text, after_text, match_count: matches.length, snapshot: file, bytes};
      await verify_file(snapshot.root, prepared_file); prepared.push(prepared_file);
    }
    if (!prepared.length || selected_ids && found_ids.size !== selected_ids.size) throw new Error("所选搜索结果不存在或已经改变，请重新搜索。");
    const plan: workspace_replace_plan = {root: snapshot.root, replacement, files: prepared.map(({snapshot, bytes, ...file}) => file), match_count: prepared.reduce((count, file) => count + file.match_count, 0)};
    plans.set(plan, {root: snapshot.root, files: prepared}); return plan;
  }

  async function apply_replace(plan: workspace_replace_plan, options: {can_write?: (file_paths: string[]) => boolean | Promise<boolean>} = {}): Promise<{files: string[]; match_count: number}> {
    const prepared = plans.get(plan); if (!prepared) throw new Error("替换预览已失效或已经执行，请重新预览。");
    if (applying) throw new Error("另一次替换正在执行，请等待完成。"); applying = true;
    const staged: {file: prepared_file; temporary: string}[] = []; const applied_files: string[] = [];
    try {
      if (options.can_write && !await options.can_write(prepared.files.map(file => file.file_path))) throw new Error("相关文档有未保存修改，未执行替换。");
      // 先验证全部目标，再准备同目录临时文件；失败时不会先写入前面的目标。
      for (const file of prepared.files) await verify_file(prepared.root, file);
      for (const file of prepared.files) {
        const temporary = path_api.join(path_api.dirname(file.file_path), `.typora_search_${Date.now()}_${++serial}.tmp`);
        const handle = await files_api.open(temporary, "wx", file.snapshot.mode & 0o777); staged.push({file, temporary});
        try { await handle.writeFile(file.bytes); if (handle.chmod) await handle.chmod(file.snapshot.mode & 0o777); await handle.sync(); } finally { await handle.close(); }
      }
      for (const file of prepared.files) await verify_file(prepared.root, file);
      if (options.can_write && !await options.can_write(prepared.files.map(file => file.file_path))) throw new Error("准备替换期间文档发生编辑，未写入目标文件。");
      for (const {file, temporary} of staged) {
        await verify_file(prepared.root, file); await files_api.rename(temporary, file.file_path); applied_files.push(file.file_path);
      }
      plans.delete(plan); return {files: applied_files, match_count: prepared.files.reduce((count, file) => count + file.match_count, 0)};
    } catch (error) {
      if (applied_files.length) plans.delete(plan);
      throw Object.assign(new Error((applied_files.length ? `已替换 ${applied_files.length} 个文件，其余未完成：` : "") + String(error instanceof Error ? error.message : error)), {applied_files});
    } finally {
      applying = false;
      for (const {temporary} of staged) try { await files_api.unlink(temporary); } catch (error) { if ((error as {code?: string}).code !== "ENOENT") { /* 保留无法清理的临时文件，绝不删除或覆盖其他路径。 */ } }
    }
  }
  return {search, prepare_replace, apply_replace};
}
