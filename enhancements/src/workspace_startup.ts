import { activate_typora_enhancements, deactivate_typora_enhancements } from "./typora_enhancements";

let startup_promise: Promise<void> | undefined;
/** 同一窗口只启动一次；文件和文件夹事件不触发重新装配。 */
export function start_typora_code(): Promise<void> {
  if (!startup_promise) {
    const pending = activate_typora_enhancements();
    startup_promise = pending;
    void pending.catch(() => { if (startup_promise === pending) startup_promise = undefined; });
  }
  return startup_promise;
}
/** 窗口级清理保留未保存文档与写操作保护，不作为文件切换入口。 */
export function shutdown_typora_code(): void {
  deactivate_typora_enhancements();
  startup_promise = undefined;
}
