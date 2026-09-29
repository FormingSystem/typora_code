export const COPY_ABSOLUTE_PATH = "linux_note:copy_absolute_path";
export const COPY_RELATIVE_PATH = "linux_note:copy_relative_path";

export type path_operations = {
  sep: string;
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
};

/** The workspace path semantics are consistent with VS Code: only generate relative paths for projects within the root directory. */
export function format_file_path(api: path_operations, target: string, root: string | undefined, relative: boolean): string | null {
  if (!target || !api.isAbsolute(target)) return null;
  let absolute = api.normalize(target);
  if (api.sep === "\\") absolute = absolute.replace(/^[a-z]:/u, (drive) => drive.toUpperCase());
  if (!relative || !root || !api.isAbsolute(root)) return absolute;
  const result = api.relative(root, absolute);
  // Do not mistakenly write other disk drives, directories with the same prefix, or files outside the root directory as relative paths within the workspace.
  return result === ".." || result.startsWith(`..${api.sep}`) || api.isAbsolute(result) ? absolute : result;
}
