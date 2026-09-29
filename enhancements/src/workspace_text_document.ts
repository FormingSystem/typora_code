import {workspace_text} from "./workspace_i18n";
import { decode_file_bytes, detect_binary_bytes, type decoded_file } from "./file_language";
import {publish_workspace_file_saved} from "./workspace_file_events";

export type text_document_eol = "LF" | "CRLF" | "CR" | "mixed";
export type text_document_encoding = "utf-8" | "utf-16le" | "utf-16be";
export type text_document_value = decoded_file & { eol: text_document_eol };
export type text_document_save_options = { encoding?: string; bom?: boolean; eol?: text_document_eol; original_text?:string };
export type text_document = { readonly file_path: string; load(): Promise<text_document_value>; save(text: string, options?: text_document_save_options): Promise<text_document_value>; prepare_relocation(path: string): Promise<{commit(): Promise<void>; cancel(): void}> };
type file_modules = { fs: any; path_api: {resolve(...paths: string[]): string; dirname(path: string): string; basename(path: string): string; join(...paths: string[]): string} };
type disk_snapshot = { real_path: string; parent_identity: string; entry_identity: string; stat: any; bytes: Uint8Array };
type loaded_snapshot = disk_snapshot & { value: text_document_value; endings: string[] };
const identity = (stat: any) => `${String(stat.dev)}:${String(stat.ino)}`;
const same_stat = (left: any, right: any) => identity(left) === identity(right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
const same_bytes = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index]);
const endings_in = (text: string) => text.match(/\r\n|\r|\n/gu) || [];
const eol_name = (ending: string): text_document_eol => ending === "\r\n" ? "CRLF" : ending === "\r" ? "CR" : "LF";
const detect_eol = (endings: string[]): text_document_eol => new Set(endings).size > 1 ? "mixed" : eol_name(endings[0] || "\n");
const conflict = () => new Error(workspace_text("text_document_the_file_has_been_modified_replaced_or_moved_by_another_proc"));

/** Do not hide invalid surrogate code units with replacement characters; lossless writing is currently supported for only three Unicode encodings. */
function encode_text(text: string, encoding: string, bom: boolean): Uint8Array {
  if (!["utf-8", "utf-16le", "utf-16be"].includes(encoding)) throw new Error(workspace_text("text_document_saving_with_encoding_is_not_supported_select_utf_8_utf_16_le", {value_0: String(encoding)}));
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) { const next = text.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(workspace_text("text_document_the_text_contains_incomplete_unicode_characters_and_cannot_b")); }
    else if (code >= 0xdc00 && code <= 0xdfff) throw new Error(workspace_text("text_document_the_text_contains_incomplete_unicode_characters_and_cannot_b"));
  }
  if (encoding === "utf-8") {
    const body = new TextEncoder().encode(text);
    if (!bom) return body;
    const output = new Uint8Array(body.length + 3); output.set([0xef, 0xbb, 0xbf]); output.set(body, 3); return output;
  }
  const offset = bom ? 2 : 0;
  const output = new Uint8Array(text.length * 2 + offset); const little = encoding === "utf-16le"; const view = new DataView(output.buffer);
  if (bom) output.set(little ? [0xff, 0xfe] : [0xfe, 0xff]);
  for (let index = 0; index < text.length; index++) view.setUint16(offset + index * 2, text.charCodeAt(index), little);
  return output;
}

function format_eol(text: string, eol: text_document_eol, original: string[]): string {
  if (!["LF", "CRLF", "CR", "mixed"].includes(eol)) throw new Error(workspace_text("text_document_the_line_format_is_invalid_please_select_lf_crlf_or_cr"));
  if (eol !== "mixed") return text.replace(/\r\n|\r|\n/gu, {LF: "\n", CRLF: "\r\n", CR: "\r"}[eol]);
  const counts = new Map<string, number>(); for (const ending of original) counts.set(ending, (counts.get(ending) || 0) + 1);
  const dominant = [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] || "\n";
  let index = 0;
  // Monaco normalizes in-memory line endings. Preserve the original separator sequence; use the original document's most common line ending for inserted lines.
  return text.replace(/\r\n|\r|\n/gu, () => original[index++] || dominant);
}

