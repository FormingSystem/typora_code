import type { git_run } from "./git_graph_data";

type git_child = { kill(): void; stdin?: { end(): void } };
type process_error = Error & { code?: string | number; killed?: boolean };
type native_modules = {
  child_process: { execFile(file: string, args: string[], options: Record<string, unknown>, callback: (error: process_error | null, stdout: any, stderr: any) => void): git_child };
  process: { env: Record<string, string | undefined> };
};

/** 直接传递参数，不经过 shell；每个视图单独管理进程，隐藏或刷新时取消旧请求。 */
export function create_git_runner(modules: native_modules, options: { executable?: string; writable?: boolean } = {}): { run: git_run; run_bytes(cwd: string, args: string[]): Promise<Uint8Array>; cancel(): void } {
  const children = new Set<git_child>();
  const env: Record<string, string | undefined> = { ...modules.process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: options.writable ? "0" : "1", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_NAMESPACE", "GIT_LITERAL_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS", "GIT_ICASE_PATHSPECS"]) delete env[key];
  const execute = (cwd: string, args: string[], binary = false, todo = ""): Promise<any> => new Promise((resolve, reject) => {
      // 命令文本固定；用户批准的 todo 仅通过被双引号保护的环境数据传入 Git 自带的 shell。
      const sequence_editor = `sh -c 'printf "%s\\n" "$LINUX_NOTE_GIT_REBASE_TODO" > "$1"' --`;
      const message_editor = `sh -c 'todo_file=$(git rev-parse --git-path rebase-merge/done); if test -f "$todo_file"; then tail -n 1 "$todo_file" | { read -r action hash message; if test "$action" = reword && test -n "$message"; then printf "%s\\n" "$message" > "$1"; fi; }; fi' --`;
      const execution_env = { ...env, GIT_EDITOR: message_editor, ...(todo ? { LINUX_NOTE_GIT_REBASE_TODO: todo, GIT_SEQUENCE_EDITOR: sequence_editor } : {}) };
      // stash 的内部 clean 需要 Git 自己构造 pathspec；只对直接接收文件路径的命令禁用通配符。
      const literal_paths = ["diff", "diff-tree", "add", "reset", "ls-files", "rm", "restore", "clean"].includes(args[0]) || args[0] === "log" && args.indexOf("--") >= 0 && args.indexOf("--") < args.length - 1;
      const child = modules.child_process.execFile(options.executable || "git", ["--no-pager", "--no-replace-objects", ...(literal_paths ? ["--literal-pathspecs"] : []),
        "-c", "protocol.ext.allow=never",
        "-c", "color.ui=false", "-c", "core.quotePath=false", "-c", "i18n.logOutputEncoding=utf-8", "-c", "log.showSignature=false", ...args], {
        cwd, env: execution_env, encoding: binary ? null : "utf8", windowsHide: true, shell: false, timeout: options.writable ? 300000 : 30000, maxBuffer: 16 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        children.delete(child);
        if (!error) { resolve(stdout); return; }
        const message = error.code === "ENOENT" ? "未找到 Git。请安装 Git 并加入 PATH，然后正常重启 Typora。"
          : error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? "结果超过 16 MiB，请缩小历史范围或选择其他文件。"
          : error.killed ? "Git 请求已取消或超时，请刷新状态后重试。"
          : (String(stderr || "") || error.message).trim();
        reject(Object.assign(new Error(message), { code: error.code }));
      });
      children.add(child);
      child.stdin?.end();
    });
  return {
    run: (cwd, args, execution) => execute(cwd, args, false, execution?.todo),
    run_bytes: (cwd, args) => execute(cwd, args, true),
    cancel() { for (const child of children) child.kill(); children.clear(); },
  };
}
