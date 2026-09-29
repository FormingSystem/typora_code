import {workspace_text} from "./workspace_i18n";
import {compile_workspace_globs} from './workspace_glob';
import {read_workspace_directory} from './workspace_directory_service';
/// <reference path="./search_worker_types.d.ts" />
import { decode_file_bytes, detect_binary_bytes, type decoded_file } from "./file_language";
import {query_expression, line_starts, whole_word, capture_match, type search_captured_match} from "./workspace_search_matcher";
import {create_search_matcher, search_match_failure, type search_matcher_factory} from "./workspace_search_worker_client";
import {file_key} from "./workspace_file_uri";

export type workspace_search_options = {
  query: string; case_sensitive?: boolean; whole_word?: boolean; regex?: boolean; include?: string; exclude?: string;
  use_ignore?: boolean; exclude_settings?: string; encoding?: string; glob_case_sensitive?: boolean;
  preserve_case?: boolean; file_paths?: string[]; folder_path?: string; open_files?: string[];
};
export type workspace_search_match = {id: string; start: number; end: number; line: number; column: number; end_line: number; end_column: number; text: string; preview: string; preview_ranges: {start: number; end: number}[]};
export type workspace_search_file = {file_path: string; relative_path: string; matches: workspace_search_match[]};
export type workspace_search_counts = {scanned_files: number; searched_files: number; matched_files: number; matches: number; skipped: {binary: number; ignored: number; excluded: number; links: number; unreadable: number}};
export type workspace_search_result = {root: string; options: workspace_search_options; files: workspace_search_file[]; counts: workspace_search_counts; cancelled: boolean; notices: string[]};
export type workspace_replace_file = {file_path: string; relative_path: string; before_text: string; after_text: string; match_count: number};
export type workspace_replace_plan = {root: string; replacement: string; files: workspace_replace_file[]; match_count: number};
export type workspace_search_modules = {fs: any; path_api: any; git_run?: (root: string, args: string[]) => Promise<string>; platform?: string; read_open_text?: (file_path:string)=>Promise<string>; matcher_factory?: search_matcher_factory};
type captured_match = search_captured_match & {id: string};
type file_snapshot = {bytes: Uint8Array; decoded: decoded_file; identity: string; mode: number; editor_modified?: boolean; matches: captured_match[]};
type result_snapshot = {root: string; options: workspace_search_options; files: Map<string, file_snapshot>; incomplete: boolean; replace_blocked: boolean};
type prepared_file = workspace_replace_file & {snapshot: file_snapshot; bytes: Uint8Array};
const DEFAULT_EXCLUDES = "**/.git, **/.svn, **/.hg, **/CVS, **/.DS_Store, **/Thumbs.db, **/node_modules, **/bower_components, **/*.code-search";
const MAX_READ_CONCURRENCY = 4;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const same_bytes = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index]);
const identity = (stat: any) => `${String(stat.dev)}:${String(stat.ino)}`;

/** Regular expression replacement supports capture groups, newlines, and VS Code case sensitivity; regular text replacement keeps the literal value. */
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
  if (!["utf-16le", "utf-16be"].includes(decoded.encoding)) throw new Error(workspace_text("search_engine_the_current_file_uses_only_search_is_allowed_and_it_cannot_g", {value_0: String(decoded.encoding)}));
  const little = decoded.encoding === "utf-16le"; const offset = decoded.bom ? 2 : 0;
  const output = new Uint8Array(text.length * 2 + offset); const view = new DataView(output.buffer);
  if (decoded.bom) output.set(little ? [0xff, 0xfe] : [0xfe, 0xff]);
  for (let index = 0; index < text.length; index++) view.setUint16(offset + index * 2, text.charCodeAt(index), little);
  return output;
}

/** Case preservation processes the original matched text, and allows foo-bar to preserve each segment separately with foo_bar. */
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