/** After reading the snapshot, verify bytes, file identity, and the real path before saving to an exclusively created temporary file in the same directory and renaming it. This provides conflict detection and atomic replacement; a race still exists between Node's checks and rename, so this is not a cross-process atomic CAS. The snapshot binds only the string passed to save; the service neither reads nor overwrites edits made while saving. */
export function create_text_document(modules: file_modules, file_path: string, options: { encoding?: string } = {}): text_document {
  const {path_api} = modules; const fs = modules.fs.promises;
  file_path = path_api.resolve(file_path);
  let baseline: loaded_snapshot | undefined; let busy = false;
  const read_disk = async (requested_path = file_path): Promise<disk_snapshot> => {
    const entry_before = await fs.lstat(requested_path);
    if (!entry_before.isFile() && !entry_before.isSymbolicLink()) throw new Error(workspace_text("text_document_this_project_is_not_a_regular_text_file_please_expand_the_fo"));
    const real_path = await fs.realpath(requested_path); const parent_identity = identity(await fs.stat(path_api.dirname(real_path)));
    const handle = await fs.open(real_path, "r");
    try {
      const before = await handle.stat();
      if (!before.isFile()) throw new Error(workspace_text("text_document_this_project_is_not_a_regular_text_file"));
      // Allocate a buffer for the current stat size and read one extra byte to detect concurrent growth, avoiding an unbounded readFile.
      const buffer = new Uint8Array(before.size + 1); let length = 0;
      while (length < buffer.length) { const chunk = await handle.read(buffer, length, buffer.length - length, length); if (!chunk.bytesRead) break; length += chunk.bytesRead; }
      const after = await handle.stat();
      const current = await fs.stat(real_path); const entry_after = await fs.lstat(requested_path);
      if (!same_stat(before, after) || !same_stat(after, current) || length !== after.size || identity(entry_before) !== identity(entry_after) || await fs.realpath(requested_path) !== real_path || identity(await fs.stat(path_api.dirname(real_path))) !== parent_identity) throw conflict();
      return {real_path, parent_identity, entry_identity: identity(entry_after), stat: after, bytes: buffer.slice(0, length)};
    } finally { await handle.close(); }
  };
  const decode = (disk: disk_snapshot, encoding: string): loaded_snapshot => {
    const raw_binary = detect_binary_bytes(disk.bytes); const explicit_utf16 = ["utf-16le", "utf-16be"].includes(encoding);
    if (raw_binary && !explicit_utf16) throw new Error(workspace_text("text_document_this_is_a_binary_file_cannot_be_edited_as_text_please_use_sy"));
    let decoded: decoded_file;
    try { decoded = decode_file_bytes(disk.bytes, encoding); } catch { throw new Error(workspace_text("text_document_the_file_is_not_a_valid_text_please_select_the_correct_encod", {value_0: String(encoding)})); }
    // When BOM-less UTF-16 is explicitly selected, NUL bytes are part of the encoding; inspect the decoded text instead.
    const binary = !decoded.bom && ["utf-16le", "utf-16be"].includes(decoded.encoding) ? detect_binary_bytes(new TextEncoder().encode(decoded.text)) : detect_binary_bytes(disk.bytes);
    if (binary) throw new Error(workspace_text("text_document_this_is_a_binary_file_cannot_be_edited_as_text_please_use_sy"));
    const endings = endings_in(decoded.text); return {...disk, value: {...decoded, eol: detect_eol(endings)}, endings};
  };
  const verify = async (snapshot: loaded_snapshot) => {
    let current: disk_snapshot; try { current = await read_disk(); } catch { throw conflict(); }
    if (current.real_path !== snapshot.real_path || current.parent_identity !== snapshot.parent_identity || current.entry_identity !== snapshot.entry_identity || !same_stat(current.stat, snapshot.stat) || !same_bytes(current.bytes, snapshot.bytes)) throw conflict();
    return current;
  };
  const load = async () => {
    if (busy) throw new Error(workspace_text("text_document_the_file_is_being_read_or_saved_please_wait_for_the_current")); busy = true;
    try { const loaded = decode(await read_disk(), baseline?.value.encoding || options.encoding || "utf-8"); baseline = loaded; return {...loaded.value}; }
    finally { busy = false; }
  };
  const save = async (text: string, settings: text_document_save_options = {}): Promise<text_document_value> => {
    if (busy) throw new Error(workspace_text("text_document_the_file_is_being_read_or_saved_please_wait_for_the_current"));
    if (!baseline) throw new Error(workspace_text("text_document_please_read_the_file_first_then_save_the_edited_content"));
    busy = true; const snapshot = baseline; const selected = {...settings}; let temporary = "", temporary_identity = "";
    try {
      const encoding = selected.encoding ?? snapshot.value.encoding; const bom = selected.bom ?? snapshot.value.bom;
      // Save As preserves the source document's mixed line endings instead of using the destination's previous separator sequence.
      const formatted = format_eol(text, selected.eol ?? snapshot.value.eol, selected.original_text===undefined?snapshot.endings:endings_in(selected.original_text));
      const bytes = encode_text(formatted, encoding, bom);
      const endings = endings_in(formatted); const value = {text: formatted, encoding, bom, eol: endings.length ? detect_eol(endings) : selected.eol ?? snapshot.value.eol};
      await verify(snapshot);
      if (!(snapshot.stat.mode & 0o222)) throw new Error(workspace_text("text_document_the_file_is_read_only_the_current_editing_content_is_still_r"));
      if (same_bytes(bytes, snapshot.bytes)) { baseline = {...snapshot, value, endings}; publish_workspace_file_saved({file_path,bytes}); return {...value}; }
      temporary = path_api.join(path_api.dirname(snapshot.real_path), `.linux-note-text-${globalThis.crypto.randomUUID()}.tmp`);
      const handle = await fs.open(temporary, "wx", snapshot.stat.mode & 0o777);
      try {
        temporary_identity = identity(await handle.stat());
        await handle.writeFile(bytes); if (handle.chmod) await handle.chmod(snapshot.stat.mode & 0o777); await handle.sync();
      } finally { await handle.close(); }
      await verify(snapshot);
      const staged = await read_disk(temporary);
      if (staged.real_path !== temporary || identity(staged.stat) !== temporary_identity || !same_bytes(staged.bytes, bytes)) throw new Error(workspace_text("text_document_the_temporary_file_has_changed_the_save_has_been_stopped_the"));
      await fs.rename(temporary, snapshot.real_path); temporary = "";
      const committed = await read_disk();
      if (identity(committed.stat) !== temporary_identity || committed.real_path !== snapshot.real_path || !same_bytes(committed.bytes, bytes)) throw new Error(workspace_text("text_document_the_file_was_modified_by_other_processes_after_being_saved_p"));
      baseline = {...committed, value, endings}; publish_workspace_file_saved({file_path,bytes}); return {...value};
    } catch (error) {
      const problem = error as { code?: string; message?: string };
      if (["EACCES", "EPERM", "EROFS"].includes(problem.code || "")) throw new Error(workspace_text("text_document_no_write_permission_or_the_file_is_being_occupied_by_other_p"));
      if (problem.code === "ENOSPC") throw new Error(workspace_text("text_document_insufficient_disk_space_the_save_is_incomplete_the_current_e"));
      throw error;
    } finally {
      // Do not delete a same-named item replaced by another process; clean only the temporary file created by this operation.
      if (temporary && temporary_identity) { try { const stat = await fs.lstat(temporary); if (identity(stat) === temporary_identity && stat.isFile() && !stat.isSymbolicLink()) await fs.unlink(temporary); } catch { /* rename No need to clean up after success or external removal. */ } }
      busy = false;
    }
  };
  const prepare_relocation = async (target: string) => {
    if (busy) throw new Error(workspace_text("text_document_the_file_is_being_read_or_saved_please_wait_before_renaming"));
    busy = true; let finished = false;
    try { if (baseline) await verify(baseline); } catch (error) { busy = false; throw error; }
    const previous = baseline;
    return {
      async commit() {
        if (finished) return; finished = true;
        // Point subsequent saves to the new path even if an external program writes after the rename; do not treat the old snapshot as current disk content.
        file_path = path_api.resolve(target);
        try {
          if (previous) {
            const current = await read_disk();
            if (identity(current.stat) !== identity(previous.stat) || !same_bytes(current.bytes, previous.bytes)) throw conflict();
            baseline = {...previous, ...current};
          }
        } finally { busy = false; }
      },
      cancel() { if (!finished) { finished = true; busy = false; } }
    };
  };
  return {get file_path() {return file_path;}, load, save, prepare_relocation};
}

