import type { git_run } from "./git_graph_data";

type git_child = { kill(): void };
type process_error = Error & { code?: string | number; killed?: boolean };
type native_modules = {
  child_process: { execFile(file: string, args: string[], options: Record<string, unknown>, callback: (error: process_error | null, stdout: string, stderr: string) => void): git_child };
  process: { env: Record<string, string | undefined> };
};

/** 直接传递参数，不经过 shell；每个视图单独管理进程，隐藏或刷新时取消旧请求。 */
export function create_git_runner(modules: native_modules): { run: git_run; cancel(): void } {
  const children = new Set<git_child>();
  const env = { ...modules.process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_NAMESPACE"]) delete env[key];
  return {
    run: (cwd, args) => new Promise((resolve, reject) => {
      const child = modules.child_process.execFile("git", ["--no-pager", "--no-replace-objects", "--literal-pathspecs",
        "-c", "color.ui=false", "-c", "core.quotePath=false", "-c", "i18n.logOutputEncoding=utf-8", "-c", "log.showSignature=false", ...args], {
        cwd, env, encoding: "utf8", windowsHide: true, shell: false, timeout: 15000, maxBuffer: 4 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        children.delete(child);
        if (!error) { resolve(stdout); return; }
        const message = error.code === "ENOENT" ? "未找到 Git。请安装 Git 并加入 PATH，然后正常重启 Typora。"
          : error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? "结果超过 4 MiB，请缩小历史范围或选择其他文件。"
          : error.killed ? "Git 查询已取消或超过 15 秒，请重试。"
          : (stderr || error.message).trim();
        reject(Object.assign(new Error(message), { code: error.code }));
      });
      children.add(child);
    }),
    cancel() { for (const child of children) child.kill(); children.clear(); },
  };
}
