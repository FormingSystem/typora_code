import { activate_typora_enhancements, deactivate_typora_enhancements } from "./typora_enhancements";

let startup_promise: Promise<void> | undefined;
/** Start once per window; file and folder events do not reassemble the workbench. */
export function start_typora_code(): Promise<void> {
  if (!startup_promise) {
    const pending = activate_typora_enhancements();
    startup_promise = pending;
    void pending.catch(() => { if (startup_promise === pending) startup_promise = undefined; });
  }
  return startup_promise;
}
/** Window cleanup retains unsaved-document and pending-write guards; it is not a file-switching entry point. */
export function shutdown_typora_code(): void {
  deactivate_typora_enhancements();
  startup_promise = undefined;
}
