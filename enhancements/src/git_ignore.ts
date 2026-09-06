import type { git_run } from "./git_graph_data";

type ignore_modules = { fs: any; path_api: any };
export type ignore_result = { rule: string; changed: boolean };

/** 根目录锚定并转义 Git 通配字符；一条规则只匹配当前相对文件路径。 */
export function exact_ignore_rule(file: string): string {
  if (!file || /[\0\r\n]/u.test(file) || /^(?:[a-z]:|\/)/iu.test(file)
      || file.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error("无法为此文件生成精确忽略规则。");
  return "/" + file.replace(/[\\*?\[\]#! ]/gu, character => "\\" + character);
}

/** 只追加根 .gitignore，不修改索引；已有文件不截断，不经符号链接写入。 */
export async function append_git_ignore(modules: ignore_modules, run: git_run, root: string, file: string): Promise<ignore_result> {
  const { fs, path_api } = modules;
  const rule = exact_ignore_rule(file);
  // Windows 的反斜线和冒号具有路径语义，不能按 Linux 文件名解释。
  if (path_api.sep === "\\" && /[\\:]/u.test(file)) throw new Error("文件路径无效。");
  const real_root = fs.realpathSync(root);
  const file_path = path_api.resolve(real_root, file);
  const inside_root = (value: string) => {
    const relative = path_api.relative(real_root, value);
    return relative && relative !== ".." && !relative.startsWith(".." + path_api.sep) && !path_api.isAbsolute(relative);
  };
  if (!inside_root(file_path) || !inside_root(fs.realpathSync(file_path))) throw new Error("文件路径超出仓库。");
  const file_stat = fs.lstatSync(file_path);
  if (!file_stat.isFile() || file_stat.isSymbolicLink()) throw new Error("仅支持将未跟踪的普通文件添加到 .gitignore。");
  if (await run(root, ["ls-files", "--cached", "-z", "--", file])) throw new Error("此文件已经加入 Git 跟踪，不能通过 .gitignore 停止跟踪；本操作不会从索引中移除文件。");
  const ignored = await run(root, ["check-ignore", "--quiet", "--", file]).then(() => true, error => { if (error.code === 1) return false; throw error; });
  const ignore_path = path_api.join(real_root, ".gitignore");
  const ordinary_file = (stat: any) => {
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error(".gitignore 必须是无链接的普通文件，未写入任何规则。");
  };
  let descriptor: number | undefined;
  try {
    let exists = true;
    try { ordinary_file(fs.lstatSync(ignore_path)); } catch (error) { if ((error as { code?: string }).code === "ENOENT") exists = false; else throw error; }
    // 排他创建避免覆盖新文件；既有文件以追加方式打开，O_NOFOLLOW 在支持的平台阻止链接跟随。
    try { descriptor = fs.openSync(ignore_path, exists ? fs.constants.O_RDWR | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0) : "ax+"); }
    catch (error) { if ((error as { code?: string }).code === "EEXIST") throw new Error(".gitignore 刚被其他程序创建，请刷新后重试。"); throw error; }
    const opened_stat = fs.fstatSync(descriptor); ordinary_file(opened_stat);
    const current_stat = fs.lstatSync(ignore_path); ordinary_file(current_stat);
    if (opened_stat.dev !== current_stat.dev || opened_stat.ino !== current_stat.ino) throw new Error(".gitignore 已被其他程序替换，请重试。");
    const existing = fs.readFileSync(descriptor);
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(existing); }
    catch { throw new Error(".gitignore 不是有效 UTF-8 文本，请先在编辑器中确认编码。"); }
    if (content.includes("\0")) throw new Error(".gitignore 包含无效文本，未写入任何规则。");
    if (ignored && content.split(/\r?\n/u).includes(rule)) return { rule, changed: false };
    const newline = content.match(/\r?\n/u)?.[0] || "\n";
    const addition = (content && !content.endsWith("\n") ? newline : "") + rule + newline;
    fs.writeFileSync(descriptor, addition, "utf8"); fs.fsyncSync(descriptor);
    return { rule, changed: true };
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}
