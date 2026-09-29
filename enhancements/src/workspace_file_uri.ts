import {workspace_text} from "./workspace_i18n";
import {remote_files_for} from './remote_workspace_files';
import { is_markdown_file } from "./file_language";

/** Empty layout is not a document; empty path belongs to the real unnamed Markdown draft. */
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

/** Source code tags only put absolute file paths into URI's one encoding segment; spaces, #, %, and brackets in the filename do not change URI structure. */
export function source_file_uri(file_path: string): string {
  if (!is_absolute_file(file_path)) throw new Error(workspace_text("file_uri_source_code_uri_requires_an_absolute_file_path"));
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

/** Windows driver and UNC path are compared case-insensitively based on file identity; POSIX path still distinguishes case. */
export function file_key(file_path: string): string {
  const normalized = file_path.replace(/\\/gu, "/");
  return /^(?:[a-z]:\/|\/\/)/iu.test(normalized) ? normalized.toLowerCase() : normalized;
}

/** file URL is decoded only once at the protocol boundary; cannot treat file:/ as a subdirectory of the workspace. */
function file_url_path(path_api: path_identity_api, target: string): string | undefined {
  try {
    const url = new URL(target);
    if (url.protocol !== "file:" || url.username || url.password || url.port || url.search) return;
    // Encoded directory separators are not considered valid file URL; prevent decoding from changing the path hierarchy.
    if (/%2f|%5c/iu.test(url.pathname)) return;
    const pathname = decodeURIComponent(url.pathname);
    if (path_api.sep === "\\") {
      if (url.hostname && url.hostname !== "localhost") return `\\\\${url.hostname}${pathname.replace(/\//gu, "\\")}`;
      return /^\/[a-z]:\//iu.test(pathname) ? pathname.slice(1).replace(/\//gu, "\\") : undefined;
    }
    return !url.hostname || url.hostname === "localhost" ? pathname : undefined;
  } catch { return; }
}

/** All workspace commands parse relative paths explicitly as context_root; avoid falling into Electron process working directory. */
export function resolve_workspace_file(path_api: workspace_path_api, context_root: string, target: string): string | undefined {
  const decoded = source_file_path(target, path_api);
  if (is_source_file_uri(target) && !decoded) return;
  const candidate = /^file:/iu.test(target) ? file_url_path(path_api, target) : decoded ?? target;
  if (!candidate || candidate.startsWith("typ://") || (!is_windows_absolute_file(candidate) && /^[a-z][a-z0-9+.-]*:/iu.test(candidate))) return;
  const remote=remote_files_for(context_root);
  if(remote&&!path_api.isAbsolute(candidate))return remote.local_path(remote.path_api.posix.resolve(remote.remote_path(context_root),candidate.replace(/\\/gu,'/')));
  if (path_api.isAbsolute(candidate)) return is_platform_absolute_file(candidate, path_api) ? path_api.resolve(candidate) : undefined;
  if (is_absolute_file(candidate) || !is_platform_absolute_file(context_root, path_api)) return;
  return path_api.resolve(context_root, candidate);
}

/** Host tool URI has already been interpreted by the workspace registry; absolutely cannot parse it again based on the current Markdown directory. */
export function resolve_host_open_file_target(path_api: workspace_path_api, source_file: string, target: string): string {
  const candidate = target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
  const remote=remote_files_for(source_file);
  if(remote&&candidate.startsWith('file:')){try{const url=new URL(candidate);if((!url.hostname||url.hostname==='localhost')&&!url.username&&!url.password&&!url.search&&!/%2f|%5c/iu.test(url.pathname)&&!/^\/[a-z]:\//iu.test(url.pathname))return remote.local_path(decodeURIComponent(url.pathname))+url.hash;}catch{return candidate;}}
  if(remote&&candidate.startsWith('/')&&!candidate.startsWith('//'))return remote.local_path(candidate);
  // Protocol is retained until the unified parsing boundary; cannot first combine https: and others into a readable local filename.
  if (!is_windows_absolute_file(candidate) && /^[a-z][a-z0-9+.-]*:/iu.test(candidate)) return candidate;
  if(remote&&!path_api.isAbsolute(candidate))return remote.local_path(remote.path_api.posix.resolve(remote.path_api.posix.dirname(remote.remote_path(source_file)),candidate.replace(/\\/gu,'/')));
  return source_file && !path_api.isAbsolute(candidate) ? path_api.resolve(path_api.dirname(source_file), candidate) : candidate;
}

/** Do not URL-decode percent signs in ordinary file paths; only a hash after the Markdown extension denotes an anchor. Thus notes/a #1 100%.md#heading preserves the filename's hash, percent sign, and spaces. */
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
