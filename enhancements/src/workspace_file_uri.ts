import { is_markdown_file } from "./file_language";

/** 空布局不是文档；空路径则属于真实的未命名Markdown草稿。 */
export function is_empty_editor_path(target: string): boolean {
  return target.startsWith("typ://core.empty/");
}

export const SOURCE_FILE_VIEW_ID = "linux_note.source_file";
const SOURCE_FILE_URI_PREFIX = `typ://${SOURCE_FILE_VIEW_ID}/`;

export type workspace_path_api = {
  sep: string;
  isAbsolute(path: string): boolean;
  normalize(path: string): string;
  resolve(...parts: string[]): string;
  dirname(path: string): string;
};

export type markdown_file_target = {file_path: string; hash?: string};

type path_identity_api = Pick<workspace_path_api, "sep" | "isAbsolute">;

const is_windows_absolute_file = (file_path: string) => /^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/iu.test(file_path);
const is_absolute_file = (file_path: string) => file_path.startsWith("/") || is_windows_absolute_file(file_path);
const is_platform_absolute_file = (file_path: string, path_api: path_identity_api) => path_api.sep === "\\"
  ? is_windows_absolute_file(file_path)
  : file_path.startsWith("/") && path_api.isAbsolute(file_path);

export function is_source_file_uri(target: string): boolean {
  return target.startsWith(SOURCE_FILE_URI_PREFIX);
}

/** 源码标签只把绝对文件路径放进 URI 的一个编码段，文件名中的空格、#、% 和方括号不会改变 URI 结构。 */
export function source_file_uri(file_path: string): string {
  if (!is_absolute_file(file_path)) throw new Error("源码 URI 需要绝对文件路径。");
  return SOURCE_FILE_URI_PREFIX + encodeURIComponent(file_path);
}

export function source_file_path(target: string, path_api?: path_identity_api): string | undefined {
  if (!is_source_file_uri(target)) return;
  try {
    const file_path = decodeURIComponent(target.slice(SOURCE_FILE_URI_PREFIX.length));
    return file_path && is_absolute_file(file_path) && (!path_api || is_platform_absolute_file(file_path, path_api)) ? file_path : undefined;
  } catch {
    return;
  }
}

/** Windows 驱动器和 UNC 路径按不区分大小写的文件身份比较；POSIX 路径仍区分大小写。 */
export function file_key(file_path: string): string {
  const normalized = file_path.replace(/\\/gu, "/");
  return /^(?:[a-z]:\/|\/\/)/iu.test(normalized) ? normalized.toLowerCase() : normalized;
}

/** file URL 只在协议边界解码一次，不能把 file:/ 当作工作区子目录。 */
function file_url_path(path_api: path_identity_api, target: string): string | undefined {
  try {
    const url = new URL(target);
    if (url.protocol !== "file:" || url.username || url.password || url.port || url.search) return;
    // 编码的目录分隔符不属于合法文件 URL，防止解码改变路径层级。
    if (/%2f|%5c/iu.test(url.pathname)) return;
    const pathname = decodeURIComponent(url.pathname);
    if (path_api.sep === "\\") {
      if (url.hostname && url.hostname !== "localhost") return `\\\\${url.hostname}${pathname.replace(/\//gu, "\\")}`;
      return /^\/[a-z]:\//iu.test(pathname) ? pathname.slice(1).replace(/\//gu, "\\") : undefined;
    }
    return !url.hostname || url.hostname === "localhost" ? pathname : undefined;
  } catch { return; }
}

/** 所有工作区命令都以显式 context_root 解析相对路径，避免落到 Electron 进程工作目录。 */
export function resolve_workspace_file(path_api: workspace_path_api, context_root: string, target: string): string | undefined {
  const decoded = source_file_path(target, path_api);
  if (is_source_file_uri(target) && !decoded) return;
  const candidate = /^file:/iu.test(target) ? file_url_path(path_api, target) : decoded ?? target;
  if (!candidate || candidate.startsWith("typ://") || (!is_windows_absolute_file(candidate) && /^[a-z][a-z0-9+.-]*:/iu.test(candidate))) return;
  if (path_api.isAbsolute(candidate)) return is_platform_absolute_file(candidate, path_api) ? path_api.resolve(candidate) : undefined;
  if (is_absolute_file(candidate) || !is_platform_absolute_file(context_root, path_api)) return;
  return path_api.resolve(context_root, candidate);
}

/** 宿主工具 URI 已由工作区注册表解释，绝不能按当前 Markdown 的目录再次解析。 */
export function resolve_host_open_file_target(path_api: workspace_path_api, source_file: string, target: string): string {
  const candidate = target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
  // 协议保留到统一解析边界；不能先把 https: 等拼成可打开的本地文件名。
  if (!is_windows_absolute_file(candidate) && /^[a-z][a-z0-9+.-]*:/iu.test(candidate)) return candidate;
  return source_file && !path_api.isAbsolute(candidate) ? path_api.resolve(path_api.dirname(source_file), candidate) : candidate;
}

/**
 * 普通文件路径中的 % 不做 URL 解码；只有位于 Markdown 后缀之后的 # 才是锚点。
 * 因而 `notes/a #1 100%.md#标题` 会保留文件名中的 #、% 和空格。
 */
export function parse_markdown_file_target(target: string): markdown_file_target | undefined {
  const candidate = target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
  if (!candidate || is_source_file_uri(candidate)) return;
  let separator = candidate.indexOf("#");
  while (separator >= 0) {
    const file_path = candidate.slice(0, separator);
    if (is_markdown_file(file_path)) return {file_path, hash: candidate.slice(separator)};
    separator = candidate.indexOf("#", separator + 1);
  }
  return is_markdown_file(candidate) ? {file_path: candidate} : undefined;
}

export function resolve_markdown_file_target(path_api: workspace_path_api, context_root: string, target: string): markdown_file_target | undefined {
  const parsed = parse_markdown_file_target(target);
  if (!parsed) return;
  const file_path = resolve_workspace_file(path_api, context_root, parsed.file_path);
  return file_path ? {...parsed, file_path} : undefined;
}
