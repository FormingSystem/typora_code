import {remote_files_for} from './remote_workspace_files';
type trash_runtime = {JSBridge?: {invoke(command: string, ...args: unknown[]): Promise<unknown>}; reqnode(name: string): any};

/** Typora 的回收站在主进程执行；拒绝回收不能退化为永久删除。 */
export async function trash_native_path(runtime: trash_runtime, target: string): Promise<void> {
  const remote=remote_files_for(target);if(remote){await remote.trash(target);return;}
  const fs = runtime.reqnode("fs").promises;
  if (runtime.JSBridge?.invoke) {
    if (await runtime.JSBridge.invoke("shell.trashItem", target) !== true) {
      throw new Error("未能移到回收站：" + target + "。请检查文件占用、目录权限及回收站支持；未执行永久删除。");
    }
  } else {
    const shell = runtime.reqnode("electron")?.shell;
    if (typeof shell?.trashItem !== "function") throw new Error("当前宿主未提供回收站接口，文件已保留。");
    await shell.trashItem(target);
  }
  try { await fs.lstat(target); }
  catch (error) { if ((error as {code?: string}).code === "ENOENT") return; throw error; }
  throw new Error("回收操作返回后项目仍然存在：" + target + "。请刷新并核对，未执行永久删除。");
}