/** Write after native Save As confirmation; keep the source unchanged and publish the new directory entry only after the new file is fully written. */
export async function save_text_document_as(modules:file_modules,target:string,text:string,source:text_document_value){
  const {path_api}=modules,fs=modules.fs.promises;
  target=path_api.resolve(target);
  const document=create_text_document(modules,target,{encoding:source.encoding});
  let exists=false;
  try{await fs.lstat(target);exists=true;}catch(error){if((error as {code?:string}).code!=="ENOENT")throw error;}
  if(exists){
    await document.load();
    const value=await document.save(text,{encoding:source.encoding,bom:source.bom,eol:source.eol,original_text:source.text});
    return{document,value};
  }
  const formatted=format_eol(text,source.eol,endings_in(source.text)),bytes=encode_text(formatted,source.encoding,source.bom);
  const parent=await fs.realpath(path_api.dirname(target)),parent_identity=identity(await fs.stat(parent));
  const temporary=path_api.join(parent,`.linux-note-text-${globalThis.crypto.randomUUID()}.tmp`);let temporary_identity="";
  const handle=await fs.open(temporary,"wx");
  try{
    try{temporary_identity=identity(await handle.stat());await handle.writeFile(bytes);await handle.sync();}
    finally{await handle.close();}
    if(await fs.realpath(path_api.dirname(target))!==parent||identity(await fs.stat(parent))!==parent_identity)throw conflict();
    // link does not overwrite a destination created concurrently; the source and other existing items remain untouched.
    await fs.link(temporary,target);
    // Removing the temporary hard link changes the target's ctime; establish the next save baseline only afterward.
    await fs.unlink(temporary);
    const value=await document.load();
    if(value.text!==formatted||identity(await fs.stat(target))!==temporary_identity)throw conflict();
    publish_workspace_file_saved({file_path:target,bytes});
    return{document,value};
  }finally{
    try{const stat=await fs.lstat(temporary);if(identity(stat)===temporary_identity&&stat.isFile()&&!stat.isSymbolicLink())await fs.unlink(temporary);}catch{}
  }
}
