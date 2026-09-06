import { decode_file_bytes, detect_binary_bytes, type decoded_file } from "./file_language";

export const MAX_TEXT_DOCUMENT_BYTES = 16 * 1024 * 1024;
export type text_document_eol = "LF" | "CRLF" | "CR" | "mixed";
export type text_document_encoding = "utf-8" | "utf-16le" | "utf-16be";
export type text_document_value = decoded_file & { eol: text_document_eol };
export type text_document_save_options = { encoding?: string; bom?: boolean; eol?: text_document_eol };
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
const conflict = () => new Error("文件已被其他进程修改、替换或移动，请先比较磁盘内容，再重新加载后保存；当前编辑内容仍保留。");

/** 不会用替换字符掩盖无效代理项；当前只承诺三种 Unicode 编码的无损写回。 */
function encode_text(text: string, encoding: string, bom: boolean): Uint8Array {
  if (!["utf-8", "utf-16le", "utf-16be"].includes(encoding)) throw new Error(`暂不支持以 ${encoding} 编码保存，请明确选择 UTF-8、UTF-16 LE 或 UTF-16 BE。`);
  if (text.length > MAX_TEXT_DOCUMENT_BYTES) throw new Error("保存结果超过 16 MiB，请缩小文件后再保存。");
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) { const next = text.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("文本含有不完整的 Unicode 字符，无法无损保存。"); }
    else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("文本含有不完整的 Unicode 字符，无法无损保存。");
  }
  if (encoding === "utf-8") {
    const body = new TextEncoder().encode(text);
    if (body.length + (bom ? 3 : 0) > MAX_TEXT_DOCUMENT_BYTES) throw new Error("保存结果超过 16 MiB，请缩小文件后再保存。");
    if (!bom) return body;
    const output = new Uint8Array(body.length + 3); output.set([0xef, 0xbb, 0xbf]); output.set(body, 3); return output;
  }
  const offset = bom ? 2 : 0;
  if (text.length * 2 + offset > MAX_TEXT_DOCUMENT_BYTES) throw new Error("保存结果超过 16 MiB，请缩小文件后再保存。");
  const output = new Uint8Array(text.length * 2 + offset); const little = encoding === "utf-16le"; const view = new DataView(output.buffer);
  if (bom) output.set(little ? [0xff, 0xfe] : [0xfe, 0xff]);
  for (let index = 0; index < text.length; index++) view.setUint16(offset + index * 2, text.charCodeAt(index), little);
  return output;
}

function format_eol(text: string, eol: text_document_eol, original: string[]): string {
  if (!["LF", "CRLF", "CR", "mixed"].includes(eol)) throw new Error("换行格式无效，请选择 LF、CRLF 或 CR。");
  if (eol !== "mixed") return text.replace(/\r\n|\r|\n/gu, {LF: "\n", CRLF: "\r\n", CR: "\r"}[eol]);
  const counts = new Map<string, number>(); for (const ending of original) counts.set(ending, (counts.get(ending) || 0) + 1);
  const dominant = [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] || "\n";
  let index = 0;
  // Monaco 会统一内存换行。保留原分隔序列；新增行使用原文出现最多的换行格式。
  return text.replace(/\r\n|\r|\n/gu, () => original[index++] || dominant);
}

/**
 * 读取快照后，保存前核对字节、文件身份与真实路径，再写同目录独占临时文件并 rename。
 * 这是冲突检测和原子替换；Node 的检查与 rename 之间仍有竞态窗口，不是跨进程原子 CAS。
 * 快照只绑定传给 save 的字符串；保存期间编辑器继续输入不会被本服务读取或覆盖。
 */
