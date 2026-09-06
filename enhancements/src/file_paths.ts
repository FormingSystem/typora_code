export const COPY_ABSOLUTE_PATH = "linux_note:copy_absolute_path";
export const COPY_RELATIVE_PATH = "linux_note:copy_relative_path";

export type path_operations = {
  sep: string;
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
};

/** 与 VS Code 的工作区路径语义一致：只对根目录内的项目生成相对路径。 */
export function format_file_path(api: path_operations, target: string, root: string | undefined, relative: boolean): string | null {
  if (!target || !api.isAbsolute(target)) return null;
  let absolute = api.normalize(target);
  if (api.sep === "\\") absolute = absolute.replace(/^[a-z]:/u, (drive) => drive.toUpperCase());
  if (!relative || !root || !api.isAbsolute(root)) return absolute;
  const result = api.relative(root, absolute);
  // 不把其他盘符、同名前缀目录或根目录外的文件误写成工作区内的相对路径。
  return result === ".." || result.startsWith(`..${api.sep}`) || api.isAbsolute(result) ? absolute : result;
}
