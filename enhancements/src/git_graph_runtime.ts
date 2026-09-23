import type { git_run } from "./git_graph_data";
import { git_graph_text as text } from "./git_graph_i18n";
import {remote_files_for,assert_remote_owner} from './remote_workspace_files';

import {discover_git} from './git_runtime_environment';
import {acquire_git_process, spawn_git_process} from './git_process_transport';
type native_modules = {child_process:any; process:{env:Record<string,string|undefined>;platform?:string}};

/** 直接传递参数，不经过 shell；每个视图单独管理进程，隐藏或刷新时取消旧请求。 */
export function create_git_runner(modules: native_modules, options: { executable?: string; writable?: boolean } = {}): { run: git_run; run_bytes(cwd: string, args: string[]): Promise<Uint8Array>; cancel(): void } {
  const children = new Set<{kill():void}>();
  const env: Record<string, string | undefined> = { ...modules.process.env, LC_ALL: "C", LANG: "C", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: options.writable ? "0" : "1", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_NAMESPACE", "GIT_LITERAL_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS", "GIT_ICASE_PATHSPECS"]) delete env[key];
  const execute = (cwd: string, args: string[], binary = false, todo = "", input?: string, consume?: (chunk:string)=>Promise<void>|void): Promise<any> => {
    const controller=new AbortController(), job={kill(){controller.abort();}};children.add(job);
    return (async()=>{
      const release=await acquire_git_process(controller.signal);
      try {
      // 大量文件由NUL输入传递，避免Windows命令行长度限制；不改变一次Git操作的原子边界。
      const separator=args.indexOf("--");
      if(input===undefined&&["add","reset","restore"].includes(args[0])&&separator>=0&&args.slice(separator+1).join(" ").length>16000){
        input=args.slice(separator+1).join("\0")+"\0";args=[...args.slice(0,separator),"--pathspec-from-file=-","--pathspec-file-nul"];
      }
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
        const data=await remote.git(cwd,command_args,execution_env,Boolean(options.writable),input,controller.signal);
        if(controller.signal.aborted)throw Object.assign(Error('Git读取已取消。'),{code:'ABORT_ERR'});
        if(binary)return data;
        let output=data.toString('utf8');
        if(args[0]==='rev-parse'&&args.some(arg=>['--show-toplevel','--absolute-git-dir','--git-dir','--git-common-dir'].includes(arg)))output=output.split('\n').map((line:string)=>line.startsWith('/')?remote.local_path(line):line).join('\n');
        if(consume){for(let i=0;i<output.length;i+=65536){if(controller.signal.aborted)throw Error('Git读取已取消。');await consume(output.slice(i,i+65536));}return '';}
        return output;
      }
      const executable=await discover_git(modules,options.executable||'git');
      return await spawn_git_process(modules.child_process,executable,command_args,{
        cwd,env:execution_env,binary,writable:Boolean(options.writable),input,consume,signal:controller.signal,
      });
      } finally {release();}
    })().finally(()=>children.delete(job));
  };

  return {
    run: (cwd, args, execution) => execute(cwd, args, false, execution?.todo, execution?.stdin, execution?.stdout),
    run_bytes: (cwd, args) => execute(cwd, args, true),
    cancel() { for (const child of children) child.kill(); children.clear(); },
  };
}