export function create_text_document(modules: file_modules, file_path: string, options: { encoding?: string } = {}): text_document {
  const {path_api} = modules; const fs = modules.fs.promises;
  file_path = path_api.resolve(file_path);
  let baseline: loaded_snapshot | undefined; let busy = false;
  const read_disk = async (requested_path = file_path): Promise<disk_snapshot> => {
    const entry_before = await fs.lstat(requested_path);
    if (!entry_before.isFile() && !entry_before.isSymbolicLink()) throw new Error("该项目不是普通文本文件，请在目录中展开文件夹。");
    const real_path = await fs.realpath(requested_path); const parent_identity = identity(await fs.stat(path_api.dirname(real_path)));
    const handle = await fs.open(real_path, "r");
    try {
      const before = await handle.stat();
      if (!before.isFile()) throw new Error("该项目不是普通文本文件。");
      if (before.size > MAX_TEXT_DOCUMENT_BYTES) throw new Error("文件超过 16 MiB，请使用系统程序打开。");
      // 只为本次 stat 的大小分配缓冲区，多读一个字节识别并发增长，避免 readFile 无界读取。
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
    if (raw_binary && !explicit_utf16) throw new Error("这是二进制文件，不能作为文本编辑；请使用系统程序打开。");
    let decoded: decoded_file;
    try { decoded = decode_file_bytes(disk.bytes, encoding); } catch { throw new Error(`文件不是有效的 ${encoding} 文本，请选择正确的编码重新打开。`); }
    // 显式指定无 BOM 的 UTF-16 时，原字节中的 NUL 是编码组成部分，改查解码后的文本。
    const binary = !decoded.bom && ["utf-16le", "utf-16be"].includes(decoded.encoding) ? detect_binary_bytes(new TextEncoder().encode(decoded.text)) : detect_binary_bytes(disk.bytes);
    if (binary) throw new Error("这是二进制文件，不能作为文本编辑；请使用系统程序打开。");
    const endings = endings_in(decoded.text); return {...disk, value: {...decoded, eol: detect_eol(endings)}, endings};
  };
  const verify = async (snapshot: loaded_snapshot) => {
    let current: disk_snapshot; try { current = await read_disk(); } catch { throw conflict(); }
    if (current.real_path !== snapshot.real_path || current.parent_identity !== snapshot.parent_identity || current.entry_identity !== snapshot.entry_identity || !same_stat(current.stat, snapshot.stat) || !same_bytes(current.bytes, snapshot.bytes)) throw conflict();
    return current;
  };
  const load = async () => {
    if (busy) throw new Error("文件正在读取或保存，请等待当前操作完成。"); busy = true;
    try { const loaded = decode(await read_disk(), baseline?.value.encoding || options.encoding || "utf-8"); baseline = loaded; return {...loaded.value}; }
    finally { busy = false; }
  };
  const save = async (text: string, settings: text_document_save_options = {}): Promise<text_document_value> => {
    if (busy) throw new Error("文件正在读取或保存，请等待当前操作完成。");
    if (!baseline) throw new Error("请先读取文件，再保存编辑内容。");
    busy = true; const snapshot = baseline; const selected = {...settings}; let temporary = "", temporary_identity = "";
    try {
      const encoding = selected.encoding ?? snapshot.value.encoding; const bom = selected.bom ?? snapshot.value.bom;
      const formatted = format_eol(text, selected.eol ?? snapshot.value.eol, snapshot.endings);
      const bytes = encode_text(formatted, encoding, bom);
      const endings = endings_in(formatted); const value = {text: formatted, encoding, bom, eol: endings.length ? detect_eol(endings) : selected.eol ?? snapshot.value.eol};
      await verify(snapshot);
      if (!(snapshot.stat.mode & 0o222)) throw new Error("文件为只读，当前编辑内容仍保留；请先修改文件权限。");
      if (same_bytes(bytes, snapshot.bytes)) { baseline = {...snapshot, value, endings}; return {...value}; }
      temporary = path_api.join(path_api.dirname(snapshot.real_path), `.linux-note-text-${globalThis.crypto.randomUUID()}.tmp`);
      const handle = await fs.open(temporary, "wx", snapshot.stat.mode & 0o777);
      try {
        temporary_identity = identity(await handle.stat());
        await handle.writeFile(bytes); if (handle.chmod) await handle.chmod(snapshot.stat.mode & 0o777); await handle.sync();
      } finally { await handle.close(); }
      await verify(snapshot);
      const staged = await read_disk(temporary);
      if (staged.real_path !== temporary || identity(staged.stat) !== temporary_identity || !same_bytes(staged.bytes, bytes)) throw new Error("保存临时文件已发生变化，已停止保存；当前编辑内容仍保留。");
      await fs.rename(temporary, snapshot.real_path); temporary = "";
      const committed = await read_disk();
      if (identity(committed.stat) !== temporary_identity || committed.real_path !== snapshot.real_path || !same_bytes(committed.bytes, bytes)) throw new Error("保存后文件又被其他进程更改，请先比较磁盘内容；当前编辑内容仍保留。");
      baseline = {...committed, value, endings}; return {...value};
    } catch (error) {
      const problem = error as { code?: string; message?: string };
      if (["EACCES", "EPERM", "EROFS"].includes(problem.code || "")) throw new Error("没有写入权限，或文件正在被其他程序占用；当前编辑内容仍保留。");
      if (problem.code === "ENOSPC") throw new Error("磁盘空间不足，保存未完成；当前编辑内容仍保留。");
      throw error;
    } finally {
      // 不删除已被其他进程替换的同名项目；只清理自己创建的临时文件。
      if (temporary && temporary_identity) { try { const stat = await fs.lstat(temporary); if (identity(stat) === temporary_identity && stat.isFile() && !stat.isSymbolicLink()) await fs.unlink(temporary); } catch { /* rename 成功或外部移走后无需清理。 */ } }
      busy = false;
    }
  };
  const prepare_relocation = async (target: string) => {
    if (busy) throw new Error("文件正在读取或保存，请等待后再重命名。");
    busy = true; let finished = false;
    try { if (baseline) await verify(baseline); } catch (error) { busy = false; throw error; }
    const previous = baseline;
    return {
      async commit() {
        if (finished) return; finished = true;
        // 即使外部程序在改名后又写入，也应把后续保存指向新路径；旧快照不冒充最新磁盘内容。
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