/** File system, paths, and Git are all injected by the host; search and preview never write to disk, only apply_replace can write. */
export function create_workspace_search_engine(modules: workspace_search_modules) {
  const {fs, path_api, git_run} = modules; const files_api = fs.promises;
  const results = new WeakMap<workspace_search_result, result_snapshot>();
  const plans = new WeakMap<workspace_replace_plan, {root: string; files: prepared_file[]}>();
  let serial = 0; let applying = false;
  const inside = (root: string, target: string) => { const relative = path_api.relative(root, target); return relative !== ".." && !relative.startsWith(".." + path_api.sep) && !path_api.isAbsolute(relative); };
  const assert_file = async (root: string, target: string) => {
    if (!inside(root, target)) throw new Error(workspace_text("search_engine_the_file_is_located_outside_the_search_directory"));
    const stat = await files_api.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new Error(workspace_text("search_engine_replacement_supports_only_regular_files_with_unsigned_or_har"));
    const real = await files_api.realpath(target);
    if (real !== target || !inside(root, real)) throw new Error(workspace_text("search_engine_the_file_or_parent_directory_has_become_a_symbolic_link_plea"));
    return stat;
  };
  const verify_file = async (root: string, file: prepared_file) => {
    const stat = await assert_file(root, file.file_path);
    if (identity(stat) !== file.snapshot.identity || !same_bytes(new Uint8Array(await files_api.readFile(file.file_path)), file.snapshot.bytes)) throw new Error(workspace_text("search_engine_the_file_has_been_modified_or_replaced_please_rescan_and_pre", {value_0: String(file.relative_path)}));
  };

  async function search(input_root: string, options: workspace_search_options, callbacks: {signal?: AbortSignal; on_file?: (file: workspace_search_file, counts: workspace_search_counts) => void} = {}): Promise<workspace_search_result> {
    const root = await files_api.realpath(path_api.resolve(input_root));
    if (!(await files_api.stat(root)).isDirectory()) throw new Error(workspace_text("search_engine_the_search_scope_must_be_a_folder"));
    const folder=options.folder_path?await files_api.realpath(path_api.resolve(options.folder_path)):root;
    if(!inside(root,folder)||!(await files_api.stat(folder)).isDirectory())throw new Error(workspace_text("search_engine_the_selected_search_folder_is_not_in_the_current_workspace"));
    // The caller is limited to already opened files; does not accept out-of-bounds paths, and does not interpret an empty list as the entire directory.
    const selected_files = options.file_paths?.map(file => path_api.resolve(file)).filter(file => inside(root, file));
    const selected_paths = selected_files ? new Set(selected_files.map(file_key)) : undefined;
    const selected_directories = new Set<string>();
    for (const file of selected_files || []) { let directory = path_api.dirname(file); while (inside(root, directory)) { selected_directories.add(file_key(directory)); if (file_key(directory) === file_key(root)) break; directory = path_api.dirname(directory); } }
    const open_paths = new Map((options.open_files || []).map(file=>[file_key(path_api.resolve(file)),path_api.resolve(file)]));
    const expression = query_expression(options);
    const case_sensitive = options.glob_case_sensitive ?? (modules.platform ? !["win32", "darwin"].includes(modules.platform) : path_api.sep !== "\\");
    const include = compile_workspace_globs(options.include || "", case_sensitive);
    const exclude = compile_workspace_globs(options.exclude || "", case_sensitive);
    const settings_exclude = compile_workspace_globs(options.exclude_settings ?? DEFAULT_EXCLUDES, case_sensitive, false);
    const result: workspace_search_result = {root, options: {...options}, files: [], counts: {scanned_files: 0, searched_files: 0, matched_files: 0, matches: 0, skipped: {binary: 0, ignored: 0, excluded: 0, links: 0, unreadable: 0}}, cancelled: false, notices: []};
    const snapshots = new Map<string, file_snapshot>(); let replace_blocked = false;
    // Regular queries also build row indexes and matches in an isolated thread; pure Node calls without Worker can still perform regular searches.
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
        // Pre-index ancestors directories to avoid re-traversing the entire Git file list for each directory item.
        for (const file of [...allowed]) { let end = file.lastIndexOf("/"); while (end > 0) { allowed.add(file.slice(0, end)); end = file.lastIndexOf("/", end - 1); } }
      } catch (error) { notice(workspace_text("search_engine_git_ignored_rules_not_applied") + String(error instanceof Error ? error.message : error)); }
      else notice(workspace_text("search_engine_no_git_provided_gitignore_not_applied_still_using_file_exclu"));
      ignore_cache.set(directory, allowed); return allowed;
    };
    try {
    matcher?.start();
    const visited_open_paths = new Set<string>();
    const allowed = await read_ignored(root);
    const stack: {directory: string; relative: string; ignore_root: string; allowed: Set<string> | null}[] = [{directory: root, relative: "", ignore_root: root, allowed}];
    async function* candidates(): AsyncGenerator<{file_path: string; relative: string} | null> {
    // Open models come before disk: even with zero matches, they cannot be overwritten by disk old content.
    for(const [key,file_path] of open_paths){
      if(cancelled())break;
      if(!inside(root,file_path)||!inside(folder,file_path)||selected_paths&&!selected_paths.has(key))continue;
      const relative=path_api.relative(root,file_path).split(path_api.sep).join('/');
      visited_open_paths.add(key);
      if(exclude(relative)||options.use_ignore!==false&&settings_exclude(relative)||options.include?.trim()&&!include(relative)){result.counts.skipped.excluded++;continue;}
      result.counts.scanned_files++;yield {file_path,relative};yield null;
    }
    while (stack.length && !cancelled()) {
      const current = stack.pop()!; let entries: any[];
      try {
        if (selected_paths && !selected_directories.has(file_key(current.directory))) continue;
        if(!inside(folder,current.directory)&&!inside(current.directory,folder))continue;
        if (await files_api.realpath(current.directory) !== current.directory) { result.counts.skipped.links++; continue; }
        entries = (await read_workspace_directory(fs,path_api,root,current.directory)).sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
      catch (error) { replace_blocked = true; result.counts.skipped.unreadable++; notice(workspace_text("search_engine_cannot_read_directory", {value_0: String(current.relative || "."), value_1: String(String(error))})); continue; }
      const directories: typeof stack = [];
      for (const entry of entries) {
        if (cancelled()) break;
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
        if(visited_open_paths.has(file_key(file_path)))continue;
        if (!entry.isFile()) { result.counts.skipped.unreadable++; continue; }
        if(!inside(folder,file_path))continue;
        if (selected_paths && !selected_paths.has(file_key(file_path))) continue;
        result.counts.scanned_files++;
        if (options.include?.trim() && !include(relative)) { result.counts.skipped.excluded++; continue; }
        yield {file_path, relative};
        if (result.counts.scanned_files % 32 === 0) await pause();
      }
      stack.push(...directories.reverse());
      // Directory boundaries let already read files deliver first; cannot wait for the next slow directory to complete the pre-read count.
      yield null;
    }
    }
    type read_candidate = {file_path: string; relative: string; stat?: any; bytes?: Uint8Array; decoded?: decoded_file; editor_modified?: boolean; skipped?: keyof workspace_search_counts["skipped"]; message?: string};
    const read_candidate = async (candidate: {file_path: string; relative: string}): Promise<read_candidate> => {
      const {file_path, relative} = candidate;
      try {
        if (cancelled()) return candidate;
        const stat = await files_api.lstat(file_path);
        if (cancelled()) return candidate;
        if (!stat.isFile() || stat.isSymbolicLink() || await files_api.realpath(file_path) !== file_path) return {...candidate, skipped: "links"};
        if (cancelled()) return candidate;
        const bytes = new Uint8Array(await files_api.readFile(file_path, callbacks.signal ? {signal: callbacks.signal} : undefined));
        if (cancelled()) return candidate;
        if (detect_binary_bytes(bytes)) return {...candidate, skipped: "binary"};
        let decoded: decoded_file;
        try { decoded = decode_file_bytes(bytes, options.encoding || "utf-8"); }
        catch { return {...candidate, skipped: "unreadable", message: workspace_text("search_engine_cannot_decode_with_the_specified_encoding", {value_0: String(relative)})}; }
        const after_stat = await files_api.lstat(file_path);
        if (identity(stat) !== identity(after_stat) || stat.mtimeMs !== after_stat.mtimeMs || stat.size !== after_stat.size) return {...candidate, skipped: "unreadable", message: workspace_text("search_engine_the_file_changed_while_reading_skipped", {value_0: String(relative)})};
        let editor_modified=false;
        if(open_paths.has(file_key(file_path))&&modules.read_open_text){
          const text=await modules.read_open_text(file_path);if(cancelled())return candidate;
          editor_modified=text!==decoded.text;decoded={...decoded,text};
        }
        return {...candidate, bytes, decoded, stat, editor_modified};
      } catch (error) { return {...candidate, skipped: "unreadable", message: workspace_text("search_engine_cannot_search", {value_0: String(relative), value_1: String(String(error))})}; }
    };
    // Only pre-read four files, maintain a definite directory order; do not put the entire project document content into the message queue or memory.
    const iterator = candidates(); const pending: Promise<read_candidate>[] = []; let exhausted = false; let directory_boundary = false;
    const fill = async () => {
      if(directory_boundary&&pending.length)return;
      directory_boundary=false;
      while (!exhausted && pending.length < MAX_READ_CONCURRENCY && !cancelled()) {
        const next = await iterator.next(); exhausted = next.done === true;
        if (!next.done) {if(next.value===null){directory_boundary=true;break;}pending.push(read_candidate(next.value));}
      }
    };
    await fill();
    while ((pending.length||!exhausted) && !cancelled()) {
      if(!pending.length){await fill();if(!pending.length)continue;}
      const {file_path, relative, bytes, decoded, stat, editor_modified, skipped, message} = await pending.shift()!;
      if (cancelled()) break;
      if(!directory_boundary)await fill();
      if (skipped) { if(skipped === "unreadable")replace_blocked = true; result.counts.skipped[skipped]++; if (message) notice(message); continue; }
      if (!bytes || !decoded || !stat) continue;
      try {
          result.counts.searched_files++; const matches: captured_match[] = [];
          if (matcher) {
            try {
              const reply = await matcher.match(decoded.text, options, callbacks.signal);
              for (const match of reply.matches) matches.push({...match, id: `match_${result.files.length}_${matches.length}`});
              result.counts.matches += matches.length;
            } catch (error) {
              if (error instanceof search_match_failure && error.reason === "cancelled") result.cancelled = true;
              else { replace_blocked = true; result.counts.skipped.unreadable++; notice(workspace_text("search_engine_this_search_is_incomplete_cannot_perform_replacement", {value_0: String(relative), value_1: String(String(error instanceof Error ? error.message : error))})); }
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
              if (matches.length % 128 === 0) await pause();
            }
          }
          if (matches.length) {
            snapshots.set(file_path, {bytes, decoded, identity: identity(stat), mode: stat.mode, editor_modified, matches});
            const file = {file_path, relative_path: relative, matches: matches.map(({captures, groups, ...match}) => match)};
            result.files.push(file); result.counts.matched_files++; callbacks.on_file?.(file, structuredClone(result.counts));
          }
        } catch (error) { replace_blocked = true; result.counts.skipped.unreadable++; notice(workspace_text("search_engine_cannot_search", {value_0: String(relative), value_1: String(String(error instanceof Error ? error.message : error))})); }
    }
    cancelled();
    if (result.counts.skipped.binary) notice(workspace_text("search_engine_skipped_binary_files", {value_0: String(result.counts.skipped.binary)}));
    if (result.counts.skipped.links) notice(workspace_text("search_engine_skipped_links_to_avoid_going_out_of_search_scope_or_forming", {value_0: String(result.counts.skipped.links)}));
    if (result.cancelled) notice(workspace_text("search_engine_search_canceled_display_results_found_before_cancellation"));
    results.set(result, {root, options: {...options, file_paths: options.file_paths?.slice()}, files: snapshots, incomplete: result.cancelled || replace_blocked, replace_blocked}); return result;
    } finally { matcher?.dispose(); }
  }

  async function prepare_replace(result: workspace_search_result, replacement: string, selection: {file_path?: string; match_ids?: string[]} = {}): Promise<workspace_replace_plan> {
    const snapshot = results.get(result); if (!snapshot) throw new Error(workspace_text("search_engine_search_results_are_stale_please_rescan"));
    if (snapshot.replace_blocked) throw new Error(workspace_text("search_engine_match_failed_this_search_is_incomplete_cannot_perform_replac"));
    if (snapshot.incomplete && !selection.match_ids?.length) throw new Error(workspace_text("search_engine_search_not_completed_cannot_perform_full_file_or_all_replace"));
    const selected_ids = selection.match_ids ? new Set(selection.match_ids) : undefined; const found_ids = new Set<string>(); const prepared: prepared_file[] = [];
    if (selected_ids && !selected_ids.size) throw new Error(workspace_text("search_engine_please_select_the_search_result_to_replace"));
    for (const [file_path, file] of snapshot.files) {
      if (selection.file_path && selection.file_path !== file_path) continue;
      const matches = file.matches.filter(match => !selected_ids || selected_ids.has(match.id)); if (!matches.length) continue;
      if(file.editor_modified)throw new Error(workspace_text("search_engine_the_search_used_the_editor_s_current_content_please_save_the"));
      matches.forEach(match => found_ids.add(match.id));
      const relative_path = path_api.relative(snapshot.root, file_path).split(path_api.sep).join("/");
      const newline = /\r\n|\r|\n/u.exec(file.decoded.text)?.[0] || "\n";
      let after_text = ""; let offset = 0;
      for (const match of matches) {
        let value = replacement_text(replacement, match, file.decoded.text, snapshot.options.regex === true);
        if (snapshot.options.preserve_case) value = preserve_case(match.text, value);
        after_text += file.decoded.text.slice(offset, match.start) + value.replace(/\r\n|\r|\n/gu, newline); offset = match.end;
      }
      after_text += file.decoded.text.slice(offset); const bytes = encode_file(after_text, file.decoded);
      const prepared_file = {file_path, relative_path, before_text: file.decoded.text, after_text, match_count: matches.length, snapshot: file, bytes};
      await verify_file(snapshot.root, prepared_file); prepared.push(prepared_file);
    }
    if (!prepared.length || selected_ids && found_ids.size !== selected_ids.size) throw new Error(workspace_text("search_engine_the_selected_search_result_does_not_exist_or_has_changed_ple"));
    const plan: workspace_replace_plan = {root: snapshot.root, replacement, files: prepared.map(({snapshot, bytes, ...file}) => file), match_count: prepared.reduce((count, file) => count + file.match_count, 0)};
    plans.set(plan, {root: snapshot.root, files: prepared}); return plan;
  }

  async function apply_replace(plan: workspace_replace_plan, options: {can_write?: (file_paths: string[]) => boolean | Promise<boolean>} = {}): Promise<{files: string[]; match_count: number}> {
    const prepared = plans.get(plan); if (!prepared) throw new Error(workspace_text("search_engine_the_replacement_preview_is_invalid_or_has_been_executed_plea"));
    if (applying) throw new Error(workspace_text("search_engine_another_replacement_is_in_progress_please_wait_for_it_to_com")); applying = true;
    const staged: {file: prepared_file; temporary: string}[] = []; const applied_files: string[] = [];
    try {
      if (options.can_write && !await options.can_write(prepared.files.map(file => file.file_path))) throw new Error(workspace_text("search_engine_related_documents_have_unsaved_modifications_no_replacement"));
      // Validate all targets first, then prepare temporary files in the same directory; failure does not write to previous targets first.
      for (const file of prepared.files) await verify_file(prepared.root, file);
      for (const file of prepared.files) {
        const temporary = path_api.join(path_api.dirname(file.file_path), `.typora_search_${Date.now()}_${++serial}.tmp`);
        const handle = await files_api.open(temporary, "wx", file.snapshot.mode & 0o777); staged.push({file, temporary});
        try { await handle.writeFile(file.bytes); if (handle.chmod) await handle.chmod(file.snapshot.mode & 0o777); await handle.sync(); } finally { await handle.close(); }
      }
      for (const file of prepared.files) await verify_file(prepared.root, file);
      if (options.can_write && !await options.can_write(prepared.files.map(file => file.file_path))) throw new Error(workspace_text("search_engine_document_editing_occurred_during_preparation_for_replacement"));
      for (const {file, temporary} of staged) {
        await verify_file(prepared.root, file); await files_api.rename(temporary, file.file_path); applied_files.push(file.file_path);
      }
      plans.delete(plan); return {files: applied_files, match_count: prepared.files.reduce((count, file) => count + file.match_count, 0)};
    } catch (error) {
      if (applied_files.length) plans.delete(plan);
      throw Object.assign(new Error((applied_files.length ? workspace_text("search_engine_replaced_files_remaining_incomplete", {value_0: String(applied_files.length)}) : "") + String(error instanceof Error ? error.message : error)), {applied_files});
    } finally {
      applying = false;
      for (const {temporary} of staged) try { await files_api.unlink(temporary); } catch (error) { if ((error as {code?: string}).code !== "ENOENT") { /* Keep temporary files that cannot be cleaned up, never delete or overwrite other paths. */ } }
    }
  }
  return {search, prepare_replace, apply_replace};
}
