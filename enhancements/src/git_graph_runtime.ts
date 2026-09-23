import type { git_run } from "./git_graph_data";
import { git_graph_text as text } from "./git_graph_i18n";
import {remote_files_for,assert_remote_owner} from './remote_workspace_files';

type git_child = { kill(): void; stdin?: { end(input?: string): void; on?(event: string, listener: (error: Error) => void): void } };
type process_error = Error & { code?: string | number; killed?: boolean };
type native_modules = {
  child_process: { execFile(file: string, args: string[], options: Record<string, unknown>, callback: (error: process_error | null, stdout: any, stderr: any) => void): git_child };
  process: { env: Record<string, string | undefined> };
};

/** 直接传递参数，不经过 shell；每个视图单独管理进程，隐藏或刷新时取消旧请求。 */
export function create_git_runner(modules: native_modules, options: { executable?: string; writable?: boolean } = {}): { run: git_run; run_bytes(cwd: string, args: string[]): Promise<Uint8Array>; cancel(): void } {
  const children = new Set<git_child>();
  const env: Record<string, string | undefined> = { ...modules.process.env, LC_ALL: "C", LANG: "C", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: options.writable ? "0" : "1", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_NAMESPACE", "GIT_LITERAL_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS", "GIT_ICASE_PATHSPECS"]) delete env[key];
  const execute = (cwd: string, args: string[], binary = false, todo = "", input?: string): Promise<any> => new Promise((resolve, reject) => {
      // 命令文本固定；用户批准的 todo 仅通过被双引号保护的环境数据传入 Git 自带的 shell。
      const sequence_editor = `sh -c 'printf "%s\\n" "$LINUX_NOTE_GIT_REBASE_TODO" > "$1"' --`;
      const message_editor = `sh -c 'todo_file=$(git rev-parse --git-path rebase-merge/done); if test -f "$todo_file"; then tail -n 1 "$todo_file" | { read -r action hash message; if test "$action" = reword && test -n "$message"; then printf "%s\\n" "$message" > "$1"; fi; }; fi' --`;
      const execution_env = { ...env, GIT_EDITOR: message_editor, ...(todo ? { LINUX_NOTE_GIT_REBASE_TODO: todo, GIT_SEQUENCE_EDITOR: sequence_editor } : {}) };
      // stash 的内部 clean 需要 Git 自己构造 pathspec；只对直接接收文件路径的命令禁用通配符。
      const literal_paths = ["diff", "diff-tree", "add", "reset", "ls-files", "rm", "restore", "clean"].includes(args[0]) || args[0] === "log" && args.indexOf("--") >= 0 && args.indexOf("--") < args.length - 1;
      const command_args=["--no-pager", "--no-replace-objects", ...(literal_paths ? ["--literal-pathspecs"] : []),
        "-c", "protocol.ext.allow=never",
        "-c", "color.ui=false", "-c", "core.quotePath=false", "-c", "i18n.logOutputEncoding=utf-8", "-c", "log.showSignature=false", ...args];
      const remote=remote_files_for(cwd);
      assert_remote_owner(cwd);
      if(remote){
        const controller=new AbortController(),job={kill(){controller.abort();}};children.add(job);
        void remote.git(cwd,command_args,execution_env,Boolean(options.writable),input,controller.signal).then(data=>{
          if(controller.signal.aborted)throw Error(text('runtime.cancelled_or_timed_out'));
          if(binary){resolve(data);return;}
          let output=data.toString('utf8');
          // 只有返回绝对资源地址的查询需要映射，正文与提交信息不能替换路径字符串。
          if(args[0]==='rev-parse'&&args.some(arg=>['--show-toplevel','--absolute-git-dir','--git-dir','--git-common-dir'].includes(arg)))output=output.split('\n').map((line:string)=>line.startsWith('/')?remote.local_path(line):line).join('\n');
          resolve(output);
        }).catch(reject).finally(()=>children.delete(job));return;
      }
      const child = modules.child_process.execFile(options.executable || "git", command_args, {
        cwd, env: execution_env, encoding: binary ? null : "utf8", windowsHide: true, shell: false, timeout: options.writable ? 300000 : 30000, maxBuffer: 16 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        children.delete(child);
        if (!error) { resolve(stdout); return; }
        const message = error.code === "ENOENT" ? text("runtime.git_not_found")
          : error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? text("runtime.result_too_large")
          : error.killed ? text("runtime.cancelled_or_timed_out")
          : (String(stderr || "") || error.message).trim();
        reject(Object.assign(new Error(message), { code: error.code }));
      });
      children.add(child);
      child.stdin?.on?.("error", () => { /* Git 提前失败时由 execFile 回调报告；防止 stdin EPIPE 成为未捕获异常。 */ });
      child.stdin?.end(input);
    });
  return {
    run: (cwd, args, execution) => execute(cwd, args, false, execution?.todo, execution?.stdin),
    run_bytes: (cwd, args) => execute(cwd, args, true),
    cancel() { for (const child of children) child.kill(); children.clear(); },
  };
}
